import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { loadEnv } from "@pgd/config";
import { AuthController } from "./auth.controller";
import { LdapProvider } from "./providers/ldap.provider";
import { AdApiProvider } from "./providers/ad-api.provider";
import { DuoProvider } from "./providers/duo.provider";
import { TotpProvider } from "./providers/totp.provider";
import { LDAP_PORT, type LdapPort } from "./ports/ldap.port";
import { MfaService } from "./services/mfa.service";
import { SessionService } from "./services/session.service";
import { RateLimitService } from "./services/rate-limit.service";
import { JournalSecuriteService } from "./services/journal-securite.service";
import { RbacResolutionService } from "./services/rbac-resolution.service";

@Module({
  imports: [JwtModule.register({})], // secret et expiresIn passés explicitement à chaque sign()/verify()
  controllers: [AuthController],
  providers: [
    LdapProvider,
    AdApiProvider,
    // Sélection par LDAP_PROVIDER (packages/config), même mécanique que
    // CRM_PORT/GED_PORT (bouchons commutables par variable d'environnement,
    // cf. CLAUDE.md « Ports d'intégration ») — coexistence, jamais un
    // remplacement : LdapProvider (dev, OpenLDAP) reste le défaut et reste
    // pleinement fonctionnel, AdApiProvider (API AD REST réelle) n'est
    // sélectionné qu'explicitement.
    {
      provide: LDAP_PORT,
      useFactory: (ldap: LdapProvider, adApi: AdApiProvider): LdapPort =>
        loadEnv().LDAP_PROVIDER === "ad-api" ? adApi : ldap,
      inject: [LdapProvider, AdApiProvider]
    },
    DuoProvider,
    TotpProvider,
    MfaService,
    SessionService,
    RateLimitService,
    JournalSecuriteService,
    RbacResolutionService
  ],
  // LDAP_PORT exporté pour AdminUtilisateursService (recherche annuaire,
  // pré-enregistrement) et HealthModule (health/ready) — même principe déjà
  // appliqué à AdminMotifsService/AdminCircuitsService (méthode de lecture
  // réutilisée hors du module propriétaire, cf. AdminModule). Le token,
  // jamais la classe concrète : c'est lui qui reste swappable.
  // TotpProvider exporté pour AdminUtilisateursService (Priorité 1,
  // 19/08/2026, génération de QR TOTP admin) — même génération que le
  // self-service (genererEnrolement), jamais une réimplémentation.
  exports: [SessionService, JournalSecuriteService, LDAP_PORT, TotpProvider]
})
export class AuthModule {}
