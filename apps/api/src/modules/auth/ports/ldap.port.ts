export interface UtilisateurAd {
  identifiantAd: string;
  nom: string;
  /** CN des groupes AD dont l'utilisateur est membre (ex. "GG-DGR-INITIATEUR-DOBB"). */
  groupes: string[];
}

// Résultat discriminé d'authentifier() (19/08/2026, AdApiProvider/SF-PGD-001)
// — même motif que ResolutionRbac (RbacResolutionService), un statut explicite
// plutôt qu'un simple `null` qui aurait perdu tout détail d'échec en route.
// codeEchec/messageEchec sont optionnels et jamais présents sur AUTHENTIFIE :
// LdapProvider (annuaire dev, bind LDAP) ne les peuple JAMAIS — un bind
// échoué n'a pas de code/message structuré comparable à celui de l'API AD
// réelle. Seul AdApiProvider peut les renseigner, et seulement quand la
// réponse HTTP en portait (cf. CLAUDE.md, « JOURNAL_SECURITE — codeEchec/
// messageEchec »).
export type ResultatAuthentificationAd =
  | { statut: "AUTHENTIFIE"; utilisateur: UtilisateurAd }
  | { statut: "ECHEC"; codeEchec?: string; messageEchec?: string };

export const LDAP_PORT = "LDAP_PORT";

// Authentification étape 1 (SF-PGD-001) + résolution des groupes AD (SF-PGD-007).
// Deux implémentations réelles coexistent derrière ce port (LdapProvider,
// AdApiProvider) — jamais de bouchon.
export interface LdapPort {
  /**
   * Vérifie les identifiants — bind LDAP réel (LdapProvider) ou appel à
   * l'API AD REST réelle (AdApiProvider) selon LDAP_PROVIDER. `statut:
   * "ECHEC"` couvre indistinctement identifiant inconnu et mot de passe
   * invalide au niveau HTTP exposé au client (jamais de distinction qui
   * faciliterait une énumération de comptes) — codeEchec/messageEchec, eux,
   * sont un détail INTERNE (JOURNAL_SECURITE uniquement), jamais renvoyés au
   * client HTTP.
   */
  authentifier(identifiantAd: string, motDePasse: string): Promise<ResultatAuthentificationAd>;

  /** Bind du compte de service uniquement — pour /api/health/ready (docs/06 §11). */
  estDisponible(): Promise<boolean>;

  /**
   * Recherche annuaire (pré-enregistrement, analyse du 12/08/2026) — filtre
   * partiel sur cn/mail, jamais un bind sur un DN précis. `groupes` reste
   * renvoyé à titre informatif (affichage écran) : il ne pilote jamais
   * l'attribution d'un rôle — décision actée, la resynchronisation continue
   * par groupe AD est retirée du flux de connexion (Temps 2).
   */
  rechercher(motCle: string): Promise<UtilisateurAd[]>;
}
