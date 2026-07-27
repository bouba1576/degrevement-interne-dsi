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
