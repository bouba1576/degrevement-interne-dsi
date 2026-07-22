import { PrismaService } from "../src/infra/prisma/prisma.service";
import { KpiService } from "../src/modules/kpi/services/kpi.service";

// Phase 8 — vérification demandée avant le feu vert : « corrections par
// agent » doit se calculer depuis DEMANDE + HISTORIQUE_MONTANT seuls, sans
// détour par JOURNAL_AUDIT. C'est l'argument qui avait justifié acteur_id sur
// HISTORIQUE_MONTANT en Phase 4 (R23) — ce test le prouve : KpiService
// n'importe, ne lit ni ne référence JournalAudit nulle part (vérifiable en
// lisant kpi.service.ts), et calcule correctement malgré ça.
describe("KpiService.correctionsParAgent — DEMANDE + HISTORIQUE_MONTANT uniquement (R23)", () => {
  const prisma = new PrismaService();
  const service = new KpiService(prisma);

  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let agentA: string;
  let agentB: string;
  let demandeId: string;

  beforeAll(async () => {
    const a = await prisma.utilisateur.create({
      data: { identifiantAd: `test.kpi-agent-a-${suffixe}@orange.ci`, nom: "Agent KPI A" }
    });
    const b = await prisma.utilisateur.create({
      data: { identifiantAd: `test.kpi-agent-b-${suffixe}@orange.ci`, nom: "Agent KPI B" }
    });
    agentA = a.id;
    agentB = b.id;
  });

  afterAll(async () => {
    await prisma.utilisateur.deleteMany({ where: { id: { in: [agentA, agentB] } } });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.historiqueMontant.deleteMany({ where: { demandeId } });
    await prisma.demande.deleteMany({ where: { id: demandeId } });
  });

  async function creerDemandeAvecHistorique(entries: Array<{ acteurId: string | null; origine: "CREATION" | "MODIFICATION" | "RECALCUL" }>) {
    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-KPI-${suffixe}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        circuit: "DOBB",
        segment: "B2B",
        nomClient: "Client Test KPI",
        initiateurId: agentA,
        montantTtc: 100_000
      }
    });
    demandeId = demande.id;

    for (const entry of entries) {
      await prisma.historiqueMontant.create({
        data: {
          demandeId,
          ht: 100_000,
          tsc: 3_000,
          tva: 18_000,
          ttc: 121_000,
          tauxTsc: 0.03,
          tauxTva: 0.18,
          origine: entry.origine,
          acteurId: entry.acteurId
        }
      });
    }
    return demande;
  }

  it("compte les MODIFICATION groupées par acteur, ignore CREATION et RECALCUL", async () => {
    await creerDemandeAvecHistorique([
      { acteurId: agentA, origine: "CREATION" }, // ne compte pas — pas une correction
      { acteurId: agentA, origine: "MODIFICATION" },
      { acteurId: agentA, origine: "MODIFICATION" },
      { acteurId: agentB, origine: "MODIFICATION" },
      { acteurId: null, origine: "RECALCUL" } // ne compte pas — pas une correction, pas d'acteur
    ]);

    const resultats = await service.correctionsParAgent({ circuit: "DOBB" });

    const ligneA = resultats.find((r) => r.acteurId === agentA);
    const ligneB = resultats.find((r) => r.acteurId === agentB);
    expect(ligneA?.nombreCorrections).toBe(2);
    expect(ligneB?.nombreCorrections).toBe(1);
  });

  it("filtre par circuit sans jamais interroger JournalAudit", async () => {
    await creerDemandeAvecHistorique([{ acteurId: agentA, origine: "MODIFICATION" }]);

    // Circuit DXC : aucune ligne créée pour ce circuit → 0 résultat pour agentA
    // sur ce filtre, alors qu'il a bien une correction en DOBB (test précédent
    // nettoyé par afterEach — cette demande est indépendante).
    const resultatsDxc = await service.correctionsParAgent({ circuit: "DXC" });
    expect(resultatsDxc.find((r) => r.acteurId === agentA)).toBeUndefined();

    const resultatsDobb = await service.correctionsParAgent({ circuit: "DOBB" });
    expect(resultatsDobb.find((r) => r.acteurId === agentA)?.nombreCorrections).toBeGreaterThanOrEqual(1);
  });
});
