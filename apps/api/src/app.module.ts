import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "./infra/prisma/prisma.module";
import { RedisModule } from "./infra/redis/redis.module";
import { RabbitMQModule } from "./infra/rabbitmq/rabbitmq.module";
import { HealthModule } from "./modules/health/health.module";
import { AuthModule } from "./modules/auth/auth.module";
import { LignesModule } from "./modules/lignes/lignes.module";
import { AdminModule } from "./modules/admin/admin.module";
import { DemandesModule } from "./modules/demandes/demandes.module";
import { TachesModule } from "./modules/taches/taches.module";
import { AuditModule } from "./modules/audit/audit.module";
import { KpiModule } from "./modules/kpi/kpi.module";
import { AuthGuard } from "./common/guards/auth.guard";
import { RbacGuard } from "./common/guards/rbac.guard";

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    RabbitMQModule,
    HealthModule,
    AuthModule,
    LignesModule,
    AdminModule,
    DemandesModule,
    TachesModule,
    AuditModule,
    KpiModule
  ],
  providers: [
    // Ordre d'exécution Nest = ordre de déclaration : authentification avant RBAC.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RbacGuard }
  ]
})
export class AppModule {}
