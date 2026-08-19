import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UnprocessableEntityException
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { loadEnv } from "@pgd/config";
import {
  type ConnexionReponse,
  connexionReponseSchema,
  connexionRequeteSchema,
  mfaVerifieRequeteSchema,
  sessionUtilisateurSchema,
  totpEnrollConfirmRequeteSchema,
  totpEnrollReponseSchema,
  type SessionUtilisateur
} from "@pgd/contracts";
import { ApiZodBody, ApiZodResponse } from "../../common/swagger/zod-schema";
import { Public } from "../../common/decorators/public.decorator";
import { Authenticated } from "../../common/decorators/authenticated.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { UtilisateurRequete } from "../../common/guards/auth.guard";
import { PrismaService } from "../../infra/prisma/prisma.service";
import type { ChallengeDemarre } from "./ports/mfa.port";
import { LDAP_PORT, type LdapPort } from "./ports/ldap.port";
import { MfaService } from "./services/mfa.service";
import { SessionService } from "./services/session.service";
import { RateLimitService } from "./services/rate-limit.service";
import { JournalSecuriteService } from "./services/journal-securite.service";
import { RbacResolutionService } from "./services/rbac-resolution.service";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    @Inject(LDAP_PORT) private readonly ldap: LdapPort,
    private readonly rbacResolution: RbacResolutionService,
    private readonly mfaService: MfaService,
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

    const utilisateurAd = await this.ldap.authentifier(identifiantAd, motDePasse);
    if (!utilisateurAd) {
      const { verrouille } = await this.rateLimit.enregistrerEchec("login", identifiantAd);
      await this.journal.consigner({ evenement: "LOGIN", facteur: "AD", succes: false });
      if (verrouille) {
        throw limiteAtteinte("Trop de tentatives. Compte temporairement verrouillé.");
      }
      throw new UnauthorizedException({ code: "NON_AUTHENTIFIE", message: "Identifiants invalides." });
    }
    await this.rateLimit.reinitialiser("login", identifiantAd);

    const resolution = await this.rbacResolution.resoudre(utilisateurAd);
    if (resolution.statut === "NON_PROVISIONNE") {
      // Pré-enregistrement des utilisateurs AD, Temps 2 (12/08/2026) — un
      // identifiant/mot de passe AD valides ne suffisent plus : distinct d'un
      // échec d'authentification (évènement/message dédiés), jamais une
      // session dégradée à zéro rôle (comportement JIT retiré, cf. CLAUDE.md).
      await this.journal.consigner({
        utilisateurId: resolution.utilisateurId ?? undefined,
        evenement: "ACCES_NON_PROVISIONNE",
        facteur: "AD",
        succes: false
      });
      throw new UnauthorizedException({
        code: "COMPTE_NON_PROVISIONNE",
        message: "Ce compte n'a pas été pré-enregistré. Contactez votre administrateur."
      });
    }
    const { utilisateur, roles } = resolution;
    await this.journal.consigner({ utilisateurId: utilisateur.id, evenement: "LOGIN", facteur: "AD", succes: true });

    const rolesExigentMfa = await this.prisma.role.count({
      where: { code: { in: roles }, requiertMfa: true }
    });

    if (rolesExigentMfa === 0) {
      const jetons = await this.sessionService.creerSession({
        id: utilisateur.id,
        identifiantAd,
        roles,
        sousFluxId: utilisateur.sousFluxId
      });
      this.poserCookiesSession(res, jetons);
      return { requiresMfa: false, methode: null, challengeId: null, redirectUrl: null, totpEnrole: null };
    }

    let challengeId: string;
    let challenge: ChallengeDemarre;
    try {
      ({ challengeId, challenge } = await this.mfaService.demarrerChallenge({
        id: utilisateur.id,
        identifiantAd,
        mfaMethode: utilisateur.mfaMethode
      }));
    } catch (erreur) {
      // Ne se produit qu'en environnement où le fournisseur MFA sélectionné
      // n'est pas correctement configuré (ex. DUO_CLIENT_ID placeholder en dev,
      // cf. .env.example) — erreur explicite plutôt qu'un 500 générique.
      this.logger.warn(`Échec du démarrage du défi MFA (${utilisateur.mfaMethode}) : ${(erreur as Error).message}`);
      await this.journal.consigner({
        utilisateurId: utilisateur.id,
        evenement: "MFA_CHALLENGE",
        facteur: utilisateur.mfaMethode,
        succes: false
      });
      throw new HttpException(
        {
          code: "MFA_INDISPONIBLE",
          message: `Le second facteur (${utilisateur.mfaMethode}) est actuellement indisponible.`
        },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
    await this.journal.consigner({
      utilisateurId: utilisateur.id,
      evenement: "MFA_CHALLENGE",
      facteur: utilisateur.mfaMethode,
      succes: true
    });

    return {
      requiresMfa: true,
      methode: challenge.methode,
      challengeId,
      redirectUrl: challenge.redirectUrl ?? null,
      totpEnrole: challenge.methode === "TOTP" ? utilisateur.totpSecret !== null : null
    };
  }

  @Public()
  @Post("mfa/verify")
  @HttpCode(200)
  @ApiZodBody(mfaVerifieRequeteSchema)
  @ApiZodResponse(200, connexionReponseSchema)
  async mfaVerify(@Body() body: unknown, @Res({ passthrough: true }) res: Response): Promise<ConnexionReponse> {
    const { challengeId, code } = mfaVerifieRequeteSchema.parse(body);

    const challenge = await this.mfaService.recupererChallenge(challengeId);
    if (!challenge) {
      throw new UnauthorizedException({ code: "NON_AUTHENTIFIE", message: "Défi MFA expiré ou inconnu." });
    }
    if (challenge.methode !== "TOTP") {
      throw new UnprocessableEntityException({
        code: "MFA_METHODE_INATTENDUE",
        message: "Cette route ne valide que le TOTP — DUO se valide par redirection."
      });
    }

    if (await this.rateLimit.estVerrouille("mfa", challenge.identifiantAd)) {
      throw limiteAtteinte("Trop de tentatives.");
    }

    const utilisateur = await this.prisma.utilisateur.findUniqueOrThrow({ where: { id: challenge.utilisateurId } });
    const valide = utilisateur.totpSecret ? this.mfaService.verifierCodeTotp(utilisateur.totpSecret, code) : false;

    if (!valide) {
      const { verrouille } = await this.rateLimit.enregistrerEchec("mfa", challenge.identifiantAd);
      await this.journal.consigner({
        utilisateurId: utilisateur.id,
        evenement: "MFA_CHALLENGE",
        facteur: "TOTP",
        succes: false
      });
      if (verrouille) {
        throw limiteAtteinte("Trop de tentatives.");
      }
      throw new UnauthorizedException({ code: "NON_AUTHENTIFIE", message: "Code TOTP invalide." });
    }

    await this.rateLimit.reinitialiser("mfa", challenge.identifiantAd);
    await this.journal.consigner({
      utilisateurId: utilisateur.id,
      evenement: "MFA_CHALLENGE",
      facteur: "TOTP",
      succes: true
    });
    await this.mfaService.invaliderChallenge(challengeId);

    const roles = await this.rolesDe(utilisateur.id);
    const jetons = await this.sessionService.creerSession({
      id: utilisateur.id,
      identifiantAd: utilisateur.identifiantAd,
      roles,
      sousFluxId: utilisateur.sousFluxId
    });
    this.poserCookiesSession(res, jetons);

    return { requiresMfa: false, methode: "TOTP", challengeId: null, redirectUrl: null, totpEnrole: true };
  }

  // Extension au contrat docs/06 §2 — le Duo Universal Prompt redirige ici le
  // navigateur avec ?code&state (state = challengeId). Pas d'appel XHR possible
  // pour ce flux : réponse HTTP de redirection, cookies posés sur cette réponse.
  @Public()
  @Get("mfa/duo/callback")
  async mfaDuoCallback(
    @Query("code") duoCode: string,
    @Query("state") challengeId: string,
    @Res() res: Response
  ): Promise<void> {
    const env = loadEnv();
    const challenge = await this.mfaService.recupererChallenge(challengeId);
    if (!challenge || challenge.methode !== "DUO") {
      res.redirect(`${env.CORS_ORIGIN}/login?erreur=mfa_invalide`);
      return;
    }

    const valide = await this.mfaService.echangerCodeDuo(duoCode, challenge.identifiantAd);
    await this.journal.consigner({
      utilisateurId: challenge.utilisateurId,
      evenement: "MFA_CHALLENGE",
      facteur: "DUO",
      succes: valide
    });

    if (!valide) {
      res.redirect(`${env.CORS_ORIGIN}/login?erreur=mfa_invalide`);
      return;
    }

    await this.mfaService.invaliderChallenge(challengeId);
    const roles = await this.rolesDe(challenge.utilisateurId);
    const { sousFluxId } = await this.prisma.utilisateur.findUniqueOrThrow({
      where: { id: challenge.utilisateurId },
      select: { sousFluxId: true }
    });
    const jetons = await this.sessionService.creerSession({
      id: challenge.utilisateurId,
      identifiantAd: challenge.identifiantAd,
      roles,
      sousFluxId
    });
    this.poserCookiesSession(res, jetons);
    res.redirect(env.CORS_ORIGIN);
  }

  // docs/06 §2 : ces deux routes sont « authentifié », pas publiques — un
  // utilisateur enrôle/change son TOTP depuis une session déjà valide.
  // LIMITE NON RÉSOLUE : un utilisateur dont mfaMethode=TOTP mais qui n'a
  // jamais enrôlé de secret ne peut donc pas obtenir de session pour venir
  // enrôler (mfaVerify échoue toujours sans totpSecret). Aucune source ne
  // décrit de mécanisme de bootstrap pour ce cas — à traiter par provisioning
  // admin (seed ou future route /api/admin) plutôt qu'inventé ici.
  @Authenticated()
  @Post("mfa/enroll/totp")
  @HttpCode(200)
  @ApiZodResponse(200, totpEnrollReponseSchema)
  async enrollTotp(@CurrentUser() utilisateur: UtilisateurRequete) {
    return this.mfaService.demarrerEnrolementTotp(utilisateur.id, utilisateur.identifiantAd);
  }

  @Authenticated()
  @Post("mfa/enroll/totp/confirm")
  @HttpCode(200)
  @ApiZodBody(totpEnrollConfirmRequeteSchema)
  async confirmEnrollTotp(
    @CurrentUser() utilisateur: UtilisateurRequete,
    @Body() body: unknown
  ): Promise<{ confirme: true }> {
    const { code } = totpEnrollConfirmRequeteSchema.parse(body);

    const secretChiffre = await this.mfaService.confirmerEnrolementTotp(utilisateur.id, code);
    if (!secretChiffre) {
      throw new UnprocessableEntityException({ code: "TOTP_CODE_INVALIDE", message: "Code de confirmation invalide." });
    }

    await this.prisma.utilisateur.update({
      where: { id: utilisateur.id },
      data: { totpSecret: secretChiffre, totpActiveLe: new Date() }
    });
    return { confirme: true };
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

    this.poserCookiesSession(res, jetons);
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
    this.effacerCookiesSession(res);
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
      sousFluxId: utilisateur.sousFluxId,
      mfaMethode: enBase.mfaMethode
    };
  }

  private async rolesDe(utilisateurId: string): Promise<string[]> {
    const membres = await this.prisma.membreRole.findMany({ where: { utilisateurId }, select: { roleCode: true } });
    return membres.map((m) => m.roleCode);
  }

  private poserCookiesSession(res: Response, jetons: { accessToken: string; refreshToken: string }): void {
    const env = loadEnv();
    res.cookie(env.SESSION_COOKIE_NAME, jetons.accessToken, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: "lax"
    });
    res.cookie(env.REFRESH_COOKIE_NAME, jetons.refreshToken, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: "lax",
      path: "/api/auth/refresh"
    });
  }

  private effacerCookiesSession(res: Response): void {
    const env = loadEnv();
    res.clearCookie(env.SESSION_COOKIE_NAME);
    res.clearCookie(env.REFRESH_COOKIE_NAME, { path: "/api/auth/refresh" });
  }
}

function limiteAtteinte(message: string): HttpException {
  return new HttpException({ code: "LIMITE_ATTEINTE", message }, HttpStatus.TOO_MANY_REQUESTS);
}
