import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { JournalSecuriteService } from "../src/modules/auth/services/journal-securite.service";
import { KpiPerimetreGuard } from "../src/common/guards/kpi-perimetre.guard";
import type { RequeteAuthentifiee } from "../src/common/guards/auth.guard";

// PGD-074 — trouvé en revue avant 8.5 : `profil` de GET /api/kpi était un
// filtre déclaratif côté client, jamais vérifié côté serveur. `pilotage` (ou
// profil absent, le cas par défaut le plus large) EST une décision d'accès
// binaire (contrairement à initiateur/valideur, scopés par
// KpiEngineService.construireWhere) — ce guard la porte, au même titre que
// CorbeilleRoleGuard pour les tâches.
describe("KpiPerimetreGuard — profil pilotage réservé à ADMIN_PGD", () => {
  const prisma = new PrismaService();
  const journal = new JournalSecuriteService(prisma);
  const guard = new KpiPerimetreGuard(journal);

  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let agentId: string;

  function contexteFactice(query: Record<string, unknown>, roles: string[]): ExecutionContext {
    const requete = {
      query,
      utilisateur: { id: agentId, identifiantAd: "test.kpi-perimetre", roles, jti: "x" }
    } as unknown as RequeteAuthentifiee;
    return {
      switchToHttp: () => ({ getRequest: () => requete, getResponse: () => ({}), getNext: () => ({}) })
    } as unknown as ExecutionContext;
  }

  beforeAll(async () => {
    const agent = await prisma.utilisateur.create({ data: { identifiantAd: `test.kpi-perimetre-${suffixe}@orange.ci`, nom: "Agent Test Périmètre KPI" } });
    agentId = agent.id;
  });

  afterAll(async () => {
    await prisma.utilisateur.deleteMany({ where: { id: agentId } });
    await prisma.$disconnect();
  });

  it("rejette (403 PERIMETRE_KPI_REFUSE) profil=pilotage sans ADMIN_PGD, journalise RBAC_REFUS", async () => {
    const contexte = contexteFactice({ profil: "pilotage" }, ["INITIATEUR_DOBB"]);

    await expect(guard.canActivate(contexte)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(contexte)).rejects.toMatchObject({ response: { code: "PERIMETRE_KPI_REFUSE" } });

    const evenements = await prisma.journalSecurite.findMany({ where: { utilisateurId: agentId, evenement: "RBAC_REFUS" } });
    expect(evenements.length).toBeGreaterThanOrEqual(1);
    expect(evenements[0]?.succes).toBe(false);
  });

  it("rejette (403) un profil ABSENT sans ADMIN_PGD — le cas par défaut le plus large, pas un profil neutre", async () => {
    const contexte = contexteFactice({}, ["INITIATEUR_DOBB"]);
    await expect(guard.canActivate(contexte)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("autorise profil=pilotage pour ADMIN_PGD", async () => {
    const contexte = contexteFactice({ profil: "pilotage" }, ["ADMIN_PGD"]);
    await expect(guard.canActivate(contexte)).resolves.toBe(true);
  });

  it("n'intervient jamais sur profil=initiateur/valideur — ce n'est pas son périmètre (scopé en aval par le service)", async () => {
    const contexteInitiateur = contexteFactice({ profil: "initiateur" }, []);
    const contexteValideur = contexteFactice({ profil: "valideur" }, []);
    await expect(guard.canActivate(contexteInitiateur)).resolves.toBe(true);
    await expect(guard.canActivate(contexteValideur)).resolves.toBe(true);
  });
});
