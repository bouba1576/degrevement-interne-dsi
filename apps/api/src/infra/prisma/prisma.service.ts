import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { interdireMutationAudit, PrismaClient } from "@pgd/database";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super();
    // Enregistré au constructeur, pas dans onModuleInit : de nombreux tests
    // instancient PrismaService directement (new PrismaService()) sans
    // jamais passer par le cycle de vie NestJS (T6 doit donc être actif dès
    // la construction, pas seulement en production sous Nest).
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
