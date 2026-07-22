import { z } from "zod";
import { enumCircuit, enumEtatSi, enumStatutLigne, enumUniteKpi } from "./enums";

// docs/06 §10 (PGD-074, SF-PGD-120/121/122) — filtres partagés par tous les
// indicateurs. `periode` (YYYY-MM) ancre le calcul d'évolution M-1 → M ;
// absente, le mois courant est utilisé.
export const kpiQuerySchema = z.object({
  profil: z.enum(["initiateur", "valideur", "pilotage"]).optional(),
  circuit: enumCircuit.optional(),
  periode: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Format attendu : AAAA-MM")
    .optional(),
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
