import { SetMetadata } from "@nestjs/common";

export const PUBLIC_KEY = "public";

// Marque explicitement une route comme accessible sans session — login, étapes
// MFA, health, docs. Toute route SANS ce marqueur ET SANS @Roles() échoue le
// test « zéro route sans décorateur » (test/rbac-coverage.spec.ts).
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_KEY, true);
