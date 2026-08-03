import { z } from "zod";
import { enumAssietteTva, enumCircuit } from "./enums";

// docs/06_Contrats_API.md §9 (PGD-043) — PARAMETRE_CALCUL n'est pas un
// référentiel comme les autres : tauxTsc/tauxTva pilotent le calcul de tous
// les montants. Décision explicite : les demandes déjà SOUMISes gardent leur
// taux figé sur DEMANDE (instantané volontaire, jamais recalculé
// rétroactivement) ; les BROUILLON suivent le nouveau taux — recalcul
// systématique à l'écriture, tracé dans HISTORIQUE_MONTANT (origine=RECALCUL,
// acteur_id=NULL : le cas système que R23 autorise explicitement).

export const parametreCalculVueSchema = z.object({
  circuit: enumCircuit,
  tauxTsc: z.number(),
  tauxTva: z.number(),
  tscActiveDefaut: z.boolean(),
  tvaActiveDefaut: z.boolean(),
  // Confirmation métier (docs/10, remarques DOBB #1/#2/#6, Phase 10.6septies)
  // — défaut hérité par Demande.assietteTva à la création, modifiable par
  // dossier ensuite via PATCH /api/demandes/{id}/taxes.
  assietteTvaDefaut: enumAssietteTva,
  devise: z.string()
});
export type ParametreCalculVue = z.infer<typeof parametreCalculVueSchema>;

export const modifierParametreCalculRequeteSchema = z.object({
  tauxTsc: z.number().nonnegative().optional(),
  tauxTva: z.number().nonnegative().optional(),
  tscActiveDefaut: z.boolean().optional(),
  tvaActiveDefaut: z.boolean().optional(),
  assietteTvaDefaut: enumAssietteTva.optional(),
  devise: z.string().optional()
});
export type ModifierParametreCalculRequete = z.infer<typeof modifierParametreCalculRequeteSchema>;

export const modifierParametreCalculReponseSchema = z.object({
  parametre: parametreCalculVueSchema,
  demandesBrouillonRecalculees: z.number().int().nonnegative()
});
export type ModifierParametreCalculReponse = z.infer<typeof modifierParametreCalculReponseSchema>;
