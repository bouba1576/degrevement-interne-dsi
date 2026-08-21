import type { Response } from "express";
import { loadEnv } from "@pgd/config";
import type { PaireJetons } from "../services/session.service";

// Extrait d'AuthController (poserCookiesSession/effacerCookiesSession,
// privées à l'origine) le 20/08/2026 — KeycloakController a besoin
// exactement du même comportement (mêmes noms de cookie, mêmes drapeaux
// httpOnly/secure/sameSite/path) pour poser la session à la fin du callback
// Keycloak. Une seule source de vérité plutôt que deux copies qui
// pourraient diverger sur un détail de sécurité (secure/sameSite).
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
