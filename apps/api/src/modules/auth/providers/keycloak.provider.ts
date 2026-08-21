import { Injectable, Logger } from "@nestjs/common";
import { loadEnv } from "@pgd/config";
import type { Configuration } from "openid-client";
import type { KeycloakPort, ResultatEchangeKeycloak } from "../ports/keycloak.port";

// openid-client (v6) est distribué exclusivement en ESM ("type": "module",
// aucune condition "require" dans ses exports, vérifié le 20/08/2026) —
// apps/api compile en CommonJS (tsconfig.base.json: module=commonjs).
// require("openid-client") échouerait (ERR_REQUIRE_ESM). import() dynamique
// reste disponible depuis un fichier CommonJS quel que soit le système de
// modules cible — c'est le contournement standard documenté pour cette
// interop, pas une solution de contournement improvisée ici. `import type`
// ci-dessus (types uniquement) est erasé à la compilation, aucun rapport
// avec ce problème.
async function chargerOpenidClient() {
  return import("openid-client");
}

// Implémentation réelle de KeycloakPort (architecture actée le 20/08/2026).
// Seul chemin réel de connexion depuis LoginScreen — LdapProvider/
// AdApiProvider restent entièrement fonctionnels en parallèle, mais ne
// servent plus qu'à POST /api/auth/login (suite de tests, quinze identités
// de test persistantes), jamais un bouton d'écran.
@Injectable()
export class KeycloakProvider implements KeycloakPort {
  private readonly logger = new Logger(KeycloakProvider.name);

  // Découverte mise en cache après la PREMIÈRE utilisation réelle — jamais
  // au bootstrap du module. AuthModule est instancié par de nombreux tests
  // qui n'exercent jamais Keycloak (demarrerAppE2e, etc.) ; découvrir au
  // démarrage y déclencherait un appel réseau réel vers KEYCLOAK_BASE_URL,
  // hors de portée depuis cet environnement de développement la plupart du
  // temps (cf. CLAUDE.md « Joignabilité de l'API AD réelle », même famille
  // de contrainte réseau). Mémoïsée pour la durée de vie du processus —
  // jamais redécouverte à chaque connexion.
  private configurationPromise: Promise<Configuration> | null = null;

  private async configuration(): Promise<Configuration> {
    if (!this.configurationPromise) {
      this.configurationPromise = this.decouvrir();
    }
    return this.configurationPromise;
  }

  private async decouvrir(): Promise<Configuration> {
    const env = loadEnv();
    const { discovery, allowInsecureRequests, enableNonRepudiationChecks } = await chargerOpenidClient();
    // ============================================================
    // DÉCOUVERTE CRITIQUE (20/08/2026, vérifiée en direct par un test réel
    // à clé signée volontairement fausse — PAS supposée) : openid-client ne
    // vérifie PAS la signature JWS de l'id_token par défaut. Sa propre
    // documentation le justifie ainsi : la vérification de signature n'est
    // « pas obligatoire » quand le jeton est reçu par communication directe
    // avec un point de jeton sécurisé en TLS, puisque la validation TLS du
    // serveur authentifie déjà l'émetteur à la place de la signature.
    //
    // Cette hypothèse ne tient PAS ici : le royaume réel confirmé
    // (investigation du 20/08/2026) expose `issuer`/`token_endpoint` en
    // http://, jamais https:// — aucune validation TLS du serveur n'a lieu
    // sur ce point de jeton. Sans enableNonRepudiationChecks explicite,
    // PGD accepterait un jeton dont la signature ne correspond à AUCUNE clé
    // du royaume, tant que les claims (iss/aud/exp/nonce) sont bien formées
    // — vérifié par un test qui a échoué avant ce correctif, précisément
    // sur ce point.
    // ============================================================
    const config = await discovery(
      new URL(`${env.KEYCLOAK_BASE_URL}/realms/${env.KEYCLOAK_REALM}`),
      env.KEYCLOAK_CLIENT_ID,
      env.KEYCLOAK_CLIENT_SECRET,
      undefined,
      // allowInsecureRequests : même royaume réel en http://, restriction
      // HTTPS-only désactivée explicitement — point de sécurité réseau déjà
      // signalé au rapport d'investigation (« confirmation réseau
      // nécessaire »), non tranché ici, légitime seulement si le serveur
      // PGD de production est sur le même segment interne que Keycloak.
      { execute: [allowInsecureRequests, enableNonRepudiationChecks] }
    );
    return config;
  }

  async creerParametresChallenge(): Promise<{
    state: string;
    nonce: string;
    codeVerifier: string;
    codeChallenge: string;
  }> {
    const { randomState, randomNonce, randomPKCECodeVerifier, calculatePKCECodeChallenge } =
      await chargerOpenidClient();
    const codeVerifier = randomPKCECodeVerifier();
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
    return { state: randomState(), nonce: randomNonce(), codeVerifier, codeChallenge };
  }

  async creerUrlAutorisation(params: { state: string; nonce: string; codeChallenge: string }): Promise<string> {
    const env = loadEnv();
    const { buildAuthorizationUrl } = await chargerOpenidClient();
    const config = await this.configuration();

    const url = buildAuthorizationUrl(config, {
      redirect_uri: env.KEYCLOAK_REDIRECT_URI,
      response_type: "code",
      scope: "openid",
      state: params.state,
      nonce: params.nonce,
      code_challenge: params.codeChallenge,
      code_challenge_method: "S256"
    });
    return url.toString();
  }

  async echangerCode(params: {
    code: string;
    urlCallback: URL;
    state: string;
    nonce: string;
    codeVerifier: string;
  }): Promise<ResultatEchangeKeycloak> {
    const { authorizationCodeGrant } = await chargerOpenidClient();
    const config = await this.configuration();

    let claims: Record<string, unknown> | undefined;
    try {
      // authorizationCodeGrant() effectue TOUTES les vérifications
      // obligatoires en interne — signature du jeton contre les clés
      // publiques du royaume (jwks_uri), émetteur, destinataire, expiration,
      // ET state/nonce attendus passés ci-dessous. Une exception ici couvre
      // indistinctement tout échec de l'une de ces vérifications — jamais un
      // accès accordé sur un cas non prévu (même discipline qu'AdApiProvider,
      // ad-api.provider.ts).
      const reponse = await authorizationCodeGrant(config, params.urlCallback, {
        expectedState: params.state,
        expectedNonce: params.nonce,
        pkceCodeVerifier: params.codeVerifier
      });
      claims = reponse.claims();
    } catch (erreur) {
      const raison = erreur instanceof Error ? erreur.message : "Erreur inconnue";
      this.logger.warn(`Échange Keycloak refusé : ${raison}`);
      return { statut: "ECHEC", raison };
    }

    // ============================================================
    // RÈGLE NON NÉGOCIABLE — ÉCHEC FERMÉ, TOUJOURS (même discipline
    // qu'AdApiProvider) : un jeton cryptographiquement valide mais sans le
    // claim attendu n'accorde jamais l'accès par défaut. Claim exact
    // (preferred_username) non encore confirmé contre un jeton réel — cf.
    // ports/keycloak.port.ts, à vérifier avant toute mise en service réelle.
    // ============================================================
    const identifiantAd = claims?.preferred_username;
    if (typeof identifiantAd !== "string" || identifiantAd.length === 0) {
      this.logger.warn("Échange Keycloak : jeton valide mais claim preferred_username absent ou vide.");
      return { statut: "ECHEC", raison: "Claim identifiant absent du jeton." };
    }

    return { statut: "AUTHENTIFIE", claim: { identifiantAd } };
  }
}
