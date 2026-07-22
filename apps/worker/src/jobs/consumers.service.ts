import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { avecRetry, QUEUE_LOCKS_SWEEPER, QUEUE_SLA_ESCALATION, type ConnexionRabbitMQ } from "@pgd/messaging";
import { CONNEXION_RABBITMQ } from "../rabbitmq/rabbitmq.constants";
import { LocksSweeperService } from "./locks-sweeper.service";
import { SlaEscalationService } from "./sla-escalation.service";

// Les crons (SchedulerService) PUBLIENT un message ; c'est ce service qui
// exécute le traitement, en consommant. Ack MANUEL après le commit Prisma
// (à l'intérieur de LocksSweeperService/SlaEscalationService), jamais avant —
// avecRetry() n'ack qu'après le retour réussi de la fonction fournie.
@Injectable()
export class ConsumersService implements OnModuleInit {
  private readonly logger = new Logger(ConsumersService.name);

  constructor(
    @Inject(CONNEXION_RABBITMQ) private readonly connexion: ConnexionRabbitMQ,
    private readonly locksSweeper: LocksSweeperService,
    private readonly slaEscalation: SlaEscalationService
  ) {}

  async onModuleInit(): Promise<void> {
    const canal = this.connexion.canalActif;

    await canal.consume(
      QUEUE_LOCKS_SWEEPER,
      avecRetry(canal, async () => {
        await this.locksSweeper.balayer();
      })
    );

    await canal.consume(
      QUEUE_SLA_ESCALATION,
      avecRetry(canal, async () => {
        await this.slaEscalation.escalader();
      })
    );

    this.logger.log(`Consumers démarrés : ${QUEUE_LOCKS_SWEEPER}, ${QUEUE_SLA_ESCALATION}`);
  }
}
