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

  const acteur = { id: "44444444-4444-4444-4444-444444444444", identifiantAd: "test.parametres@orange.ci" };
  let tauxOriginal: { tauxTsc: string; tauxTva: string };
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
  });

  afterEach(async () => {
    // Restaure le taux DOBB — partagé avec d'autres fichiers de test contre
    // le même Postgres, ne doit pas fuiter d'un test à l'autre.
    await prisma.parametreCalcul.update({
      where: { circuit: "DOBB" },
      data: { tauxTsc: tauxOriginal.tauxTsc, tauxTva: tauxOriginal.tauxTva }
    });
    await prisma.historiqueMontant.deleteMany({
      where: { demandeId: { in: [demandeBrouillonId, demandeSoumiseId].filter(Boolean) } }
    });
    await prisma.demande.deleteMany({ where: { id: { in: [demandeBrouillonId, demandeSoumiseId].filter(Boolean) } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function creerDemande(statut: "BROUILLON" | "SOUMIS", suffixe: string): Promise<string> {
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

    const reponse = await service.modifier("DOBB", { tauxTsc: 0.05, tauxTva: 0.2 });
    expect(reponse.parametre.tauxTsc).toBe(0.05);
    expect(reponse.parametre.tauxTva).toBe(0.2);
    expect(reponse.demandesBrouillonRecalculees).toBeGreaterThanOrEqual(1);

    const brouillonApres = await prisma.demande.findUniqueOrThrow({ where: { id: demandeBrouillonId } });
    expect(Number(brouillonApres.tauxTsc)).toBe(0.05);
    expect(Number(brouillonApres.tauxTva)).toBe(0.2);
    // HT=1_000_000 : TSC=50_000, TVA=(1_050_000)*0.20=210_000, TTC=1_260_000
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
});
