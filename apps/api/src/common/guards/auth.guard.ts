import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { loadEnv } from "@pgd/config";
import type { EnumProfilSysteme } from "@pgd/database";
import { PUBLIC_KEY } from "../decorators/public.decorator";
import { SessionService } from "../../modules/auth/services/session.service";

export interface UtilisateurRequete {
  id: string;
  identifiantAd: string;
  roles: string[];
  sousFluxId: string | null;
  profils: EnumProfilSysteme[];
  jti: string;
}

export interface RequeteAuthentifiee extends Request {
  utilisateur?: UtilisateurRequete;
}

// Valide le JWT d'accès (cookie httpOnly) ET interroge Redis pour la
// révocation immédiate (SF-PGD-003) — cf. SessionService.verifierAccessToken.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessionService: SessionService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const estPublique = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (estPublique) return true;

    const request = context.switchToHttp().getRequest<RequeteAuthentifiee>();
    const env = loadEnv();
    const token = request.cookies?.[env.SESSION_COOKIE_NAME];
    if (!token) throw new UnauthorizedException({ code: "NON_AUTHENTIFIE", message: "Session absente." });

    const resultat = await this.sessionService.verifierAccessToken(token);
    if (!resultat) {
      throw new UnauthorizedException({ code: "NON_AUTHENTIFIE", message: "Session invalide ou expirée." });
    }

    request.utilisateur = {
      id: resultat.sub,
      identifiantAd: resultat.identifiantAd,
      roles: resultat.roles,
      sousFluxId: resultat.sousFluxId,
      profils: resultat.profils,
      jti: resultat.jti
    };
    return true;
  }
}
