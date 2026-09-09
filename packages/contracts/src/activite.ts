import { z } from "zod";
import { enumTypeActivite } from "./enums";

// Journal d'activité administrateur (08/09/2026, CLAUDE.md « Journal
// d'activité administrateur ») — POST /api/activite/navigation.
//
// `route` : la clé d'écran stable (cleDePathname côté client — "corbeilles",
// "detail", jamais le pathname brut avec un id dedans). `libelle` n'est
// JAMAIS transmis par le client : dérivé côté serveur depuis `route`, même
// discipline que le reste de ce journal — un texte affiché à un admin dans
// un but de contrôle ne doit jamais être une valeur que l'acteur observé
// pourrait influencer. `detail` reste optionnel et minimal (ex. {demandeId}
// pour /dossiers/:id), jamais un contenu de page.
export const activiteNavigationRequeteSchema = z.object({
  route: z.string().min(1).max(40),
  detail: z.record(z.string(), z.unknown()).optional()
});
export type ActiviteNavigationRequete = z.infer<typeof activiteNavigationRequeteSchema>;

// GET /api/audit/activite (étape 4, écran — extension d'AuditSecuriteScreen,
// onglet « Activité ») — même forme exactement que journalSecuriteVueSchema/
// journalSecuriteQuerySchema (packages/contracts/src/audit.ts) : identifiantAd
// résolu côté serveur (jointure sur Utilisateur, jamais un uuid brut à
// l'écran), pagination page/limit, filtres optionnels envoyés au serveur —
// jamais un filtrage recalculé côté client sur une page déjà reçue.
export const journalActiviteVueSchema = z.object({
  id: z.string().uuid(),
  utilisateurId: z.string().uuid().nullable(),
  identifiantAd: z.string().nullable(),
  type: enumTypeActivite,
  route: z.string(),
  methodeHttp: z.string().nullable(),
  libelle: z.string(),
  detail: z.unknown().nullable(),
  horodatage: z.string()
});
export type JournalActiviteVue = z.infer<typeof journalActiviteVueSchema>;

export const journalActiviteQuerySchema = z.object({
  utilisateur: z.string().optional(),
  type: enumTypeActivite.optional(),
  depuis: z.string().optional(),
  jusqua: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50)
});
export type JournalActiviteQuery = z.infer<typeof journalActiviteQuerySchema>;
