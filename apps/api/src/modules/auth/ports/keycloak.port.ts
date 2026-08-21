// Claim retenu comme identifiant PGD — à confirmer en Phase de vérification
// réelle (jamais scriptée ici, cf. CLAUDE.md « API AD réelle ») contre un
// jeton réel décodé par la personne pilotant le projet. `preferred_username`
// est le candidat le plus probable (déclaré dans claims_supported par le
// royaume, .well-known/openid-configuration, 20/08/2026) mais non confirmé
// contre un jeton réel — TOUJOURS transmis tel quel, jamais transformé
// (même discipline que LdapPort/AdApiProvider : pas de complétion de
// domaine, pas de casse forcée).
export interface ClaimKeycloak {
  identifiantAd: string;
}

// Résultat discriminé — même motif que ResultatAuthentificationAd
// (ldap.port.ts) et ResolutionRbac (rbac-resolution.service.ts) : un statut
// explicite, jamais un simple null/exception qui perdrait la raison de
// l'échec en route. `raison` est un détail INTERNE (log/journal), jamais
// renvoyé tel quel au client HTTP.
export type ResultatEchangeKeycloak =
  | { statut: "AUTHENTIFIE"; claim: ClaimKeycloak }
  | { statut: "ECHEC"; raison: string };

export const KEYCLOAK_PORT = "KEYCLOAK_PORT";

// Architecture Keycloak (20/08/2026, décision actée) — LoginScreen ne
// soumet plus jamais d'identifiant/mot de passe à PGD : le navigateur est
// redirigé vers Keycloak, qui gère AD et le second facteur en un seul flux,
// et revient avec un code d'autorisation. Ce port n'a donc pas la même
// forme que LdapPort (authentifier(identifiant, motDePasse)) — il n'y a
// jamais de credentials transmis à PGD dans ce flux, seulement une URL à
// construire puis un code à échanger.
export interface KeycloakPort {
  /**
   * Génère `state`/`nonce`/PKCE (S256, jamais `plain`) via les fonctions
   * d'openid-client dédiées — jamais une réimplémentation manuelle de
   * l'encodage PKCE (base64url, contraintes de longueur RFC 7636). Confine
   * tout l'interop ESM/CommonJS (cf. keycloak.provider.ts) au seul provider,
   * jamais dans l'appelant (KeycloakController).
   */
  creerParametresChallenge(): Promise<{ state: string; nonce: string; codeVerifier: string; codeChallenge: string }>;

  /**
   * Construit l'URL d'autorisation Keycloak à partir des paramètres déjà
   * générés par creerParametresChallenge() et stockés côté serveur avant
   * l'appel (KeycloakChallengeService).
   */
  creerUrlAutorisation(params: { state: string; nonce: string; codeChallenge: string }): Promise<string>;

  /**
   * Échange le code reçu au callback contre un jeton, ET vérifie
   * intégralement ce jeton (signature via jwks_uri, émetteur, destinataire,
   * expiration, `state`/`nonce` attendus) avant de renvoyer quoi que ce
   * soit — AUCUNE de ces vérifications n'est optionnelle, cf. rapport
   * d'investigation du 20/08/2026. `codeVerifier` est celui généré au
   * moment de creerUrlAutorisation (PKCE), retrouvé par l'appelant via le
   * `state`.
   */
  echangerCode(params: {
    code: string;
    urlCallback: URL;
    state: string;
    nonce: string;
    codeVerifier: string;
  }): Promise<ResultatEchangeKeycloak>;
}
