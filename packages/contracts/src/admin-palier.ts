import { z } from "zod";
import { enumAffectation, enumCircuit, enumTypeActeur } from "./enums";

// docs/06_Contrats_API.md §9 · PGD-042 · R1/R2/R11.
// CRUD des paliers de subdélégation (configuration_circuit + etape_regle).
// Le chevauchement des bornes n'est PAS revérifié ici : il est garanti en
// base par excl_configuration_circuit_chevauchement depuis la Phase 1 — ce
// service traduit la violation Postgres en 422 lisible, il ne la duplique pas.

export const etapeReglePayloadSchema = z.object({
  ordre: z.number().int().positive(),
  roleCode: z.string().min(1),
  typeActeur: enumTypeActeur,
  bloquant: z.boolean(),
  slaHeures: z.number().int().positive(),
  modeAffectation: enumAffectation.optional()
});
export type EtapeReglePayload = z.infer<typeof etapeReglePayloadSchema>;

export const creerPalierRequeteSchema = z.object({
  circuit: enumCircuit,
  segment: z.string().min(1),
  sousFlux: z.string().optional(),
  borneMin: z.number().nonnegative(),
  borneMax: z.number().positive(),
  labelPalier: z.string().optional(),
  sourceFiche: z.string().optional(),
  dateEffet: z.string().optional(),
  etapes: z.array(etapeReglePayloadSchema).min(1, "Au moins une étape est requise")
});
export type CreerPalierRequete = z.infer<typeof creerPalierRequeteSchema>;

// PATCH — tous les champs optionnels ; fournir `etapes` remplace la chaîne
// entière (pas de fusion partielle, pour éviter un ordre incohérent).
export const modifierPalierRequeteSchema = creerPalierRequeteSchema.partial().extend({
  actif: z.boolean().optional()
});
export type ModifierPalierRequete = z.infer<typeof modifierPalierRequeteSchema>;

export const etapeRegleVueSchema = z.object({
  id: z.string().uuid(),
  ordre: z.number(),
  roleCode: z.string(),
  typeActeur: enumTypeActeur,
  bloquant: z.boolean(),
  slaHeures: z.number(),
  modeAffectation: enumAffectation
});
export type EtapeRegleVue = z.infer<typeof etapeRegleVueSchema>;

export const palierVueSchema = z.object({
  id: z.string().uuid(),
  circuit: enumCircuit,
  segment: z.string(),
  sousFlux: z.string().nullable(),
  borneMin: z.number(),
  borneMax: z.number(),
  actif: z.boolean(),
  labelPalier: z.string().nullable(),
  sourceFiche: z.string().nullable(),
  dateEffet: z.string().nullable(),
  datePublication: z.string(),
  etapesRegle: z.array(etapeRegleVueSchema)
});
export type PalierVue = z.infer<typeof palierVueSchema>;

// Trou détecté entre deux tranches actives d'un même (circuit, segment,
// sous_flux) — signalé, jamais bloquant (PGD-042 : "trous détectés et signalés").
export const trouPalierSchema = z.object({
  circuit: enumCircuit,
  segment: z.string(),
  sousFlux: z.string().nullable(),
  borneMin: z.number(),
  borneMax: z.number()
});
export type TrouPalier = z.infer<typeof trouPalierSchema>;

export const listerPaliersQuerySchema = z.object({
  circuit: enumCircuit.optional(),
  segment: z.string().optional()
});
export type ListerPaliersQuery = z.infer<typeof listerPaliersQuerySchema>;

export const paliersListeReponseSchema = z.object({
  paliers: z.array(palierVueSchema),
  trous: z.array(trouPalierSchema)
});
export type PaliersListeReponse = z.infer<typeof paliersListeReponseSchema>;
