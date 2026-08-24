import { z } from "zod";

// docs/06_Contrats_API.md §2 — Authentification.
//
// Keycloak est la source unique d'authentification, identité ET second
// facteur (DUO déjà lié au royaume) — décision actée le 24/08/2026, cf.
// CLAUDE.md « Architecture Keycloak — source unique ». MfaService/
// TotpProvider/DuoProvider et tout le mécanisme mfaMethode côté PGD sont
// retirés le même jour : plus de defi MFA, plus de champ mfaMethode sur la
// session, POST /api/auth/login accorde ou refuse en un seul aller-retour.

export const connexionRequeteSchema = z.object({
  identifiantAd: z.string().min(1, "Identifiant requis"),
  motDePasse: z.string().min(1, "Mot de passe requis")
});
export type ConnexionRequete = z.infer<typeof connexionRequeteSchema>;

export const connexionReponseSchema = z.object({
  connecte: z.literal(true)
});
export type ConnexionReponse = z.infer<typeof connexionReponseSchema>;

export const sessionUtilisateurSchema = z.object({
  id: z.string().uuid(),
  identifiantAd: z.string(),
  nom: z.string(),
  roles: z.array(z.string()),
  sousFluxId: z.string().uuid().nullable()
});
export type SessionUtilisateur = z.infer<typeof sessionUtilisateurSchema>;
