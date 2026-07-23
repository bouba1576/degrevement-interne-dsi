import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import type { ListerNotificationsQuery, NotificationVue } from "@pgd/contracts";
import { PrismaService } from "../../infra/prisma/prisma.service";

// PGD-073 (Phase 9.2, question ouverte fermée) — les notifications s'écrivent
// en base depuis la Phase 8 (apps/worker, NotificationService) mais aucune
// route ne les lisait jusqu'ici. `destinataireId` vient TOUJOURS de la
// session authentifiée (utilisateurId, résolu par le contrôleur via
// @CurrentUser()), jamais d'un paramètre client — même garde que
// `profil=initiateur` sur /api/demandes et /api/kpi.
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(query: ListerNotificationsQuery, utilisateurId: string): Promise<{ notifications: NotificationVue[]; total: number }> {
    const where = {
      destinataireId: utilisateurId,
      ...(query.lu !== undefined ? { lu: query.lu } : {})
    };

    const [notifications, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { horodatage: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit
      }),
      this.prisma.notification.count({ where })
    ]);

    return { notifications: notifications.map((n) => this.versVue(n)), total };
  }

  async marquerLue(id: string): Promise<NotificationVue> {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification) {
      throw new NotFoundException({ code: "NOTIFICATION_INTROUVABLE", message: "Notification introuvable." });
    }
    if (notification.lu) {
      throw new UnprocessableEntityException({
        code: "NOTIFICATION_DEJA_LUE",
        message: "Cette notification est déjà marquée comme lue."
      });
    }

    const misAJour = await this.prisma.notification.update({ where: { id }, data: { lu: true } });
    return this.versVue(misAJour);
  }

  private versVue(n: {
    id: string;
    demandeId: string | null;
    type: string;
    canal: string;
    lu: boolean;
    horodatage: Date;
  }): NotificationVue {
    return {
      id: n.id,
      demandeId: n.demandeId,
      type: n.type as never,
      canal: n.canal,
      lu: n.lu,
      horodatage: n.horodatage.toISOString()
    };
  }
}
