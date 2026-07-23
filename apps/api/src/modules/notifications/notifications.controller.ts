import { Controller, Get, HttpCode, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { listerNotificationsQuerySchema, type NotificationVue } from "@pgd/contracts";
import { Authenticated } from "../../common/decorators/authenticated.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { UtilisateurRequete } from "../../common/guards/auth.guard";
import { NotificationDestinataireGuard } from "../../common/guards/notification-destinataire.guard";
import { NotificationsService } from "./notifications.service";

@ApiTags("notifications")
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  // Pas de NotificationDestinataireGuard ici — volontaire, même raisonnement
  // que DemandesController.creer : le périmètre est garanti par construction
  // (where.destinataireId = utilisateur.id, jamais un paramètre client), pas
  // par un contrôle sur une ressource déjà identifiée par id.
  @Authenticated()
  @Get()
  async lister(
    @Query() query: unknown,
    @CurrentUser() utilisateur: UtilisateurRequete
  ): Promise<{ notifications: NotificationVue[]; meta: { total: number } }> {
    const dto = listerNotificationsQuerySchema.parse(query);
    const { notifications, total } = await this.notifications.lister(dto, utilisateur.id);
    return { notifications, meta: { total } };
  }

  @Authenticated()
  @UseGuards(NotificationDestinataireGuard)
  @Patch(":id/lu")
  @HttpCode(200)
  async marquerLue(@Param("id") id: string): Promise<NotificationVue> {
    return this.notifications.marquerLue(id);
  }
}
