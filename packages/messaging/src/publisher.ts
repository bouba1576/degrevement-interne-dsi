import type { ConfirmChannel } from "amqplib";
import { EXCHANGE_EVENTS } from "./topology";

// Publication persistent + publisher confirms (CLAUDE.md) : la Promise ne se
// résout qu'après l'accusé de réception du broker (confirmée écrite sur
// disque côté RabbitMQ), pas à l'émission — c'est la différence entre
// "envoyé" et "le broker a promis de ne pas le perdre".
export function publier(channel: ConfirmChannel, routingKey: string, payload: unknown, headers: Record<string, unknown> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    channel.publish(
      EXCHANGE_EVENTS,
      routingKey,
      Buffer.from(JSON.stringify(payload)),
      { persistent: true, headers },
      (erreur) => {
        if (erreur) reject(erreur);
        else resolve();
      }
    );
  });
}
