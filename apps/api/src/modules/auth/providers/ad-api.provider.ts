import { Injectable, Logger } from "@nestjs/common";
import { loadEnv } from "@pgd/config";
import type { LdapPort, UtilisateurAd } from "../ports/ldap.port";

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

// Implémentation réelle de LdapPort contre l'API REST AD (SF-PGD-001,
// confirmée le 19/08/2026 — cf. CLAUDE.md « API AD réelle » et « identifiantAd
// = username brut »). Coexiste avec LdapProvider (dev, OpenLDAP) derrière le
// même port, sélectionnée par LDAP_PROVIDER=ad-api (packages/config) — jamais
// un remplacement, cf. AuthModule.
@Injectable()
export class AdApiProvider implements LdapPort {
  private readonly logger = new Logger(AdApiProvider.name);

  async authentifier(identifiantAd: string, motDePasse: string): Promise<UtilisateurAd | null> {
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
      // d'authentification silencieux à ce niveau (même contrat que
      // LdapProvider.authentifier(), qui ne distingue jamais non plus les
      // causes d'échec au niveau HTTP).
      this.logger.warn(`API AD injoignable pour ${identifiantAd} : ${(erreur as Error).message}`);
      return null;
    }

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
    // FERMÉ (retourner null), jamais laisser passer par omission.
    // ============================================================
    if (reponseHttp.status !== 200) {
      this.logger.warn(`API AD : statut HTTP ${reponseHttp.status} pour ${identifiantAd}.`);
      return null;
    }

    let corps: unknown;
    try {
      corps = await reponseHttp.json();
    } catch {
      this.logger.warn(`API AD : corps de réponse absent ou JSON invalide pour ${identifiantAd}.`);
      return null;
    }

    if (typeof corps !== "object" || corps === null) {
      this.logger.warn(`API AD : corps de réponse n'est pas un objet pour ${identifiantAd}.`);
      return null;
    }

    const donnees = corps as ReponseAdApi;
    if (donnees.check !== "true") {
      this.logger.warn(`API AD : champ "check" absent ou différent de "true" pour ${identifiantAd}.`);
      return null;
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
    return { identifiantAd, nom, groupes: [] };
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
}
