import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { KeycloakDirectGrantProvider } from "./providers/keycloak-direct-grant.provider";
import { KEYCLOAK_PORT } from "./ports/keycloak.port";
import { SessionService } from "./services/session.service";
import { RateLimitService } from "./services/rate-limit.service";
import { JournalSecuriteService } from "./services/journal-securite.service";
import { RbacResolutionService } from "./services/rbac-resolution.service";

// Keycloak est la SOURCE UNIQUE d'authentification, identité ET second
// facteur (DUO déjà lié au royaume) — décision actée le 24/08/2026, cf.
// CLAUDE.md « Architecture Keycloak — source unique ». MfaService/
// TotpProvider/DuoProvider retirés le même jour (confirmé par la personne
// pilotant le projet comme à retirer, pas à conserver en dormance) : plus
// aucun second facteur géré côté PGD, pour aucun chemin.
@Module({
  imports: [JwtModule.register({})], // secret et expiresIn passés explicitement à chaque sign()/verify()
  controllers: [AuthController],
  providers: [
    KeycloakDirectGrantProvider,
    { provide: KEYCLOAK_PORT, useExisting: KeycloakDirectGrantProvider },
    SessionService,
    RateLimitService,
    JournalSecuriteService,
    RbacResolutionService
  ],
  // KEYCLOAK_PORT exporté pour AdminUtilisateursService (recherche annuaire,
  // pré-enregistrement) et HealthModule (health/ready) — même principe déjà
  // appliqué à AdminMotifsService/AdminCircuitsService (méthode de lecture
  // réutilisée hors du module propriétaire, cf. AdminModule). Le token,
  // jamais la classe concrète.
  exports: [SessionService, JournalSecuriteService, KEYCLOAK_PORT]
})
export class AuthModule {}
