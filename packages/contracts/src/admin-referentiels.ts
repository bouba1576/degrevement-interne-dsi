import { z } from "zod";
import { enumCircuit, enumTypeRole } from "./enums";

// docs/06_Contrats_API.md §9 (PGD-043) — CRUD des référentiels d'administration
// hors paliers (admin-palier.ts) et paramètres de calcul (admin-parametre-calcul.ts,
// traité à part : impact sur les montants, décision de gel/recalcul dédiée).
// Aucun de ces référentiels n'est aujourd'hui lu via un cache Redis — pas
// d'invalidation à écrire ici tant qu'aucun cache n'existe (cf. RuleEngineService
// pour l'unique cas actuel, palier, déjà invalidé à l'écriture).

// ---------------------------------------------------------------------------
// Circuit — GET/PATCH seulement : code est un ENUM Postgres à 3 valeurs fixes
// (DOBB/DXC/DF), ni création ni suppression n'ont de sens structurel ici.
// ---------------------------------------------------------------------------
export const circuitVueSchema = z.object({
  code: enumCircuit,
  libelle: z.string(),
  segment: z.string(),
  processCode: z.string().nullable()
});
export type CircuitVue = z.infer<typeof circuitVueSchema>;

export const modifierCircuitRequeteSchema = z.object({
  libelle: z.string().optional(),
  processCode: z.string().optional()
});
export type ModifierCircuitRequete = z.infer<typeof modifierCircuitRequeteSchema>;

// ---------------------------------------------------------------------------
// Role — code libre (String @id), CRUD complet.
// ---------------------------------------------------------------------------
export const roleVueSchema = z.object({
  code: z.string(),
  libelle: z.string(),
  groupeAd: z.string(),
  niveau: z.number(),
  type: enumTypeRole,
  dansMatrice: z.boolean(),
  requiertMfa: z.boolean()
});
export type RoleVue = z.infer<typeof roleVueSchema>;

export const creerRoleRequeteSchema = z.object({
  code: z.string().min(1),
  libelle: z.string().min(1),
  groupeAd: z.string().min(1),
  niveau: z.number().int(),
  type: enumTypeRole,
  dansMatrice: z.boolean().optional(),
  requiertMfa: z.boolean().optional()
});
export type CreerRoleRequete = z.infer<typeof creerRoleRequeteSchema>;

export const modifierRoleRequeteSchema = creerRoleRequeteSchema.omit({ code: true }).partial();
export type ModifierRoleRequete = z.infer<typeof modifierRoleRequeteSchema>;

// ---------------------------------------------------------------------------
// Motif + PieceAfferente — remplacement complet des pièces à la modification,
// même principe que les étapes d'un palier (pas de fusion partielle).
// ---------------------------------------------------------------------------
export const pieceAfferentePayloadSchema = z.object({
  libelle: z.string().min(1),
  obligatoire: z.boolean().optional()
});
export type PieceAfferentePayload = z.infer<typeof pieceAfferentePayloadSchema>;

export const pieceAfferenteVueSchema = z.object({
  id: z.string().uuid(),
  libelle: z.string(),
  obligatoire: z.boolean()
});
export type PieceAfferenteVue = z.infer<typeof pieceAfferenteVueSchema>;

export const creerMotifRequeteSchema = z.object({
  circuit: enumCircuit,
  libelle: z.string().min(1),
  actif: z.boolean().optional(),
  pieces: z.array(pieceAfferentePayloadSchema).optional()
});
export type CreerMotifRequete = z.infer<typeof creerMotifRequeteSchema>;

export const modifierMotifRequeteSchema = creerMotifRequeteSchema.partial();
export type ModifierMotifRequete = z.infer<typeof modifierMotifRequeteSchema>;

export const motifVueSchema = z.object({
  id: z.string().uuid(),
  circuit: enumCircuit,
  libelle: z.string(),
  actif: z.boolean(),
  piecesAfferentes: z.array(pieceAfferenteVueSchema)
});
export type MotifVue = z.infer<typeof motifVueSchema>;

// ---------------------------------------------------------------------------
// LibelleAjustement — docs/10 remarques DOBB #3 / DXC #16 (Phase 10.6ter) :
// même forme que Motif (id/circuit/libelle/actif), CRUD complet, aucun
// sous-objet (contrairement aux pièces afférentes de Motif — pas de source
// qui en réclame ici).
// ---------------------------------------------------------------------------
export const creerLibelleAjustementRequeteSchema = z.object({
  circuit: enumCircuit,
  libelle: z.string().min(1),
  actif: z.boolean().optional()
});
export type CreerLibelleAjustementRequete = z.infer<typeof creerLibelleAjustementRequeteSchema>;

export const modifierLibelleAjustementRequeteSchema = creerLibelleAjustementRequeteSchema.partial();
export type ModifierLibelleAjustementRequete = z.infer<typeof modifierLibelleAjustementRequeteSchema>;

export const libelleAjustementVueSchema = z.object({
  id: z.string().uuid(),
  circuit: enumCircuit,
  libelle: z.string(),
  actif: z.boolean()
});
export type LibelleAjustementVue = z.infer<typeof libelleAjustementVueSchema>;

// ---------------------------------------------------------------------------
// Operateur (25/08/2026, demande explicite) — fiche Mémo Wholesale (DF),
// champ « Opérateur » promu en référentiel admin-configurable. Même forme
// que LibelleAjustement (id/libelle/actif), sans `circuit` : DF
// exclusivement, jamais partagé avec DOBB/DXC.
// ---------------------------------------------------------------------------
export const creerOperateurRequeteSchema = z.object({
  libelle: z.string().min(1),
  actif: z.boolean().optional()
});
export type CreerOperateurRequete = z.infer<typeof creerOperateurRequeteSchema>;

export const modifierOperateurRequeteSchema = creerOperateurRequeteSchema.partial();
export type ModifierOperateurRequete = z.infer<typeof modifierOperateurRequeteSchema>;

export const operateurVueSchema = z.object({
  id: z.string().uuid(),
  libelle: z.string(),
  actif: z.boolean()
});
export type OperateurVue = z.infer<typeof operateurVueSchema>;

// ---------------------------------------------------------------------------
// PointContact (25/08/2026, demande explicite) — fiche B2B (DOBB), champ
// « Point de contact » : déjà un <select> (Priorité 1.3, 20/08/2026) mais
// sur une constante locale, promu ici en référentiel admin-configurable.
// Même forme qu'Operateur ci-dessus.
// ---------------------------------------------------------------------------
export const creerPointContactRequeteSchema = z.object({
  libelle: z.string().min(1),
  actif: z.boolean().optional()
});
export type CreerPointContactRequete = z.infer<typeof creerPointContactRequeteSchema>;

export const modifierPointContactRequeteSchema = creerPointContactRequeteSchema.partial();
export type ModifierPointContactRequete = z.infer<typeof modifierPointContactRequeteSchema>;

export const pointContactVueSchema = z.object({
  id: z.string().uuid(),
  libelle: z.string(),
  actif: z.boolean()
});
export type PointContactVue = z.infer<typeof pointContactVueSchema>;

// ---------------------------------------------------------------------------
// SousFlux — SF-PGD-109 (« Motifs & circuits : référentiel des sous-flux et
// motifs par circuit »). Pas de champ actif (absent du modèle Prisma,
// contrairement à Motif/LibelleAjustement) ; pas de FK entrante
// (Demande.sousFlux / ConfigurationCircuit.sousFlux restent des chaînes
// libres, jamais une relation vers cette table) — mêmes conséquences que
// LibelleAjustement : pas de garde P2003 à la suppression.
// ---------------------------------------------------------------------------
export const creerSousFluxRequeteSchema = z.object({
  circuit: enumCircuit,
  libelle: z.string().min(1)
});
export type CreerSousFluxRequete = z.infer<typeof creerSousFluxRequeteSchema>;

export const modifierSousFluxRequeteSchema = creerSousFluxRequeteSchema.partial();
export type ModifierSousFluxRequete = z.infer<typeof modifierSousFluxRequeteSchema>;

export const sousFluxVueSchema = z.object({
  id: z.string().uuid(),
  circuit: enumCircuit,
  libelle: z.string()
});
export type SousFluxVue = z.infer<typeof sousFluxVueSchema>;

// ---------------------------------------------------------------------------
// ParametreGlobal — GET/PATCH seulement (clé libre déjà seedée, pas de création
// ad hoc de nouvelles clés via l'API : le code qui les lit doit les connaître).
// ---------------------------------------------------------------------------
export const parametreGlobalVueSchema = z.object({
  cle: z.string(),
  valeur: z.unknown(),
  libelle: z.string().nullable(),
  modifiableAdmin: z.boolean(),
  dateMaj: z.string()
});
export type ParametreGlobalVue = z.infer<typeof parametreGlobalVueSchema>;

export const modifierParametreGlobalRequeteSchema = z.object({
  valeur: z.unknown()
});
export type ModifierParametreGlobalRequete = z.infer<typeof modifierParametreGlobalRequeteSchema>;

// ---------------------------------------------------------------------------
// CalendrierSla + JourFerie — jours ouvrés, plage horaire, fériés.
// ---------------------------------------------------------------------------
export const jourFerieVueSchema = z.object({
  id: z.string().uuid(),
  jour: z.string(),
  libelle: z.string().nullable()
});
export type JourFerieVue = z.infer<typeof jourFerieVueSchema>;

export const calendrierSlaVueSchema = z.object({
  id: z.string().uuid(),
  libelle: z.string(),
  joursOuvres: z.array(z.number()),
  heureDebut: z.string(),
  heureFin: z.string(),
  actif: z.boolean(),
  joursFeries: z.array(jourFerieVueSchema)
});
export type CalendrierSlaVue = z.infer<typeof calendrierSlaVueSchema>;

export const modifierCalendrierSlaRequeteSchema = z.object({
  libelle: z.string().optional(),
  joursOuvres: z.array(z.number().int().min(1).max(7)).optional(),
  heureDebut: z.string().optional(),
  heureFin: z.string().optional(),
  actif: z.boolean().optional(),
  // Remplacement complet si fourni — même principe que les paliers/motifs.
  joursFeries: z.array(z.object({ jour: z.string(), libelle: z.string().optional() })).optional()
});
export type ModifierCalendrierSlaRequete = z.infer<typeof modifierCalendrierSlaRequeteSchema>;

// ---------------------------------------------------------------------------
// Module — activation de modules.
// ---------------------------------------------------------------------------
export const moduleVueSchema = z.object({
  code: z.string(),
  libelle: z.string(),
  coeur: z.boolean(),
  actif: z.boolean()
});
export type ModuleVue = z.infer<typeof moduleVueSchema>;

export const modifierModuleRequeteSchema = z.object({
  actif: z.boolean()
});
export type ModifierModuleRequete = z.infer<typeof modifierModuleRequeteSchema>;
