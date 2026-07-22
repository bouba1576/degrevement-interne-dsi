import { z } from "zod";
import { enumMethodeMfa } from "./enums";

// docs/06_Contrats_API.md §2 — Authentification.

export const connexionRequeteSchema = z.object({
  identifiantAd: z.string().min(1, "Identifiant requis"),
  motDePasse: z.string().min(1, "Mot de passe requis")
});
export type ConnexionRequete = z.infer<typeof connexionRequeteSchema>;

export const connexionReponseSchema = z.object({
  requiresMfa: z.boolean(),
  methode: enumMethodeMfa.nullable(),
  challengeId: z.string().nullable(),
  // Extension au contrat docs/06 §2 — nécessaire au flux réel du Duo Universal
  // Prompt (redirection OIDC) : présent uniquement si methode === "DUO".
  redirectUrl: z.string().url().nullable()
});
export type ConnexionReponse = z.infer<typeof connexionReponseSchema>;

// TOTP uniquement — vérification synchrone par code. DUO se valide par la
// redirection reçue sur /api/auth/mfa/duo/callback (le navigateur y est envoyé
// via connexionReponseSchema.redirectUrl), pas par un appel JSON à cette route.
export const mfaVerifieRequeteSchema = z.object({
  challengeId: z.string().min(1),
  code: z.string().min(6).max(6)
});
export type MfaVerifieRequete = z.infer<typeof mfaVerifieRequeteSchema>;

export const totpEnrollReponseSchema = z.object({
  secretBase32: z.string(),
  qrCodeDataUrl: z.string(),
  issuer: z.string()
});
export type TotpEnrollReponse = z.infer<typeof totpEnrollReponseSchema>;

export const totpEnrollConfirmRequeteSchema = z.object({
  code: z.string().min(6).max(6)
});
export type TotpEnrollConfirmRequete = z.infer<typeof totpEnrollConfirmRequeteSchema>;

export const sessionUtilisateurSchema = z.object({
  id: z.string().uuid(),
  identifiantAd: z.string(),
  nom: z.string(),
  roles: z.array(z.string()),
  mfaMethode: enumMethodeMfa
});
export type SessionUtilisateur = z.infer<typeof sessionUtilisateurSchema>;
