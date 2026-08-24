import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { loadEnv } from "@pgd/config";
import {
  type ConnexionReponse,
  connexionReponseSchema,
  connexionRequeteSchema,
  sessionUtilisateurSchema,
  type SessionUtilisateur
} from "@pgd/contracts";
import { ApiZodBody, ApiZodResponse } from "../../common/swagger/zod-schema";
import { Public } from "../../common/decorators/public.decorator";
import { Authenticated } from "../../common/decorators/authenticated.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { UtilisateurRequete } from "../../common/guards/auth.guard";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { KEYCLOAK_PORT, type KeycloakPort } from "./ports/keycloak.port";
import { SessionService } from "./services/session.service";
import { RateLimitService } from "./services/rate-limit.service";
import { JournalSecuriteService } from "./services/journal-securite.service";
import { RbacResolutionService } from "./services/rbac-resolution.service";
import { poserCookiesSession, effacerCookiesSession } from "./utils/session-cookies.util";

// MfaService/TotpProvider/DuoProvider et les routes mfa/* retirés le
// 24/08/2026 (confirmé par la personne pilotant le projet comme à retirer,
// pas à conserver en dormance, cf. CLAUDE.md « Architecture Keycloak —
// source unique ») — Keycloak résout identité et second facteur en un seul
// échange, PGD ne gère plus aucun second facteur pour aucun chemin.
@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(KEYCLOAK_PORT) private readonly keycloak: KeycloakPort,
    private readonly rbacResolution: RbacResolutionService,
    private readonly sessionService: SessionService,
    private readonly rateLimit: RateLimitService,
    private readonly journal: JournalSecuriteService,
    private readonly prisma: PrismaService
  ) {}

  @Public()
  @Post("login")
  @HttpCode(200)
  @ApiZodBody(connexionRequeteSchema)
  @ApiZodResponse(200, connexionReponseSchema)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response): Promise<ConnexionReponse> {
    const { identifiantAd, motDePasse } = connexionRequeteSchema.parse(body);

    if (await this.rateLimit.estVerrouille("login", identifiantAd)) {
      throw limiteAtteinte("Trop de tentatives. Réessayez plus tard.");
    }

    // Une réponse AUTHENTIFIE signifie identité ET second facteur (DUO déjà
    // lié au royaume) tous deux résolus côté Keycloak.
    const resultatAuth = await this.keycloak.authentifier(identifiantAd, motDePasse);
    if (resultatAuth.statut === "ECHEC") {
      const { verrouille } = await this.rateLimit.enregistrerEchec("login", identifiantAd);
      // codeEchec/messageEchec : détail interne (JOURNAL_SECURITE
      // uniquement, jamais renvoyé au client HTTP ci-dessous — même
      // discipline que le message générique "Identifiants invalides.", qui
      // ne distingue jamais identifiant inconnu de mot de passe invalide,
      // ni un DUO refusé d'un mot de passe erroné).
      await this.journal.consigner({
        evenement: "LOGIN",
        facteur: "KEYCLOAK",
        succes: false,
        codeEchec: resultatAuth.codeEchec,
        messageEchec: resultatAuth.messageEchec
      });
      if (verrouille) {
        throw limiteAtteinte("Trop de tentatives. Compte temporairement verrouillé.");
      }
      throw new UnauthorizedException({ code: "NON_AUTHENTIFIE", message: "Identifiants invalides." });
    }
    const utilisateurAd = resultatAuth.utilisateur;
    await this.rateLimit.reinitialiser("login", identifiantAd);

    const resolution = await this.rbacResolution.resoudre(utilisateurAd);
    if (resolution.statut === "NON_PROVISIONNE") {
      // Pré-enregistrement des utilisateurs AD, Temps 2 (12/08/2026) — un
      // identifiant/mot de passe valides côté Keycloak ne suffisent plus :
      // distinct d'un échec d'authentification (évènement/message dédiés),
      // jamais une session dégradée à zéro rôle (JIT retiré, cf. CLAUDE.md).
      await this.journal.consigner({
        utilisateurId: resolution.utilisateurId ?? undefined,
        evenement: "ACCES_NON_PROVISIONNE",
        facteur: "KEYCLOAK",
        succes: false
      });
      throw new UnauthorizedException({
        code: "COMPTE_NON_PROVISIONNE",
        message: "Ce compte n'a pas été pré-enregistré. Contactez votre administrateur."
      });
    }
    const { utilisateur, roles } = resolution;
    await this.journal.consigner({
      utilisateurId: utilisateur.id,
      evenement: "LOGIN",
      facteur: "KEYCLOAK",
      succes: true
    });

    const jetons = await this.sessionService.creerSession({
      id: utilisateur.id,
      identifiantAd,
      roles,
      sousFluxId: utilisateur.sousFluxId
    });
    poserCookiesSession(res, jetons);
    return { connecte: true };
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ rafraichi: boolean }> {
    const env = loadEnv();
    const refreshToken = req.cookies?.[env.REFRESH_COOKIE_NAME];
    if (!refreshToken) throw new UnauthorizedException({ code: "NON_AUTHENTIFIE", message: "Refresh token absent." });

    const jetons = await this.sessionService.rafraichir(refreshToken);
    if (!jetons) throw new UnauthorizedException({ code: "NON_AUTHENTIFIE", message: "Refresh token invalide." });

    poserCookiesSession(res, jetons);
    return { rafraichi: true };
  }

  @Authenticated()
  @Post("logout")
  @HttpCode(200)
  async logout(
    @CurrentUser() utilisateur: UtilisateurRequete,
    @Res({ passthrough: true }) res: Response
  ): Promise<{ deconnecte: true }> {
    await this.sessionService.revoquer(utilisateur.jti);
    await this.journal.consigner({ utilisateurId: utilisateur.id, evenement: "LOGOUT", facteur: "SESSION", succes: true });
    effacerCookiesSession(res);
    return { deconnecte: true };
  }

  @Authenticated()
  @Get("session")
  @ApiZodResponse(200, sessionUtilisateurSchema)
  async session(@CurrentUser() utilisateur: UtilisateurRequete): Promise<SessionUtilisateur> {
    const enBase = await this.prisma.utilisateur.findUniqueOrThrow({ where: { id: utilisateur.id } });
    return {
      id: enBase.id,
      identifiantAd: enBase.identifiantAd,
      nom: enBase.nom,
      roles: utilisateur.roles,
      sousFluxId: utilisateur.sousFluxId
    };
  }
}

function limiteAtteinte(message: string): HttpException {
  return new HttpException({ code: "LIMITE_ATTEINTE", message }, HttpStatus.TOO_MANY_REQUESTS);
}
