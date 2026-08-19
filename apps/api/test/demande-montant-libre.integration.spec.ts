import { PrismaService } from "../src/infra/prisma/prisma.service";
import { DemandeService } from "../src/modules/demandes/services/demande.service";
import { MontantService } from "../src/modules/demandes/services/montant.service";
import { HistoriqueMontantService } from "../src/modules/demandes/services/historique-montant.service";
import { ReferenceService } from "../src/modules/demandes/services/reference.service";
import { GedStubAdapter } from "../src/modules/demandes/providers/ged-stub.adapter";

// Intégration réelle contre Postgres — Priorité 2 (19/08/2026), montant à
// ajuster HT saisi directement au niveau du dossier (R18 abandonnée, cf.
// CLAUDE.md « Fiches d'ajustement — abandon du rattachement à une ligne
// réelle »). Complète demande-workflow.integration.spec.ts (qui prouve que
// R17/R15 ne bloquent plus une soumission sans ligne) : ce fichier prouve
// que le montant lui-même est correctement calculé et tracé, pas seulement
// que la soumission n'échoue plus.
describe("DemandeService — montant HT direct (Priorité 2)", () => {
  const prisma = new PrismaService();
  const reference = new ReferenceService();
  const montant = new MontantService(prisma);
  const historique = new HistoriqueMontantService(prisma);
  const demandeService = new DemandeService(prisma, reference, montant, historique, new GedStubAdapter());

  const acteur = { id: "99999999-9999-9999-9999-999999999999", identifiantAd: "test.montant.libre@orange.com" };
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  beforeAll(async () => {
    await prisma.utilisateur.upsert({
      where: { id: acteur.id },
      update: {},
      create: { id: acteur.id, identifiantAd: acteur.identifiantAd, nom: "Test Montant Libre" }
    });
  });

  afterEach(async () => {
    await prisma.historiqueMontant.deleteMany({ where: { demande: { nomClient: `TEST_ML_${suffixe}` } } });
    await prisma.demande.deleteMany({ where: { nomClient: `TEST_ML_${suffixe}` } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creer() avec montantHt calcule TSC/TVA/TTC via le même moteur que MontantService.calculer, jamais 0", async () => {
    const detail = await demandeService.creer(
      { circuit: "DOBB", nomClient: `TEST_ML_${suffixe}`, montantHt: 100_000, numeroCase: "CASE-100231" },
      acteur.id
    );

    const enBase = await prisma.demande.findUniqueOrThrow({ where: { id: detail.demande.id } });
    const taux = montant.tauxDepuisDemande(enBase);
    const attendu = montant.calculer(100_000, taux);

    expect(Number(enBase.montantHt)).toBe(attendu.montantHt);
    expect(Number(enBase.montantTsc)).toBe(attendu.montantTsc);
    expect(Number(enBase.montantTva)).toBe(attendu.montantTva);
    expect(Number(enBase.montantTtc)).toBe(attendu.montantTtc);
    expect(attendu.montantTtc).toBeGreaterThan(100_000); // TSC/TVA réellement appliquées, pas un passthrough
    expect(enBase.numeroCase).toBe("CASE-100231");
  });

  it("creer() sans montantHt reste à 0 — un brouillon peut exister sans montant tant qu'il n'est pas soumis", async () => {
    const detail = await demandeService.creer({ circuit: "DOBB", nomClient: `TEST_ML_${suffixe}` }, acteur.id);
    expect(detail.demande.montantHt).toBe(0);
    expect(detail.demande.montantTtc).toBe(0);
  });

  it("creer() écrit HISTORIQUE_MONTANT avec les montants réels (jamais hardcodé à 0 quand montantHt est fourni)", async () => {
    const detail = await demandeService.creer(
      { circuit: "DOBB", nomClient: `TEST_ML_${suffixe}`, montantHt: 50_000 },
      acteur.id
    );

    const entree = await prisma.historiqueMontant.findFirstOrThrow({
      where: { demandeId: detail.demande.id, origine: "CREATION" }
    });
    expect(Number(entree.ht)).toBe(50_000);
    expect(Number(entree.ttc)).toBeGreaterThan(50_000);
    expect(entree.acteurId).toBe(acteur.id);
  });

  it("modifier() avec montantHt recalcule TSC/TVA/TTC et journalise une entrée HISTORIQUE_MONTANT distincte (R23)", async () => {
    const detail = await demandeService.creer(
      { circuit: "DOBB", nomClient: `TEST_ML_${suffixe}`, montantHt: 10_000 },
      acteur.id
    );
    const avant = await prisma.historiqueMontant.count({ where: { demandeId: detail.demande.id } });

    const modifie = await demandeService.modifier(detail.demande.id, { montantHt: 200_000 }, acteur.id);

    expect(modifie.demande.montantHt).toBe(200_000);
    expect(modifie.demande.montantTtc).toBeGreaterThan(200_000);

    const apres = await prisma.historiqueMontant.count({ where: { demandeId: detail.demande.id } });
    expect(apres).toBe(avant + 1);

    const derniere = await prisma.historiqueMontant.findFirstOrThrow({
      where: { demandeId: detail.demande.id, origine: "MODIFICATION" }
    });
    expect(Number(derniere.ht)).toBe(200_000);
    expect(derniere.acteurId).toBe(acteur.id);
  });

  it("modifier() sans montantHt ne touche pas les montants existants et n'écrit aucune entrée HISTORIQUE_MONTANT supplémentaire", async () => {
    const detail = await demandeService.creer(
      { circuit: "DOBB", nomClient: `TEST_ML_${suffixe}`, montantHt: 15_000 },
      acteur.id
    );
    const avant = await prisma.historiqueMontant.count({ where: { demandeId: detail.demande.id } });

    const modifie = await demandeService.modifier(detail.demande.id, { commentaire: "Sans toucher au montant." }, acteur.id);

    expect(modifie.demande.montantHt).toBe(15_000);
    const apres = await prisma.historiqueMontant.count({ where: { demandeId: detail.demande.id } });
    expect(apres).toBe(avant);
  });

  it("recurrentMensuel round-trip comme un montant (nombre), pas un booléen", async () => {
    const detail = await demandeService.creer(
      { circuit: "DOBB", nomClient: `TEST_ML_${suffixe}`, recurrentMensuel: 12_500 },
      acteur.id
    );
    expect(detail.demande.recurrentMensuel).toBe(12_500);

    const modifie = await demandeService.modifier(detail.demande.id, { recurrentMensuel: 0 }, acteur.id);
    expect(modifie.demande.recurrentMensuel).toBe(0);
  });
});
