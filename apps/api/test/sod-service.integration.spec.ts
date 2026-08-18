import { PrismaService } from "../src/infra/prisma/prisma.service";
import { SodService } from "../src/common/guards/sod.service";

// Intégration réelle contre Postgres (docker compose, pas de mock de requête).
describe("SodService — R3 + R21 (délégation)", () => {
  const prisma = new PrismaService();
  const sodService = new SodService(prisma);

  let demandeId: string;
  let tacheN1Id: string;
  const initiateurId = "11111111-1111-1111-1111-111111111111";

  beforeAll(async () => {
    await prisma.utilisateur.upsert({
      where: { id: initiateurId },
      update: {},
      create: {
        id: initiateurId,
        identifiantAd: "test.initiateur@orange.com",
        nom: "Test Initiateur"
      }
    });
  });

  beforeEach(async () => {
    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-SOD-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        circuit: "DOBB",
        segment: "B2B",
        nomClient: "Client Test SoD",
        montantHt: 100000,
        initiateurId
      }
    });
    demandeId = demande.id;

    const tache1 = await prisma.tache.create({
      data: {
        demandeId,
        roleCorbeille: "RESPONSABLE_DOBB",
        ordre: 1,
        typeActeur: "V",
        bloquant: true,
        slaHeures: 8,
        etat: "APPROUVEE"
      }
    });
    tacheN1Id = tache1.id;

    await prisma.tache.create({
      data: {
        demandeId,
        roleCorbeille: "MANAGER_DOBB",
        ordre: 2,
        typeActeur: "V",
        bloquant: true,
        slaHeures: 8,
        etat: "EN_CORBEILLE"
      }
    });
  });

  afterEach(async () => {
    // JournalAudit est append-only (T6) — pas de nettoyage ici.
    await prisma.tache.deleteMany({ where: { demandeId } });
    await prisma.demande.delete({ where: { id: demandeId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("n'a aucun conflit s'il n'existe pas d'action à l'étape N-1", async () => {
    const resultat = await sodService.verifier({
      demandeId,
      etapeOrdreActuelle: 2,
      agentIdentifiantAd: "quelqu.un@orange.com"
    });
    expect(resultat.conflit).toBe(false);
  });

  it("R3 — détecte le conflit quand le même agent a agi à l'étape N-1", async () => {
    await prisma.journalAudit.create({
      data: { demandeId, tacheId: tacheN1Id, acteur: "marie.diallo@orange.com", action: "approbation" }
    });

    const resultat = await sodService.verifier({
      demandeId,
      etapeOrdreActuelle: 2,
      agentIdentifiantAd: "marie.diallo@orange.com"
    });
    expect(resultat.conflit).toBe(true);
    expect(resultat.acteurEtapePrecedente).toBe("marie.diallo@orange.com");
  });

  it("R3 — n'a pas de conflit quand un AUTRE agent traite l'étape N", async () => {
    await prisma.journalAudit.create({
      data: { demandeId, tacheId: tacheN1Id, acteur: "marie.diallo@orange.com", action: "approbation" }
    });

    const resultat = await sodService.verifier({
      demandeId,
      etapeOrdreActuelle: 2,
      agentIdentifiantAd: "paul.brou@orange.com"
    });
    expect(resultat.conflit).toBe(false);
  });

  it("R21 — détecte le conflit quand le délégataire agit pour un délégant ayant traité N-1", async () => {
    // Le titulaire (délégant) a traité l'étape N-1 lui-même.
    await prisma.journalAudit.create({
      data: { demandeId, tacheId: tacheN1Id, acteur: "chef.service@orange.com", action: "approbation" }
    });

    // Son intérimaire (délégataire) tente de traiter l'étape N en son nom.
    const resultat = await sodService.verifier({
      demandeId,
      etapeOrdreActuelle: 2,
      agentIdentifiantAd: "interimaire@orange.com",
      agitPourCompteDe: "chef.service@orange.com"
    });
    expect(resultat.conflit).toBe(true);
    expect(resultat.acteurEtapePrecedente).toBe("chef.service@orange.com");
  });

  it("R21 — détecte le conflit quand le titulaire agit après que son intérimaire a traité N-1 pour lui", async () => {
    // L'étape N-1 a été traitée par l'intérimaire, POUR LE COMPTE du titulaire.
    await prisma.journalAudit.create({
      data: {
        demandeId,
        tacheId: tacheN1Id,
        acteur: "interimaire@orange.com",
        action: "approbation",
        detail: { delegationId: "deleg-1", delegantIdentifiantAd: "chef.service@orange.com" }
      }
    });

    // Le titulaire lui-même tente de traiter l'étape N.
    const resultat = await sodService.verifier({
      demandeId,
      etapeOrdreActuelle: 2,
      agentIdentifiantAd: "chef.service@orange.com"
    });
    expect(resultat.conflit).toBe(true);
  });

  it("n'a pas de conflit entre deux délégations sans lien de titulaire commun", async () => {
    await prisma.journalAudit.create({
      data: { demandeId, tacheId: tacheN1Id, acteur: "marie.diallo@orange.com", action: "approbation" }
    });

    const resultat = await sodService.verifier({
      demandeId,
      etapeOrdreActuelle: 2,
      agentIdentifiantAd: "interimaire@orange.com",
      agitPourCompteDe: "quelqu.un-dautre@orange.com"
    });
    expect(resultat.conflit).toBe(false);
  });
});

// R24 — trouvé en direct (essai de bout en bout Phase 9, dossier DF-2026-AF5715) :
// un acteur ayant approuvé l'étape bloquante N-1 (typeActeur='V') ne peut pas
// ensuite réaliser le contrôle a posteriori N (typeActeur='C') du même dossier.
// SodService.verifier ne distingue jamais typeActeur (cf. implémentation) — R3
// s'applique donc déjà uniformément avant ce test ; ce bloc ne change aucun
// comportement, il verrouille structurellement un comportement jusqu'ici
// seulement observé une fois en conditions réelles, jamais couvert par un
// test. Sans lui, un futur refactor de SodService qui introduirait une
// exception pour typeActeur='C' (par exemple en pensant, à tort, qu'un
// contrôle a posteriori est "hors chemin bloquant" donc hors SoD) passerait
// inaperçu jusqu'à la prochaine vérification manuelle.
describe("SodService — R24 (SoD étendu au contrôle a posteriori, typeActeur='C')", () => {
  const prisma = new PrismaService();
  const sodService = new SodService(prisma);

  let demandeId: string;
  let tacheEtapeBloquanteId: string;
  const initiateurId = "22222222-2222-2222-2222-222222222222";

  beforeAll(async () => {
    await prisma.utilisateur.upsert({
      where: { id: initiateurId },
      update: {},
      create: {
        id: initiateurId,
        identifiantAd: "test.initiateur.r24@orange.com",
        nom: "Test Initiateur R24"
      }
    });
  });

  beforeEach(async () => {
    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-SOD-R24-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        circuit: "DF",
        segment: "WHOLESALE",
        nomClient: "Client Test SoD R24",
        montantHt: 6500000,
        initiateurId
      }
    });
    demandeId = demande.id;

    const tacheBloquante = await prisma.tache.create({
      data: {
        demandeId,
        roleCorbeille: "DF",
        ordre: 1,
        typeActeur: "V",
        bloquant: true,
        slaHeures: 24,
        etat: "APPROUVEE"
      }
    });
    tacheEtapeBloquanteId = tacheBloquante.id;

    await prisma.tache.create({
      data: {
        demandeId,
        roleCorbeille: "FRA",
        ordre: 2,
        typeActeur: "C",
        bloquant: true,
        slaHeures: 48,
        etat: "POST_CLOTURE"
      }
    });
  });

  afterEach(async () => {
    await prisma.tache.deleteMany({ where: { demandeId } });
    await prisma.demande.delete({ where: { id: demandeId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("R24 — détecte le conflit quand l'acteur du contrôle a approuvé l'étape bloquante précédente", async () => {
    await prisma.journalAudit.create({
      data: { demandeId, tacheId: tacheEtapeBloquanteId, acteur: "jean.kouassi@orange.com", action: "approbation" }
    });

    const resultat = await sodService.verifier({
      demandeId,
      etapeOrdreActuelle: 2,
      agentIdentifiantAd: "jean.kouassi@orange.com"
    });
    expect(resultat.conflit).toBe(true);
    expect(resultat.acteurEtapePrecedente).toBe("jean.kouassi@orange.com");
  });

  it("R24 — n'a pas de conflit quand un AUTRE acteur réalise le contrôle", async () => {
    await prisma.journalAudit.create({
      data: { demandeId, tacheId: tacheEtapeBloquanteId, acteur: "jean.kouassi@orange.com", action: "approbation" }
    });

    const resultat = await sodService.verifier({
      demandeId,
      etapeOrdreActuelle: 2,
      agentIdentifiantAd: "fra.controleur@orange.com"
    });
    expect(resultat.conflit).toBe(false);
  });
});
