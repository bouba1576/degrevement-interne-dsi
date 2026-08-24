// Remplace intégralement la forme précédente de ce fichier (architecture
// authorization_code + PKCE, actée le 20/08/2026, jamais mise en service —
// le royaume réel s'est révélé lié à un flux Direct Grant, pas un flux par
// redirection, cf. CLAUDE.md « Architecture Keycloak »). Décision du
// 24/08/2026 : Keycloak devient la SOURCE UNIQUE d'authentification —
// LdapPort/LdapProvider/AdApiProvider sont retirés, pas conservés derrière
// un indicateur de sélection. Ce fichier reprend donc, à l'identique, la
// forme exacte de l'ancien LdapPort (UtilisateurAd, ResultatAuthentificationAd,
// authentifier/estDisponible/rechercher) — choix délibéré plutôt qu'une
// interface entièrement nouvelle : AuthController/AdminUtilisateursService/
// HealthController n'ont besoin de connaître aucun détail Keycloak, seulement
// ce même contrat déjà éprouvé. `identifiantAd`/`UtilisateurAd` restent ainsi
// nommés : l'identité vérifiée reste fondamentalement un compte AD Orange,
// Keycloak n'est que la nouvelle façade d'authentification devant lui.
export interface UtilisateurAd {
  identifiantAd: string;
  nom: string;
  /**
   * Toujours vide — Keycloak ne renvoie aucun groupe exploitable pour ce
   * champ (même constat déjà posé pour AdApiProvider) et la résolution des
   * rôles reste exclusivement MembreRole (Temps 2, retrait de la
   * resynchronisation par groupe). Conservé sur le type pour ne pas casser
   * RbacResolutionService/les tests existants qui construisent un
   * UtilisateurAd complet, pas parce qu'il est encore rempli par un
   * fournisseur réel.
   */
  groupes: string[];
}

// Résultat discriminé d'authentifier() — même motif que ResolutionRbac
// (RbacResolutionService) et que l'ancien ResultatAuthentificationAd qu'il
// remplace à l'identique. codeEchec/messageEchec portent `error`/
// `error_description` du corps JSON renvoyé par Keycloak (RFC 6749 §5.2)
// quand présents — jamais garantis (cf. KeycloakDirectGrantProvider, forme
// non confirmée en cas d'échec DUO).
export type ResultatAuthentificationAd =
  | { statut: "AUTHENTIFIE"; utilisateur: UtilisateurAd }
  | { statut: "ECHEC"; codeEchec?: string; messageEchec?: string };

export const KEYCLOAK_PORT = "KEYCLOAK_PORT";

// Authentification réelle (identité + second facteur, cf. CLAUDE.md
// « Architecture Keycloak — source unique », 24/08/2026) — une seule
// implémentation réelle derrière ce port (KeycloakDirectGrantProvider),
// jamais un bouchon : contrairement à CrmPort/GedPort/SmtpPort (Phase 1/3/7),
// l'authentification n'a jamais eu de mode dégradé.
export interface KeycloakPort {
  /**
   * POST grant_type=password au point /token du royaume — identifiant et
   * mot de passe transmis tels quels, jamais transformés. Une réponse 200
   * avec jeton exploitable signifie authentification ET second facteur
   * (DUO déjà lié à ce royaume) tous deux résolus côté Keycloak : PGD ne
   * déclenche, ne vérifie, ni n'interprète plus aucun second facteur —
   * MfaService/TotpProvider/DuoProvider sont retirés (24/08/2026), plus
   * aucun chemin ne les utilise.
   */
  authentifier(identifiantAd: string, motDePasse: string): Promise<ResultatAuthentificationAd>;

  /** Sonde de disponibilité — /api/health/ready (champ `ad`). */
  estDisponible(): Promise<boolean>;

  /**
   * Aucune capacité de recherche construite à ce jour — cf. rapport du
   * 24/08/2026 : l'API Admin Keycloak expose bien une recherche
   * utilisateurs, mais son usage depuis PGD (jeton de service, rôle
   * `view-users`) n'est pas confirmé avec l'administrateur du royaume.
   * Renvoie toujours [] (même précédent qu'AdApiProvider) — jamais simulée.
   */
  rechercher(motCle: string): Promise<UtilisateurAd[]>;
}
