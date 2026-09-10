import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { JournalSecuriteService } from "../../modules/auth/services/journal-securite.service";
import type { RequeteAuthentifiee } from "./auth.guard";

// Même famille de risque que InitiateurDemandeGuard (Phase 8) : un contrôle
// de PORTÉE sur une ressource existante, distinct de l'authentification déjà
// vérifiée par AuthGuard. Sans ce garde, un utilisateur authentifié
// connaissant l'id d'une notification pourrait la marquer lue à la place de
// son destinataire réel.
@Injectable()
export class NotificationDestinataireGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: JournalSecuriteService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequeteAuthentifiee>();
    const notificationId = typeof request.params?.id === "string" ? request.params.id : undefined;
    const utilisateur = request.utilisateur;
    if (!notificationId || !utilisateur) return true;

    const notification = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification) return true; // 404 est la responsabilité du contrôleur/service

    if (notification.destinataireId === utilisateur.id) return true;

    await this.journal.consigner({
      utilisateurId: utilisateur.id,
      evenement: "RBAC_REFUS",
      facteur: "SESSION",
      succes: false,
      ip: request.ip
    });

    throw new ForbiddenException({
      code: "PAS_DESTINATAIRE",
      message: "Seul le destinataire de cette notification peut la marquer comme lue.",
      details: { notificationId }
    });
  }
}
