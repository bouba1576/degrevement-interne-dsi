import { z } from "zod";
import { enumStatutLigne } from "./enums";
import { compteClientSchema } from "./compte-client";
import { formuleSchema } from "./formule";

// docs/06_Contrats_API.md §3 · SF-PGD-300, 310, 311, 320.

export const ligneSchema = z.object({
  id: z.string().uuid(),
  nd: z.string(),
  libelleLigne: z.string().nullable(),
  statut: enumStatutLigne,
  universFmiCode: z.string().nullable(),
  historiquePartiel: z.boolean()
});
export type Ligne = z.infer<typeof ligneSchema>;

// GET /api/lignes?nd= — résout compte + ligne + toutes les formules.
// ND inconnu → data: null, jamais 404 (SF-PGD-310).
export const ligneAvecContexteSchema = z.object({
  compte: compteClientSchema,
  ligne: ligneSchema,
  formules: z.array(formuleSchema)
});
export type LigneAvecContexte = z.infer<typeof ligneAvecContexteSchema>;

export const rechercheNdQuerySchema = z.object({
  nd: z.string().min(1, "Le ND est requis")
});
export type RechercheNdQuery = z.infer<typeof rechercheNdQuerySchema>;

// GET /api/comptes/{numero}/lignes — résumé par ligne (formule courante seulement).
export const ligneResumeSchema = ligneSchema.extend({
  formuleCourante: formuleSchema.nullable()
});
export type LigneResume = z.infer<typeof ligneResumeSchema>;

export const compteAvecLignesSchema = z.object({
  compte: compteClientSchema,
  lignes: z.array(ligneResumeSchema)
});
export type CompteAvecLignes = z.infer<typeof compteAvecLignesSchema>;

// GET /api/lignes/{id}/formules
export const formulesDeLigneSchema = z.object({
  historiquePartiel: z.boolean(),
  formules: z.array(formuleSchema)
});
export type FormulesDeLigne = z.infer<typeof formulesDeLigneSchema>;
