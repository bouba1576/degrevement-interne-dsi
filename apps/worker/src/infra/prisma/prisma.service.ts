import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { interdireMutationAudit, PrismaClient } from "@pgd/database";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super();
    // Cf. apps/api/src/infra/prisma/prisma.service.ts — même garde T6,
    // enregistrée au constructeur pour les mêmes raisons (tests qui
    // instancient PrismaService sans passer par NestJS).
    interdireMutationAudit(this);
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log("Connecté à PostgreSQL");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
