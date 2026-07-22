import { z } from "zod";
import { enumEtatSi } from "./enums";

// docs/06 §? — GET /api/demandes/{id}/si (SF-PGD-360).
export const siVueSchema = z.object({
  etat: enumEtatSi,
  refSi: z.string().nullable(),
  horodatage: z.string().nullable(),
  message: z.string().nullable(),
  tentatives: z.number(),
  adaptateur: z.string().nullable()
});
export type SiVue = z.infer<typeof siVueSchema>;
