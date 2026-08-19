import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { AuthModule } from "../auth/auth.module";
import { DuoProvider } from "../auth/providers/duo.provider";

@Module({
  // AuthModule importé pour LDAP_PORT (readiness doit sonder le fournisseur
  // AD réellement sélectionné — LdapProvider ou AdApiProvider selon
  // LDAP_PROVIDER — jamais une instance séparée qui divergerait de celle
  // utilisée par le flux de connexion réel).
  imports: [AuthModule],
  controllers: [HealthController],
  providers: [DuoProvider]
})
export class HealthModule {}
