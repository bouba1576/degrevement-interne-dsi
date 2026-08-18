import { ConflictException } from "@nestjs/common";
import Redis from "ioredis";
import { loadEnv } from "@pgd/config";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { CacheService } from "../src/infra/redis/cache.service";
import { TacheService } from "../src/modules/taches/services/tache.service";
import { DelegationService } from "../src/modules/taches/services/delegation.service";

// T1 — PGD-051, condition NON NÉGOCIABLE du feu vert Phase 6 : 50 requêtes
// concurrentes de claim sur la MÊME tâche → exactement 1 succès, 49 × 409.
// Intégration réelle contre Postgres ET Redis (aucun mock) : c'est
// précisément la classe de bug invisible en test manuel et coûteuse en
// production que ce test doit attraper.
describe("TacheService.claim — T1, concurrence réelle (SF-PGD-072, R7)", () => {
  const prisma = new PrismaService();
  const redis = new Redis(loadEnv().REDIS_URL);
  const cache = new CacheService(redis);
  const delegationService = new DelegationService(prisma);
  const service = new TacheService(prisma, cache, delegationService);

  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const NB_AGENTS = 55; // 50 pour le test de concurrence + quelques-uns pour les autres
  let agentIds: string[];
  let demandeId: string;
  let tacheId: string;

  beforeAll(async () => {
    const agents = await Promise.all(
      Array.from({ length: NB_AGENTS }, (_, i) =>
        prisma.utilisateur.create({ data: { identifiantAd: `test.claim-${suffixe}-${i}@orange.com`, nom: `Agent Test ${i}` } })
      )
    );
    agentIds = agents.map((a) => a.id);
  });

  afterAll(async () => {
    await prisma.utilisateur.deleteMany({ where: { id: { in: agentIds } } });
    await prisma.$disconnect();
    await redis.quit();
  });

  beforeEach(async () => {
    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-CLAIM-${suffixe}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        circuit: "DOBB",
        segment: "B2B",
        nomClient: "Client Test Claim",
        initiateurId: agentIds[0]!,
        montantTtc: 100_000
      }
    });
    demandeId = demande.id;

    const tache = await prisma.tache.create({
      data: {
        demandeId,
        roleCorbeille: "RESPONSABLE_DOBB",
        ordre: 1,
        typeActeur: "V",
        bloquant: true,
        slaHeures: 8,
        etat: "EN_CORBEILLE"
      }
    });
    tacheId = tache.id;
  });

  afterEach(async () => {
    await cache.libererVerrou(`lock:tache:${tacheId}`);
    // JournalAudit est append-only (T6) — pas de nettoyage ici.
    await prisma.tache.deleteMany({ where: { demandeId } });
    await prisma.demande.deleteMany({ where: { id: demandeId } });
  });

  it("50 requêtes concurrentes sur la même tâche → exactement 1 succès, 49 × 409", async () => {
    const NB_REQUETES = 50;
    const resultats = await Promise.allSettled(
      agentIds.slice(0, NB_REQUETES).map((agentId) => service.claim(tacheId, agentId))
    );

    const succes = resultats.filter((r) => r.status === "fulfilled");
    const echecs = resultats.filter((r) => r.status === "rejected");

    expect(succes).toHaveLength(1);
    expect(echecs).toHaveLength(NB_REQUETES - 1);

    for (const echec of echecs) {
      expect((echec as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
      expect((echec as PromiseRejectedResult).reason.response.code).toBe("TACHE_DEJA_RECLAMEE");
    }

    // Source de vérité Postgres : une seule ligne RECLAMEE, jamais un état
    // intermédiaire ou incohérent après la contention.
    const tacheApres = await prisma.tache.findUniqueOrThrow({ where: { id: tacheId } });
    expect(tacheApres.etat).toBe("RECLAMEE");
    expect(tacheApres.agentClaimId).not.toBeNull();
    expect(agentIds.slice(0, NB_REQUETES)).toContain(tacheApres.agentClaimId);

    // Un seul événement "claim" journalisé — pas 50, pas 0.
    const audits = await prisma.journalAudit.findMany({ where: { tacheId, action: "claim" } });
    expect(audits).toHaveLength(1);

    // Le verrou Redis doit refléter l'agent réellement gagnant côté Postgres.
    const valeurVerrou = await redis.get(`lock:tache:${tacheId}`);
    expect(valeurVerrou).toBe(tacheApres.agentClaimId);
  });

  it("après un claim réussi, un nouveau claim (même par un autre agent) reste 409", async () => {
    await service.claim(tacheId, agentIds[0]!);
    await expect(service.claim(tacheId, agentIds[1]!)).rejects.toMatchObject({
      response: { code: "TACHE_DEJA_RECLAMEE" }
    });
  });

  it("unclaim relâche le verrou Redis et remet la tâche EN_CORBEILLE — un claim redevient alors possible", async () => {
    await service.claim(tacheId, agentIds[0]!);
    await service.unclaim(tacheId, agentIds[0]!);

    const tacheApres = await prisma.tache.findUniqueOrThrow({ where: { id: tacheId } });
    expect(tacheApres.etat).toBe("EN_CORBEILLE");
    expect(tacheApres.agentClaimId).toBeNull();

    const valeurVerrou = await redis.get(`lock:tache:${tacheId}`);
    expect(valeurVerrou).toBeNull();

    // Le verrou étant relâché, un autre agent peut réclamer.
    const reclamee = await service.claim(tacheId, agentIds[1]!);
    expect(reclamee.etat).toBe("RECLAMEE");
  });

  it("unclaim par un agent qui ne détient pas le claim est rejeté (409)", async () => {
    await service.claim(tacheId, agentIds[0]!);
    await expect(service.unclaim(tacheId, agentIds[1]!)).rejects.toMatchObject({
      response: { code: "TACHE_NON_RECLAMEE_PAR_VOUS" }
    });
  });
});
