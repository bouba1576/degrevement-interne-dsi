import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { loadEnv } from "@pgd/config";
import { HealthController } from "./health.controller";
import { RabbitMQModule } from "./rabbitmq/rabbitmq.module";
import { RedisModule } from "./infra/redis/redis.module";
import { PrismaService } from "./infra/prisma/prisma.service";
import { LocksSweeperService } from "./jobs/locks-sweeper.service";
import { JournalActiviteRetentionService } from "./jobs/journal-activite-retention.service";
import { SocleWatchService } from "./jobs/socle-watch.service";
import { SlaEscalationService } from "./jobs/sla-escalation.service";
import { ConsumersService } from "./jobs/consumers.service";
import { SchedulerService } from "./jobs/scheduler.service";
import { BscsStubAdapter } from "./si-push/bscs-stub.adapter";
import { GaiaStubAdapter } from "./si-push/gaia-stub.adapter";
import { BillingSiRouterService } from "./si-push/billing-si-router.service";
import { SiPushService } from "./si-push/si-push.service";
import { NotificationService } from "./notifications/notification.service";
import { SmtpStubAdapter } from "./notifications/smtp-stub.adapter";
import { SmtpAdapter } from "./notifications/smtp.adapter";
import { SMTP_PORT, type SmtpPort } from "./notifications/smtp.port";
import { SmsStubAdapter } from "./notifications/sms-stub.adapter";
import { SMS_PORT } from "./notifications/sms.port";

@Module({
  imports: [ScheduleModule.forRoot(), RabbitMQModule, RedisModule],
  controllers: [HealthController],
  providers: [
    PrismaService,
    LocksSweeperService,
    JournalActiviteRetentionService,
    SocleWatchService,
    SlaEscalationService,
    ConsumersService,
    SchedulerService,
    BscsStubAdapter,
    GaiaStubAdapter,
    BillingSiRouterService,
    SiPushService,
    SmtpStubAdapter,
    SmtpAdapter,
    // Sélection par SMTP_PROVIDER (packages/config) — défaut "stub"
    // (SmtpStubAdapter, journalise seulement), "smtp" bascule vers le
    // relais réel (SmtpAdapter, confirmé 24/08/2026). Coexistence, jamais
    // un remplacement — même mécanique que CRM_PROVIDER/LDAP_PROVIDER.
    {
      provide: SMTP_PORT,
      useFactory: (stub: SmtpStubAdapter, reel: SmtpAdapter): SmtpPort =>
        loadEnv().SMTP_PROVIDER === "smtp" ? reel : stub,
      inject: [SmtpStubAdapter, SmtpAdapter]
    },
    // SmsPort — bouchon uniquement, aucun fournisseur réel confirmé (cf.
    // sms.port.ts). Pas encore appelé par NotificationService.
    SmsStubAdapter,
    { provide: SMS_PORT, useExisting: SmsStubAdapter },
    NotificationService
  ]
})
export class WorkerModule {}
