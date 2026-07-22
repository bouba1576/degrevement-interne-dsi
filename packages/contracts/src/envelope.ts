import { z } from "zod";

export const erreurSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional()
});

export const metaSchema = z
  .object({
    page: z.number().int().positive().optional(),
    limit: z.number().int().positive().optional(),
    total: z.number().int().nonnegative().optional()
  })
  .nullable();

export function enveloppeSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema.nullable(),
    error: erreurSchema.nullable(),
    meta: metaSchema
  });
}

export type Erreur = z.infer<typeof erreurSchema>;
export type Meta = z.infer<typeof metaSchema>;

export interface Enveloppe<T> {
  data: T | null;
  error: Erreur | null;
  meta: Meta;
}
