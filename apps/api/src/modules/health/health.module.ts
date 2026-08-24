import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { AuthModule } from "../auth/auth.module";
import { DuoProvider } from "../auth/providers/duo.provider";

@Module({
  // AuthModule importé pour KEYCLOAK_PORT (readiness doit sonder le même
  // fournisseur que celui réellement utilisé par le flux de connexion réel,
  // jamais une instance séparée qui pourrait diverger).
  imports: [AuthModule],
  controllers: [HealthController],
  providers: [DuoProvider]
})
export class HealthModule {}
