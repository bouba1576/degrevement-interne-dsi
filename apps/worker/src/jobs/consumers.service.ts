import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import {
  avecRetry,
  QUEUE_LOCKS_SWEEPER,
  QUEUE_SLA_ESCALATION,
  QUEUE_SI_PUSH,
  QUEUE_NOTIFICATIONS,
  ROUTING_KEY_NOTIFICATION_NOUVELLE_TACHE,
  ROUTING_KEY_NOTIFICATION_AVANCEMENT,
  ROUTING_KEY_NOTIFICATION_REJET,
  ROUTING_KEY_NOTIFICATION_VALIDATION,
  ROUTING_KEY_NOTIFICATION_ESCALADE,
  ROUTING_KEY_NOTIFICATION_ERREUR_SI,
  type ConnexionRabbitMQ
} from "@pgd/messaging";
import { CONNEXION_RABBITMQ } from "../rabbitmq/rabbitmq.constants";
import { LocksSweeperService } from "./locks-sweeper.service";
import { SlaEscalationService } from "./sla-escalation.service";
import { SiPushService } from "../si-push/si-push.service";
import { NotificationService } from "../notifications/notification.service";

// Les crons (SchedulerService) PUBLIENT un message ; c'est ce service qui
// exécute le traitement, en consommant. Ack MANUEL après le commit Prisma
// (à l'intérieur de LocksSweeperService/SlaEscalationService/SiPushService),
// jamais avant — avecRetry() n'ack qu'après le retour réussi de la fonction
// fournie.
@Injectable()
export class ConsumersService implements OnModuleInit {
  private readonly logger = new Logger(ConsumersService.name);

  constructor(
    @Inject(CONNEXION_RABBITMQ) private readonly connexion: ConnexionRabbitMQ,
    private readonly locksSweeper: LocksSweeperService,
    private readonly slaEscalation: SlaEscalationService,
    private readonly siPush: SiPushService,
    private readonly notifications: NotificationService
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

    // q.si-push (PGD-061) — le message ne porte que demandeId, la source de
    // vérité (montant, circuit, référence) reste lue en base au moment du
    // traitement, jamais recopiée dans le message.
    await canal.consume(
      QUEUE_SI_PUSH,
      avecRetry(canal, async (msg) => {
        const { demandeId } = JSON.parse(msg.content.toString()) as { demandeId: string };
        await this.siPush.traiter(demandeId);
      })
    );

    // q.notifications — un seul consumer sur la file, la clé de routage
    // (notification.*) distingue le type ; pas besoin de le redupliquer dans
    // le corps du message. Les deux types à destinataire configurable
    // (ESCALADE, ERREUR_SI) sont gérés par NotificationService lui-même —
    // ce dispatcher ne sait rien de cette nuance.
    await canal.consume(
      QUEUE_NOTIFICATIONS,
      avecRetry(canal, async (msg) => {
        const payload = JSON.parse(msg.content.toString()) as { tacheId?: string; demandeId?: string };
        switch (msg.fields.routingKey) {
          case ROUTING_KEY_NOTIFICATION_NOUVELLE_TACHE:
            return this.notifications.traiterNouvelleTache(payload.tacheId!);
          case ROUTING_KEY_NOTIFICATION_AVANCEMENT:
            return this.notifications.traiterAvancement(payload.demandeId!);
          case ROUTING_KEY_NOTIFICATION_REJET:
            return this.notifications.traiterRejet(payload.demandeId!);
          case ROUTING_KEY_NOTIFICATION_VALIDATION:
            return this.notifications.traiterValidation(payload.demandeId!);
          case ROUTING_KEY_NOTIFICATION_ESCALADE:
            return this.notifications.traiterEscalade(payload.tacheId!);
          case ROUTING_KEY_NOTIFICATION_ERREUR_SI:
            return this.notifications.traiterErreurSi(payload.demandeId!);
          default:
            this.logger.warn(`Clé de routage notification inconnue : ${msg.fields.routingKey}`);
        }
      })
    );

    this.logger.log(
      `Consumers démarrés : ${QUEUE_LOCKS_SWEEPER}, ${QUEUE_SLA_ESCALATION}, ${QUEUE_SI_PUSH}, ${QUEUE_NOTIFICATIONS}`
    );
  }
}
