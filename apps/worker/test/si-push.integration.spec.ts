import Redis from "ioredis";
import { amqpUrl, loadEnv } from "@pgd/config";
import { ConnexionRabbitMQ } from "@pgd/messaging";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { RedisLockService } from "../src/infra/redis/redis-lock.service";
import { BillingSiRouterService } from "../src/si-push/billing-si-router.service";
import { BscsStubAdapter } from "../src/si-push/bscs-stub.adapter";
import { GaiaStubAdapter } from "../src/si-push/gaia-stub.adapter";
import { SiPushService } from "../src/si-push/si-push.service";

// T5 (docs/07) — idempotence de la poussée SI. « Un dossier CONFIRME n'est
// jamais repoussé » est garanti par la transition Postgres conditionnelle
// (EN_ATTENTE|ERREUR → ENVOYE) à l'intérieur de SiPushService.traiter, PAS
// par le contrôle 422 de l'endpoint HTTP — donc vérifié ici directement au
// niveau du service que le consumer appelle, pas seulement côté apps/api.
//
// PGD-073 (Phase 8) — SiPushService publie désormais notification.erreur_si
// après un ERREUR commité : constructeur exige une vraie connexion RabbitMQ.
describe("SiPushService.traiter — T5 (idempotence poussée SI) + R10 (erreur/rejeu)", () => {
  const prisma = new PrismaService();
  const redis = new Redis(loadEnv().REDIS_URL);
  const redisLock = new RedisLockService(redis);
  const bscs = new BscsStubAdapter();
  const gaia = new GaiaStubAdapter();
  const router = new BillingSiRouterService(prisma, bscs, gaia);
  const connexionRabbitMQ = new ConnexionRabbitMQ(amqpUrl(loadEnv()));
  const service = new SiPushService(prisma, redisLock, router, connexionRabbitMQ);

  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let agentId: string;
  let demandeId: string;

  beforeAll(async () => {
    await connexionRabbitMQ.connecter();
    const agent = await prisma.utilisateur.create({
      data: { identifiantAd: `test.si-push-${suffixe}@orange.com`, nom: "Agent Test SI Push" }
    });
    agentId = agent.id;
  });

  afterAll(async () => {
    await prisma.utilisateur.deleteMany({ where: { id: agentId } });
    await prisma.$disconnect();
    await connexionRabbitMQ.fermer();
    await redis.quit();
  });

  afterEach(async () => {
    // JournalAudit est append-only (T6) — pas de nettoyage ; demande_id passe
    // à NULL (ON DELETE SET NULL) quand la demande est supprimée ci-dessous.
    await prisma.demande.deleteMany({ where: { id: demandeId } });
  });

  async function creerDemande(circuit: "DOBB" | "DF" = "DOBB") {
    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-SIPUSH-${suffixe}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        circuit,
        segment: circuit === "DF" ? "OPERATEURS" : "B2B",
        nomClient: "Client Test SI Push",
        initiateurId: agentId,
        montantTtc: 250_000,
        statut: "VALIDE"
      }
    });
    demandeId = demande.id;
    return demande;
  }

  it("deux appels CONCURRENTS sur le même dossier → un seul appel effectif à BillingSiPort", async () => {
    await creerDemande("DOBB");
    const espionPousser = jest.spyOn(bscs, "pousser");

    const resultats = await Promise.allSettled([service.traiter(demandeId), service.traiter(demandeId)]);

    expect(espionPousser).toHaveBeenCalledTimes(1);
    const succes = resultats.filter((r) => r.status === "fulfilled");
    const echecs = resultats.filter((r) => r.status === "rejected");
    expect(succes).toHaveLength(1);
    expect(echecs).toHaveLength(1); // le second n'a pas pu acquérir le verrou Redis

    const demandeApres = await prisma.demande.findUniqueOrThrow({ where: { id: demandeId } });
    expect(demandeApres.siEtat).toBe("CONFIRME");
    expect(demandeApres.siTentatives).toBe(1); // pas 2 — un seul appel a réellement poussé

    espionPousser.mockRestore();
  });

  it("variante messagerie — rejeu du même message si.push après succès : second passage acquitté sans effet (pas de second appel au port)", async () => {
    await creerDemande("DOBB");
    const espionPousser = jest.spyOn(bscs, "pousser");

    await service.traiter(demandeId); // 1er passage — succès
    await service.traiter(demandeId); // redélivraison simulée du même message

    expect(espionPousser).toHaveBeenCalledTimes(1);
    const demandeApres = await prisma.demande.findUniqueOrThrow({ where: { id: demandeId } });
    expect(demandeApres.siEtat).toBe("CONFIRME");
    expect(demandeApres.siTentatives).toBe(1);

    espionPousser.mockRestore();
  });

  it("un dossier CONFIRME n'est jamais repoussé, y compris par un si.push explicitement republié", async () => {
    await creerDemande("DOBB");
    await service.traiter(demandeId);

    const refAvant = (await prisma.demande.findUniqueOrThrow({ where: { id: demandeId } })).siRef;

    // Simule un rejeu manuel malencontreux sur un dossier déjà CONFIRME.
    await service.traiter(demandeId);

    const demandeApres = await prisma.demande.findUniqueOrThrow({ where: { id: demandeId } });
    expect(demandeApres.siEtat).toBe("CONFIRME");
    expect(demandeApres.siRef).toBe(refAvant); // jamais régénéré
  });

  it("R10 — adaptateur forcé en erreur : si_etat=ERREUR, message et tentative tracés, puis rejeu manuel réussi", async () => {
    await creerDemande("DOBB");
    const espionPousser = jest.spyOn(bscs, "pousser").mockRejectedValueOnce(new Error("Timeout BSCS simulé"));

    await service.traiter(demandeId);

    const apresErreur = await prisma.demande.findUniqueOrThrow({ where: { id: demandeId } });
    expect(apresErreur.siEtat).toBe("ERREUR");
    expect(apresErreur.siMessage).toBe("Timeout BSCS simulé");
    expect(apresErreur.siTentatives).toBe(1);

    const auditErreur = await prisma.journalAudit.findFirstOrThrow({ where: { demandeId, action: "si_erreur" } });
    expect(auditErreur.acteur).toBe("system:si-push");

    // Rejeu manuel (PGD-062) : republie si.push, SANS re-valider — même
    // service, l'adaptateur répond cette fois normalement.
    await service.traiter(demandeId);

    const apresRejeu = await prisma.demande.findUniqueOrThrow({ where: { id: demandeId } });
    expect(apresRejeu.siEtat).toBe("CONFIRME");
    expect(apresRejeu.siTentatives).toBe(2); // 1 échec + 1 succès, compteur cumulatif

    const auditConfirme = await prisma.journalAudit.findFirstOrThrow({ where: { demandeId, action: "si_confirme" } });
    expect(auditConfirme).not.toBeNull();

    espionPousser.mockRestore();
  });

  it("route vers GAIA pour le circuit DF (routage par PARAMETRE_GLOBAL, pas en dur)", async () => {
    await creerDemande("DF");
    const espionGaia = jest.spyOn(gaia, "pousser");
    const espionBscs = jest.spyOn(bscs, "pousser");

    await service.traiter(demandeId);

    expect(espionGaia).toHaveBeenCalledTimes(1);
    expect(espionBscs).not.toHaveBeenCalled();

    const demandeApres = await prisma.demande.findUniqueOrThrow({ where: { id: demandeId } });
    expect(demandeApres.siAdaptateur).toBe("GAIA");
    expect(demandeApres.siRef).toMatch(/^GAIA-/);

    espionGaia.mockRestore();
    espionBscs.mockRestore();
  });
});
