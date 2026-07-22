import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { JournalSecuriteService } from "../src/modules/auth/services/journal-securite.service";
import { InitiateurDemandeGuard } from "../src/common/guards/initiateur-demande.guard";
import type { RequeteAuthentifiee } from "../src/common/guards/auth.guard";

// Trouvé en auditant DemandesController (Phase 8, suite à la faille
// CorbeilleRoleGuard) : modifier/definirLignes/recalculer/soumettre/
// abandonner/rappeler/pieces ne vérifiaient jamais que l'appelant est
// l'initiateur du dossier. Un garde unique remplace six vérifications qui
// auraient dû être dispersées dans autant de services.
describe("InitiateurDemandeGuard (audit Phase 8 — DemandesController)", () => {
  const prisma = new PrismaService();
  const journal = new JournalSecuriteService(prisma);
  const guard = new InitiateurDemandeGuard(prisma, journal);

  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let initiateurId: string;
  let tiersId: string;
  let demandeId: string;

  function contexteFactice(utilisateurId: string): ExecutionContext {
    const requete = {
      params: { id: demandeId },
      utilisateur: { id: utilisateurId, identifiantAd: "x", roles: [], jti: "x" }
    } as unknown as RequeteAuthentifiee;
    return { switchToHttp: () => ({ getRequest: () => requete, getResponse: () => ({}), getNext: () => ({}) }) } as unknown as ExecutionContext;
  }

  beforeAll(async () => {
    const [initiateur, tiers] = await Promise.all([
      prisma.utilisateur.create({ data: { identifiantAd: `test.initiateur-${suffixe}@orange.ci`, nom: "Initiateur Test" } }),
      prisma.utilisateur.create({ data: { identifiantAd: `test.tiers-${suffixe}@orange.ci`, nom: "Tiers Test" } })
    ]);
    initiateurId = initiateur.id;
    tiersId = tiers.id;

    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-INITIATEUR-${suffixe}`,
        circuit: "DOBB",
        segment: "B2B",
        nomClient: "Client Test Initiateur",
        initiateurId,
        montantTtc: 100_000
      }
    });
    demandeId = demande.id;
  });

  afterAll(async () => {
    await prisma.demande.deleteMany({ where: { id: demandeId } });
    await prisma.utilisateur.deleteMany({ where: { id: { in: [initiateurId, tiersId] } } });
    await prisma.$disconnect();
  });

  it("autorise l'initiateur du dossier", async () => {
    await expect(guard.canActivate(contexteFactice(initiateurId))).resolves.toBe(true);
  });

  it("rejette (403 PAS_INITIATEUR) un tiers authentifié, journalise RBAC_REFUS", async () => {
    await expect(guard.canActivate(contexteFactice(tiersId))).rejects.toMatchObject({
      response: { code: "PAS_INITIATEUR" }
    });
    await expect(guard.canActivate(contexteFactice(tiersId))).rejects.toBeInstanceOf(ForbiddenException);

    const evenements = await prisma.journalSecurite.findMany({ where: { utilisateurId: tiersId, evenement: "RBAC_REFUS" } });
    expect(evenements.length).toBeGreaterThanOrEqual(1);
  });
});
