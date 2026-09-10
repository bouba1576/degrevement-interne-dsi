import { z } from "zod";
import { enumEvenementSecurite, enumFacteurAuth } from "./enums";

// docs/06 §8 — SF-PGD-140 (journal d'audit append-only), SF-PGD-006 (journal
// de sécurité), SF-PGD-141 (export).
export const journalAuditVueSchema = z.object({
  id: z.string().uuid(),
  demandeId: z.string().uuid().nullable(),
  tacheId: z.string().uuid().nullable(),
  // `acteur` reste la chaîne snapshot brute telle qu'écrite à l'action
  // (identifiantAd réel, ou un acteur système comme "system:locks-sweeper",
  // cf. schema.prisma) — jamais réécrite, l'audit doit rester lisible même
  // si la résolution ci-dessous échoue. `acteurNom` est résolu côté serveur
  // (jointure sur Utilisateur par identifiantAd, même principe que
  // JournalSecuriteVue.identifiantAd/EtapeDossier.acteurNom) — `null` si
  // `acteur` ne correspond à aucun compte actuel (compte supprimé, ou acteur
  // système qui n'a jamais été un compte).
  acteur: z.string(),
  acteurNom: z.string().nullable(),
  action: z.string(),
  // Objet enrichi côté serveur quand applicable (ex. `delegantNom` ajouté à
  // côté de `delegantIdentifiantAd` déjà écrit à l'action) — jamais une
  // réécriture du detail original, une jointure supplémentaire dans le même
  // esprit que `acteurNom` ci-dessus.
  detail: z.unknown().nullable(),
  commentaire: z.string().nullable(),
  horodatage: z.string()
});
export type JournalAuditVue = z.infer<typeof journalAuditVueSchema>;

export const journalSecuriteVueSchema = z.object({
  id: z.string().uuid(),
  utilisateurId: z.string().uuid().nullable(),
  // Résolu côté serveur (jointure sur Utilisateur), Phase 9.2 — ADMIN_PGD a
  // déjà la visibilité la plus large qui existe sur cette route (IP,
  // connexions, refus RBAC/SoD, tous utilisateurs) : ce champ rend lisible
  // ce que l'admin voit déjà, il ne crée aucun accès nouveau. `null` couvre
  // deux cas INDISTINGUABLES en base (`ON DELETE SET NULL` sur la FK,
  // aucune copie texte façon `JournalAudit.acteur`) : un identifiant jamais
  // résolu (tentative de connexion avec un identifiant inconnu — le cas le
  // plus fréquent) ou un compte depuis supprimé. Ne jamais afficher « compte
  // supprimé » pour ce `null` : ce serait factuellement faux dans le cas le
  // plus courant.
  identifiantAd: z.string().nullable(),
  evenement: enumEvenementSecurite,
  succes: z.boolean(),
  facteur: enumFacteurAuth,
  ip: z.string().nullable(),
  // Détail d'échec (19/08/2026, AdApiProvider/SF-PGD-001) — capturés et
  // persistés (JournalSecurite.codeEchec/messageEchec, schema.prisma) depuis
  // ce chantier-là, jamais exposés à l'écran jusqu'ici (CLAUDE.md, Questions
  // ouvertes). Jamais peuplés sur succes=true ; LdapProvider (annuaire dev)
  // ne les peuple jamais non plus, cf. commentaire du modèle Prisma.
  codeEchec: z.string().nullable(),
  messageEchec: z.string().nullable(),
  // E7.2 (10/09/2026) — distinct d'`identifiantAd` ci-dessus : celui-là
  // n'est jamais renseigné quand `utilisateurId` est NULL (rien à
  // résoudre par jointure). `identifiantTente` porte la chaîne brute
  // saisie par le client, capturée précisément sur les échecs où
  // l'identité n'a jamais pu être résolue — jamais peuplé sur
  // succes=true, jamais peuplé non plus quand `identifiantAd` l'est déjà
  // (redondant).
  identifiantTente: z.string().nullable(),
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
