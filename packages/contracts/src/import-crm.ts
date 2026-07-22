import { z } from "zod";

// POST /api/admin/import-crm — docs/06_Contrats_API.md §9, SF-PGD-052b.
// Réponse non détaillée dans la source : forme minimale, un compteur par entité
// synchronisée, suffisante pour un accusé de réception d'import.
export const importCrmReponseSchema = z.object({
  comptesImportes: z.number().int().nonnegative(),
  lignesImportees: z.number().int().nonnegative(),
  formulesImportees: z.number().int().nonnegative()
});
export type ImportCrmReponse = z.infer<typeof importCrmReponseSchema>;
