import { UnprocessableEntityException } from "@nestjs/common";
import Redis from "ioredis";
import { loadEnv } from "@pgd/config";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { CacheService } from "../src/infra/redis/cache.service";
import { AdminPaliersService } from "../src/modules/admin/services/admin-paliers.service";
import { RuleEngineService } from "../src/modules/demandes/services/rule-engine.service";
import { CalendrierSlaService } from "../src/modules/demandes/services/calendrier-sla.service";

// Intégration réelle contre Postgres ET Redis — PGD-042. Preuve du "piège
// classique" de la Phase 5 signalé explicitement : une écriture via ce
// service doit invalider le cache SANS que l'appelant ait à y penser — pas
// seulement une invalidation manuelle dans un test, comme en 5.1.
describe("AdminPaliersService — CRUD, chevauchement, trous, invalidation automatique", () => {
  const prisma = new PrismaService();
  const redis = new Redis(loadEnv().REDIS_URL);
  const cache = new CacheService(redis);
  const calendrierSla = new CalendrierSlaService(prisma);
  const ruleEngine = new RuleEngineService(prisma, calendrierSla, cache);
  const service = new AdminPaliersService(prisma, ruleEngine);

  const segmentTest = `TEST_ADMIN_${Date.now()}`;
  const idsACreer: string[] = [];

  afterEach(async () => {
    for (const id of idsACreer.splice(0)) {
      await prisma.etapeRegle.deleteMany({ where: { configurationCircuitId: id } });
      await prisma.configurationCircuit.deleteMany({ where: { id } });
    }
    await ruleEngine.invaliderCache("DOBB", segmentTest);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await redis.quit();
  });

  const etapeMinimale = { ordre: 1, roleCode: "RESPONSABLE_DOBB", typeActeur: "V" as const, bloquant: true, slaHeures: 8 };

  it("crée un palier et invalide le cache correspondant", async () => {
    const palier = await service.creer({
      circuit: "DOBB",
      segment: segmentTest,
      borneMin: 0,
      borneMax: 1000,
      etapes: [etapeMinimale]
    });
    idsACreer.push(palier.id);

    expect(palier.etapesRegle).toHaveLength(1);
    expect(palier.etapesRegle[0]?.roleCode).toBe("RESPONSABLE_DOBB");

    const configuration = await ruleEngine.selectionnerConfiguration({
      circuit: "DOBB",
      segment: segmentTest,
      sousFlux: null,
      montantTtc: 500
    });
    expect(configuration.id).toBe(palier.id);
  });

  it("PALIER_CHEVAUCHEMENT — rejette un palier dont les bornes chevauchent un palier actif existant, 422 lisible", async () => {
    const premier = await service.creer({
      circuit: "DOBB",
      segment: segmentTest,
      borneMin: 0,
      borneMax: 1000,
      etapes: [etapeMinimale]
    });
    idsACreer.push(premier.id);

    await expect(
      service.creer({ circuit: "DOBB", segment: segmentTest, borneMin: 500, borneMax: 1500, etapes: [etapeMinimale] })
    ).rejects.toMatchObject({
      response: { code: "PALIER_CHEVAUCHEMENT" }
    });
  });

  it("PALIER_BORNES_INVALIDES — rejette borne_min >= borne_max, 422 lisible", async () => {
    await expect(
      service.creer({ circuit: "DOBB", segment: segmentTest, borneMin: 1000, borneMax: 500, etapes: [etapeMinimale] })
    ).rejects.toMatchObject({
      response: { code: "PALIER_BORNES_INVALIDES" }
    });
  });

  it("modifier() remplace la chaîne et invalide automatiquement le cache — sans appel manuel à invaliderCache", async () => {
    const palier = await service.creer({
      circuit: "DOBB",
      segment: segmentTest,
      borneMin: 0,
      borneMax: 1_000_000,
      etapes: [etapeMinimale]
    });
    idsACreer.push(palier.id);

    // Peuple le cache — aucune invalidation manuelle ci-dessous, uniquement
    // celle que AdminPaliersService.modifier() doit déclencher lui-même.
    const avant = await ruleEngine.selectionnerConfiguration({
      circuit: "DOBB",
      segment: segmentTest,
      sousFlux: null,
      montantTtc: 500_000
    });
    expect(avant.etapesRegle.map((e) => e.roleCode)).toEqual(["RESPONSABLE_DOBB"]);

    await service.modifier(palier.id, {
      etapes: [
        { ordre: 1, roleCode: "MANAGER_DOBB", typeActeur: "V", bloquant: true, slaHeures: 8 },
        { ordre: 2, roleCode: "MANAGER_SENIOR_DOBB", typeActeur: "V", bloquant: true, slaHeures: 8 }
      ]
    });

    const apres = await ruleEngine.selectionnerConfiguration({
      circuit: "DOBB",
      segment: segmentTest,
      sousFlux: null,
      montantTtc: 500_000
    });
    expect(apres.etapesRegle.map((e) => e.roleCode)).toEqual(["MANAGER_DOBB", "MANAGER_SENIOR_DOBB"]);
  });

  it("supprimer() invalide automatiquement le cache — le palier supprimé n'est plus servi", async () => {
    const palier = await service.creer({
      circuit: "DOBB",
      segment: segmentTest,
      borneMin: 0,
      borneMax: 1000,
      etapes: [etapeMinimale]
    });

    await ruleEngine.selectionnerConfiguration({ circuit: "DOBB", segment: segmentTest, sousFlux: null, montantTtc: 500 });

    await service.supprimer(palier.id);

    await expect(
      ruleEngine.selectionnerConfiguration({ circuit: "DOBB", segment: segmentTest, sousFlux: null, montantTtc: 500 })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("détecte et signale un trou entre deux tranches actives, sans bloquer", async () => {
    const premier = await service.creer({
      circuit: "DOBB",
      segment: segmentTest,
      borneMin: 0,
      borneMax: 1000,
      etapes: [etapeMinimale]
    });
    idsACreer.push(premier.id);
    const second = await service.creer({
      circuit: "DOBB",
      segment: segmentTest,
      borneMin: 2000,
      borneMax: 5000,
      etapes: [etapeMinimale]
    });
    idsACreer.push(second.id);

    const { trous } = await service.lister("DOBB", segmentTest);
    expect(trous).toHaveLength(1);
    expect(trous[0]).toMatchObject({ circuit: "DOBB", segment: segmentTest, borneMin: 1000.01, borneMax: 1999.99 });
  });
});
