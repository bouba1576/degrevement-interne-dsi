import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { HealthController } from "./health.controller";
import { RabbitMQModule } from "./rabbitmq/rabbitmq.module";
import { RedisModule } from "./infra/redis/redis.module";
import { PrismaService } from "./infra/prisma/prisma.service";
import { LocksSweeperService } from "./jobs/locks-sweeper.service";
import { SlaEscalationService } from "./jobs/sla-escalation.service";
import { ConsumersService } from "./jobs/consumers.service";
import { SchedulerService } from "./jobs/scheduler.service";

@Module({
  imports: [ScheduleModule.forRoot(), RabbitMQModule, RedisModule],
  controllers: [HealthController],
  providers: [PrismaService, LocksSweeperService, SlaEscalationService, ConsumersService, SchedulerService]
})
export class WorkerModule {}
