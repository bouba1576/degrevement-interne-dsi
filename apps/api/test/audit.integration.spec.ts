import { PrismaService } from "../src/infra/prisma/prisma.service";
import { AuditService } from "../src/modules/audit/audit.service";

// PGD-071/072 (SF-PGD-140, 141, 006).
describe("AuditService (docs/06 §8)", () => {
  const prisma = new PrismaService();
  const service = new AuditService(prisma);

  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let agentId: string;
  let delegantId: string;
  let demandeId: string;

  beforeAll(async () => {
    const agent = await prisma.utilisateur.create({
      data: { identifiantAd: `test.audit-svc-${suffixe}@orange.com`, nom: "Agent Test Audit" }
    });
    agentId = agent.id;
    const delegant = await prisma.utilisateur.create({
      data: { identifiantAd: `test.audit-delegant-${suffixe}@orange.com`, nom: "Delegant Test Audit" }
    });
    delegantId = delegant.id;
  });

  afterAll(async () => {
    await prisma.utilisateur.deleteMany({ where: { id: { in: [agentId, delegantId] } } });
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
      utilisateur: `test.audit-svc-${suffixe}@orange.com`,
      page: 1,
      limit: 50
    });
    expect(Array.isArray(entrees)).toBe(true);
  });

  it("journalSecurite avec un identifiant inconnu renvoie un résultat vide (pas une erreur)", async () => {
    demandeId = "00000000-0000-0000-0000-000000000000";
    const resultat = await service.journalSecurite({ utilisateur: "inconnu@orange.com", page: 1, limit: 50 });
    expect(resultat.entrees).toEqual([]);
    expect(resultat.total).toBe(0);
  });

  // Point 1 (CLAUDE.md « Journal d'audit du dossier plus explicite »,
  // 09/09/2026) — résolution acteur/délégant en nom, même jointure que
  // JournalSecuriteVue.identifiantAd/EtapeDossier.acteurNom.
  it("résout acteurNom quand acteur correspond à un identifiantAd réel, null sinon", async () => {
    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-AUDIT-NOM-${suffixe}`,
        circuit: "DOBB",
        segment: "B2B",
        nomClient: "Client Test Résolution Nom",
        initiateurId: agentId,
        montantTtc: 100_000
      }
    });
    demandeId = demande.id;
    await prisma.journalAudit.create({
      data: { demandeId, acteur: `test.audit-svc-${suffixe}@orange.com`, action: "soumission" }
    });
    await prisma.journalAudit.create({ data: { demandeId, acteur: "system:locks-sweeper", action: "verrou_expire" } });

    const entrees = await service.journalDemande(demandeId);
    const soumission = entrees.find((e) => e.action === "soumission");
    const systeme = entrees.find((e) => e.action === "verrou_expire");
    expect(soumission?.acteurNom).toBe("Agent Test Audit");
    expect(systeme?.acteurNom).toBeNull();
  });

  it("enrichit detail.delegantNom quand delegantIdentifiantAd correspond à un compte réel, jamais une réécriture du detail original", async () => {
    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-AUDIT-DELEG-${suffixe}`,
        circuit: "DOBB",
        segment: "B2B",
        nomClient: "Client Test Délégation Audit",
        initiateurId: agentId,
        montantTtc: 100_000
      }
    });
    demandeId = demande.id;
    await prisma.journalAudit.create({
      data: {
        demandeId,
        acteur: `test.audit-svc-${suffixe}@orange.com`,
        action: "approbation",
        detail: {
          revue: [{ champ: "Montant", vu: true }],
          delegationId: "00000000-0000-0000-0000-000000000001",
          delegantIdentifiantAd: `test.audit-delegant-${suffixe}@orange.com`
        }
      }
    });

    const entrees = await service.journalDemande(demandeId);
    const approbation = entrees.find((e) => e.action === "approbation");
    const detail = approbation?.detail as Record<string, unknown> | null | undefined;
    expect(detail?.delegantNom).toBe("Delegant Test Audit");
    // Enrichissement ADDITIF — le detail original reste intact à côté du
    // champ ajouté, jamais remplacé.
    expect(detail?.delegationId).toBe("00000000-0000-0000-0000-000000000001");
    expect(detail?.revue).toEqual([{ champ: "Montant", vu: true }]);
  });
});
