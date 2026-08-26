import { z } from "zod";
import { enumCircuit, enumEtatSi, enumStatutLigne, enumUniteKpi } from "./enums";

const dateJourSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu : AAAA-MM-JJ");

// docs/06 §10 (PGD-074, SF-PGD-120/121/122) — filtres partagés par tous les
// indicateurs. `periode` (YYYY-MM) ancre le calcul d'évolution M-1 → M ;
// absente, le mois courant est utilisé — INDÉPENDANT de `debut`/`fin`
// ci-dessous (26/08/2026, refonte Dashboard) : `debut`/`fin` bornent le
// dossier lui-même (Demande.dateSoumission) pour le reste du calcul
// (scalaires/répartitions), jamais la fenêtre mensuelle glissante de
// l'évolution, qui garde sa propre logique (KpiEngineService.bornesMois) —
// composer les deux aurait reproduit l'incohérence de la maquette
// (docs/design/screens3.jsx:21-24 borne `ds` par période PUIS recalcule un
// mois glissant par-dessus, un artefact de prototype).
export const kpiQuerySchema = z.object({
  profil: z.enum(["initiateur", "valideur", "pilotage"]).optional(),
  circuit: enumCircuit.optional(),
  periode: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Format attendu : AAAA-MM")
    .optional(),
  debut: dateJourSchema.optional(),
  fin: dateJourSchema.optional(),
  univers: z.string().optional(),
  statutLigne: enumStatutLigne.optional(),
  siEtat: enumEtatSi.optional()
});
export type KpiQuery = z.infer<typeof kpiQuerySchema>;

export const kpiRepartitionSchema = z.object({
  cle: z.string(),
  libelle: z.string().nullable(),
  valeur: z.number()
});
export type KpiRepartition = z.infer<typeof kpiRepartitionSchema>;

export const kpiValeurSchema = z.object({
  code: z.string(),
  libelle: z.string(),
  famille: z.string(),
  unite: enumUniteKpi,
  valeur: z.number().nullable(),
  repartition: z.array(kpiRepartitionSchema).optional()
});
export type KpiValeur = z.infer<typeof kpiValeurSchema>;

export const kpiDefinitionVueSchema = z.object({
  code: z.string(),
  famille: z.string(),
  libelle: z.string(),
  unite: enumUniteKpi,
  dimensions: z.array(z.string()),
  surDossiersTraites: z.boolean()
});
export type KpiDefinitionVue = z.infer<typeof kpiDefinitionVueSchema>;

// GET /api/kpi/synthese (26/08/2026, refonte Dashboard) — entonnoir de
// statuts + SLA pour Initiateur/Valideur (docs/design/screens3.jsx:174-198,
// `initStats`/`valStats`), 4 tuiles d'en-tête pour Pilotage (screens3.jsx:
// 202-206) — trois formes DIFFÉRENTES, jamais le catalogue générique à 26
// indicateurs (KpiValeur[]) : ces métriques (entonnoir de statuts, délai
// moyen, taux d'approbation) ne sont pas des agrégations dimension/unité
// génériques, un KPI_DEFINITION n'aurait rien à leur apporter.
export const syntheseInitiateurSchema = z.object({
  profil: z.literal("initiateur"),
  initiees: z.number(),
  enCours: z.number(),
  validees: z.number(),
  rejetees: z.number(),
  slaOk: z.number()
});
export type SyntheseInitiateur = z.infer<typeof syntheseInitiateurSchema>;

export const syntheseValideurSchema = z.object({
  profil: z.literal("valideur"),
  enAttente: z.number(),
  enCoursTraitement: z.number(),
  valideesParMoi: z.number(),
  rejeteesParMoi: z.number(),
  slaOk: z.number()
});
export type SyntheseValideur = z.infer<typeof syntheseValideurSchema>;

export const synthesePilotageSchema = z.object({
  profil: z.literal("pilotage"),
  delaiMoyenHeures: z.number().nullable(),
  tauxApprobation: z.number().nullable(),
  dossiersEnCircuit: z.number(),
  montantValideCumule: z.number()
});
export type SynthesePilotage = z.infer<typeof synthesePilotageSchema>;

export const syntheseReponseSchema = z.discriminatedUnion("profil", [
  syntheseInitiateurSchema,
  syntheseValideurSchema,
  synthesePilotageSchema
]);
export type SyntheseReponse = z.infer<typeof syntheseReponseSchema>;

// Query de GET /api/kpi/synthese — `profil` obligatoire ici (contrairement
// à kpiQuerySchema où son absence retombe sur "pilotage" par défaut) :
// la forme de réponse EST déterminée par ce champ, un défaut implicite
// serait trompeur pour un contrat à union discriminée.
export const syntheseQuerySchema = z.object({
  profil: z.enum(["initiateur", "valideur", "pilotage"]),
  circuit: enumCircuit.optional(),
  debut: dateJourSchema.optional(),
  fin: dateJourSchema.optional()
});
export type SyntheseQuery = z.infer<typeof syntheseQuerySchema>;
