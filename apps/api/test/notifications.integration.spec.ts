import { PrismaService } from "../src/infra/prisma/prisma.service";
import { NotificationsService } from "../src/modules/notifications/notifications.service";

// PGD-073 (Phase 9.2, question ouverte fermée) — les notifications s'écrivent
// en base depuis la Phase 8 (apps/worker) mais aucune route ne les lisait.
// Ces tests prouvent le périmètre par destinataire dans les deux sens, même
// famille de contrôle que profil=initiateur sur /api/demandes et /api/kpi.
describe("NotificationsService", () => {
  const prisma = new PrismaService();
  const service = new NotificationsService(prisma);

  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let destinataireId: string;
  let autreDestinataireId: string;
  const notificationIds: string[] = [];

  beforeAll(async () => {
    const [destinataire, autre] = await Promise.all([
      prisma.utilisateur.create({ data: { identifiantAd: `test.notif-svc-${suffixe}@orange.com`, nom: "Destinataire Test" } }),
      prisma.utilisateur.create({ data: { identifiantAd: `test.notif-svc-autre-${suffixe}@orange.com`, nom: "Autre Destinataire" } })
    ]);
    destinataireId = destinataire.id;
    autreDestinataireId = autre.id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { id: { in: notificationIds } } });
    await prisma.utilisateur.deleteMany({ where: { id: { in: [destinataireId, autreDestinataireId] } } });
    await prisma.$disconnect();
  });

  async function creerNotification(destinataireId: string, lu = false): Promise<string> {
    const notification = await prisma.notification.create({
      data: { destinataireId, type: "AVANCEMENT", canal: "in_app", lu }
    });
    notificationIds.push(notification.id);
    return notification.id;
  }

  describe("lister — périmètre forcé sur le destinataire", () => {
    it("ne renvoie que les notifications du destinataire appelant — celles d'un autre destinataire restent invisibles", async () => {
      const idPropre = await creerNotification(destinataireId);
      const idAutre = await creerNotification(autreDestinataireId);

      const { notifications, total } = await service.lister({ page: 1, limit: 200 }, destinataireId);

      const ids = notifications.map((n) => n.id);
      expect(ids).toContain(idPropre);
      expect(ids).not.toContain(idAutre);
      expect(total).toBe(notifications.length);

      const resultatsAutre = await service.lister({ page: 1, limit: 200 }, autreDestinataireId);
      expect(resultatsAutre.notifications.some((n) => n.id === idAutre)).toBe(true);
      expect(resultatsAutre.notifications.some((n) => n.id === idPropre)).toBe(false);
    });

    it("le filtre lu=true/false borne aux notifications déjà lues ou non lues du même destinataire", async () => {
      const idLue = await creerNotification(destinataireId, true);
      const idNonLue = await creerNotification(destinataireId, false);

      const { notifications: lues } = await service.lister({ lu: true, page: 1, limit: 200 }, destinataireId);
      expect(lues.some((n) => n.id === idLue)).toBe(true);
      expect(lues.some((n) => n.id === idNonLue)).toBe(false);

      const { notifications: nonLues } = await service.lister({ lu: false, page: 1, limit: 200 }, destinataireId);
      expect(nonLues.some((n) => n.id === idNonLue)).toBe(true);
      expect(nonLues.some((n) => n.id === idLue)).toBe(false);
    });
  });

  describe("marquerLue", () => {
    it("marque une notification non lue comme lue", async () => {
      const id = await creerNotification(destinataireId, false);

      const resultat = await service.marquerLue(id);
      expect(resultat.lu).toBe(true);

      const relue = await prisma.notification.findUniqueOrThrow({ where: { id } });
      expect(relue.lu).toBe(true);
    });

    it("rejette (422 NOTIFICATION_DEJA_LUE) une notification déjà marquée lue", async () => {
      const id = await creerNotification(destinataireId, true);

      await expect(service.marquerLue(id)).rejects.toMatchObject({
        response: { code: "NOTIFICATION_DEJA_LUE" }
      });
    });

    it("rejette (404 NOTIFICATION_INTROUVABLE) un id inexistant", async () => {
      await expect(service.marquerLue("00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({
        response: { code: "NOTIFICATION_INTROUVABLE" }
      });
    });
  });
});
