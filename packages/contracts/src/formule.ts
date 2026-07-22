import { z } from "zod";

// docs/06_Contrats_API.md §3 · SF-PGD-320.

export const formuleSchema = z.object({
  id: z.string().uuid(),
  libelle: z.string(),
  recurrentMensuelHt: z.number(),
  dateDebut: z.string(),
  dateFin: z.string().nullable(),
  courante: z.boolean()
});
export type Formule = z.infer<typeof formuleSchema>;
