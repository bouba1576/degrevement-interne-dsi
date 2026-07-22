import type { Channel } from "amqplib";

// CLAUDE.md § Messagerie RabbitMQ — topologie déclarée PAR LE CODE, jamais à
// la main dans la console de gestion (T8, docs/07 : démarrer sur un broker
// vierge, tout doit se créer seul). assertExchange/assertQueue/bindQueue sont
// idempotents par construction AMQP : rejouer declarerTopologie() sur une
// topologie déjà créée ne produit aucun effet supplémentaire.
export const EXCHANGE_EVENTS = "pgd.events";
export const EXCHANGE_DLX = "pgd.dlx";

export const QUEUE_LOCKS_SWEEPER = "q.locks-sweeper";
export const QUEUE_SLA_ESCALATION = "q.sla-escalation";
export const QUEUE_NOTIFICATIONS = "q.notifications";
export const QUEUE_SI_PUSH = "q.si-push";
export const QUEUE_DEAD_LETTER = "q.dead-letter";

export const ROUTING_KEY_LOCK_SWEEP = "lock.sweep";
export const ROUTING_KEY_SLA_CHECK = "sla.check";
export const ROUTING_KEY_NOTIFICATION_WILDCARD = "notification.*";
export const ROUTING_KEY_SI_PUSH = "si.push";

// PGD-073 (SF-PGD-110) — une clé de routage par type de NOTIFICATION, toutes
// liées par le binding générique notification.* ci-dessus (aucun changement
// de topologie nécessaire pour en ajouter une : le binding est déjà large).
export const ROUTING_KEY_NOTIFICATION_NOUVELLE_TACHE = "notification.nouvelle_tache";
export const ROUTING_KEY_NOTIFICATION_AVANCEMENT = "notification.avancement";
export const ROUTING_KEY_NOTIFICATION_REJET = "notification.rejet";
export const ROUTING_KEY_NOTIFICATION_VALIDATION = "notification.validation";
export const ROUTING_KEY_NOTIFICATION_ESCALADE = "notification.escalade";
export const ROUTING_KEY_NOTIFICATION_ERREUR_SI = "notification.erreur_si";

interface DefinitionFile {
  nom: string;
  routingKey: string;
}

// prefetch=1 (CLAUDE.md, PGD-061) : la restitution SI ne doit jamais traiter
// deux dossiers en parallèle sur le même worker. amqplib applique
// channel.prefetch(count) par CONSOMMATEUR (global=false, le défaut) sur tout
// le canal partagé (cf. ConnexionRabbitMQ.connecter) — locks-sweeper et
// sla-escalation en héritent aussi, sans effet néfaste : ce sont des tâches
// peu fréquentes qui n'ont jamais bénéficié d'un traitement en parallèle.
const FILES_METIER: DefinitionFile[] = [
  { nom: QUEUE_LOCKS_SWEEPER, routingKey: ROUTING_KEY_LOCK_SWEEP },
  { nom: QUEUE_SLA_ESCALATION, routingKey: ROUTING_KEY_SLA_CHECK },
  { nom: QUEUE_NOTIFICATIONS, routingKey: ROUTING_KEY_NOTIFICATION_WILDCARD },
  { nom: QUEUE_SI_PUSH, routingKey: ROUTING_KEY_SI_PUSH }
];

export async function declarerTopologie(channel: Channel): Promise<void> {
  await channel.assertExchange(EXCHANGE_EVENTS, "topic", { durable: true });
  await channel.assertExchange(EXCHANGE_DLX, "fanout", { durable: true });

  await channel.assertQueue(QUEUE_DEAD_LETTER, { durable: true });
  await channel.bindQueue(QUEUE_DEAD_LETTER, EXCHANGE_DLX, "");

  for (const file of FILES_METIER) {
    await channel.assertQueue(file.nom, {
      durable: true,
      // Retry épuisé (5 tentatives, cf. retry.ts) → routage vers la DLX,
      // jamais de perte silencieuse de message.
      arguments: { "x-dead-letter-exchange": EXCHANGE_DLX }
    });
    await channel.bindQueue(file.nom, EXCHANGE_EVENTS, file.routingKey);
  }
}
