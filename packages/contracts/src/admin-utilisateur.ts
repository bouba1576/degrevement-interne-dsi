import { z } from "zod";

// Pré-enregistrement des utilisateurs AD (analyse + conception du 12/08/2026,
// CLAUDE.md « Pré-enregistrement des utilisateurs AD »). Distinct de
// admin-referentiels.ts (roleVueSchema) : ceci porte le catalogue
// Utilisateur/MembreRole, jamais Role lui-même.

// Résultat de recherche annuaire — KeycloakPort.rechercher(), jamais un bind
// (pas de mot de passe en jeu). `groupesAd` reste informatif à l'affichage :
// aucune route ne l'utilise pour dériver un rôle — la resynchronisation
// continue par groupe AD est retirée du flux de connexion (Temps 2, décision
// actée : l'API AD réelle ne renvoie aucun groupe pour cette recherche).
export const annuaireResultatSchema = z.object({
  identifiantAd: z.string(),
  nom: z.string(),
  groupesAd: z.array(z.string())
});
export type AnnuaireResultat = z.infer<typeof annuaireResultatSchema>;

export const roleAffecteVueSchema = z.object({
  code: z.string(),
  libelle: z.string()
});
export type RoleAffecteVue = z.infer<typeof roleAffecteVueSchema>;

// mfaMethode/totpEnrole retirés le 24/08/2026 avec MfaService/TotpProvider/
// DuoProvider — Keycloak gère l'intégralité du second facteur, plus aucun
// état MFA à afficher côté PGD (cf. CLAUDE.md « Architecture Keycloak —
// source unique »).
export const utilisateurAdminVueSchema = z.object({
  id: z.string().uuid(),
  identifiantAd: z.string(),
  nom: z.string(),
  matricule: z.string().nullable(),
  actif: z.boolean(),
  directionId: z.string().uuid().nullable(),
  directionLibelle: z.string().nullable(),
  serviceId: z.string().uuid().nullable(),
  serviceLibelle: z.string().nullable(),
  sousFluxId: z.string().uuid().nullable(),
  sousFluxLibelle: z.string().nullable(),
  roles: z.array(roleAffecteVueSchema)
});
export type UtilisateurAdminVue = z.infer<typeof utilisateurAdminVueSchema>;

// Forme attendue d'un identifiant AD — deux formes valides, pas une seule.
// Confirmé directement par la personne pilotant le projet (19/08/2026) :
// l'API AD réelle authentifie sur le `username` brut tel quel (ex.
// `c_afofana6`), jamais une adresse e-mail — contrairement à l'hypothèse
// tenue jusqu'ici (et au socle de test dev, qui reste lui structuré en
// e-mail, `prenom.nom@orange.com`/`orange.ci`, cf. docker/openldap/seed.ldif).
// Les deux formes coexistent dans ce dépôt et doivent donc rester acceptées
// toutes les deux : la forme e-mail (utilisée par le socle de test dev et
// potentiellement par d'autres comptes réels) et la forme brute (confirmée
// pour le username AD réel). Jamais une vérification d'existence — seulement
// une forme plausible ; une erreur d'existence (mauvais identifiant, faute de
// frappe) ne peut de toute façon être détectée que par une tentative de
// connexion réelle, jamais par un pattern statique.
const formatEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Exportée — AnnuaireRechercheModal (apps/web) réutilise cette même fonction
// pour sa validation cliente, jamais une réimplémentation locale du critère.
export function estFormeIdentifiantAdValide(valeur: string): boolean {
  return formatEmailRegex.test(valeur) || (!valeur.includes("@") && !/\s/.test(valeur));
}

export const preEnregistrerUtilisateurRequeteSchema = z.object({
  identifiantAd: z
    .string()
    .min(1)
    .refine(
      estFormeIdentifiantAdValide,
      "Forme attendue : identifiant@domaine (ex. jean.kouassi@orange.com), ou un identifiant AD brut sans espace (ex. c_afofana6)."
    ),
  nom: z.string().min(1),
  roles: z.array(z.string().min(1)).min(1, "Au moins un rôle est requis."),
  directionId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  sousFluxId: z.string().uuid().optional()
});
export type PreEnregistrerUtilisateurRequete = z.infer<typeof preEnregistrerUtilisateurRequeteSchema>;

// identifiantAd volontairement absent : immuable une fois pré-enregistré —
// c'est la clé d'appariement avec LDAP à la connexion (même principe que
// Role.code, creerRoleRequeteSchema.omit({code:true})). `roles`, si fourni,
// remplace l'ensemble complet (même convention que les pièces d'un motif ou
// les étapes d'un palier) — jamais de fusion partielle. Passer `roles: []`
// reste rejeté par le `min(1)` hérité : retirer tout accès à un utilisateur
// pré-enregistré passe par `actif: false`, jamais par un ensemble de rôles
// vide (aucune route de suppression physique n'est construite ici).
export const modifierUtilisateurAdminRequeteSchema = preEnregistrerUtilisateurRequeteSchema
  .omit({ identifiantAd: true })
  .partial()
  .extend({ actif: z.boolean().optional() });
export type ModifierUtilisateurAdminRequete = z.infer<typeof modifierUtilisateurAdminRequeteSchema>;
