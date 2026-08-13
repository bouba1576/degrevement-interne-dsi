import { z } from "zod";
import { enumAffectation, enumEtatTache, enumTypeActeur } from "./enums";

// docs/06_Contrats_API.md §5 · PGD-050, 051, 052, 055, 056, 057, 058.

export const tacheVueSchema = z.object({
  id: z.string().uuid(),
  demandeId: z.string().uuid(),
  reference: z.string(),
  nomClient: z.string(),
  montantTtc: z.number(),
  roleCorbeille: z.string(),
  ordre: z.number(),
  typeActeur: enumTypeActeur,
  bloquant: z.boolean(),
  slaHeures: z.number(),
  modeAffectation: enumAffectation,
  etat: enumEtatTache,
  agentClaimId: z.string().uuid().nullable(),
  dateClaim: z.string().nullable(),
  verrouExpireAt: z.string().nullable(),
  echeanceSla: z.string().nullable(),
  niveauEscalade: z.number(),
  dateDecision: z.string().nullable()
});
export type TacheVue = z.infer<typeof tacheVueSchema>;

// GET /api/taches?role=&etat=&page= (SF-PGD-071, R4) — un agent ne voit que
// les corbeilles de ses rôles ; le filtre role= restreint encore, il n'élargit
// jamais au-delà des rôles réels de l'utilisateur (vérifié en service).
export const listerTachesQuerySchema = z.object({
  role: z.string().optional(),
  etat: enumEtatTache.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(20)
});
export type ListerTachesQuery = z.infer<typeof listerTachesQuerySchema>;

export const tachesListeReponseSchema = z.object({
  taches: z.array(tacheVueSchema),
  total: z.number()
});
export type TachesListeReponse = z.infer<typeof tachesListeReponseSchema>;

// POST /api/taches/{id}/approuver (SF-PGD-080, 081) — revue champ par champ :
// chaque champ marqué vu, corrections éventuelles journalisées (JournalAudit.detail).
export const revueChampSchema = z.object({
  champ: z.string(),
  vu: z.boolean(),
  correction: z.string().optional()
});
export type RevueChamp = z.infer<typeof revueChampSchema>;

export const approuverRequeteSchema = z.object({
  revue: z.array(revueChampSchema).optional()
});
export type ApprouverRequete = z.infer<typeof approuverRequeteSchema>;

// POST /api/taches/{id}/rejeter (SF-PGD-082) — motif obligatoire.
// Décision métier du 12/08/2026 (docs/12 diapositive 17, options i+iv
// combinées) : par défaut, un rejet renvoie systématiquement le dossier à
// l'initiateur pour correction (statut -> BROUILLON, cf.
// TacheWorkflowService.rejeter) ; `clore` bascule explicitement vers
// l'ancien comportement (statut -> REJETE, terminal) et exige alors un
// motif de clôture DISTINCT du motif de rejet — jamais réutilisé l'un pour
// l'autre, ce sont deux faits différents (pourquoi rejeté / pourquoi
// clôturé plutôt que renvoyé).
export const rejeterRequeteSchema = z
  .object({
    motif: z.string().min(1, "Le motif de rejet est obligatoire"),
    clore: z.boolean().default(false),
    motifCloture: z.string().min(1).optional()
  })
  .refine((v) => !v.clore || (v.motifCloture && v.motifCloture.trim().length > 0), {
    message: "Le motif de clôture est obligatoire lorsque « clore » est demandé.",
    path: ["motifCloture"]
  });
export type RejeterRequete = z.infer<typeof rejeterRequeteSchema>;

// GET /api/demandes/{id}/taches (Phase 9.2) — chaîne réelle des tâches d'un
// dossier, pour l'onglet « Circuit de validation » (WorkflowStepper,
// packages/ui). Même ouverture que GET /api/demandes/{id} (docs/06 §4,
// lecture non restreinte) : la chaîne d'un dossier déjà lisible ne divulgue
// rien de nouveau structurellement.
//
// Vue délibérément PLUS ÉTROITE que TacheVue — décision explicite, pas un
// `select *` : `agentClaimId`/`dateClaim` (qui traite le dossier, depuis
// quand) ne sont JAMAIS exposés pour une étape en cours (EN_ATTENTE/
// EN_CORBEILLE/RECLAMEE), ce serait révéler la charge de travail en temps
// réel d'un agent précis à n'importe quel utilisateur authentifié qui ouvre
// un dossier tiers — une information différente de « quel rôle doit
// valider ». `acteurNom` n'est renseigné que lorsque `dateDecision` est déjà
// posée (étape APPROUVEE/REJETEE, donc décidée) : c'est la même information
// que celle déjà visible via GET /api/audit/{demandeId} (acteur.identifiantAd
// sur les entrées "approbation"/"rejet"), présentée avec un nom résolu au
// lieu d'un identifiant — pas une exposition nouvelle.
export const etapeDossierSchema = z.object({
  id: z.string().uuid(),
  ordre: z.number(),
  roleCode: z.string(),
  roleLibelle: z.string(),
  typeActeur: enumTypeActeur,
  bloquant: z.boolean(),
  etat: enumEtatTache,
  echeanceSla: z.string().nullable(),
  niveauEscalade: z.number(),
  dateDecision: z.string().nullable(),
  acteurNom: z.string().nullable()
});
export type EtapeDossier = z.infer<typeof etapeDossierSchema>;
