import { z } from "zod";
import {
  apercuRoutageReponseSchema,
  controleVueSchema,
  delegationVueSchema,
  demandeDetailSchema,
  erreurSchema,
  etapeDossierSchema,
  formulesDeLigneSchema,
  journalAuditVueSchema,
  kpiValeurSchema,
  ligneAvecContexteSchema,
  pieceJointeSchema,
  sessionUtilisateurSchema,
  siVueSchema,
  soumissionReponseSchema,
  tacheVueSchema,
  tachesListeReponseSchema,
  type ApercuRoutageReponse,
  type ApprouverRequete,
  type ControleVue,
  type CreerDelegationRequete,
  type CreerDemandeRequete,
  type DefinirLignesRequete,
  type DelegationVue,
  type DemandeDetail,
  type EtapeDossier,
  type FormulesDeLigne,
  type JournalAuditVue,
  type KpiValeur,
  type LigneAvecContexte,
  type ModifierDemandeRequete,
  type PieceJointeVue,
  type RejeterRequete,
  type SessionUtilisateur,
  type SiVue,
  type SoumettreControleRequete,
  type SoumissionReponse,
  type TacheVue,
  type TachesListeReponse
} from "@pgd/contracts";

// Session par cookie httpOnly (SessionService, apps/api) : `credentials:
// "include"` sur chaque appel, jamais un jeton porté manuellement côté
// client. CORS_ORIGIN (apps/api) doit correspondre à l'origine réelle de
// apps/web pour que le navigateur accepte le cookie cross-origin.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

// Forme de chaque violation cumulée dans `error.details` d'un 422
// REGLE_METIER_VIOLEE (DemandeWorkflowService.soumettre) — même shape que
// `erreurSchema` (envelope.ts), mais un tableau, jamais exporté séparément
// par packages/contracts (c'est une interface locale au service, pas un DTO
// public). Défini ici, au point d'usage, plutôt qu'une supposition sur sa forme.
export const erreurRegleMetierSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional()
});
export type ErreurRegleMetier = z.infer<typeof erreurRegleMetierSchema>;

// TOUTE réponse (succès ou erreur) passe par l'enveloppe {data,error,meta} —
// `ResponseEnvelopeInterceptor` (apps/api/src/common/interceptors/) l'ajoute
// globalement à chaque contrôleur, y compris quand la méthode retourne un
// DTO « à plat » (KpiValeur[], TachesListeReponse, SessionUtilisateur — leur
// signature TypeScript décrit ce que le CONTRÔLEUR retourne, pas la forme du
// corps HTTP réel après l'intercepteur). Vérifié en réel (Phase 9.2) :
// GET /api/auth/session renvoie bien {"data":{...},"error":null,"meta":null},
// jamais le SessionUtilisateur nu — une hypothèse fausse tenue pour acquise
// à l'écriture initiale de ce fichier, corrigée seulement en testant contre
// un vrai login (jean.kouassi), pas en relisant le contrôleur.
async function requete<T>(chemin: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const reponse = await fetch(`${API_URL}${chemin}`, { credentials: "include", ...init });
  const corps: unknown = await reponse.json().catch(() => null);
  const enveloppe = corps as { data?: unknown; error?: unknown } | null;

  if (!reponse.ok) {
    const erreur = enveloppe?.error
      ? erreurSchema.parse(enveloppe.error)
      : { code: "ERREUR", message: "Erreur inattendue du serveur.", details: undefined };
    throw new ApiError(erreur.code, erreur.message, reponse.status, erreur.details);
  }

  return schema.parse(enveloppe?.data);
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export type ProfilKpi = "initiateur" | "valideur" | "pilotage";

export function fetchKpi(profil: ProfilKpi): Promise<KpiValeur[]> {
  return requete(`/api/kpi?profil=${profil}`, z.array(kpiValeurSchema));
}

// `limit=1` : seul `total` (un vrai count() Postgres, TacheService.lister)
// nous intéresse ici, pas la page de résultats.
export function fetchTachesTotal(etat: string): Promise<TachesListeReponse> {
  return requete(`/api/taches?etat=${etat}&limit=1`, tachesListeReponseSchema);
}

export function fetchSession(): Promise<SessionUtilisateur> {
  return requete("/api/auth/session", sessionUtilisateurSchema);
}

export function deconnecter(): Promise<{ deconnecte: true }> {
  return requete("/api/auth/logout", z.object({ deconnecte: z.literal(true) }), { method: "POST" });
}

// --- Nouvelle demande (Phase 9.2) ------------------------------------

export function creerDemande(donnees: CreerDemandeRequete): Promise<DemandeDetail> {
  return requete("/api/demandes", demandeDetailSchema, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(donnees)
  });
}

// GET /api/lignes?nd= — data: null si ND inconnu (jamais 404, SF-PGD-310).
// Le serveur normalise déjà espaces/casse (LigneService.rechercherParNd) ;
// aucune normalisation dupliquée ici.
export function rechercherNd(nd: string): Promise<LigneAvecContexte | null> {
  return requete(`/api/lignes?nd=${encodeURIComponent(nd)}`, ligneAvecContexteSchema.nullable());
}

export function fetchFormulesDeLigne(ligneId: string): Promise<FormulesDeLigne> {
  return requete(`/api/lignes/${ligneId}/formules`, formulesDeLigneSchema);
}

// R18 : le serveur réagrège TOUTES les lignes du dossier et renvoie les
// montants à jour dans la même réponse — aucun second appel de recalcul
// n'est nécessaire après celui-ci.
export function definirLignes(demandeId: string, donnees: DefinirLignesRequete): Promise<DemandeDetail> {
  return requete(`/api/demandes/${demandeId}/lignes`, demandeDetailSchema, {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify(donnees)
  });
}

// Pas de body — le contrôleur relit la demande et appelle RuleEngineService
// directement (même sélection que la soumission), aucun recalcul propre.
export function apercuRoutage(demandeId: string): Promise<ApercuRoutageReponse> {
  return requete(`/api/demandes/${demandeId}/apercu-routage`, apercuRoutageReponseSchema, { method: "POST" });
}

export function soumettreDemande(demandeId: string): Promise<SoumissionReponse> {
  return requete(`/api/demandes/${demandeId}/soumettre`, soumissionReponseSchema, { method: "POST" });
}

export function abandonnerDemande(demandeId: string): Promise<{ abandonne: true }> {
  return requete(`/api/demandes/${demandeId}/abandonner`, z.object({ abandonne: z.literal(true) }), {
    method: "POST"
  });
}

// --- DossierDetailScreen / CorbeillesScreen (Phase 9.2) --------------

export function obtenirDetailDemande(demandeId: string): Promise<DemandeDetail> {
  return requete(`/api/demandes/${demandeId}`, demandeDetailSchema);
}

// Vue EtapeDossier délibérément plus étroite que TacheVue — voir
// packages/contracts/src/tache.ts. acteurNom n'est jamais renseigné pour une
// étape en cours, seulement une fois décidée.
export function listerTachesDemande(demandeId: string): Promise<EtapeDossier[]> {
  return requete(`/api/demandes/${demandeId}/taches`, z.array(etapeDossierSchema));
}

export function obtenirEtatSi(demandeId: string): Promise<SiVue> {
  return requete(`/api/demandes/${demandeId}/si`, siVueSchema);
}

export function journalAuditDemande(demandeId: string): Promise<JournalAuditVue[]> {
  return requete(`/api/audit/${demandeId}`, z.array(journalAuditVueSchema));
}

export function rappelerDemande(demandeId: string): Promise<{ rappele: true }> {
  return requete(`/api/demandes/${demandeId}/rappeler`, z.object({ rappele: z.literal(true) }), { method: "POST" });
}

export function modifierDemande(demandeId: string, donnees: ModifierDemandeRequete): Promise<DemandeDetail> {
  return requete(`/api/demandes/${demandeId}`, demandeDetailSchema, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(donnees)
  });
}

export function ajouterPiece(demandeId: string, fichier: File, pieceAfferenteId?: string): Promise<PieceJointeVue> {
  const formData = new FormData();
  formData.append("fichier", fichier);
  if (pieceAfferenteId) formData.append("pieceAfferenteId", pieceAfferenteId);
  // Pas de Content-Type explicite : le navigateur pose le boundary multipart
  // lui-même, un en-tête manuel casserait le découpage des parties.
  return requete(`/api/demandes/${demandeId}/pieces`, pieceJointeSchema, { method: "POST", body: formData });
}

export function supprimerPiece(demandeId: string, pieceId: string): Promise<{ supprime: true }> {
  return requete(`/api/demandes/${demandeId}/pieces/${pieceId}`, z.object({ supprime: z.literal(true) }), {
    method: "DELETE"
  });
}

export interface ListerTachesCorbeilleParams {
  role?: string;
  etat?: string;
}

// GET /api/taches — scopé serveur aux rôles réels + délégués de l'appelant
// (R4, TacheService.lister) : `role=` restreint cet ensemble, ne l'élargit
// jamais.
export function listerTachesCorbeille(params: ListerTachesCorbeilleParams): Promise<TachesListeReponse> {
  const query = new URLSearchParams();
  if (params.role) query.set("role", params.role);
  if (params.etat) query.set("etat", params.etat);
  query.set("limit", "200");
  return requete(`/api/taches?${query.toString()}`, tachesListeReponseSchema);
}

export function trouverTache(tacheId: string): Promise<TacheVue> {
  return requete(`/api/taches/${tacheId}`, tacheVueSchema);
}

export function claimTache(tacheId: string): Promise<TacheVue> {
  return requete(`/api/taches/${tacheId}/claim`, tacheVueSchema, { method: "POST" });
}

export function unclaimTache(tacheId: string): Promise<TacheVue> {
  return requete(`/api/taches/${tacheId}/unclaim`, tacheVueSchema, { method: "POST" });
}

export function approuverTache(tacheId: string, donnees: ApprouverRequete): Promise<TacheVue> {
  return requete(`/api/taches/${tacheId}/approuver`, tacheVueSchema, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(donnees)
  });
}

export function rejeterTache(tacheId: string, donnees: RejeterRequete): Promise<TacheVue> {
  return requete(`/api/taches/${tacheId}/rejeter`, tacheVueSchema, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(donnees)
  });
}

export function deleguerTache(tacheId: string, donnees: CreerDelegationRequete): Promise<DelegationVue> {
  return requete(`/api/taches/${tacheId}/deleguer`, delegationVueSchema, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(donnees)
  });
}

// --- ControleScreen (Phase 9.2) ---------------------------------------

// Pas de role= : la portée vient de TacheService.lister lui-même (rôles +
// délégations actifs de l'appelant), la même base que CorbeilleRoleGuard sur
// POST /api/taches/{id}/controle — cohérence par construction, pas par
// coïncidence. POST_CLOTURE n'est posé que sur les étapes typeActeur === 'C'
// (RuleEngineService.instancierChaine) : aucune ambiguïté sur ce que ce
// filtre renvoie.
export function listerTachesControle(): Promise<TachesListeReponse> {
  return requete(`/api/taches?etat=POST_CLOTURE&limit=200`, tachesListeReponseSchema);
}

export function soumettreControle(tacheId: string, donnees: SoumettreControleRequete): Promise<ControleVue> {
  return requete(`/api/taches/${tacheId}/controle`, controleVueSchema, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(donnees)
  });
}
