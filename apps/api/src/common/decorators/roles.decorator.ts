import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "roles";

// SF-PGD-203 : @Roles() sur chaque endpoint mutatif et de lecture sensible.
// RbacGuard n'autorise que si l'utilisateur porte au moins un des rôles listés.
export const Roles = (...roles: string[]): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles);
