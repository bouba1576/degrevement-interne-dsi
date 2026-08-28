import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PROFIL_REQUIS_KEY } from "../decorators/profil-requis.decorator";
import { PUBLIC_KEY } from "../decorators/public.decorator";
import { JournalSecuriteService } from "../../modules/auth/services/journal-securite.service";
import type { RequeteAuthentifiee } from "./auth.guard";

// Chantier 2 (28/08/2026, docs/14) — même patron que RbacGuard, sur l'axe
// profilSysteme plutôt que roleCode. S'exécute après AuthGuard/RbacGuard —
// request.utilisateur doit déjà être posé.
@Injectable()
export class ProfilGuard implements CanActivate {
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

    const profilsRequis = this.reflector.getAllAndOverride<string[]>(PROFIL_REQUIS_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!profilsRequis || profilsRequis.length === 0) return true;

    const request = context.switchToHttp().getRequest<RequeteAuthentifiee>();
    const utilisateur = request.utilisateur;
    const autorise = !!utilisateur && utilisateur.profils.some((p) => profilsRequis.includes(p));

    if (!autorise) {
      await this.journal.consigner({
        utilisateurId: utilisateur?.id,
        evenement: "RBAC_REFUS",
        facteur: "SESSION",
        succes: false
      });
      throw new ForbiddenException({
        code: "ACCES_REFUSE",
        message: "Votre profil ne permet pas cette action.",
        details: { profilsRequis }
      });
    }
    return true;
  }
}
