import { z } from "zod";
import {
  apercuRoutageReponseSchema,
  calendrierSlaVueSchema,
  circuitVueSchema,
  comptesRechercheReponseSchema,
  connexionReponseSchema,
  controleVueSchema,
  delegationVueSchema,
  demandeDetailSchema,
  demandesListeReponseSchema,
  directionResponsabiliteVueSchema,
  facteurDegrevementVueSchema,
  journalSecuriteVueSchema,
  erreurSchema,
  etapeDossierSchema,
  formulesDeLigneSchema,
  journalAuditVueSchema,
  kpiValeurSchema,
  libelleAjustementVueSchema,
  ligneAvecContexteSchema,
  moduleVueSchema,
  modifierParametreCalculReponseSchema,
  motifVueSchema,
  universFmiVueSchema,
  notificationSchema,
  paliersListeReponseSchema,
  palierVueSchema,
  parametreCalculVueSchema,
  parametresCalculPublicVueSchema,
  parametreGlobalVueSchema,
  pieceJointeSchema,
  roleVueSchema,
  sessionUtilisateurSchema,
  siVueSchema,
  soumissionReponseSchema,
  tacheVueSchema,
  tachesListeReponseSchema,
  type ApercuRoutageReponse,
  type ApprouverRequete,
  type CalendrierSlaVue,
  type CircuitVue,
  type CompteClient,
  type ConnexionReponse,
  type ConnexionRequete,
  type ControleVue,
  type CreerDelegationRequete,
  type CreerDemandeRequete,
  type CreerLibelleAjustementRequete,
  type CreerMotifRequete,
  type CreerPalierRequete,
  type CreerRoleRequete,
  type DefinirLignesRequete,
  type DelegationVue,
  type Demande,
  type DemandeDetail,
  type DirectionResponsabiliteVue,
  type EtapeDossier,
  type FacteurDegrevementVue,
  type ListerDemandesQuery,
  type ListerNotificationsQuery,
  type FormulesDeLigne,
  type JournalAuditVue,
  type JournalSecuriteQuery,
  type JournalSecuriteVue,
  type KpiValeur,
  type LibelleAjustementVue,
  type LigneAvecContexte,
  type ModifierCalendrierSlaRequete,
  type MfaVerifieRequete,
  type ModifierCircuitRequete,
  type ModifierDemandeRequete,
  type ModifierLibelleAjustementRequete,
  type ModifierModuleRequete,
  type ModifierMotifRequete,
  type ModifierPalierRequete,
  type ModifierParametreCalculReponse,
  type ModifierParametreCalculRequete,
  type ModifierParametreGlobalRequete,
  type ModifierRoleRequete,
  type ModuleVue,
  type MotifVue,
  type NotificationVue,
  type PaliersListeReponse,
  type PalierVue,
  type ParametreCalculVue,
  type ParametresCalculPublicVue,
  type ParametreGlobalVue,
  type PieceJointeVue,
  type RejeterRequete,
  type RoleVue,
  type SessionUtilisateur,
  type SiVue,
  type SoumettreControleRequete,
  type SoumissionReponse,
  type TacheVue,
  type TachesListeReponse,
  type UniversFmiVue
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

// Variante de `requete` pour les listes paginées, qui ont besoin de
// `meta.total` (compte réel Postgres) en plus de la page de résultats —
// `requete` seule jette `meta`. Réservée à ces cas : le reste de ce fichier
// n'a jamais eu besoin de meta jusqu'ici (Phase 9.2, AdminScreen).
async function requeteAvecTotal<T>(
  chemin: string,
  schema: z.ZodType<T>,
  init?: RequestInit
): Promise<{ data: T; total: number }> {
  const reponse = await fetch(`${API_URL}${chemin}`, { credentials: "include", ...init });
  const corps: unknown = await reponse.json().catch(() => null);
  const enveloppe = corps as { data?: unknown; error?: unknown; meta?: { total?: number } } | null;

  if (!reponse.ok) {
    const erreur = enveloppe?.error
      ? erreurSchema.parse(enveloppe.error)
      : { code: "ERREUR", message: "Erreur inattendue du serveur.", details: undefined };
    throw new ApiError(erreur.code, erreur.message, reponse.status, erreur.details);
  }

  return { data: schema.parse(enveloppe?.data), total: enveloppe?.meta?.total ?? 0 };
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

// --- LoginScreen (Phase 9.2) — @Public() sur ces deux routes -----------

export function login(donnees: ConnexionRequete): Promise<ConnexionReponse> {
  return requete("/api/auth/login", connexionReponseSchema, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(donnees)
  });
}

export function verifierMfa(donnees: MfaVerifieRequete): Promise<ConnexionReponse> {
  return requete("/api/auth/mfa/verify", connexionReponseSchema, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(donnees)
  });
}

// --- Nouvelle demande (Phase 9.2) ------------------------------------

export function creerDemande(donnees: CreerDemandeRequete): Promise<DemandeDetail> {
  return requete("/api/demandes", demandeDetailSchema, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(donnees)
  });
}

// --- Référentiels de saisie (Phase 10.6, décomposition NouvelleDemandeScreen)
// GET /api/referentiels/* — ouvert à tout authentifié, distinct de
// listerMotifs() ci-dessous (GET /api/admin/motifs, ADMIN_PGD-only, tout
// statut) : celui-ci ne renvoie que les motifs actifs, filtrés serveur.
export function listerMotifsActifs(circuit?: string): Promise<MotifVue[]> {
  const query = circuit ? `?circuit=${circuit}` : "";
  return requete(`/api/referentiels/motifs${query}`, z.array(motifVueSchema));
}

// docs/10 remarques DOBB #3 / DXC #16 (Phase 10.6ter) — même distinction que
// listerMotifsActifs() vs listerMotifs() ci-dessous : celui-ci ne renvoie que
// les libellés actifs, filtrés serveur.
export function listerLibellesAjustementActifs(circuit?: string): Promise<LibelleAjustementVue[]> {
  const query = circuit ? `?circuit=${circuit}` : "";
  return requete(`/api/referentiels/libelles-ajustement${query}`, z.array(libelleAjustementVueSchema));
}

export function listerUniversFmi(): Promise<UniversFmiVue[]> {
  return requete("/api/referentiels/univers-fmi", z.array(universFmiVueSchema));
}

export function listerFacteursReferentiel(): Promise<FacteurDegrevementVue[]> {
  return requete("/api/referentiels/facteurs", z.array(facteurDegrevementVueSchema));
}

export function listerDirectionsReferentiel(): Promise<DirectionResponsabiliteVue[]> {
  return requete("/api/referentiels/directions", z.array(directionResponsabiliteVueSchema));
}

// Projection à 4 champs (jamais ParametreCalculVue au complet, 6 champs
// admin dont `devise`) — cf. ReferentielsService.parametresCalcul(),
// packages/contracts/src/referentiel.ts. Nom distinct de
// listerParametresCalcul() ci-dessous (GET /api/admin/parametres,
// ADMIN_PGD-only, vue complète) : même collision évitée que
// listerMotifsActifs() vs le CRUD admin des motifs.
export function obtenirParametresCalculReferentiel(circuit: string): Promise<ParametresCalculPublicVue> {
  return requete(`/api/referentiels/parametres-calcul/${circuit}`, parametresCalculPublicVueSchema);
}

// Écarts DossierDetailScreen (Phase 10.6quinquies, point 4) — distinct de
// listerCircuits() ci-dessous (GET /api/admin/circuits, ADMIN_PGD-only) :
// ApercuTab résout Circuit.libelle pour tout viewer authentifié du dossier.
export function listerCircuitsReferentiel(): Promise<CircuitVue[]> {
  return requete("/api/referentiels/circuits", z.array(circuitVueSchema));
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

// GET /api/comptes?q= — SF-PGD-052, insensible casse/espaces, indexé
// trigramme (pg_trgm, cf. CLAUDE.md § Index de performance). Contrats déjà
// présents dans packages/contracts (CompteService.rechercher, apps/api) :
// jamais consommée par apps/web avant docs/10 (remarques DOBB #9, DXC #18).
export function rechercherCompte(q: string): Promise<CompteClient[]> {
  return requete(`/api/comptes?q=${encodeURIComponent(q)}`, comptesRechercheReponseSchema);
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

// --- MesDemandesScreen (Phase 9.2) --------------------------------------

// `query.profil` transmis tel quel — jamais un `initiateurId` construit ici :
// le périmètre réel vient de DemandeService.lister côté serveur (session),
// ce paramètre ne fait que DEMANDER ce scope, il ne le garantit pas.
export function listerDemandes(query: ListerDemandesQuery): Promise<{ data: Demande[]; total: number }> {
  const params = new URLSearchParams();
  if (query.circuit) params.set("circuit", query.circuit);
  if (query.statut) params.set("statut", query.statut);
  if (query.q) params.set("q", query.q);
  if (query.profil) params.set("profil", query.profil);
  params.set("page", String(query.page));
  params.set("limit", String(query.limit));
  return requeteAvecTotal(`/api/demandes?${params.toString()}`, demandesListeReponseSchema);
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

// --- AdminScreen (Phase 9.2) — @Roles("ADMIN_PGD") sur toutes ces routes ---

// Paliers (PGD-042) ----------------------------------------------------

export function listerPaliers(circuit?: string): Promise<PaliersListeReponse> {
  const query = circuit ? `?circuit=${circuit}` : "";
  return requete(`/api/admin/paliers${query}`, paliersListeReponseSchema);
}

export function creerPalier(donnees: CreerPalierRequete): Promise<PalierVue> {
  return requete("/api/admin/paliers", palierVueSchema, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(donnees) });
}

export function modifierPalier(id: string, donnees: ModifierPalierRequete): Promise<PalierVue> {
  return requete(`/api/admin/paliers/${id}`, palierVueSchema, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(donnees) });
}

export function supprimerPalier(id: string): Promise<{ supprime: true }> {
  return requete(`/api/admin/paliers/${id}`, z.object({ supprime: z.literal(true) }), { method: "DELETE" });
}

// Rôles (PGD-043) -------------------------------------------------------

export function listerRoles(): Promise<RoleVue[]> {
  return requete("/api/admin/roles", z.array(roleVueSchema));
}

export function creerRole(donnees: CreerRoleRequete): Promise<RoleVue> {
  return requete("/api/admin/roles", roleVueSchema, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(donnees) });
}

export function modifierRole(code: string, donnees: ModifierRoleRequete): Promise<RoleVue> {
  return requete(`/api/admin/roles/${code}`, roleVueSchema, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(donnees) });
}

export function supprimerRole(code: string): Promise<{ supprime: true }> {
  return requete(`/api/admin/roles/${code}`, z.object({ supprime: z.literal(true) }), { method: "DELETE" });
}

// Motifs (PGD-043) ------------------------------------------------------

export function listerMotifs(circuit?: string): Promise<MotifVue[]> {
  const query = circuit ? `?circuit=${circuit}` : "";
  return requete(`/api/admin/motifs${query}`, z.array(motifVueSchema));
}

export function creerMotif(donnees: CreerMotifRequete): Promise<MotifVue> {
  return requete("/api/admin/motifs", motifVueSchema, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(donnees) });
}

export function modifierMotif(id: string, donnees: ModifierMotifRequete): Promise<MotifVue> {
  return requete(`/api/admin/motifs/${id}`, motifVueSchema, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(donnees) });
}

export function supprimerMotif(id: string): Promise<{ supprime: true }> {
  return requete(`/api/admin/motifs/${id}`, z.object({ supprime: z.literal(true) }), { method: "DELETE" });
}

// Libellés d'ajustement (docs/10 remarques DOBB #3 / DXC #16, Phase 10.6ter) --

export function listerLibellesAjustement(circuit?: string): Promise<LibelleAjustementVue[]> {
  const query = circuit ? `?circuit=${circuit}` : "";
  return requete(`/api/admin/libelles-ajustement${query}`, z.array(libelleAjustementVueSchema));
}

export function creerLibelleAjustement(donnees: CreerLibelleAjustementRequete): Promise<LibelleAjustementVue> {
  return requete("/api/admin/libelles-ajustement", libelleAjustementVueSchema, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(donnees)
  });
}

export function modifierLibelleAjustement(id: string, donnees: ModifierLibelleAjustementRequete): Promise<LibelleAjustementVue> {
  return requete(`/api/admin/libelles-ajustement/${id}`, libelleAjustementVueSchema, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(donnees)
  });
}

export function supprimerLibelleAjustement(id: string): Promise<{ supprime: true }> {
  return requete(`/api/admin/libelles-ajustement/${id}`, z.object({ supprime: z.literal(true) }), { method: "DELETE" });
}

// Circuits (PGD-043) — GET/PATCH seulement, segment immuable -------------

export function listerCircuits(): Promise<CircuitVue[]> {
  return requete("/api/admin/circuits", z.array(circuitVueSchema));
}

export function modifierCircuit(code: string, donnees: ModifierCircuitRequete): Promise<CircuitVue> {
  return requete(`/api/admin/circuits/${code}`, circuitVueSchema, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(donnees) });
}

// Paramètres de calcul (PGD-043) — taux TSC/TVA, recalcul des brouillons -

export function listerParametresCalcul(): Promise<ParametreCalculVue[]> {
  return requete("/api/admin/parametres", z.array(parametreCalculVueSchema));
}

export function modifierParametreCalcul(
  circuit: string,
  donnees: ModifierParametreCalculRequete
): Promise<ModifierParametreCalculReponse> {
  return requete(`/api/admin/parametres/${circuit}`, modifierParametreCalculReponseSchema, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(donnees)
  });
}

// Calendrier SLA (PGD-043) ------------------------------------------------

export function listerCalendriersSla(): Promise<CalendrierSlaVue[]> {
  return requete("/api/admin/calendrier-sla", z.array(calendrierSlaVueSchema));
}

export function modifierCalendrierSla(id: string, donnees: ModifierCalendrierSlaRequete): Promise<CalendrierSlaVue> {
  return requete(`/api/admin/calendrier-sla/${id}`, calendrierSlaVueSchema, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(donnees)
  });
}

// Paramètres globaux + Modules (PGD-043) — onglet "Paramètres système" --

export function listerParametresGlobaux(): Promise<ParametreGlobalVue[]> {
  return requete("/api/admin/parametres-globaux", z.array(parametreGlobalVueSchema));
}

export function modifierParametreGlobal(cle: string, donnees: ModifierParametreGlobalRequete): Promise<ParametreGlobalVue> {
  return requete(`/api/admin/parametres-globaux/${cle}`, parametreGlobalVueSchema, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(donnees)
  });
}

export function listerModules(): Promise<ModuleVue[]> {
  return requete("/api/admin/modules", z.array(moduleVueSchema));
}

export function modifierModule(code: string, donnees: ModifierModuleRequete): Promise<ModuleVue> {
  return requete(`/api/admin/modules/${code}`, moduleVueSchema, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(donnees) });
}

// Compte des brouillons d'un circuit — pour prévenir avant un changement de
// taux (AdminParametresCalculService.modifier recalcule tous les brouillons
// de ce circuit). Réutilise GET /api/demandes déjà scopé/filtré, pas une
// route dédiée : limit=1, seul meta.total (count() réel Postgres,
// DemandeService.lister) nous intéresse, jamais la page renvoyée.
export function compterBrouillons(circuit: string): Promise<number> {
  return requeteAvecTotal(`/api/demandes?circuit=${circuit}&statut=BROUILLON&limit=1`, z.array(z.unknown())).then(
    (r) => r.total
  );
}

// --- AuditSecuriteScreen (Phase 9.2) — @Roles("ADMIN_PGD") ---------------

// Journal de SÉCURITÉ (connexions, MFA, refus RBAC/SoD) — pas le journal
// d'audit métier par dossier (journalAuditDemande, déjà consommé par
// DossierDetailScreen). Deux sources réelles distinctes, cf. CLAUDE.md.
export function journalSecurite(query: JournalSecuriteQuery): Promise<{ data: JournalSecuriteVue[]; total: number }> {
  const params = new URLSearchParams();
  if (query.utilisateur) params.set("utilisateur", query.utilisateur);
  if (query.evenement) params.set("evenement", query.evenement);
  if (query.depuis) params.set("depuis", query.depuis);
  if (query.jusqua) params.set("jusqua", query.jusqua);
  params.set("page", String(query.page));
  params.set("limit", String(query.limit));
  return requeteAvecTotal(`/api/audit/securite?${params.toString()}`, z.array(journalSecuriteVueSchema));
}

// --- NotificationBell (coquille, 9.3) — GET/PATCH /api/notifications ----
// Portée déjà forcée côté serveur sur le destinataire authentifié
// (NotificationsController.lister, @CurrentUser()) : aucun paramètre
// destinataire ici, même principe que profil=initiateur.
export function listerNotifications(query: ListerNotificationsQuery): Promise<{ data: NotificationVue[]; total: number }> {
  const params = new URLSearchParams();
  if (query.lu !== undefined) params.set("lu", String(query.lu));
  params.set("page", String(query.page));
  params.set("limit", String(query.limit));
  return requeteAvecTotal(`/api/notifications?${params.toString()}`, z.array(notificationSchema));
}

export function marquerNotificationLue(id: string): Promise<NotificationVue> {
  return requete(`/api/notifications/${id}/lu`, notificationSchema, { method: "PATCH" });
}
