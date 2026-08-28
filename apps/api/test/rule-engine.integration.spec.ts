import { UnprocessableEntityException } from "@nestjs/common";
import Redis from "ioredis";
import { loadEnv } from "@pgd/config";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { CacheService } from "../src/infra/redis/cache.service";
import { RuleEngineService, ROLE_CODE_FIABILISATION } from "../src/modules/demandes/services/rule-engine.service";
import { CalendrierSlaService } from "../src/modules/demandes/services/calendrier-sla.service";

// Intégration réelle contre Postgres ET Redis (pas de mock de cache) —
// exploite les paliers réellement seedés (paliers.seed.ts), y compris la
// limite DF 5M/5M.01 corrigée en Phase 4 pour que l'EXCLUDE gist protège
// réellement les bornes.
describe("RuleEngineService — sélection de palier + cache Redis (Phase 4/5)", () => {
  const prisma = new PrismaService();
  const redis = new Redis(loadEnv().REDIS_URL);
  const cache = new CacheService(redis);
  const calendrierSla = new CalendrierSlaService(prisma);
  const ruleEngine = new RuleEngineService(prisma, calendrierSla, cache);

  // Repart d'un cache propre pour les segments réels du seed : une exécution
  // manuelle antérieure (vérification live) a pu déjà peupler ces clés dans
  // le Redis partagé — sans ce nettoyage, les assertions pourraient refléter
  // un état mis en cache plutôt que la base actuelle.
  beforeAll(async () => {
    await Promise.all([
      ruleEngine.invaliderCache("DOBB", "B2B"),
      ruleEngine.invaliderCache("DXC", "B2C"),
      ruleEngine.invaliderCache("DF", "WHOLESALE")
    ]);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await redis.quit();
  });

  // Garde-fou de convention (R12) — signalé après vérification de la Phase 5,
  // CORRIGÉ le 27/08/2026 (docs/14, correction FRA/FIABILISATION — le rôle
  // désigné par cette convention est désormais FIABILISATION, jamais FRA,
  // cf. rule-engine.service.ts). possedeControleR12() n'a AUCUN moyen de
  // savoir que le rôle "FIABILISATION" a changé de nom dans le référentiel ;
  // une chaîne sans étape "FIABILISATION" se lit comme « pas de contrôle
  // requis », pas comme une erreur. Ce test est la seule chose qui rend la
  // dérive détectable : si ROLE_CODE_FIABILISATION disparaît du catalogue de
  // rôles, il échoue en CI.
  it("le rôle FIABILISATION (convention R12) existe dans le référentiel des rôles", async () => {
    const role = await prisma.role.findUnique({ where: { code: ROLE_CODE_FIABILISATION } });
    expect(role).not.toBeNull();
  });

  it("sélectionne l'unique palier DOBB (non borné) pour un montant courant", async () => {
    const configuration = await ruleEngine.selectionnerConfiguration({
      circuit: "DOBB",
      segment: "B2B",
      sousFlux: null,
      montantTtc: 100_000
    });
    expect(configuration.circuit).toBe("DOBB");
    expect(configuration.etapesRegle.length).toBeGreaterThan(0);
  });

  it("sélectionne la tranche DF JUSQU_5M à la borne haute exacte (5 000 000.00 inclusif)", async () => {
    const configuration = await ruleEngine.selectionnerConfiguration({
      circuit: "DF",
      segment: "WHOLESALE",
      sousFlux: null,
      montantTtc: 5_000_000
    });
    expect(Number(configuration.borneMax)).toBe(5_000_000);
  });

  it("sélectionne la tranche DF 5M_A_50M un centime au-dessus (bornes réellement disjointes)", async () => {
    const configuration = await ruleEngine.selectionnerConfiguration({
      circuit: "DF",
      segment: "WHOLESALE",
      sousFlux: null,
      montantTtc: 5_000_000.01
    });
    expect(Number(configuration.borneMin)).toBe(5_000_000.01);
  });

  it("sélectionne la tranche DF AU_DELA_50M pour un montant très élevé", async () => {
    const configuration = await ruleEngine.selectionnerConfiguration({
      circuit: "DF",
      segment: "WHOLESALE",
      sousFlux: null,
      montantTtc: 100_000_000
    });
    expect(Number(configuration.borneMin)).toBe(50_000_000.01);
  });

  it("rejette (422, jamais un routage silencieux) quand le segment ne correspond à aucune configuration", async () => {
    await expect(
      ruleEngine.selectionnerConfiguration({
        circuit: "DOBB",
        segment: "SEGMENT_INEXISTANT",
        sousFlux: null,
        montantTtc: 1000
      })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  // Dette signalée après la Phase 4 : le jeu de démo n'a que des paliers
  // « attrape-tout » (DOBB/DXC non bornés, DF couvrant 0 → l'infini) — un
  // vrai trou de montant est donc invisible en dev et n'apparaîtrait qu'en
  // recette avec des bornes réelles. Reproduit ici avec un segment isolé
  // (jamais utilisé par une vraie demande, qui reprend toujours
  // CIRCUIT.segment) portant deux tranches disjointes avec un trou entre les
  // deux : 0–1000 et 2000–5000, rien pour 1000.01–1999.99.
  describe("trou de palier (montant hors de toute tranche configurée)", () => {
    const segmentTest = `TEST_TROU_${Date.now()}`;

    beforeAll(async () => {
      const configs = await Promise.all([
        prisma.configurationCircuit.create({ data: { circuit: "DOBB", segment: segmentTest, borneMin: 0, borneMax: 1000 } }),
        prisma.configurationCircuit.create({ data: { circuit: "DOBB", segment: segmentTest, borneMin: 2000, borneMax: 5000 } })
      ]);
      await Promise.all(
        configs.map((config) =>
          prisma.etapeRegle.create({
            data: { configurationCircuitId: config.id, ordre: 1, roleCode: "RESPONSABLE_DOBB", typeActeur: "V", bloquant: true, slaHeures: 8 }
          })
        )
      );
    });

    afterAll(async () => {
      await prisma.configurationCircuit.deleteMany({ where: { segment: segmentTest } });
    });

    it("couvre correctement une valeur DANS une tranche (contrôle du test lui-même)", async () => {
      const configuration = await ruleEngine.selectionnerConfiguration({
        circuit: "DOBB",
        segment: segmentTest,
        sousFlux: null,
        montantTtc: 500
      });
      expect(Number(configuration.borneMax)).toBe(1000);
    });

    it("rejette avec 422 nommant le montant et le circuit — jamais un routage par défaut silencieux", async () => {
      await expect(
        ruleEngine.selectionnerConfiguration({
          circuit: "DOBB",
          segment: segmentTest,
          sousFlux: null,
          montantTtc: 1500
        })
      ).rejects.toMatchObject({
        response: {
          code: "AUCUN_PALIER_CORRESPONDANT",
          message: expect.stringContaining("1500"),
          details: expect.objectContaining({ circuit: "DOBB", montantTtc: 1500 })
        }
      });
    });
  });

  // T3 — condition explicite du feu vert Phase 5 : modifier un palier en base
  // doit changer le routage SANS redémarrer le service. Avec le cache Redis
  // ajouté en 5.1, R3/R11 ne tiennent plus par la seule lecture directe :
  // c'est l'invalidation à l'écriture qui les garantit désormais — ce test le
  // prouve dans les deux sens, pas seulement le sens qui arrange :
  //   1) sans invalidation, le cache sert délibérément l'ancienne règle
  //      (sinon le cache serait un no-op silencieux qu'aucun test n'attraperait) ;
  //   2) avec invalidation — le geste que l'administration des paliers (5.5)
  //      devra faire à chaque écriture — le routage change immédiatement.
  describe("T3 — le routage change quand la base change ET que le cache est invalidé", () => {
    const segmentTest = `TEST_T3_${Date.now()}`;
    let configId: string;

    beforeAll(async () => {
      const config = await prisma.configurationCircuit.create({
        data: { circuit: "DOBB", segment: segmentTest, borneMin: 0, borneMax: 1_000_000 }
      });
      configId = config.id;
      await prisma.etapeRegle.create({
        data: { configurationCircuitId: configId, ordre: 1, roleCode: "RESPONSABLE_DOBB", typeActeur: "V", bloquant: true, slaHeures: 8 }
      });
    });

    afterAll(async () => {
      await prisma.etapeRegle.deleteMany({ where: { configurationCircuitId: configId } });
      await prisma.configurationCircuit.delete({ where: { id: configId } });
      await ruleEngine.invaliderCache("DOBB", segmentTest);
    });

    it("sert l'ancienne règle tant que le cache n'est pas invalidé, puis la nouvelle après invalidation", async () => {
      const avant = await ruleEngine.selectionnerConfiguration({
        circuit: "DOBB",
        segment: segmentTest,
        sousFlux: null,
        montantTtc: 500_000
      });
      expect(avant.etapesRegle.map((e) => e.roleCode)).toEqual(["RESPONSABLE_DOBB"]);

      // Modification directe en base — aucun appel au service, aucun redéploiement.
      await prisma.etapeRegle.updateMany({
        where: { configurationCircuitId: configId },
        data: { roleCode: "MANAGER_DOBB" }
      });
      await prisma.etapeRegle.create({
        data: { configurationCircuitId: configId, ordre: 2, roleCode: "MANAGER_SENIOR_DOBB", typeActeur: "V", bloquant: true, slaHeures: 8 }
      });

      // Le cache est réel : sans invalidation, il sert encore l'ancienne règle.
      const sansInvalidation = await ruleEngine.selectionnerConfiguration({
        circuit: "DOBB",
        segment: segmentTest,
        sousFlux: null,
        montantTtc: 500_000
      });
      expect(sansInvalidation.etapesRegle.map((e) => e.roleCode)).toEqual(["RESPONSABLE_DOBB"]);

      // Le geste que l'administration des paliers devra faire à chaque écriture.
      await ruleEngine.invaliderCache("DOBB", segmentTest);

      const apres = await ruleEngine.selectionnerConfiguration({
        circuit: "DOBB",
        segment: segmentTest,
        sousFlux: null,
        montantTtc: 500_000
      });
      expect(apres.etapesRegle.map((e) => e.roleCode)).toEqual(["MANAGER_DOBB", "MANAGER_SENIOR_DOBB"]);
    });
  });

  it("instancie la chaîne : première étape EN_CORBEILLE avec échéance SLA, suivantes EN_ATTENTE", async () => {
    const compte = await prisma.compteClient.create({
      data: { numeroCompte: `TEST-CPT-RE-${Date.now()}`, nomClient: "Client Test RuleEngine" }
    });
    const initiateur = await prisma.utilisateur.upsert({
      where: { id: "22222222-2222-2222-2222-222222222222" },
      update: {},
      create: { id: "22222222-2222-2222-2222-222222222222", identifiantAd: "test.rule-engine@orange.com", nom: "Test RuleEngine" }
    });
    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-RE-${Date.now()}`,
        circuit: "DOBB",
        segment: "B2B",
        nomClient: "Client Test",
        initiateurId: initiateur.id
      }
    });

    try {
      const configuration = await ruleEngine.selectionnerConfiguration({
        circuit: "DOBB",
        segment: "B2B",
        sousFlux: null,
        montantTtc: 100_000
      });
      await prisma.$transaction((tx) => ruleEngine.instancierChaine(demande.id, configuration, tx));

      const taches = await prisma.tache.findMany({ where: { demandeId: demande.id }, orderBy: { ordre: "asc" } });
      expect(taches.length).toBe(configuration.etapesRegle.length);
      expect(taches[0]?.etat).toBe("EN_CORBEILLE");
      expect(taches[0]?.echeanceSla).not.toBeNull();
      for (const tache of taches.slice(1)) {
        expect(["EN_ATTENTE", "POST_CLOTURE"]).toContain(tache.etat);
      }
    } finally {
      await prisma.tache.deleteMany({ where: { demandeId: demande.id } });
      await prisma.demande.delete({ where: { id: demande.id } });
      await prisma.compteClient.delete({ where: { id: compte.id } });
    }
  });
});
