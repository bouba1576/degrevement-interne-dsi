import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
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
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { ReferentielsModule } from "./modules/referentiels/referentiels.module";
import { ReportingModule } from "./modules/reporting/reporting.module";
import { ActiviteModule } from "./modules/activite/activite.module";
import { AuthGuard } from "./common/guards/auth.guard";
import { RbacGuard } from "./common/guards/rbac.guard";
import { ProfilGuard } from "./common/guards/profil.guard";
import { JournalActiviteInterceptor } from "./common/interceptors/journal-activite.interceptor";

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
    KpiModule,
    NotificationsModule,
    ReferentielsModule,
    ReportingModule,
    ActiviteModule
  ],
  providers: [
    // Ordre d'exécution Nest = ordre de déclaration : authentification avant
    // RBAC avant profil système (Chantier 2, 28/08/2026, docs/14) — ProfilGuard
    // ne fait rien tant qu'aucune route ne porte @ProfilRequis(), donc l'ordre
    // avec RbacGuard n'a pas d'incidence pratique aujourd'hui, mais reste
    // logique : rôle (portée) avant profil (capacité).
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
    { provide: APP_GUARD, useClass: ProfilGuard },
    // Global via APP_INTERCEPTOR (pas main.ts, à la différence de
    // LoggingInterceptor/ResponseEnvelopeInterceptor) — celui-ci a besoin de
    // l'injection de dépendances (ActiviteService), que useGlobalInterceptors()
    // ne fournit pas. Ordre sans incidence : chaque intercepteur observe
    // indépendamment, aucun ne dépend du résultat d'un autre.
    { provide: APP_INTERCEPTOR, useClass: JournalActiviteInterceptor }
  ]
})
export class AppModule {}
