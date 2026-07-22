export interface UtilisateurAd {
  identifiantAd: string;
  nom: string;
  /** CN des groupes AD dont l'utilisateur est membre (ex. "GG-DGR-INITIATEUR-DOBB"). */
  groupes: string[];
}

export const LDAP_PORT = "LDAP_PORT";

// Authentification étape 1 (SF-PGD-001) + résolution des groupes AD (SF-PGD-007).
// Implémentation réelle attendue (LdapProvider, ldapjs) — jamais de bouchon en Phase 2.
export interface LdapPort {
  /**
   * Vérifie les identifiants par un bind LDAP réel sur le DN de l'utilisateur,
   * puis résout ses groupes. Retourne null si l'identifiant est inconnu ou le
   * mot de passe invalide — ne distingue jamais les deux cas au niveau HTTP.
   */
  authentifier(identifiantAd: string, motDePasse: string): Promise<UtilisateurAd | null>;

  /** Bind du compte de service uniquement — pour /api/health/ready (docs/06 §11). */
  estDisponible(): Promise<boolean>;
}
