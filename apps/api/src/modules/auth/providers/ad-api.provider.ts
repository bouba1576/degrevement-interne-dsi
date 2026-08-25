import { Injectable, Logger } from "@nestjs/common";
import { loadEnv } from "@pgd/config";
import type { KeycloakPort, ResultatAuthentificationAd, UtilisateurAd } from "../ports/keycloak.port";

const CHEMIN_AUTHENTIFICATION = "/ci.orange.ldap/rs-interface/authenticate";

// Réponse attendue du succès, telle que documentée (CLAUDE.md « API AD
// réelle ») — tous les champs autres que `check` sont informatifs, jamais
// garantis présents/typés par un contrat formel côté fournisseur.
interface ReponseAdApi {
  check?: unknown;
  nom?: unknown;
  prenom?: unknown;
  commonName?: unknown;
  department?: unknown;
}

// Forme réelle observée d'un échec (19/08/2026, transmise directement par la
// personne pilotant le projet — jamais vue avant ce jour) :
//   { "code": "IncorrectLoginOrPassword", "status": 401,
//     "message": "Login ou mot de passe incorrect.", "timestamp": "..." }
// `code`/`message` sont capturés quand présents pour JOURNAL_SECURITE
// (codeEchec/messageEchec, cf. keycloak.port.ts) — jamais garantis par un
// contrat formel côté fournisseur, une seule forme d'échec ayant été
// observée à ce jour. `timestamp` n'est pas consommé (aucune ambiguïté de
// fuseau à traiter tant que rien ne le lit).
interface DetailEchecAdApi {
  code?: unknown;
  message?: unknown;
}

// Restauré le 24/08/2026 (retiré trois tours plus tôt, cf. CLAUDE.md
// « Restauration transitoire — AdApiProvider ») — mesure transitoire
// acceptée explicitement par la personne pilotant le projet, en attendant
// que Keycloak soit confirmé définitivement opérationnel. Implémentation
// réelle de KeycloakPort contre l'API REST AD (SF-PGD-001, confirmée le
// 19/08/2026 — cf. CLAUDE.md « API AD réelle » et « identifiantAd = username
// brut »). Coexiste avec KeycloakDirectGrantProvider derrière le même port,
// sélectionnée par AUTH_PROVIDER=ad-api (packages/config) — un seul
// fournisseur actif à la fois, jamais une tentative en cascade de l'un puis
// l'autre (même principe que l'ancien LDAP_PROVIDER). Logique interne
// inchangée depuis sa version d'origine — seul le contrat implémenté change
// de nom (LdapPort → KeycloakPort, formes strictement identiques).
@Injectable()
export class AdApiProvider implements KeycloakPort {
  private readonly logger = new Logger(AdApiProvider.name);

  async authentifier(identifiantAd: string, motDePasse: string): Promise<ResultatAuthentificationAd> {
    const env = loadEnv();
    const url = `${env.AD_API_URL}${CHEMIN_AUTHENTIFICATION}`;

    let reponseHttp: Response;
    try {
      const controleur = new AbortController();
      const minuteur = setTimeout(() => controleur.abort(), env.AD_API_TIMEOUT_MS);
      try {
        reponseHttp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // identifiantAd transmis tel quel — jamais transformé (confirmé
          // 19/08/2026 : c'est le username brut attendu par cette API, pas une
          // adresse e-mail, cf. CLAUDE.md).
          body: JSON.stringify({ username: identifiantAd, password: motDePasse }),
          signal: controleur.signal
        });
      } finally {
        clearTimeout(minuteur);
      }
    } catch (erreur) {
      // Réseau injoignable, DNS, connexion refusée, ou délai dépassé
      // (AbortError) — jamais une exception qui remonte, toujours un échec
      // d'authentification silencieux à ce niveau. Aucun code/message :
      // aucune réponse n'a été reçue, il n'y a rien à extraire.
      this.logger.warn(`API AD injoignable pour ${identifiantAd} : ${(erreur as Error).message}`);
      return { statut: "ECHEC" };
    }

    // Corps lu AVANT la décision d'accès — uniquement pour extraire
    // codeEchec/messageEchec à des fins de journalisation. Ceci NE PARTICIPE
    // JAMAIS à la décision d'accès elle-même, qui reste strictement
    // gouvernée par le bloc ci-dessous.
    let corps: unknown;
    try {
      corps = await reponseHttp.json();
    } catch {
      this.logger.warn(`API AD : corps de réponse absent ou JSON invalide pour ${identifiantAd}.`);
      corps = undefined;
    }
    const { codeEchec, messageEchec } = this.extraireDetailEchec(corps);

    // ============================================================
    // RÈGLE NON NÉGOCIABLE — ÉCHEC FERMÉ, TOUJOURS.
    //
    // Seule une réponse strictement conforme au contrat documenté accorde
    // l'accès : statut HTTP 200 ET corps JSON valide ET check === "true"
    // (comparaison stricte sur la CHAÎNE — jamais une coercition booléenne
    // implicite : "false", false, 0, absent, undefined, tout autre littéral
    // sont TOUS des échecs, au même titre qu'un statut non-200, un corps
    // malformé/vide, un délai dépassé ou une erreur réseau déjà traitée
    // ci-dessus). Aucun cas non prévu par ce contrat ne doit jamais accorder
    // l'accès par défaut — un `if` qui échoue à couvrir un cas doit échouer
    // FERMÉ (statut: "ECHEC"), jamais laisser passer par omission.
    // codeEchec/messageEchec, extraits ci-dessus, ne sont qu'un DÉTAIL
    // journalisé sur l'issue déjà décidée — ils n'infléchissent jamais
    // cette décision, dans un sens comme dans l'autre.
    //
    // Ce chemin ne déclenche par ailleurs aucune étape MFA, ni PGD ni
    // Keycloak — une authentification AD réussie mène directement à la
    // création de session (AuthController.login(), inchangé, déjà
    // agnostique du fournisseur depuis le retrait de MfaService/
    // TotpProvider/DuoProvider). Voir l'entrée CLAUDE.md dédiée pour
    // l'impact sur la double authentification SM_DF/DF/DGA_DG/ADMIN.
    // ============================================================
    if (reponseHttp.status !== 200) {
      this.logger.warn(
        `API AD : statut HTTP ${reponseHttp.status} pour ${identifiantAd}${codeEchec ? ` (${codeEchec})` : ""}.`
      );
      return { statut: "ECHEC", codeEchec, messageEchec };
    }

    if (typeof corps !== "object" || corps === null) {
      this.logger.warn(`API AD : corps de réponse n'est pas un objet pour ${identifiantAd}.`);
      return { statut: "ECHEC", codeEchec, messageEchec };
    }

    const donnees = corps as ReponseAdApi;
    if (donnees.check !== "true") {
      this.logger.warn(`API AD : champ "check" absent ou différent de "true" pour ${identifiantAd}.`);
      return { statut: "ECHEC", codeEchec, messageEchec };
    }
    // ============================================================
    // Fin de la vérification à échec fermé — au-delà de cette ligne,
    // l'authentification est acquise.
    // ============================================================

    if (typeof donnees.department === "string" && donnees.department.length > 0) {
      // Capturé et journalisé UNIQUEMENT — aucune assignation automatique
      // vers Direction/directionId. Piste déjà identifiée, jamais tranchée
      // (cf. CLAUDE.md, Questions ouvertes) ; ne pas la construire ici.
      this.logger.log(`API AD : department="${donnees.department}" reçu pour ${identifiantAd} (informatif, non assigné).`);
    }

    const nom = this.resoudreNom(donnees, identifiantAd);

    // Aucun groupe renvoyé par cette API (confirmé, cf. CLAUDE.md « API AD
    // réelle » — ni memberOf ni équivalent dans la réponse documentée) —
    // cohérent avec la décision déjà actée (Temps 2, pré-enregistrement) :
    // la résolution des rôles reste exclusivement MembreRole, jamais un
    // groupe AD.
    const utilisateur: UtilisateurAd = { identifiantAd, nom, groupes: [] };
    return { statut: "AUTHENTIFIE", utilisateur };
  }

  // Aucune capacité de recherche exposée par cette API (confirmé, cf.
  // CLAUDE.md « API AD réelle » — un seul point d'accès, l'authentification)
  // — jamais simulée. Le pré-enregistrement passe par la saisie manuelle
  // (AnnuaireRechercheModal) quand ce fournisseur est sélectionné.
  async rechercher(_motCle: string): Promise<UtilisateurAd[]> {
    return [];
  }

  // Aucun endpoint de santé documenté pour cette API — une sonde de
  // disponibilité ne peut donc pas authentifier un compte réel sans en
  // consommer un pour de faux. Sonde la seule chose vérifiable sans
  // identifiants réels : que l'API réponde HTTP à une requête au contrat
  // documenté (quel que soit son verdict) plutôt que de timeout/refuser la
  // connexion — un signal de joignabilité réseau, jamais une validation
  // d'identifiants.
  async estDisponible(): Promise<boolean> {
    const env = loadEnv();
    const url = `${env.AD_API_URL}${CHEMIN_AUTHENTIFICATION}`;
    try {
      const controleur = new AbortController();
      const minuteur = setTimeout(() => controleur.abort(), env.AD_API_TIMEOUT_MS);
      try {
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "", password: "" }),
          signal: controleur.signal
        });
        return true;
      } finally {
        clearTimeout(minuteur);
      }
    } catch {
      return false;
    }
  }

  private resoudreNom(donnees: ReponseAdApi, identifiantAd: string): string {
    if (typeof donnees.commonName === "string" && donnees.commonName.length > 0) {
      return donnees.commonName;
    }
    const prenom = typeof donnees.prenom === "string" ? donnees.prenom.trim() : "";
    const nomFamille = typeof donnees.nom === "string" ? donnees.nom.trim() : "";
    const compose = `${prenom} ${nomFamille}`.trim();
    return compose.length > 0 ? compose : identifiantAd;
  }

  // N'influence jamais la décision d'accès (cf. bloc d'échec fermé
  // ci-dessus) — lecture purement informative pour JOURNAL_SECURITE.
  // undefined si le corps n'est pas un objet, ou si code/message n'y sont
  // pas des chaînes non vides.
  private extraireDetailEchec(corps: unknown): { codeEchec?: string; messageEchec?: string } {
    if (typeof corps !== "object" || corps === null) return {};
    const donnees = corps as DetailEchecAdApi;
    const codeEchec = typeof donnees.code === "string" && donnees.code.length > 0 ? donnees.code : undefined;
    const messageEchec = typeof donnees.message === "string" && donnees.message.length > 0 ? donnees.message : undefined;
    return { codeEchec, messageEchec };
  }
}
