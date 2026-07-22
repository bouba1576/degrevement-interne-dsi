import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { PUBLIC_KEY } from "../decorators/public.decorator";
import { JournalSecuriteService } from "../../modules/auth/services/journal-securite.service";
import type { RequeteAuthentifiee } from "./auth.guard";

// SF-PGD-203 : @Roles() sur les endpoints mutatifs/sensibles. Refus → 403
// journalisé (rbac_refus). S'exécute après AuthGuard — request.utilisateur
// doit déjà être posé.
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly journal: JournalSecuriteService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const estPublique = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (estPublique) return true;

    const rolesRequis = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!rolesRequis || rolesRequis.length === 0) return true;

    const request = context.switchToHttp().getRequest<RequeteAuthentifiee>();
    const utilisateur = request.utilisateur;
    const autorise = !!utilisateur && utilisateur.roles.some((r) => rolesRequis.includes(r));

    if (!autorise) {
      await this.journal.consigner({
        utilisateurId: utilisateur?.id,
        evenement: "RBAC_REFUS",
        facteur: "SESSION",
        succes: false
      });
      throw new ForbiddenException({
        code: "ACCES_REFUSE",
        message: "Votre rôle ne permet pas cette action.",
        details: { rolesRequis }
      });
    }
    return true;
  }
}
