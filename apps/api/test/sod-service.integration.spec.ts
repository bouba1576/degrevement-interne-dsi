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
        identifiantAd: "test.initiateur@orange.ci",
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
      agentIdentifiantAd: "quelqu.un@orange.ci"
    });
    expect(resultat.conflit).toBe(false);
  });

  it("R3 — détecte le conflit quand le même agent a agi à l'étape N-1", async () => {
    await prisma.journalAudit.create({
      data: { demandeId, tacheId: tacheN1Id, acteur: "marie.diallo@orange.ci", action: "approbation" }
    });

    const resultat = await sodService.verifier({
      demandeId,
      etapeOrdreActuelle: 2,
      agentIdentifiantAd: "marie.diallo@orange.ci"
    });
    expect(resultat.conflit).toBe(true);
    expect(resultat.acteurEtapePrecedente).toBe("marie.diallo@orange.ci");
  });

  it("R3 — n'a pas de conflit quand un AUTRE agent traite l'étape N", async () => {
    await prisma.journalAudit.create({
      data: { demandeId, tacheId: tacheN1Id, acteur: "marie.diallo@orange.ci", action: "approbation" }
    });

    const resultat = await sodService.verifier({
      demandeId,
      etapeOrdreActuelle: 2,
      agentIdentifiantAd: "paul.brou@orange.ci"
    });
    expect(resultat.conflit).toBe(false);
  });

  it("R21 — détecte le conflit quand le délégataire agit pour un délégant ayant traité N-1", async () => {
    // Le titulaire (délégant) a traité l'étape N-1 lui-même.
    await prisma.journalAudit.create({
      data: { demandeId, tacheId: tacheN1Id, acteur: "chef.service@orange.ci", action: "approbation" }
    });

    // Son intérimaire (délégataire) tente de traiter l'étape N en son nom.
    const resultat = await sodService.verifier({
      demandeId,
      etapeOrdreActuelle: 2,
      agentIdentifiantAd: "interimaire@orange.ci",
      agitPourCompteDe: "chef.service@orange.ci"
    });
    expect(resultat.conflit).toBe(true);
    expect(resultat.acteurEtapePrecedente).toBe("chef.service@orange.ci");
  });

  it("R21 — détecte le conflit quand le titulaire agit après que son intérimaire a traité N-1 pour lui", async () => {
    // L'étape N-1 a été traitée par l'intérimaire, POUR LE COMPTE du titulaire.
    await prisma.journalAudit.create({
      data: {
        demandeId,
        tacheId: tacheN1Id,
        acteur: "interimaire@orange.ci",
        action: "approbation",
        detail: { delegationId: "deleg-1", delegantIdentifiantAd: "chef.service@orange.ci" }
      }
    });

    // Le titulaire lui-même tente de traiter l'étape N.
    const resultat = await sodService.verifier({
      demandeId,
      etapeOrdreActuelle: 2,
      agentIdentifiantAd: "chef.service@orange.ci"
    });
    expect(resultat.conflit).toBe(true);
  });

  it("n'a pas de conflit entre deux délégations sans lien de titulaire commun", async () => {
    await prisma.journalAudit.create({
      data: { demandeId, tacheId: tacheN1Id, acteur: "marie.diallo@orange.ci", action: "approbation" }
    });

    const resultat = await sodService.verifier({
      demandeId,
      etapeOrdreActuelle: 2,
      agentIdentifiantAd: "interimaire@orange.ci",
      agitPourCompteDe: "quelqu.un-dautre@orange.ci"
    });
    expect(resultat.conflit).toBe(false);
  });
});
