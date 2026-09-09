import { z } from "zod";
import { enumProfilSysteme } from "./enums";

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
  // Matricule (08/09/2026) — relu frais à chaque GET /api/auth/session,
  // même principe que `nom` juste au-dessus : propriété de profil éditable
  // depuis l'écran admin, jamais figée en JWT contrairement à roles/
  // sousFluxId/profils (qui, eux, obéissent à « cohérence plutôt que
  // fraîcheur »). Consommé par NouvelleDemandeScreen pour pré-remplir
  // silencieusement Demande.matriculeInitiateur — plus aucun champ éditable
  // sur le formulaire, cf. CLAUDE.md.
  matricule: z.string().nullable(),
  roles: z.array(z.string()),
  sousFluxId: z.string().uuid().nullable(),
  // Chantier 2 (28/08/2026, docs/14) — cumul des Role.profilSysteme des rôles
  // détenus à la connexion, figé en JWT/session comme roles/sousFluxId
  // (même principe déjà posé : cohérence plutôt que fraîcheur). Remplace les
  // proxies fragiles par préfixe/complément sur `roles` (startsWith
  // "INITIATEUR_", r !== "ADMIN_PGD" && ...) trouvés côté front.
  profils: z.array(enumProfilSysteme)
});
export type SessionUtilisateur = z.infer<typeof sessionUtilisateurSchema>;
