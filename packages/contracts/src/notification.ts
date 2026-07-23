import { z } from "zod";
import { enumTypeNotification } from "./enums";

// GET /api/notifications (Phase 9.2, question ouverte fermée — CLAUDE.md
// « GET /api/notifications n'existe pas encore »). Portée forcée sur le
// destinataire authentifié : `destinataireId` vient TOUJOURS de la session
// (@CurrentUser()), jamais d'un paramètre client — ce schéma ne porte même
// pas ce champ, même principe que `profil=initiateur` pour /api/demandes et
// /api/kpi.
export const listerNotificationsQuerySchema = z.object({
  // Filtre optionnel sur le statut lu/non-lu. `z.coerce.boolean()` coercerait
  // n'importe quelle chaîne non vide (y compris "false") à `true` — piège
  // documenté de Zod, évité en énumérant les deux littéraux acceptés.
  lu: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(20)
});
export type ListerNotificationsQuery = z.infer<typeof listerNotificationsQuerySchema>;

export const notificationSchema = z.object({
  id: z.string().uuid(),
  demandeId: z.string().uuid().nullable(),
  type: enumTypeNotification,
  canal: z.string(),
  lu: z.boolean(),
  horodatage: z.string()
});
export type NotificationVue = z.infer<typeof notificationSchema>;
