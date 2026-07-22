import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { LdapProvider } from "../auth/providers/ldap.provider";
import { DuoProvider } from "../auth/providers/duo.provider";

@Module({
  controllers: [HealthController],
  providers: [LdapProvider, DuoProvider]
})
export class HealthModule {}
