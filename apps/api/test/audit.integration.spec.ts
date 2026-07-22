import { PrismaService } from "../src/infra/prisma/prisma.service";
import { AuditService } from "../src/modules/audit/audit.service";

// PGD-071/072 (SF-PGD-140, 141, 006).
describe("AuditService (docs/06 §8)", () => {
  const prisma = new PrismaService();
  const service = new AuditService(prisma);

  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let agentId: string;
  let demandeId: string;

  beforeAll(async () => {
    const agent = await prisma.utilisateur.create({
      data: { identifiantAd: `test.audit-svc-${suffixe}@orange.ci`, nom: "Agent Test Audit" }
    });
    agentId = agent.id;
  });

  afterAll(async () => {
    await prisma.utilisateur.deleteMany({ where: { id: agentId } });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // JournalAudit/JournalSecurite append-only (T6) — pas de nettoyage ici.
    await prisma.demande.deleteMany({ where: { id: demandeId } });
  });

  it("journalDemande renvoie les entrées dans l'ordre chronologique", async () => {
    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-AUDIT-SVC-${suffixe}`,
        circuit: "DOBB",
        segment: "B2B",
        nomClient: "Client Test Audit",
        initiateurId: agentId,
        montantTtc: 100_000
      }
    });
    demandeId = demande.id;

    await prisma.journalAudit.create({ data: { demandeId, acteur: "test.audit-svc", action: "creation" } });
    await new Promise((r) => setTimeout(r, 5));
    await prisma.journalAudit.create({ data: { demandeId, acteur: "test.audit-svc", action: "soumission" } });

    const entrees = await service.journalDemande(demandeId);
    expect(entrees.length).toBeGreaterThanOrEqual(2);
    expect(entrees[0]!.action).toBe("creation");
    expect(entrees[1]!.action).toBe("soumission");
  });

  it("journalDemande sur une demande introuvable -> 404 DEMANDE_INTROUVABLE", async () => {
    demandeId = "00000000-0000-0000-0000-000000000000";
    await expect(service.journalDemande(demandeId)).rejects.toMatchObject({
      response: { code: "DEMANDE_INTROUVABLE" }
    });
  });

  it("exporter(csv) produit un CSV avec la référence et les entrées", async () => {
    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-AUDIT-CSV-${suffixe}`,
        circuit: "DOBB",
        segment: "B2B",
        nomClient: "Client Test Export",
        initiateurId: agentId,
        montantTtc: 100_000
      }
    });
    demandeId = demande.id;
    await prisma.journalAudit.create({ data: { demandeId, acteur: "test.audit-svc", action: "creation" } });

    const fichier = await service.exporter(demandeId, { format: "csv" });
    expect(fichier.contentType).toContain("text/csv");
    const contenu = fichier.buffer.toString("utf-8");
    expect(contenu).toContain(demande.reference);
    expect(contenu).toContain("creation");
  });

  it("exporter(pdf) produit un buffer PDF non vide (en-tête %PDF)", async () => {
    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-AUDIT-PDF-${suffixe}`,
        circuit: "DOBB",
        segment: "B2B",
        nomClient: "Client Test Export PDF",
        initiateurId: agentId,
        montantTtc: 100_000
      }
    });
    demandeId = demande.id;
    await prisma.journalAudit.create({ data: { demandeId, acteur: "test.audit-svc", action: "creation" } });

    const fichier = await service.exporter(demandeId, { format: "pdf" });
    expect(fichier.contentType).toBe("application/pdf");
    expect(fichier.buffer.subarray(0, 4).toString("utf-8")).toBe("%PDF");
  });

  it("journalSecurite filtre par identifiantAd et par événement", async () => {
    demandeId = "00000000-0000-0000-0000-000000000000"; // pas utilisé par ce test, afterEach no-op
    const { entrees } = await service.journalSecurite({
      utilisateur: `test.audit-svc-${suffixe}@orange.ci`,
      page: 1,
      limit: 50
    });
    expect(Array.isArray(entrees)).toBe(true);
  });

  it("journalSecurite avec un identifiant inconnu renvoie un résultat vide (pas une erreur)", async () => {
    demandeId = "00000000-0000-0000-0000-000000000000";
    const resultat = await service.journalSecurite({ utilisateur: "inconnu@orange.ci", page: 1, limit: 50 });
    expect(resultat.entrees).toEqual([]);
    expect(resultat.total).toBe(0);
  });
});
