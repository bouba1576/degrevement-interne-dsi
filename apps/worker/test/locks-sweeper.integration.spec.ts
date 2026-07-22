import Redis from "ioredis";
import { loadEnv } from "@pgd/config";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { LocksSweeperService } from "../src/jobs/locks-sweeper.service";

// T8, volet 2 (idempotence) + cas de désalignement Redis/Postgres explicitement
// demandé : le sweeper ne lit JAMAIS Redis — il corrige une tâche RECLAMEE
// dont verrou_expire_at est dépassé sur la seule foi de Postgres. Le scénario
// « Redis a expiré/perdu la clé mais la ligne est restée RECLAMEE » ne se
// laisse pas attendre : on le provoque directement en ne posant jamais de
// clé Redis pour la tâche de test.
describe("LocksSweeperService.balayer — T8 (désalignement Redis/Postgres)", () => {
  const prisma = new PrismaService();
  const redis = new Redis(loadEnv().REDIS_URL);
  const service = new LocksSweeperService(prisma);

  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let agentId: string;
  let demandeId: string;

  beforeAll(async () => {
    const agent = await prisma.utilisateur.create({
      data: { identifiantAd: `test.sweeper-${suffixe}@orange.ci`, nom: "Agent Test Sweeper" }
    });
    agentId = agent.id;
  });

  afterAll(async () => {
    await prisma.utilisateur.deleteMany({ where: { id: agentId } });
    await prisma.$disconnect();
    await redis.quit();
  });

  afterEach(async () => {
    // JournalAudit est append-only (T6) — pas de nettoyage ici.
    await prisma.tache.deleteMany({ where: { demandeId } });
    await prisma.demande.deleteMany({ where: { id: demandeId } });
  });

  async function creerDemandeEtTache(verrouExpireAt: Date, etat: "RECLAMEE" | "EN_CORBEILLE" = "RECLAMEE") {
    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-SWEEP-${suffixe}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        circuit: "DOBB",
        segment: "B2B",
        nomClient: "Client Test Sweeper",
        initiateurId: agentId,
        montantTtc: 100_000
      }
    });
    demandeId = demande.id;

    return prisma.tache.create({
      data: {
        demandeId,
        roleCorbeille: "RESPONSABLE_DOBB",
        ordre: 1,
        typeActeur: "V",
        bloquant: true,
        slaHeures: 8,
        etat,
        ...(etat === "RECLAMEE" ? { agentClaimId: agentId, dateClaim: new Date(), verrouExpireAt } : {})
      }
    });
  }

  it("corrige une tâche RECLAMEE dont la clé Redis a déjà disparu (jamais posée ici) — sans lire Redis", async () => {
    const tache = await creerDemandeEtTache(new Date(Date.now() - 60_000)); // expiré il y a 1 min

    // Provoque explicitement le désalignement : aucune clé Redis n'existe pour
    // cette tâche (simulateur du cas « Redis a déjà expiré la clé »).
    const cleRedis = `lock:tache:${tache.id}`;
    expect(await redis.get(cleRedis)).toBeNull();

    const nbLiberees = await service.balayer();

    expect(nbLiberees).toBeGreaterThanOrEqual(1);
    const tacheApres = await prisma.tache.findUniqueOrThrow({ where: { id: tache.id } });
    expect(tacheApres.etat).toBe("EN_CORBEILLE");
    expect(tacheApres.agentClaimId).toBeNull();
    expect(tacheApres.dateClaim).toBeNull();
    expect(tacheApres.verrouExpireAt).toBeNull();

    const audit = await prisma.journalAudit.findFirst({ where: { tacheId: tache.id, action: "verrou_expire" } });
    expect(audit).not.toBeNull();
    expect(audit?.acteur).toBe("system:locks-sweeper");

    // Toujours aucune clé Redis : le sweeper n'en a créé, lu, ni eu besoin.
    expect(await redis.get(cleRedis)).toBeNull();
  });

  it("ignore une tâche RECLAMEE dont le verrou n'est pas encore expiré", async () => {
    const tache = await creerDemandeEtTache(new Date(Date.now() + 60_000));

    await service.balayer();

    const tacheApres = await prisma.tache.findUniqueOrThrow({ where: { id: tache.id } });
    expect(tacheApres.etat).toBe("RECLAMEE");
  });

  it("est idempotent : un second passage sur une tâche déjà libérée ne journalise rien de plus", async () => {
    const tache = await creerDemandeEtTache(new Date(Date.now() - 60_000));

    const premierPassage = await service.balayer();
    expect(premierPassage).toBeGreaterThanOrEqual(1);

    const auditsApresPremier = await prisma.journalAudit.findMany({ where: { tacheId: tache.id, action: "verrou_expire" } });
    expect(auditsApresPremier).toHaveLength(1);

    // Rejeu simulant une redélivraison at-least-once du message lock.sweep.
    // Comptage global non fiable en parallèle (autres fixtures), on vérifie
    // l'effet sur NOTRE tâche uniquement.
    await service.balayer();

    const tacheApres = await prisma.tache.findUniqueOrThrow({ where: { id: tache.id } });
    expect(tacheApres.etat).toBe("EN_CORBEILLE");

    const auditsApresSecond = await prisma.journalAudit.findMany({ where: { tacheId: tache.id, action: "verrou_expire" } });
    expect(auditsApresSecond).toHaveLength(1); // toujours 1, pas 2
  });
});
