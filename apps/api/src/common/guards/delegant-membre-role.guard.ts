import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { JournalSecuriteService } from "../../modules/auth/services/journal-securite.service";
import type { RequeteAuthentifiee } from "./auth.guard";

// R21/R22 — élévation de privilège trouvée en construisant le contrôle a
// posteriori (Phase 8) : POST /api/taches/{id}/deleguer n'avait AUCUN garde.
// Un utilisateur pouvait déléguer le rôle d'une tâche qu'il ne détenait pas
// du tout, ou RE-DÉLÉGUER un rôle reçu par délégation — une chaîne qui ne
// remonte jamais à un détenteur réel. Combiné à CorbeilleRoleGuard (qui
// accepte une délégation comme habilitation légitime pour AGIR), ceci
// permettait un contournement complet du SoD : déléguer l'étape N à un
// complice qui l'approuve, sans que SodGuard ne voie rien (acteur différent)
// et sans que R21 ne trouve d'historique sur N-1 chez ce complice (il n'a
// jamais réellement occupé la chaîne).
//
// Contrairement à CorbeilleRoleGuard (qui accepte à raison rôle réel OU
// délégation active — on peut AGIR sur une tâche par délégation), ce garde
// n'accepte QUE MembreRole : on ne peut déléguer que ce qu'on détient
// réellement, jamais ce qu'on a soi-même reçu par délégation. C'est ce qui
// empêche la chaîne de re-délégation.
@Injectable()
export class DelegantMembreRoleGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: JournalSecuriteService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequeteAuthentifiee>();
    const tacheId = typeof request.params?.id === "string" ? request.params.id : undefined;
    const utilisateur = request.utilisateur;
    if (!tacheId || !utilisateur) return true;

    const tache = await this.prisma.tache.findUnique({ where: { id: tacheId } });
    if (!tache) return true; // 404 est la responsabilité du contrôleur/service

    const membre = await this.prisma.membreRole.findUnique({
      where: { utilisateurId_roleCode: { utilisateurId: utilisateur.id, roleCode: tache.roleCorbeille } }
    });
    if (membre) return true;

    await this.journal.consigner({
      utilisateurId: utilisateur.id,
      evenement: "RBAC_REFUS",
      facteur: "SESSION",
      succes: false,
      ip: request.ip
    });

    throw new ForbiddenException({
      code: "DELEGATION_ROLE_NON_DETENU",
      message: "Vous ne pouvez déléguer que le rôle d'une corbeille dont vous êtes réellement membre (délégation reçue exclue).",
      details: { roleCorbeille: tache.roleCorbeille }
    });
  }
}
