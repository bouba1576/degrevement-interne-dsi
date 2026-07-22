import { z } from "zod";
import { enumConstat, enumNiveauControle } from "./enums";

// docs/04 PGD-070 (SF-PGD-100) — contrôle a posteriori FRA/N1/N2, sur une
// tâche POST_CLOTURE. Commentaire obligatoire sur ANOMALIE (une anomalie non
// motivée ne serait pas exploitable) ; optionnel sur CONFORME.
export const soumettreControleRequeteSchema = z
  .object({
    constat: enumConstat,
    commentaire: z.string().optional()
  })
  .refine((v) => v.constat !== "ANOMALIE" || (v.commentaire && v.commentaire.trim().length > 0), {
    message: "Un commentaire est obligatoire pour un constat d'anomalie.",
    path: ["commentaire"]
  });
export type SoumettreControleRequete = z.infer<typeof soumettreControleRequeteSchema>;

export const controleVueSchema = z.object({
  id: z.string().uuid(),
  demandeId: z.string().uuid(),
  niveau: enumNiveauControle,
  constat: enumConstat,
  commentaire: z.string().nullable(),
  controleurId: z.string().uuid(),
  horodatage: z.string()
});
export type ControleVue = z.infer<typeof controleVueSchema>;
