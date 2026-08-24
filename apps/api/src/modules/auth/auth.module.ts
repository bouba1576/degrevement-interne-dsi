import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { KeycloakDirectGrantProvider } from "./providers/keycloak-direct-grant.provider";
import { DuoProvider } from "./providers/duo.provider";
import { TotpProvider } from "./providers/totp.provider";
import { KEYCLOAK_PORT } from "./ports/keycloak.port";
import { MfaService } from "./services/mfa.service";
import { SessionService } from "./services/session.service";
import { RateLimitService } from "./services/rate-limit.service";
import { JournalSecuriteService } from "./services/journal-securite.service";
import { RbacResolutionService } from "./services/rbac-resolution.service";

// Keycloak devient la SOURCE UNIQUE d'authentification (décision actée le
// 24/08/2026, cf. CLAUDE.md « Architecture Keycloak — source unique ») —
// plus de sélection multi-fournisseurs, plus de factory de bascule
// (LDAP_PROVIDER retiré). Un seul provider réel, comme MfaPort ne l'a
// jamais eu qu'un seul mode dégradé possible pour l'authentification
// elle-même. DuoProvider/TotpProvider restent fournis : MfaService les
// utilise encore ailleurs (mfa/duo/callback, enroll/totp) — inutilisés par
// le chemin de connexion réel via Keycloak, mais non retirés (constat, pas
// une décision de ce chantier, cf. CLAUDE.md).
@Module({
  imports: [JwtModule.register({})], // secret et expiresIn passés explicitement à chaque sign()/verify()
  controllers: [AuthController],
  providers: [
    KeycloakDirectGrantProvider,
    { provide: KEYCLOAK_PORT, useExisting: KeycloakDirectGrantProvider },
    DuoProvider,
    TotpProvider,
    MfaService,
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
  // TotpProvider exporté pour AdminUtilisateursService (Priorité 1,
  // 19/08/2026, génération de QR TOTP admin) — même génération que le
  // self-service (genererEnrolement), jamais une réimplémentation.
  exports: [SessionService, JournalSecuriteService, KEYCLOAK_PORT, TotpProvider]
})
export class AuthModule {}
