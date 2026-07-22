import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { publier, ROUTING_KEY_LOCK_SWEEP, ROUTING_KEY_SLA_CHECK, type ConnexionRabbitMQ } from "@pgd/messaging";
import { CONNEXION_RABBITMQ } from "../rabbitmq/rabbitmq.constants";

// CLAUDE.md — « Les déclenchements périodiques restent portés par
// @nestjs/schedule dans apps/worker, qui PUBLIE un message au lieu d'exécuter
// le traitement en ligne » : préserve retry et DLX sur les jobs planifiés
// (un cron qui exécuterait directement le traitement n'aurait ni l'un ni
// l'autre — une panne Postgres au milieu du cron perdrait le cycle entier
// sans aucune trace, alors qu'un message publié reste dans la queue jusqu'à
// traitement réussi ou épuisement des tentatives).
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(@Inject(CONNEXION_RABBITMQ) private readonly connexion: ConnexionRabbitMQ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async publierLockSweep(): Promise<void> {
    await publier(this.connexion.canalActif, ROUTING_KEY_LOCK_SWEEP, { horodatage: new Date().toISOString() });
    this.logger.debug(`Publié ${ROUTING_KEY_LOCK_SWEEP}`);
  }

  @Cron("*/15 * * * *") // toutes les 15 min (SF-PGD-075) — pas d'équivalent dans CronExpression
  async publierSlaCheck(): Promise<void> {
    await publier(this.connexion.canalActif, ROUTING_KEY_SLA_CHECK, { horodatage: new Date().toISOString() });
    this.logger.debug(`Publié ${ROUTING_KEY_SLA_CHECK}`);
  }
}
