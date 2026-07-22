import { z } from "zod";
import { enumEvenementSecurite, enumFacteurAuth } from "./enums";

// docs/06 §8 — SF-PGD-140 (journal d'audit append-only), SF-PGD-006 (journal
// de sécurité), SF-PGD-141 (export).
export const journalAuditVueSchema = z.object({
  id: z.string().uuid(),
  demandeId: z.string().uuid().nullable(),
  tacheId: z.string().uuid().nullable(),
  acteur: z.string(),
  action: z.string(),
  detail: z.unknown().nullable(),
  commentaire: z.string().nullable(),
  horodatage: z.string()
});
export type JournalAuditVue = z.infer<typeof journalAuditVueSchema>;

export const journalSecuriteVueSchema = z.object({
  id: z.string().uuid(),
  utilisateurId: z.string().uuid().nullable(),
  evenement: enumEvenementSecurite,
  succes: z.boolean(),
  facteur: enumFacteurAuth,
  ip: z.string().nullable(),
  horodatage: z.string()
});
export type JournalSecuriteVue = z.infer<typeof journalSecuriteVueSchema>;

export const journalSecuriteQuerySchema = z.object({
  utilisateur: z.string().optional(),
  evenement: enumEvenementSecurite.optional(),
  depuis: z.string().optional(),
  jusqua: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50)
});
export type JournalSecuriteQuery = z.infer<typeof journalSecuriteQuerySchema>;

export const exportAuditQuerySchema = z.object({
  format: z.enum(["csv", "pdf"])
});
export type ExportAuditQuery = z.infer<typeof exportAuditQuerySchema>;
