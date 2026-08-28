import { Injectable, Logger } from "@nestjs/common";
import { loadEnv, type Env } from "@pgd/config";
import type { KeycloakPort, ResultatAuthentificationAd, UtilisateurAd } from "../ports/keycloak.port";

// Sonde de disponibilité/résolution d'identité (userinfo) — appels réseau
// courts, jamais soumis à une attente humaine. Distinct de
// env.KEYCLOAK_TIMEOUT_MS (le POST /token lui-même), qui doit rester
// généreux : cf. commentaire d'authentifier() ci-dessous.
const TIMEOUT_SONDE_MS = 5000;

interface ReponseTokenKeycloak {
  access_token?: unknown;
}

// RFC 6749 §5.2 — forme d'erreur standard du point /token. Deux formes
// réellement observées à ce jour (24/08/2026, sonde en direct contre le
// royaume DSI-PGD, identifiant manifestement inexistant) :
//   401 { "error": "invalid_grant", "error_description": "Invalid user
//         credentials" }
// et, lu directement dans le code source de Keycloak (ValidateOTP.java,
// authenticator directgrant) sans jamais avoir été observé contre CE
// royaume précis :
//   400 { "error": "invalid_grant", "error_description": "Invalid user
//         credentials" } quand un OTP est requis et absent de la requête —
// texte IDENTIQUE au cas précédent, seul le statut HTTP diffère (400 vs 401)
// selon la source lue. Aucune autre forme n'est confirmée.
interface ReponseErreurKeycloak {
  error?: unknown;
  error_description?: unknown;
}

interface ReponseUserinfoKeycloak {
  preferred_username?: unknown;
  name?: unknown;
  given_name?: unknown;
  family_name?: unknown;
}

// Implémentation réelle de KeycloakPort — SOURCE UNIQUE d'authentification
// (décision actée le 24/08/2026, remplace LdapProvider/AdApiProvider, jamais
// un fournisseur de plus derrière un indicateur de sélection). POST
// grant_type=password au point /token du royaume DSI-PGD.
//
// ============================================================
// CE QUI RESTE NON CONFIRMÉ — LIRE AVANT DE MODIFIER CE FICHIER
// ============================================================
// La forme exacte de la résolution DUO dans cet échange n'est pas
// confirmée : (a) jeton obtenu directement dans CETTE réponse une fois
// l'approbation donnée sur Duo Mobile (le point /token restant en attente
// le temps de cette approbation — d'où KEYCLOAK_TIMEOUT_MS généreux,
// pensé pour ce scénario), ou (b) une réponse intermédiaire distincte
// nécessitant un second appel, dont la forme n'est pas connue. Ce fichier
// ne traite QUE deux issues : un succès 200 avec access_token exploitable,
// et un échec (fermé) pour tout le reste — y compris une éventuelle forme
// (b), qui échouerait aujourd'hui plutôt que d'être gérée en deux temps.
// Ne pas deviner cette forme : formeConnue() distingue seulement, à des
// fins de journalisation, les deux formes d'échec déjà documentées
// ci-dessus des formes non reconnues — elle n'infléchit jamais la décision
// d'accès, toujours fermée par défaut. Si une forme non reconnue apparaît
// en usage réel, le log WARN dédié la capture précisément (statut + corps)
// pour examen — ne pas la remplacer par une hypothèse.
@Injectable()
export class KeycloakDirectGrantProvider implements KeycloakPort {
  private readonly logger = new Logger(KeycloakDirectGrantProvider.name);

  async authentifier(identifiantAd: string, motDePasse: string): Promise<ResultatAuthentificationAd> {
    const env = loadEnv();

    let reponseHttp: Response;
    try {
      const controleur = new AbortController();
      // Généreux, délibérément distinct d'un timeout réseau classique
      // (cf. TIMEOUT_SONDE_MS) — si Keycloak bloque cette réponse le temps
      // d'une approbation Duo Mobile (scénario (a) ci-dessus), un timeout
      // court couperait une authentification légitime en cours.
      const minuteur = setTimeout(() => controleur.abort(), env.KEYCLOAK_TIMEOUT_MS);
      try {
        reponseHttp = await fetch(this.urlToken(env), {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "password",
            client_id: env.KEYCLOAK_CLIENT_ID,
            client_secret: env.KEYCLOAK_CLIENT_SECRET,
            // Transmis tels quels — jamais transformés (même discipline que
            // LdapProvider/AdApiProvider : pas de complétion de domaine, pas
            // de casse forcée).
            username: identifiantAd,
            password: motDePasse,
            // scope=openid explicite — trouvé manquant le 26/08/2026 en
            // diagnostiquant un /userinfo 403 juste après un /token 200 pour
            // un compte DUO réel (le jeton était donc émis, mais sans les
            // droits OIDC nécessaires à /userinfo). Sans ce paramètre,
            // Keycloak retombe sur les Default Client Scopes du client — si
            // "openid" n'y figure pas en scope par défaut (juste optionnel,
            // ou absent), le jeton émis reste un jeton OAuth2 nu. Le demander
            // explicitement ne dépend plus de cette configuration côté
            // royaume. "profile email" ajoutés pour garantir preferred_username/
            // name/given_name/family_name (déjà lus par resoudreUtilisateur)
            // même si un de ces deux scopes n'était pas non plus par défaut.
            scope: "openid profile email"
          }),
          signal: controleur.signal
        });
      } finally {
        clearTimeout(minuteur);
      }
    } catch (erreur) {
      this.logger.warn(`Keycloak injoignable pour ${identifiantAd} : ${(erreur as Error).message}`);
      return { statut: "ECHEC" };
    }

    let corps: unknown;
    try {
      corps = await reponseHttp.json();
    } catch {
      corps = undefined;
    }

    // ============================================================
    // RÈGLE NON NÉGOCIABLE — ÉCHEC FERMÉ, TOUJOURS (même discipline que
    // AdApiProvider). Seul un 200 avec un access_token exploitable accorde
    // l'accès. Tout le reste — y compris une forme jamais observée — est un
    // échec, sans exception.
    // ============================================================
    if (reponseHttp.status !== 200) {
      const { codeEchec, messageEchec } = this.extraireErreur(corps);
      if (this.formeConnue(reponseHttp.status, codeEchec)) {
        this.logger.warn(`Keycloak : échec pour ${identifiantAd} (${codeEchec} — statut ${reponseHttp.status}).`);
      } else {
        this.logger.warn(
          `Keycloak : forme de réponse d'échec NON RECONNUE pour ${identifiantAd} — statut=${reponseHttp.status}, corps=${JSON.stringify(corps)}. À examiner : ne correspond à aucun scénario déjà observé (cf. commentaire de tête de ce fichier).`
        );
      }
      return { statut: "ECHEC", codeEchec, messageEchec };
    }

    if (typeof corps !== "object" || corps === null) {
      this.logger.warn(`Keycloak : corps de réponse 200 n'est pas un objet exploitable pour ${identifiantAd}.`);
      return { statut: "ECHEC" };
    }
    const donnees = corps as ReponseTokenKeycloak;
    if (typeof donnees.access_token !== "string" || donnees.access_token.length === 0) {
      this.logger.warn(`Keycloak : réponse 200 sans access_token exploitable pour ${identifiantAd}.`);
      return { statut: "ECHEC" };
    }
    // ============================================================
    // Fin de la vérification à échec fermé — au-delà de cette ligne,
    // l'authentification (et le second facteur, résolus tous deux côté
    // Keycloak) est acquise.
    // ============================================================

    const utilisateur = await this.resoudreUtilisateur(env, donnees.access_token, identifiantAd);
    if (!utilisateur) return { statut: "ECHEC" };
    return { statut: "AUTHENTIFIE", utilisateur };
  }

  // Aucune capacité de recherche construite ici — cf. ports/keycloak.port.ts
  // et le rapport du 24/08/2026 (capacité de l'Admin API Keycloak à
  // confirmer avec l'administrateur du royaume). Jamais simulée.
  async rechercher(_motCle: string): Promise<UtilisateurAd[]> {
    return [];
  }

  async estDisponible(): Promise<boolean> {
    const env = loadEnv();
    try {
      const reponse = await fetch(this.urlDecouverte(env), { signal: AbortSignal.timeout(TIMEOUT_SONDE_MS) });
      return reponse.status === 200;
    } catch {
      return false;
    }
  }

  // Résout l'identité via /userinfo (claims standard OIDC) plutôt que par
  // décodage manuel de l'access_token — /userinfo est garanti par la
  // spécification OIDC pour tout client ayant le scope "profile" (défaut),
  // indépendamment du format interne (JWT ou opaque) que ce royaume donne à
  // l'access_token. `preferred_username` est le candidat retenu pour
  // identifiantAd (claim standard, cf. commentaire d'origine de ce fichier
  // avant remplacement) — sa VALEUR exacte face à Utilisateur.identifiantAd
  // (Postgres) n'est PAS confirmée contre un compte réel, cf. rapport du
  // 24/08/2026. Repli sur l'identifiant soumis si la claim est absente.
  private async resoudreUtilisateur(
    env: Env,
    accessToken: string,
    identifiantAd: string
  ): Promise<UtilisateurAd | null> {
    try {
      const reponse = await fetch(this.urlUserinfo(env), {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(TIMEOUT_SONDE_MS)
      });
      if (reponse.status !== 200) {
        this.logger.warn(`Keycloak : /userinfo a échoué (${reponse.status}) pour ${identifiantAd}.`);
        return null;
      }
      const donnees = (await reponse.json()) as ReponseUserinfoKeycloak;
      const identifiantResolu =
        typeof donnees.preferred_username === "string" && donnees.preferred_username.length > 0
          ? donnees.preferred_username
          : identifiantAd;
      return { identifiantAd: identifiantResolu, nom: this.resoudreNom(donnees, identifiantResolu), groupes: [] };
    } catch (erreur) {
      this.logger.warn(`Keycloak : /userinfo injoignable pour ${identifiantAd} : ${(erreur as Error).message}`);
      return null;
    }
  }

  private resoudreNom(donnees: ReponseUserinfoKeycloak, repli: string): string {
    if (typeof donnees.name === "string" && donnees.name.length > 0) return donnees.name;
    const prenom = typeof donnees.given_name === "string" ? donnees.given_name.trim() : "";
    const nomFamille = typeof donnees.family_name === "string" ? donnees.family_name.trim() : "";
    const compose = `${prenom} ${nomFamille}`.trim();
    return compose.length > 0 ? compose : repli;
  }

  // Distingue, pour la journalisation seulement, les deux formes d'échec
  // déjà documentées en tête de fichier — n'influence jamais la décision
  // d'accès (toujours ECHEC dans les deux branches appelantes).
  private formeConnue(statut: number, codeEchec?: string): boolean {
    if (codeEchec !== "invalid_grant") return false;
    return statut === 401 || statut === 400;
  }

  private extraireErreur(corps: unknown): { codeEchec?: string; messageEchec?: string } {
    if (typeof corps !== "object" || corps === null) return {};
    const donnees = corps as ReponseErreurKeycloak;
    const codeEchec = typeof donnees.error === "string" && donnees.error.length > 0 ? donnees.error : undefined;
    const messageEchec =
      typeof donnees.error_description === "string" && donnees.error_description.length > 0
        ? donnees.error_description
        : undefined;
    return { codeEchec, messageEchec };
  }

  private urlToken(env: Env): string {
    return `${env.KEYCLOAK_BASE_URL}/realms/${env.KEYCLOAK_REALM}/protocol/openid-connect/token`;
  }
  private urlUserinfo(env: Env): string {
    return `${env.KEYCLOAK_BASE_URL}/realms/${env.KEYCLOAK_REALM}/protocol/openid-connect/userinfo`;
  }
  private urlDecouverte(env: Env): string {
    return `${env.KEYCLOAK_BASE_URL}/realms/${env.KEYCLOAK_REALM}/.well-known/openid-configuration`;
  }
}
