import { SetMetadata } from "@nestjs/common";

export const AUTHENTICATED_KEY = "authenticated";

// Déclare explicitement qu'une route exige une session valide mais AUCUN rôle
// particulier (ex. /auth/session, /auth/logout — tout utilisateur connecté).
// Distinct de l'absence de décorateur : sans lui, le test de couverture RBAC
// (test/rbac-coverage.spec.ts) échoue plutôt que de laisser une route
// « protégée par oubli » invisible en revue.
export const Authenticated = (): MethodDecorator & ClassDecorator => SetMetadata(AUTHENTICATED_KEY, true);
