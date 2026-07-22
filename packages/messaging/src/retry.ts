import type { Channel, ConsumeMessage } from "amqplib";

export const EN_TETE_TENTATIVES = "x-retry-count";
export const NB_TENTATIVES_MAX = 5;

// CLAUDE.md — non négociable côté messagerie :
//   - ack MANUEL, émis APRÈS le commit de la transaction Prisma — jamais avant.
//     `traiter` DOIT avoir committé avant de retourner ; c'est cette fonction
//     qui ack ensuite, jamais l'appelant.
//   - Retry avec back-off exponentiel, 5 tentatives max, puis routage vers
//     pgd.dlx (via x-dead-letter-exchange posé sur la queue, cf. topology.ts).
//   - Chaque `traiter` doit être idempotent : RabbitMQ garantit at-least-once,
//     jamais exactly-once — un rejeu (retry ou redélivraison après crash) peut
//     toujours survenir.
export function avecRetry(channel: Channel, traiter: (msg: ConsumeMessage) => Promise<void>) {
  return async (msg: ConsumeMessage | null): Promise<void> => {
    if (!msg) return;

    try {
      await traiter(msg);
      channel.ack(msg);
    } catch {
      const tentativePrecedente = Number(msg.properties.headers?.[EN_TETE_TENTATIVES] ?? 0);
      const tentativeActuelle = tentativePrecedente + 1;

      if (tentativeActuelle > NB_TENTATIVES_MAX) {
        // Épuisé — nack sans requeue : la queue route vers pgd.dlx (x-dead-
        // letter-exchange), jamais de perte silencieuse.
        channel.nack(msg, false, false);
        return;
      }

      const delaiMs = Math.min(1000 * 2 ** tentativeActuelle, 30_000);
      await new Promise((resolve) => setTimeout(resolve, delaiMs));

      channel.publish(msg.fields.exchange, msg.fields.routingKey, msg.content, {
        ...msg.properties,
        persistent: true,
        headers: { ...msg.properties.headers, [EN_TETE_TENTATIVES]: tentativeActuelle }
      });
      // Le message original est remplacé par la republication ci-dessus.
      channel.ack(msg);
    }
  };
}
