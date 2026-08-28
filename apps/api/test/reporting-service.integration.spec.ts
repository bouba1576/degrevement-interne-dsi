import { PrismaService } from "../src/infra/prisma/prisma.service";
import { ReportingService } from "../src/modules/reporting/services/reporting.service";

// GET /api/reporting (26/08/2026) — 5 types de rapports (transmis/rejetés/
// validés/en cours/consolidé) réduits à un seul service, cf. CLAUDE.md.
// Isolation : chaque groupe de cas utilise une fenêtre de dates fixe et
// rare (années passées distinctes, jamais "aujourd'hui") — aucun autre test
// de ce dépôt ne pose de dateSoumission/dateCloture sur ces dates précises,
// donc aucun risque de bruit d'un fichier exécuté en parallèle (convention
// « clé ouverte », Phase 5) sans avoir besoin d'un circuit dédié introuvable
// (seules 3 valeurs d'EnumCircuit existent, partagées par tous les tests).
describe("ReportingService — rapports de dégrèvements (26/08/2026)", () => {
  const prisma = new PrismaService();
  const service = new ReportingService(prisma);

  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let agentId: string;
  const demandeIds: string[] = [];
  const tacheIds: string[] = [];
  const roleCodes: string[] = [];

  beforeAll(async () => {
    const agent = await prisma.utilisateur.create({
      data: { identifiantAd: `test.reporting-${suffixe}@orange.com`, nom: "Agent Test Reporting" }
    });
    agentId = agent.id;
  });

  // JournalAudit ne se nettoie JAMAIS en fin de test (middleware
  // interdireMutationAudit, append-only — CLAUDE.md « JournalAudit ne se
  // nettoie JAMAIS en fin de test ») : les entrées créées ci-dessous
  // deviennent orphelines (demandeId → NULL, ON DELETE SET NULL) une fois
  // leur Demande supprimée — comportement voulu, pas une fuite.
  afterAll(async () => {
    await prisma.tache.deleteMany({ where: { id: { in: tacheIds } } });
    await prisma.demande.deleteMany({ where: { id: { in: demandeIds } } });
    await prisma.role.deleteMany({ where: { code: { in: roleCodes } } });
    await prisma.utilisateur.deleteMany({ where: { id: agentId } });
    await prisma.$disconnect();
  });

  async function creerDemande(options: {
    circuit?: "DOBB" | "DXC" | "DF";
    statut?: "BROUILLON" | "SOUMIS" | "VALIDE" | "REJETE";
    dateSoumission?: Date | null;
    dateCloture?: Date | null;
  }) {
    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-REPORTING-${suffixe}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        circuit: options.circuit ?? "DOBB",
        segment: "B2B",
        nomClient: "Client Test Reporting",
        initiateurId: agentId,
        statut: options.statut ?? "SOUMIS",
        dateSoumission: options.dateSoumission,
        dateCloture: options.dateCloture
      }
    });
    demandeIds.push(demande.id);
    return demande;
  }

  it("transmis — compte les dossiers dont dateSoumission tombe dans [debut, fin), jamais hors fenêtre ni autre circuit", async () => {
    // Delta sur une mesure AVANT/APRÈS plutôt qu'une égalité absolue :
    // robuste même si une exécution précédente interrompue a laissé des
    // lignes orphelines dans cette même fenêtre (déjà observé une fois en
    // écrivant ce test — cf. incident documenté, nettoyé manuellement).
    const avant = await service.generer({ debut: "2019-03-01", fin: "2019-03-31", circuit: "DOBB" });
    await Promise.all([
      creerDemande({ circuit: "DOBB", dateSoumission: new Date("2019-03-10T10:00:00Z") }),
      creerDemande({ circuit: "DOBB", dateSoumission: new Date("2019-03-15T23:59:00Z") }),
      creerDemande({ circuit: "DOBB", dateSoumission: new Date("2019-04-01T00:00:00Z") }), // hors fenêtre
      creerDemande({ circuit: "DXC", dateSoumission: new Date("2019-03-12T10:00:00Z") }) // autre circuit
    ]);

    const apres = await service.generer({ debut: "2019-03-01", fin: "2019-03-31", circuit: "DOBB" });
    expect(apres.transmis.total - avant.transmis.total).toBe(2);
  });

  it("rejetés/validés — comptés sur dateCloture (pas dateSoumission), taux cohérent sur les dossiers clôturés", async () => {
    const avant = await service.generer({ debut: "2019-06-01", fin: "2019-06-30", circuit: "DXC" });
    await Promise.all([
      creerDemande({ circuit: "DXC", statut: "REJETE", dateSoumission: new Date("2018-01-01"), dateCloture: new Date("2019-06-10") }),
      creerDemande({ circuit: "DXC", statut: "REJETE", dateSoumission: new Date("2018-01-01"), dateCloture: new Date("2019-06-15") }),
      creerDemande({ circuit: "DXC", statut: "VALIDE", dateSoumission: new Date("2018-01-01"), dateCloture: new Date("2019-06-20") }),
      creerDemande({ circuit: "DXC", statut: "REJETE", dateSoumission: new Date("2018-01-01"), dateCloture: new Date("2019-07-01") }) // hors fenêtre
    ]);

    const apres = await service.generer({ debut: "2019-06-01", fin: "2019-06-30", circuit: "DXC" });
    expect(apres.rejetes.total - avant.rejetes.total).toBe(2);
    expect(apres.valides.total - avant.valides.total).toBe(1);
    // Le taux est recalculé sur le total réel (avant + après), pas seulement
    // le delta introduit par ce test — reconstruit ici pour l'assertion.
    const rejetesReel = apres.rejetes.total;
    const validesReel = apres.valides.total;
    expect(apres.rejetes.tauxRejet).toBeCloseTo(rejetesReel / (rejetesReel + validesReel), 5);
    expect(apres.valides.tauxValidation).toBeCloseTo(validesReel / (rejetesReel + validesReel), 5);
  });

  it("taux null quand aucun dossier clôturé pendant la période — jamais une division par zéro déguisée", async () => {
    const rapport = await service.generer({ debut: "2017-01-01", fin: "2017-01-02", circuit: "DF" });
    expect(rapport.rejetes.total).toBe(0);
    expect(rapport.valides.total).toBe(0);
    expect(rapport.rejetes.tauxRejet).toBeNull();
    expect(rapport.valides.tauxValidation).toBeNull();
  });

  it("principaux motifs — agrège JournalAudit.commentaire (action=rejet) par chaîne exacte, ordre décroissant", async () => {
    const d1 = await creerDemande({ circuit: "DF", statut: "REJETE", dateCloture: new Date("2016-05-10") });
    const d2 = await creerDemande({ circuit: "DF", statut: "REJETE", dateCloture: new Date("2016-05-12") });
    const d3 = await creerDemande({ circuit: "DF", statut: "REJETE", dateCloture: new Date("2016-05-14") });

    const motifFrequent = `Pièce manquante ${suffixe}`;
    const motifRare = `Montant incohérent ${suffixe}`;
    await Promise.all([
      prisma.journalAudit.create({ data: { demandeId: d1.id, acteur: "test", action: "rejet", commentaire: motifFrequent } }),
      prisma.journalAudit.create({ data: { demandeId: d2.id, acteur: "test", action: "rejet", commentaire: motifFrequent } }),
      prisma.journalAudit.create({ data: { demandeId: d3.id, acteur: "test", action: "rejet", commentaire: motifRare } })
    ]);

    const rapport = await service.generer({ debut: "2016-05-01", fin: "2016-05-31", circuit: "DF" });
    expect(rapport.rejetes.principauxMotifs.find((m) => m.motif === motifFrequent)).toEqual({ motif: motifFrequent, total: 2 });
    expect(rapport.rejetes.principauxMotifs.find((m) => m.motif === motifRare)).toEqual({ motif: motifRare, total: 1 });
  });

  it("en cours — instantané indépendant de la période demandée, groupé par rôle, ancienneté dérivée de dateSoumission", async () => {
    const roleTest = `TEST_ROLE_REPORTING_${suffixe}`.slice(0, 40);
    await prisma.role.create({ data: { code: roleTest, libelle: roleTest, groupeAd: `GG-${roleTest}`, niveau: 1, type: "METIER", profilSysteme: "VALIDATEUR" } });
    roleCodes.push(roleTest);

    const ancienDe10Jours = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const demande = await creerDemande({ circuit: "DOBB", statut: "SOUMIS", dateSoumission: ancienDe10Jours });
    const tache = await prisma.tache.create({
      data: { demandeId: demande.id, roleCorbeille: roleTest, ordre: 1, typeActeur: "V", bloquant: true, slaHeures: 8, etat: "EN_CORBEILLE" }
    });
    tacheIds.push(tache.id);

    // Période explicitement SANS RAPPORT avec dateSoumission (il y a 10 jours) —
    // preuve que « en cours » ignore le filtre de période, contrairement aux
    // 3 autres sections.
    const rapport = await service.generer({ debut: "2015-01-01", fin: "2015-01-02", circuit: "DOBB" });
    const ligneRole = rapport.enCours.parRole.find((p) => p.roleCorbeille === roleTest);
    expect(ligneRole?.total).toBeGreaterThanOrEqual(1);
    const plusAncien = rapport.enCours.plusAnciens.find((p) => p.demandeId === demande.id);
    expect(plusAncien?.ancienneteJours).toBeGreaterThanOrEqual(9);
    expect(plusAncien?.ancienneteJours).toBeLessThanOrEqual(11);
  });

  it("exporter — CSV et PDF non vides, content-type corrects", async () => {
    const csv = await service.exporter({ debut: "2019-03-01", fin: "2019-03-31", circuit: "DOBB", format: "csv" });
    expect(csv.contentType).toContain("text/csv");
    expect(csv.buffer.length).toBeGreaterThan(0);
    expect(csv.buffer.toString("utf-8")).toContain("transmis;total");

    const pdf = await service.exporter({ debut: "2019-03-01", fin: "2019-03-31", circuit: "DOBB", format: "pdf" });
    expect(pdf.contentType).toBe("application/pdf");
    expect(pdf.buffer.length).toBeGreaterThan(0);
  });
});
