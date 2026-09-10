import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { JournalSecuriteService } from "../../modules/auth/services/journal-securite.service";
import { DelegationService } from "../../modules/taches/services/delegation.service";
import type { RequeteAuthentifiee } from "./auth.guard";

// R4 (CLAUDE.md, non négociable) — « une tâche n'est traitée que par un
// membre du rôle de sa corbeille ». Trouvé non appliqué (Phase 8, en
// construisant le contrôle a posteriori) : TacheService.lister() filtre par
// rôle (visibilité), mais claim/unclaim/approuver/rejeter ne vérifiaient
// JAMAIS que l'appelant est membre du rôle de la tâche — seul le verrou
// double (Redis + Postgres) protégeait la CONTENTION, pas l'APPARTENANCE.
// Un utilisateur authentifié connaissant/devinant un id de tâche pouvait la
// réclamer et la traiter quel que soit son rôle. Retrofité sur les quatre
// routes Phase 6 en construisant ce guard pour la nouvelle route de
// contrôle, qui en avait besoin de toute façon.
@Injectable()
export class CorbeilleRoleGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly delegationService: DelegationService,
    private readonly journal: JournalSecuriteService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequeteAuthentifiee>();
    const tacheId = typeof request.params?.id === "string" ? request.params.id : undefined;
    const utilisateur = request.utilisateur;
    if (!tacheId || !utilisateur) return true;

    const tache = await this.prisma.tache.findUnique({ where: { id: tacheId } });
    if (!tache) return true; // 404 est la responsabilité du contrôleur/service

    if (utilisateur.roles.includes(tache.roleCorbeille)) return true;

    const delegation = await this.delegationService.delegationActivePour(utilisateur.id, tache.roleCorbeille);
    if (delegation) return true;

    // RBAC_REFUS : même famille d'événement que SodGuard (SOD_REFUS), une
    // tentative hors corbeille est un refus d'habilitation au même titre.
    await this.journal.consigner({
      utilisateurId: utilisateur.id,
      evenement: "RBAC_REFUS",
      facteur: "SESSION",
      succes: false,
      ip: request.ip
    });

    throw new ForbiddenException({
      code: "HORS_CORBEILLE",
      message: "Cette tâche n'appartient pas à un rôle que vous détenez ou qui vous est délégué.",
      details: { roleCorbeille: tache.roleCorbeille }
    });
  }
}
