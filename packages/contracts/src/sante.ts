import { z } from "zod";

export const santeSchema = z.object({
  statut: z.literal("ok"),
  horodatage: z.string()
});

export const santeDetailSchema = z.object({
  statut: z.enum(["ok", "degrade", "indisponible"]),
  // mfa retiré le 24/08/2026 (MfaService/DuoProvider retirés) — Keycloak
  // résout identité ET second facteur en un seul échange, `ad` couvre donc
  // déjà les deux, cf. CLAUDE.md « Architecture Keycloak — source unique ».
  services: z.object({
    postgresql: z.boolean(),
    redis: z.boolean(),
    rabbitmq: z.boolean(),
    ad: z.boolean()
  }),
  horodatage: z.string()
});

export type Sante = z.infer<typeof santeSchema>;
export type SanteDetail = z.infer<typeof santeDetailSchema>;
