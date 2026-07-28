import { z } from "zod";
import { enumCircuit } from "./enums";

// GET /api/referentiels/* (Phase 10.6, décomposition NouvelleDemandeScreen) —
// lecture ouverte à tout authentifié, jamais de rôle : ces référentiels
// alimentent un formulaire de saisie, pas une fonction d'administration.
// Distinct des contrôleurs admin/* (CRUD complet, ADMIN_PGD-only) — même
// principe déjà appliqué à LignesController vs les routes d'écriture de
// lignes/formules.
export const universFmiVueSchema = z.object({
  code: z.string(),
  libelle: z.string()
});
export type UniversFmiVue = z.infer<typeof universFmiVueSchema>;

export const facteurDegrevementVueSchema = z.object({
  code: z.string(),
  libelle: z.string()
});
export type FacteurDegrevementVue = z.infer<typeof facteurDegrevementVueSchema>;

export const serviceResponsabiliteVueSchema = z.object({
  id: z.string().uuid(),
  libelle: z.string()
});
export type ServiceResponsabiliteVue = z.infer<typeof serviceResponsabiliteVueSchema>;

// Services imbriqués sous leur direction — reflète la FK réelle
// (ServiceResponsabilite.directionId), pas deux listes plates à recroiser
// côté client.
export const directionResponsabiliteVueSchema = z.object({
  id: z.string().uuid(),
  libelle: z.string(),
  services: z.array(serviceResponsabiliteVueSchema)
});
export type DirectionResponsabiliteVue = z.infer<typeof directionResponsabiliteVueSchema>;

export const listerMotifsQuerySchema = z.object({
  circuit: enumCircuit.optional()
});
export type ListerMotifsQuery = z.infer<typeof listerMotifsQuerySchema>;

// GET /api/referentiels/parametres-calcul/:circuit (Phase 10.6, carte mémo
// DF) — projection délibérément étroite de ParametreCalculVue (admin-
// parametre-calcul.ts, 6 champs : circuit/tauxTsc/tauxTva/tscActiveDefaut/
// tvaActiveDefaut/devise). Exactement les 4 champs affichables en lecture
// seule : `circuit` est redondant avec le paramètre d'URL, `devise` n'a
// aucun usage ici — ne jamais élargir vers le schéma admin complet, la
// projection explicite (pas un spread) est ce qui empêche une exposition
// par ricochet si ParametreCalculVue gagne un champ plus tard.
export const parametresCalculPublicVueSchema = z.object({
  tauxTsc: z.number(),
  tauxTva: z.number(),
  tscActiveDefaut: z.boolean(),
  tvaActiveDefaut: z.boolean()
});
export type ParametresCalculPublicVue = z.infer<typeof parametresCalculPublicVueSchema>;
