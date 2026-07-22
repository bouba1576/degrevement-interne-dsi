import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { LdapProvider } from "./providers/ldap.provider";
import { DuoProvider } from "./providers/duo.provider";
import { TotpProvider } from "./providers/totp.provider";
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
    DuoProvider,
    TotpProvider,
    MfaService,
    SessionService,
    RateLimitService,
    JournalSecuriteService,
    RbacResolutionService
  ],
  exports: [SessionService, JournalSecuriteService]
})
export class AuthModule {}
