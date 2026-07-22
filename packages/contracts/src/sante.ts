import { z } from "zod";

export const santeSchema = z.object({
  statut: z.literal("ok"),
  horodatage: z.string()
});

export const santeDetailSchema = z.object({
  statut: z.enum(["ok", "degrade", "indisponible"]),
  services: z.object({
    postgresql: z.boolean(),
    redis: z.boolean(),
    rabbitmq: z.boolean(),
    ad: z.boolean(),
    mfa: z.boolean()
  }),
  horodatage: z.string()
});

export type Sante = z.infer<typeof santeSchema>;
export type SanteDetail = z.infer<typeof santeDetailSchema>;
