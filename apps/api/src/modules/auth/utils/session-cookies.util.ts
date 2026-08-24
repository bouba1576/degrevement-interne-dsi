import type { Response } from "express";
import { loadEnv } from "@pgd/config";
import type { PaireJetons } from "../services/session.service";

// Extrait d'AuthController (poserCookiesSession/effacerCookiesSession,
// privées à l'origine) le 20/08/2026 — à l'époque pour KeycloakController
// (flux authorization_code, retiré le 24/08/2026, cf. CLAUDE.md
// « Architecture Keycloak — source unique »). Conservé en fichier séparé
// malgré le retrait de ce second appelant : un seul point de vérité pour les
// drapeaux de cookie de session (httpOnly/secure/sameSite/path) reste
// préférable à une réintégration dans AuthController, si un futur appelant
// (ex. un flux de connexion supplémentaire) en a de nouveau besoin.
export function poserCookiesSession(res: Response, jetons: PaireJetons): void {
  const env = loadEnv();
  res.cookie(env.SESSION_COOKIE_NAME, jetons.accessToken, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "lax"
  });
  res.cookie(env.REFRESH_COOKIE_NAME, jetons.refreshToken, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "lax",
    path: "/api/auth/refresh"
  });
}

export function effacerCookiesSession(res: Response): void {
  const env = loadEnv();
  res.clearCookie(env.SESSION_COOKIE_NAME);
  res.clearCookie(env.REFRESH_COOKIE_NAME, { path: "/api/auth/refresh" });
}
