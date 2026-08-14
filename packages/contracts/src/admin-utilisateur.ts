import { z } from "zod";
import { enumMethodeMfa } from "./enums";

// Pré-enregistrement des utilisateurs AD (analyse + conception du 12/08/2026,
// CLAUDE.md « Pré-enregistrement des utilisateurs AD »). Distinct de
// admin-referentiels.ts (roleVueSchema) : ceci porte le catalogue
// Utilisateur/MembreRole, jamais Role lui-même.

// Résultat de recherche annuaire — LdapPort.rechercher(), jamais un bind (pas
// de mot de passe en jeu). `groupesAd` reste informatif à l'affichage :
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

export const utilisateurAdminVueSchema = z.object({
  id: z.string().uuid(),
  identifiantAd: z.string(),
  nom: z.string(),
  matricule: z.string().nullable(),
  actif: z.boolean(),
  mfaMethode: enumMethodeMfa,
  directionId: z.string().uuid().nullable(),
  directionLibelle: z.string().nullable(),
  serviceId: z.string().uuid().nullable(),
  serviceLibelle: z.string().nullable(),
  sousFluxId: z.string().uuid().nullable(),
  sousFluxLibelle: z.string().nullable(),
  roles: z.array(roleAffecteVueSchema)
});
export type UtilisateurAdminVue = z.infer<typeof utilisateurAdminVueSchema>;

export const preEnregistrerUtilisateurRequeteSchema = z.object({
  identifiantAd: z.string().min(1),
  nom: z.string().min(1),
  roles: z.array(z.string().min(1)).min(1, "Au moins un rôle est requis."),
  directionId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  sousFluxId: z.string().uuid().optional(),
  mfaMethode: enumMethodeMfa.optional()
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
