import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { JournalSecuriteService } from "../src/modules/auth/services/journal-securite.service";
import { NotificationDestinataireGuard } from "../src/common/guards/notification-destinataire.guard";
import type { RequeteAuthentifiee } from "../src/common/guards/auth.guard";

// Même famille de test que initiateur-demande.guard.spec.ts (Phase 8) : le
// guard est testé directement via un ExecutionContext factice, indépendamment
// de toute route précise — les routes qui le réutilisent n'ont besoin que
// d'une entrée guard-coverage.spec.ts, pas d'un test d'appartenance dupliqué.
describe("NotificationDestinataireGuard (Phase 9.2 — GET /api/notifications)", () => {
  const prisma = new PrismaService();
  const journal = new JournalSecuriteService(prisma);
  const guard = new NotificationDestinataireGuard(prisma, journal);

  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let destinataireId: string;
  let tiersId: string;
  let notificationId: string;

  function contexteFactice(utilisateurId: string): ExecutionContext {
    const requete = {
      params: { id: notificationId },
      utilisateur: { id: utilisateurId, identifiantAd: "x", roles: [], jti: "x" }
    } as unknown as RequeteAuthentifiee;
    return { switchToHttp: () => ({ getRequest: () => requete, getResponse: () => ({}), getNext: () => ({}) }) } as unknown as ExecutionContext;
  }

  beforeAll(async () => {
    const [destinataire, tiers] = await Promise.all([
      prisma.utilisateur.create({ data: { identifiantAd: `test.notif-destinataire-${suffixe}@orange.ci`, nom: "Destinataire Test" } }),
      prisma.utilisateur.create({ data: { identifiantAd: `test.notif-tiers-${suffixe}@orange.ci`, nom: "Tiers Test" } })
    ]);
    destinataireId = destinataire.id;
    tiersId = tiers.id;

    const notification = await prisma.notification.create({
      data: { destinataireId, type: "AVANCEMENT", canal: "in_app" }
    });
    notificationId = notification.id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { id: notificationId } });
    await prisma.utilisateur.deleteMany({ where: { id: { in: [destinataireId, tiersId] } } });
    await prisma.$disconnect();
  });

  it("autorise le destinataire réel de la notification", async () => {
    await expect(guard.canActivate(contexteFactice(destinataireId))).resolves.toBe(true);
  });

  it("rejette (403 PAS_DESTINATAIRE) un tiers authentifié, journalise RBAC_REFUS", async () => {
    await expect(guard.canActivate(contexteFactice(tiersId))).rejects.toMatchObject({
      response: { code: "PAS_DESTINATAIRE" }
    });
    await expect(guard.canActivate(contexteFactice(tiersId))).rejects.toBeInstanceOf(ForbiddenException);

    const evenements = await prisma.journalSecurite.findMany({ where: { utilisateurId: tiersId, evenement: "RBAC_REFUS" } });
    expect(evenements.length).toBeGreaterThanOrEqual(1);
  });
});
