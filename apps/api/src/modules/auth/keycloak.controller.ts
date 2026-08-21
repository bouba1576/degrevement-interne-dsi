import { Controller, Get, Inject, Logger, Query, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { loadEnv } from "@pgd/config";
import { Public } from "../../common/decorators/public.decorator";
import { KEYCLOAK_PORT, type KeycloakPort } from "./ports/keycloak.port";
import { KeycloakChallengeService } from "./services/keycloak-challenge.service";
import { RbacResolutionService } from "./services/rbac-resolution.service";
import { SessionService } from "./services/session.service";
import { JournalSecuriteService } from "./services/journal-securite.service";
import { poserCookiesSession } from "./utils/session-cookies.util";

// Architecture Keycloak (20/08/2026, décision actée) — contrôleur séparé
// d'AuthController, sur demande explicite : ce flux ne partage aucune route
// avec POST /api/auth/login/POST /api/auth/mfa/verify (qui restent intacts,
// réservés à la suite de tests et aux quinze identités de test persistantes,
// jamais un bouton d'écran). SessionService.creerSession() et
// RbacResolutionService.resoudre() sont réutilisés SANS AUCUNE modification —
// le point de couture déjà existant, cf. rapport d'investigation.
@ApiTags("auth")
@Controller("auth/keycloak")
export class KeycloakController {
  private readonly logger = new Logger(KeycloakController.name);

  constructor(
    @Inject(KEYCLOAK_PORT) private readonly keycloak: KeycloakPort,
    private readonly challenges: KeycloakChallengeService,
    private readonly rbacResolution: RbacResolutionService,
    private readonly sessionService: SessionService,
    private readonly journal: JournalSecuriteService
  ) {}

  @Public()
  @Get("login")
  async login(@Res() res: Response): Promise<void> {
    const { state, nonce, codeVerifier, codeChallenge } = await this.keycloak.creerParametresChallenge();
    await this.challenges.demarrer({ state, nonce, codeVerifier });
    const url = await this.keycloak.creerUrlAutorisation({ state, nonce, codeChallenge });
    res.redirect(url);
  }

  @Public()
  @Get("callback")
  async callback(
    @Query("state") state: string | undefined,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    const env = loadEnv();

    // `state` inconnu/expiré/déjà consommé → refus fermé IMMÉDIAT, avant
    // tout appel à Keycloak — un state absent ou invalide ne prouve rien,
    // il n'y a rien à vérifier de plus.
    const challenge = state ? await this.challenges.recuperer(state) : null;
    if (!challenge) {
      await this.journal.consigner({ evenement: "LOGIN", facteur: "KEYCLOAK", succes: false });
      res.redirect(`${env.CORS_ORIGIN}/login?erreur=keycloak_invalide`);
      return;
    }
    // Usage unique — invalidé dès la récupération, avant même la tentative
    // d'échange, réussie ou non (plus strict que le patron DUO existant qui
    // n'invalide qu'au succès : ce state ne doit jamais être rejouable).
    await this.challenges.invalider(state as string);

    // Reconstruit l'URL exacte reçue (code/state ET iss si présent — le
    // royaume expose authorization_response_iss_parameter_supported=true,
    // vérifié le 20/08/2026 — jamais recomposée à la main depuis
    // seulement @Query("code")/@Query("state"), qui perdrait ce paramètre).
    const urlCallback = new URL(req.originalUrl, `${req.protocol}://${req.get("host")}`);

    const resultat = await this.keycloak.echangerCode({
      code: urlCallback.searchParams.get("code") ?? "",
      urlCallback,
      state: challenge.state,
      nonce: challenge.nonce,
      codeVerifier: challenge.codeVerifier
    });

    if (resultat.statut === "ECHEC") {
      this.logger.warn(`Échange Keycloak refusé : ${resultat.raison}`);
      await this.journal.consigner({ evenement: "LOGIN", facteur: "KEYCLOAK", succes: false });
      res.redirect(`${env.CORS_ORIGIN}/login?erreur=keycloak_invalide`);
      return;
    }

    // À partir d'ici, exactement le même point de couture que
    // POST /api/auth/login (AuthController) — RbacResolutionService ne
    // sait pas et n'a pas besoin de savoir comment identifiantAd a été
    // obtenu. `nom`/`groupes` ne sont jamais lus par resoudre() (cf.
    // rbac-resolution.service.ts) — valeurs de forme, jamais consommées.
    const resolution = await this.rbacResolution.resoudre({
      identifiantAd: resultat.claim.identifiantAd,
      nom: resultat.claim.identifiantAd,
      groupes: []
    });

    if (resolution.statut === "NON_PROVISIONNE") {
      await this.journal.consigner({
        utilisateurId: resolution.utilisateurId ?? undefined,
        evenement: "ACCES_NON_PROVISIONNE",
        facteur: "KEYCLOAK",
        succes: false
      });
      res.redirect(`${env.CORS_ORIGIN}/login?erreur=compte_non_provisionne`);
      return;
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
      identifiantAd: utilisateur.identifiantAd,
      roles,
      sousFluxId: utilisateur.sousFluxId
    });
    poserCookiesSession(res, jetons);
    res.redirect(env.CORS_ORIGIN);
  }
}
