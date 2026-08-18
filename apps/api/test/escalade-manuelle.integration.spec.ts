import Redis from "ioredis";
import { loadEnv } from "@pgd/config";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { CacheService } from "../src/infra/redis/cache.service";
import { DelegationService } from "../src/modules/taches/services/delegation.service";
import { TacheService } from "../src/modules/taches/services/tache.service";
import { EscaladeManuelleService } from "../src/modules/admin/services/escalade-manuelle.service";

// 6.7 — POST /api/admin/escalade-manuelle/{tacheId} : volet manuel, sans
// condition d'échéance SLA (contrairement à SlaEscalationService côté worker).
describe("EscaladeManuelleService.escalader (docs/06 §9, 6.7)", () => {
  const prisma = new PrismaService();
  const redis = new Redis(loadEnv().REDIS_URL);
  const cache = new CacheService(redis);
  const delegationService = new DelegationService(prisma);
  const tacheService = new TacheService(prisma, cache, delegationService);
  const service = new EscaladeManuelleService(prisma, tacheService);

  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let agentId: string;
  let demandeId: string;

  beforeAll(async () => {
    const agent = await prisma.utilisateur.create({
      data: { identifiantAd: `test.escalade-manuelle-${suffixe}@orange.com`, nom: "Agent Test Escalade" }
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

  async function creerDemandeEtTache(etat: "EN_CORBEILLE" | "RECLAMEE" | "EN_ATTENTE", echeanceSla: Date | null = null) {
    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-ESCALADE-MAN-${suffixe}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        circuit: "DOBB",
        segment: "B2B",
        nomClient: "Client Test Escalade Manuelle",
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
        echeanceSla
      }
    });
  }

  it("escalade une tâche EN_CORBEILLE même si son échéance SLA n'est PAS dépassée", async () => {
    const tache = await creerDemandeEtTache("EN_CORBEILLE", new Date(Date.now() + 60 * 60 * 1000));

    const resultat = await service.escalader(tache.id, "test.admin-escalade");

    expect(resultat.niveauEscalade).toBe(tache.niveauEscalade + 1);

    const audit = await prisma.journalAudit.findFirstOrThrow({ where: { tacheId: tache.id, action: "escalade_manuelle" } });
    expect(audit.acteur).toBe("test.admin-escalade");
    expect(audit.detail).toMatchObject({ niveauEscaladeAvant: 0, niveauEscaladeApres: 1 });
  });

  it("escalade aussi une tâche RECLAMEE", async () => {
    const tache = await creerDemandeEtTache("RECLAMEE");

    const resultat = await service.escalader(tache.id, "test.admin-escalade");
    expect(resultat.niveauEscalade).toBe(1);
  });

  it("rejette (409) une tâche EN_ATTENTE — pas encore entrée dans une corbeille", async () => {
    const tache = await creerDemandeEtTache("EN_ATTENTE");

    await expect(service.escalader(tache.id, "test.admin-escalade")).rejects.toMatchObject({
      response: { code: "TACHE_NON_ESCALADABLE" }
    });
  });

  it("rejette (404) une tâche introuvable", async () => {
    await expect(service.escalader("00000000-0000-0000-0000-000000000000", "test.admin-escalade")).rejects.toMatchObject({
      response: { code: "TACHE_INTROUVABLE" }
    });
  });
});
