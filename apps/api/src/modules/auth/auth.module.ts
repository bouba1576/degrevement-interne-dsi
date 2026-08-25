import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { loadEnv } from "@pgd/config";
import { AuthController } from "./auth.controller";
import { KeycloakDirectGrantProvider } from "./providers/keycloak-direct-grant.provider";
import { AdApiProvider } from "./providers/ad-api.provider";
import { KEYCLOAK_PORT, type KeycloakPort } from "./ports/keycloak.port";
import { SessionService } from "./services/session.service";
import { RateLimitService } from "./services/rate-limit.service";
import { JournalSecuriteService } from "./services/journal-securite.service";
import { RbacResolutionService } from "./services/rbac-resolution.service";

// Keycloak reste le fournisseur cible, identité ET second facteur (DUO déjà
// lié au royaume) — décision actée le 24/08/2026, cf. CLAUDE.md « Architecture
// Keycloak — source unique ». AdApiProvider restauré trois tours plus tard
// (cf. CLAUDE.md « Restauration transitoire — AdApiProvider ») comme mesure
// TRANSITOIRE, sélection strictement serveur via AUTH_PROVIDER — un seul
// fournisseur actif à la fois, jamais une tentative en cascade de l'un puis
// l'autre. Les deux implémentent KeycloakPort à l'identique (même contrat
// hérité de l'ancien LdapPort) : AuthController/HealthController/
// AdminUtilisateursService n'ont besoin de connaître aucun détail de
// fournisseur. MfaService/TotpProvider/DuoProvider restent retirés — le
// chemin AD ne déclenche non plus aucune étape MFA, PGD comme Keycloak,
// AuthController.login() allant directement à la création de session pour
// n'importe quel fournisseur derrière ce port.
@Module({
  imports: [JwtModule.register({})], // secret et expiresIn passés explicitement à chaque sign()/verify()
  controllers: [AuthController],
  providers: [
    KeycloakDirectGrantProvider,
    AdApiProvider,
    {
      provide: KEYCLOAK_PORT,
      useFactory: (keycloak: KeycloakDirectGrantProvider, adApi: AdApiProvider): KeycloakPort =>
        loadEnv().AUTH_PROVIDER === "ad-api" ? adApi : keycloak,
      inject: [KeycloakDirectGrantProvider, AdApiProvider]
    },
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
