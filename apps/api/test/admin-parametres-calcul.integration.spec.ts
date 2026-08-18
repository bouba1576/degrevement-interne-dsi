import { PrismaService } from "../src/infra/prisma/prisma.service";
import { MontantService } from "../src/modules/demandes/services/montant.service";
import { HistoriqueMontantService } from "../src/modules/demandes/services/historique-montant.service";
import { AdminParametresCalculService } from "../src/modules/admin/services/admin-parametres-calcul.service";

// Intégration réelle contre Postgres — PGD-043 (ParametreCalcul). Décision
// actée après revue Phase 5 : SOUMIS garde son taux figé (instantané
// volontaire) ; BROUILLON suit le nouveau taux, recalculé et tracé dans
// HISTORIQUE_MONTANT (origine=RECALCUL, acteur_id=NULL — cas système).
describe("AdminParametresCalculService.modifier — recalcul brouillon / gel soumis", () => {
  const prisma = new PrismaService();
  const montantService = new MontantService(prisma);
  const historique = new HistoriqueMontantService(prisma);
  const service = new AdminParametresCalculService(prisma, montantService, historique);

  const acteur = { id: "44444444-4444-4444-4444-444444444444", identifiantAd: "test.parametres@orange.com" };
  let tauxOriginal: { tauxTsc: string; tauxTva: string };
  let assietteTvaDefautOriginal: "HT" | "HT_TSC";
  let demandeBrouillonId: string;
  let demandeSoumiseId: string;

  beforeAll(async () => {
    await prisma.utilisateur.upsert({
      where: { id: acteur.id },
      update: {},
      create: { id: acteur.id, identifiantAd: acteur.identifiantAd, nom: "Test Paramètres" }
    });
    const parametre = await prisma.parametreCalcul.findUniqueOrThrow({ where: { circuit: "DOBB" } });
    tauxOriginal = { tauxTsc: parametre.tauxTsc.toString(), tauxTva: parametre.tauxTva.toString() };
    assietteTvaDefautOriginal = parametre.assietteTvaDefaut;
  });

  afterEach(async () => {
    // Restaure le taux ET l'assiette TVA de DOBB — partagés avec d'autres
    // fichiers de test contre le même Postgres, ne doivent pas fuiter d'un
    // test à l'autre (convention « clé fermée » du projet).
    await prisma.parametreCalcul.update({
      where: { circuit: "DOBB" },
      data: { tauxTsc: tauxOriginal.tauxTsc, tauxTva: tauxOriginal.tauxTva, assietteTvaDefaut: assietteTvaDefautOriginal }
    });
    await prisma.historiqueMontant.deleteMany({
      where: { demandeId: { in: [demandeBrouillonId, demandeSoumiseId].filter(Boolean) } }
    });
    await prisma.demande.deleteMany({ where: { id: { in: [demandeBrouillonId, demandeSoumiseId].filter(Boolean) } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function creerDemande(
    statut: "BROUILLON" | "SOUMIS",
    suffixe: string,
    assietteTva: "HT" | "HT_TSC" = "HT_TSC"
  ): Promise<string> {
    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-PARAM-${suffixe}`,
        circuit: "DOBB",
        segment: "B2B",
        nomClient: "Client Test Paramètres",
        initiateurId: acteur.id,
        montantHt: 1_000_000,
        tauxTsc: tauxOriginal.tauxTsc,
        tauxTva: tauxOriginal.tauxTva,
        assietteTva,
        // HT=1_000_000, TSC=30_000 : cascade HT_TSC -> TVA=(1_030_000)*0.18=185_400
        montantTsc: 30_000,
        montantTva: 185_400,
        montantTtc: 1_215_400,
        statut,
        ...(statut === "SOUMIS" ? { dateSoumission: new Date(), etapeCourante: 1 } : {})
      }
    });
    return demande.id;
  }

  it("recalcule les brouillons du circuit et gèle les demandes déjà soumises", async () => {
    demandeBrouillonId = await creerDemande("BROUILLON", `B-${Date.now()}`);
    demandeSoumiseId = await creerDemande("SOUMIS", `S-${Date.now()}`);

    // assietteTvaDefaut fixé explicitement (HT_TSC) : ce test porte sur le
    // recalcul de tauxTsc/tauxTva, pas sur l'assiette (couverte par le test
    // dédié plus bas) — sans ce pin, le calcul dépend du défaut AMBIANT du
    // circuit DOBB, qui a basculé vers HT le 2026-08-11 (confirmation
    // métier, CLAUDE.md) : ce test l'aurait silencieusement cassé sans ce
    // fix, trouvé en sweep complet plutôt que supposé toujours vert.
    const reponse = await service.modifier("DOBB", { tauxTsc: 0.05, tauxTva: 0.2, assietteTvaDefaut: "HT_TSC" });
    expect(reponse.parametre.tauxTsc).toBe(0.05);
    expect(reponse.parametre.tauxTva).toBe(0.2);
    expect(reponse.demandesBrouillonRecalculees).toBeGreaterThanOrEqual(1);

    const brouillonApres = await prisma.demande.findUniqueOrThrow({ where: { id: demandeBrouillonId } });
    expect(Number(brouillonApres.tauxTsc)).toBe(0.05);
    expect(Number(brouillonApres.tauxTva)).toBe(0.2);
    // HT=1_000_000, assiette HT_TSC : TSC=50_000, TVA=(1_050_000)*0.20=210_000, TTC=1_260_000
    expect(Number(brouillonApres.montantTsc)).toBe(50_000);
    expect(Number(brouillonApres.montantTva)).toBe(210_000);
    expect(Number(brouillonApres.montantTtc)).toBe(1_260_000);

    const historiqueBrouillon = await prisma.historiqueMontant.findFirst({
      where: { demandeId: demandeBrouillonId, origine: "RECALCUL" },
      orderBy: { horodatage: "desc" }
    });
    expect(historiqueBrouillon).not.toBeNull();
    expect(historiqueBrouillon?.acteurId).toBeNull(); // R23 : cas système

    // Gel — la demande déjà soumise ne bouge pas.
    const soumiseApres = await prisma.demande.findUniqueOrThrow({ where: { id: demandeSoumiseId } });
    expect(Number(soumiseApres.tauxTsc)).toBe(Number(tauxOriginal.tauxTsc));
    expect(Number(soumiseApres.tauxTva)).toBe(Number(tauxOriginal.tauxTva));
    expect(Number(soumiseApres.montantTtc)).toBe(1_215_400);

    const historiqueSoumise = await prisma.historiqueMontant.findFirst({ where: { demandeId: demandeSoumiseId } });
    expect(historiqueSoumise).toBeNull();
  });

  // Dédié — signalé après revue Phase 5 : le gel est structurellement vrai
  // parce que tauxTsc/tauxTva vivent sur DEMANDE, mais rien dans le schéma ou
  // le service ne PROTÈGE cette propriété. Si ces colonnes sont un jour
  // jugées redondantes avec ParametreCalcul et supprimées, le gel disparaît
  // sans erreur de compilation ni de test qui l'accompagnerait — sauf celui-
  // ci, qui échouerait immédiatement (montants soudain recalculés au lieu de
  // rester égaux à leur valeur d'origine).
  it("verrouille le gel : une demande SOUMIS ne bouge JAMAIS, même après plusieurs changements de taux successifs", async () => {
    demandeSoumiseId = await creerDemande("SOUMIS", `GEL-${Date.now()}`);
    demandeBrouillonId = "";

    const avantTauxTsc = Number(tauxOriginal.tauxTsc);
    const avantTauxTva = Number(tauxOriginal.tauxTva);
    const avantMontantTtc = 1_215_400;

    await service.modifier("DOBB", { tauxTsc: 0.09, tauxTva: 0.25 });
    await service.modifier("DOBB", { tauxTsc: 0.01, tauxTva: 0.1 });

    const apres = await prisma.demande.findUniqueOrThrow({ where: { id: demandeSoumiseId } });
    expect(Number(apres.tauxTsc)).toBe(avantTauxTsc);
    expect(Number(apres.tauxTva)).toBe(avantTauxTva);
    expect(Number(apres.montantTtc)).toBe(avantMontantTtc);

    const historique = await prisma.historiqueMontant.findFirst({ where: { demandeId: demandeSoumiseId } });
    expect(historique).toBeNull();
  });

  it("ne déclenche aucun recalcul quand seuls tscActiveDefaut/devise changent (pas les taux)", async () => {
    demandeBrouillonId = await creerDemande("BROUILLON", `B2-${Date.now()}`);
    demandeSoumiseId = "";

    const reponse = await service.modifier("DOBB", { devise: "XOF" });
    expect(reponse.demandesBrouillonRecalculees).toBe(0);

    const historique = await prisma.historiqueMontant.findFirst({ where: { demandeId: demandeBrouillonId } });
    expect(historique).toBeNull();
  });

  // Confirmation métier du 2026-08-11 (défaut HT_TSC -> HT, cf. CLAUDE.md) —
  // assietteTvaDefaut seul (sans changement de tauxTsc/tauxTva) doit suivre
  // exactement le même mécanisme que les taux : recalcul des BROUILLON,
  // gel des SOUMIS. Jamais explicitement isolé avant ce tour — les tests
  // ci-dessus ne changent que tauxTsc/tauxTva, jamais assietteTvaDefaut seul.
  it("recalcule les brouillons quand seul assietteTvaDefaut change (HT_TSC -> HT), gèle les soumises", async () => {
    demandeBrouillonId = await creerDemande("BROUILLON", `ASSIETTE-B-${Date.now()}`, "HT_TSC");
    demandeSoumiseId = await creerDemande("SOUMIS", `ASSIETTE-S-${Date.now()}`, "HT_TSC");

    const reponse = await service.modifier("DOBB", { assietteTvaDefaut: "HT" });
    expect(reponse.parametre.assietteTvaDefaut).toBe("HT");
    expect(reponse.demandesBrouillonRecalculees).toBeGreaterThanOrEqual(1);

    const brouillonApres = await prisma.demande.findUniqueOrThrow({ where: { id: demandeBrouillonId } });
    expect(brouillonApres.assietteTva).toBe("HT");
    // HT=1_000_000, taux inchangés : TSC=30_000 (assiette n'affecte que la TVA),
    // TVA=1_000_000*0.18=180_000 (HT seul, plus de +TSC dans l'assiette), TTC=1_210_000.
    expect(Number(brouillonApres.montantTsc)).toBe(30_000);
    expect(Number(brouillonApres.montantTva)).toBe(180_000);
    expect(Number(brouillonApres.montantTtc)).toBe(1_210_000);

    const historiqueBrouillon = await prisma.historiqueMontant.findFirst({
      where: { demandeId: demandeBrouillonId, origine: "RECALCUL" },
      orderBy: { horodatage: "desc" }
    });
    expect(historiqueBrouillon).not.toBeNull();
    expect(historiqueBrouillon?.acteurId).toBeNull(); // R23 : cas système

    // Gel — assiette ET montants de la demande déjà soumise ne bougent pas.
    const soumiseApres = await prisma.demande.findUniqueOrThrow({ where: { id: demandeSoumiseId } });
    expect(soumiseApres.assietteTva).toBe("HT_TSC");
    expect(Number(soumiseApres.montantTva)).toBe(185_400);
    expect(Number(soumiseApres.montantTtc)).toBe(1_215_400);

    const historiqueSoumise = await prisma.historiqueMontant.findFirst({ where: { demandeId: demandeSoumiseId } });
    expect(historiqueSoumise).toBeNull();
  });
});
