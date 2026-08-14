import Redis from "ioredis";
import { loadEnv } from "@pgd/config";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { CacheService } from "../src/infra/redis/cache.service";
import type { UtilisateurRequete } from "../src/common/guards/auth.guard";
import { KpiEngineService } from "../src/modules/kpi/services/kpi-engine.service";

// PGD-074 (SF-PGD-120/121/122) — moteur générique piloté par KPI_DEFINITION.
// On ne teste pas les ~26 codes un par un (le référentiel les fait tous
// passer par la même poignée de chemins de calcul) : on couvre chaque chemin
// une fois (scalaire montant/volume, répartition, taux de répartition,
// évolution M-1→M globale et par dimension, composite à deux dimensions),
// plus la convention « reçu vs traité » et le cache Redis TTL court.
describe("KpiEngineService — agrégations DEMANDE (docs/04 §3.2)", () => {
  const prisma = new PrismaService();
  const redis = new Redis(loadEnv().REDIS_URL);
  const cache = new CacheService(redis);
  const engine = new KpiEngineService(prisma, cache);

  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let agentId: string;
  let autreAgentId: string;
  const demandeIds: string[] = [];
  let motifIdFixe: string;
  let motifIdMobile: string;
  let universTest: string;
  let admin: UtilisateurRequete;
  let initiateurAppelant: UtilisateurRequete;
  let initiateurAutre: UtilisateurRequete;
  let valideurDobb: UtilisateurRequete;
  let valideurAutreRole: UtilisateurRequete;
  let roleTestDetenu: string;
  let roleTestNonDetenu: string;

  beforeAll(async () => {
    const [agent, autreAgent] = await Promise.all([
      prisma.utilisateur.create({ data: { identifiantAd: `test.kpi-${suffixe}@orange.ci`, nom: "Agent Test KPI" } }),
      prisma.utilisateur.create({ data: { identifiantAd: `test.kpi-autre-${suffixe}@orange.ci`, nom: "Autre Agent Test KPI" } })
    ]);
    agentId = agent.id;
    autreAgentId = autreAgent.id;

    admin = { id: agentId, identifiantAd: agent.identifiantAd, roles: ["ADMIN_PGD"], sousFluxId: null, jti: "test" };
    initiateurAppelant = { id: agentId, identifiantAd: agent.identifiantAd, roles: [], sousFluxId: null, jti: "test" };
    initiateurAutre = { id: autreAgentId, identifiantAd: autreAgent.identifiantAd, roles: [], sousFluxId: null, jti: "test" };
    // Tache.roleCorbeille est une FK vers Role (contrainte réelle en base) —
    // deux rôles jetables et uniques à ce run rendent le test hermétique au
    // bruit des autres fichiers exécutés en parallèle (un vrai
    // "RESPONSABLE_DOBB" serait aussi posé ailleurs) tout en respectant la FK.
    roleTestDetenu = `TEST_ROLE_DETENU_${suffixe}`.slice(0, 40);
    roleTestNonDetenu = `TEST_ROLE_NON_DETENU_${suffixe}`.slice(0, 40);
    await Promise.all([
      prisma.role.create({ data: { code: roleTestDetenu, libelle: roleTestDetenu, groupeAd: `GG-${roleTestDetenu}`, niveau: 1, type: "METIER" } }),
      prisma.role.create({ data: { code: roleTestNonDetenu, libelle: roleTestNonDetenu, groupeAd: `GG-${roleTestNonDetenu}`, niveau: 1, type: "METIER" } })
    ]);
    valideurDobb = { id: agentId, identifiantAd: agent.identifiantAd, roles: [roleTestDetenu], sousFluxId: null, jti: "test" };
    valideurAutreRole = {
      id: agentId,
      identifiantAd: agent.identifiantAd,
      roles: [roleTestNonDetenu],
      sousFluxId: null,
      jti: "test"
    };

    const [motifFixe, motifMobile] = await Promise.all([
      prisma.motif.create({ data: { circuit: "DOBB", libelle: `TEST_MOTIF_FIXE_${suffixe}` } }),
      prisma.motif.create({ data: { circuit: "DOBB", libelle: `TEST_MOTIF_MOBILE_${suffixe}` } })
    ]);
    motifIdFixe = motifFixe.id;
    motifIdMobile = motifMobile.id;

    // Univers dédié au test composite motif+univers — FIXE/MOBILE/INTERNET
    // sont partagés par tous les fichiers de test exécutés en parallèle
    // (convention Phase 5, clé ouverte) ; un code isolé rend le dénominateur
    // (total par univers) exact, sans bruit d'un autre fichier de test.
    universTest = `TEST_UNIVERS_${suffixe}`.slice(0, 20);
    await prisma.universFmi.create({ data: { code: universTest, libelle: `Univers Test ${suffixe}` } });
  });

  afterAll(async () => {
    await prisma.tache.deleteMany({ where: { demandeId: { in: demandeIds } } });
    await prisma.demande.deleteMany({ where: { id: { in: demandeIds } } });
    await prisma.motif.deleteMany({ where: { id: { in: [motifIdFixe, motifIdMobile] } } });
    await prisma.universFmi.delete({ where: { code: universTest } });
    await prisma.role.deleteMany({ where: { code: { in: [roleTestDetenu, roleTestNonDetenu] } } });
    await prisma.utilisateur.deleteMany({ where: { id: { in: [agentId, autreAgentId] } } });
    await prisma.$disconnect();
    await redis.quit();
  });

  // Le TTL court (60 s) qui protège la production contre un recalcul à
  // chaque requête est justement ce qui ferait fuiter un résultat d'un test
  // au suivant (ou d'un appel à l'autre DANS un même test) si deux appels
  // réutilisent la même forme de requête en moins d'une minute — purge
  // ciblée, jamais un FLUSHDB qui toucherait aussi les autres suites
  // (verrous, sessions JWT).
  async function purgerCacheKpi() {
    const cles = await redis.keys("kpi:resultats:*");
    if (cles.length > 0) {
      await redis.del(...cles);
    }
  }

  afterEach(purgerCacheKpi);

  async function creerDemande(options: {
    universFmiCode?: string;
    facteurCode?: string;
    motifId?: string;
    montantTtc?: number;
    montantHt?: number;
    siEtat?: "EN_ATTENTE" | "ENVOYE" | "CONFIRME" | "ERREUR";
    dateDemande?: Date;
    siHorodatage?: Date;
    initiateurId?: string;
  }) {
    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-KPI-${suffixe}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        circuit: "DOBB",
        segment: "B2B",
        nomClient: "Client Test KPI",
        initiateurId: options.initiateurId ?? agentId,
        montantTtc: options.montantTtc ?? 0,
        montantHt: options.montantHt ?? 0,
        universFmiCode: options.universFmiCode,
        facteurCode: options.facteurCode,
        motifId: options.motifId,
        siEtat: options.siEtat ?? "EN_ATTENTE",
        dateDemande: options.dateDemande ?? new Date(),
        siHorodatage: options.siHorodatage
      }
    });
    demandeIds.push(demande.id);
    return demande;
  }

  async function creerDemandeAvecTache(roleCorbeille: string) {
    const demande = await creerDemande({ universFmiCode: "FIXE" });
    await prisma.tache.create({
      data: { demandeId: demande.id, roleCorbeille, ordre: 1, typeActeur: "V", bloquant: true, slaHeures: 8, etat: "EN_CORBEILLE" }
    });
    return demande;
  }

  function trouver(resultats: Awaited<ReturnType<typeof engine.calculer>>, code: string) {
    const trouve = resultats.find((r) => r.code === code);
    if (!trouve) throw new Error(`KPI ${code} absent du résultat`);
    return trouve;
  }

  it("definitions() retourne le référentiel complet (≈24 indicateurs, 6 familles)", async () => {
    const defs = await engine.definitions();
    expect(defs.length).toBeGreaterThanOrEqual(24);
    const familles = new Set(defs.map((d) => d.famille));
    expect(familles.size).toBe(6);
  });

  it("scalaire VOLUME et MONTANT (HT explicite vs TTC par défaut) sur un jeu de dossiers réel", async () => {
    await Promise.all([
      creerDemande({ universFmiCode: "FIXE", montantHt: 100_000, montantTtc: 118_000 }),
      creerDemande({ universFmiCode: "MOBILE", montantHt: 200_000, montantTtc: 236_000 })
    ]);

    const resultats = await engine.calculer({ circuit: "DOBB" }, admin);
    // Volume global sur DOBB inclut potentiellement d'autres dossiers de test
    // concurrents — on vérifie une borne basse, pas une égalité stricte.
    expect(trouver(resultats, "RECUS_VOLUME").valeur).toBeGreaterThanOrEqual(2);
    expect(trouver(resultats, "RECUS_MONTANT_HT").valeur).toBeGreaterThanOrEqual(300_000);
    // DIRECTION_MONTANT n'a pas de suffixe _HT explicite — retombe sur TTC (R1).
    // On ne peut pas isoler la contribution exacte sans dimension direction
    // posée sur ces dossiers ; on vérifie seulement que la valeur globale TTC
    // (utilisée en fallback) est cohérente avec la somme attendue ailleurs.
    expect(trouver(resultats, "RECUS_MONTANT_TTC").valeur).toBeGreaterThanOrEqual(354_000);
  });

  it("convention reçu vs traité — TRAITES_* ne compte que si_etat=CONFIRME, jamais EN_ATTENTE/ERREUR", async () => {
    const horodatage = new Date();
    await Promise.all([
      creerDemande({ universFmiCode: "FIXE", siEtat: "CONFIRME", siHorodatage: horodatage, montantTtc: 50_000 }),
      creerDemande({ universFmiCode: "FIXE", siEtat: "ERREUR", montantTtc: 50_000_000 }),
      creerDemande({ universFmiCode: "FIXE", siEtat: "EN_ATTENTE", montantTtc: 50_000_000 })
    ]);

    const resultats = await engine.calculer({ circuit: "DOBB", univers: "FIXE" }, admin);
    const traitesTtc = trouver(resultats, "TRAITES_MONTANT_TTC").valeur ?? 0;
    // Doit inclure le dossier CONFIRME (50 000) mais aucun des deux dossiers à
    // 50 000 000 (ERREUR/EN_ATTENTE) — une contamination ferait exploser ce
    // total à un ordre de grandeur incompatible avec du bruit de test parallèle.
    expect(traitesTtc).toBeLessThan(1_000_000);
  });

  it("répartition 1 dimension (VOLUME par univers) et taux 1 dimension (facteur)", async () => {
    await Promise.all([
      creerDemande({ universFmiCode: "FIXE", facteurCode: "INTERNE" }),
      creerDemande({ universFmiCode: "FIXE", facteurCode: "INTERNE" }),
      creerDemande({ universFmiCode: "MOBILE", facteurCode: "EXTERNE" })
    ]);

    const resultats = await engine.calculer({ circuit: "DOBB" }, admin);

    const repartitionUnivers = trouver(resultats, "RECUS_VOLUME_PAR_UNIVERS").repartition ?? [];
    const fixe = repartitionUnivers.find((r) => r.cle === "FIXE");
    expect(fixe?.libelle).toBe("Fixe");
    expect(fixe?.valeur).toBeGreaterThanOrEqual(2);

    const tauxFacteur = trouver(resultats, "FACTEUR_TAUX").repartition ?? [];
    for (const ligne of tauxFacteur) {
      expect(ligne.valeur).toBeGreaterThanOrEqual(0);
      expect(ligne.valeur).toBeLessThanOrEqual(1);
    }
  });

  it("évolution M-1 → M globale et par dimension, sur une période explicite sans division par zéro", async () => {
    const maintenant = new Date();
    const periode = `${maintenant.getUTCFullYear()}-${String(maintenant.getUTCMonth() + 1).padStart(2, "0")}`;

    await creerDemande({ universFmiCode: "FIXE", dateDemande: maintenant });

    const resultats = await engine.calculer({ circuit: "DOBB", periode }, admin);
    const evolution = trouver(resultats, "RECUS_EVOLUTION").valeur;
    expect(evolution).not.toBeNull();
    expect(Number.isFinite(evolution)).toBe(true);

    const evolutionParUnivers = trouver(resultats, "RECUS_EVOLUTION_PAR_UNIVERS").repartition ?? [];
    const fixe = evolutionParUnivers.find((r) => r.cle === "FIXE");
    expect(fixe).toBeDefined();
    expect(Number.isFinite(fixe?.valeur)).toBe(true);
  });

  it("composite 2 dimensions motif+univers — volume brut (TOP_MOTIF_PAR_UNIVERS) et taux relatif à l'univers (TAUX_MOTIF_UNIVERS)", async () => {
    await Promise.all([
      creerDemande({ universFmiCode: universTest, motifId: motifIdFixe }),
      creerDemande({ universFmiCode: universTest, motifId: motifIdFixe }),
      creerDemande({ universFmiCode: universTest, motifId: motifIdMobile })
    ]);

    const resultats = await engine.calculer({ circuit: "DOBB", univers: universTest }, admin);

    const topMotif = trouver(resultats, "TOP_MOTIF_PAR_UNIVERS").repartition ?? [];
    const cleFixe = `${motifIdFixe}|${universTest}`;
    const ligneFixe = topMotif.find((r) => r.cle === cleFixe);
    expect(ligneFixe?.valeur).toBe(2);

    const tauxMotifUnivers = trouver(resultats, "TAUX_MOTIF_UNIVERS").repartition ?? [];
    const ligneTaux = tauxMotifUnivers.find((r) => r.cle === cleFixe);
    // 2 dossiers motifFixe sur 3 dossiers de cet univers dédié (isolé des
    // autres fichiers de test) au total → 2/3, exact.
    expect(ligneTaux?.valeur).toBeCloseTo(2 / 3, 5);
  });

  it("cache Redis TTL court — deux appels identiques rapprochés renvoient le même résultat sans recalcul divergent", async () => {
    await creerDemande({ universFmiCode: "FIXE" });

    const premier = await engine.calculer({ circuit: "DOBB", univers: "FIXE", profil: "pilotage" }, admin);
    await creerDemande({ universFmiCode: "FIXE" }); // devrait être invisible tant que le cache est chaud
    const second = await engine.calculer({ circuit: "DOBB", univers: "FIXE", profil: "pilotage" }, admin);

    expect(second).toEqual(premier);
  });

  // Périmètre de `profil` — la faille signalée avant 8.5 : un filtre déclaratif
  // côté client n'est pas un contrôle. Ces tests prouvent que le périmètre est
  // vérifié contre des données réelles (initiateurId, roleCorbeille détenu),
  // jamais contre ce que le client prétend demander.
  it("profil=initiateur force initiateurId=appelant, quel que soit ce que demande le client — un dossier d'un autre agent reste invisible", async () => {
    // `agentId` a déjà accumulé du montant via les fixtures des tests
    // précédents (tous par défaut initiateurId=agentId) — on compare un
    // DELTA avant/après, pas un seuil absolu, pour rester exact malgré ce
    // bruit intra-fichier.
    const avant = await engine.calculer({ circuit: "DOBB", univers: "FIXE", profil: "initiateur" }, initiateurAppelant);
    const montantAvant = trouver(avant, "RECUS_MONTANT_TTC").valeur ?? 0;

    await Promise.all([
      creerDemande({ universFmiCode: "FIXE", montantTtc: 10_000, initiateurId: agentId }),
      creerDemande({ universFmiCode: "FIXE", montantTtc: 20_000_000, initiateurId: autreAgentId })
    ]);
    await purgerCacheKpi();

    const resultats = await engine.calculer({ circuit: "DOBB", univers: "FIXE", profil: "initiateur" }, initiateurAppelant);
    const montant = trouver(resultats, "RECUS_MONTANT_TTC").valeur ?? 0;
    // La hausse doit être exactement les 10 000 propres à l'appelant, jamais
    // les 20 000 000 destinés à l'autre agent — une fuite de périmètre
    // ferait apparaître les deux dans ce delta.
    expect(montant - montantAvant).toBe(10_000);

    const resultatsAutre = await engine.calculer({ circuit: "DOBB", univers: "FIXE", profil: "initiateur" }, initiateurAutre);
    const montantAutre = trouver(resultatsAutre, "RECUS_MONTANT_TTC").valeur ?? 0;
    // autreAgentId est un utilisateur flambant neuf créé pour ce fichier —
    // jamais rattaché à une autre demande ailleurs — total exact, pas un seuil.
    expect(montantAutre).toBe(20_000_000);
  });

  it("profil=valideur force le périmètre aux dossiers dont une tâche porte un roleCorbeille réellement détenu par l'appelant", async () => {
    const roleDetenu = valideurDobb.roles[0]!;
    await Promise.all([creerDemandeAvecTache(roleDetenu), creerDemandeAvecTache(roleDetenu)]);

    const resultatsAvecRole = await engine.calculer({ circuit: "DOBB", profil: "valideur" }, valideurDobb);
    const volumeAvecRole = trouver(resultatsAvecRole, "RECUS_VOLUME").valeur ?? 0;
    expect(volumeAvecRole).toBeGreaterThanOrEqual(2);

    // Même appelant, mais un rôle qu'il ne détient pas dans ce test (JWT
    // roles) sur les mêmes données — doit voir 0, jamais les 2 dossiers.
    const resultatsSansRole = await engine.calculer({ circuit: "DOBB", profil: "valideur" }, valideurAutreRole);
    const volumeSansRole = trouver(resultatsSansRole, "RECUS_VOLUME").valeur ?? 0;
    expect(volumeSansRole).toBe(0);
  });

  // Le refus profil=pilotage sans ADMIN_PGD est une décision d'accès binaire,
  // pas un filtre de données — portée par KpiPerimetreGuard (voir
  // kpi-perimetre.guard.spec.ts), pas par ce service, qui suppose
  // l'autorisation déjà acquise pour ce profil (même principe que
  // TacheWorkflowService vis-à-vis de SodGuard).
});
