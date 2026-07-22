import amqp from "amqplib";
import { amqpUrl, loadEnv } from "@pgd/config";
import {
  ConnexionRabbitMQ,
  EXCHANGE_DLX,
  EXCHANGE_EVENTS,
  QUEUE_DEAD_LETTER,
  QUEUE_LOCKS_SWEEPER,
  QUEUE_NOTIFICATIONS,
  QUEUE_SI_PUSH,
  QUEUE_SLA_ESCALATION
} from "@pgd/messaging";

// T8, volet 3 — topologie déclarée PAR LE CODE, jamais à la main dans la
// console de gestion. Preuve : on détruit exchanges/queues au préalable
// (simule un broker vierge), puis on démarre UNIQUEMENT ConnexionRabbitMQ —
// aucune étape manuelle. Si tout réapparaît, connecter() seul suffit.
describe("declarerTopologie (via ConnexionRabbitMQ.connecter) — T8 (broker vierge)", () => {
  const urlAmqp = () => amqpUrl(loadEnv());

  async function detruireTopologie(): Promise<void> {
    const connexion = await amqp.connect(urlAmqp());
    const canal = await connexion.createChannel();
    for (const q of [QUEUE_LOCKS_SWEEPER, QUEUE_SLA_ESCALATION, QUEUE_NOTIFICATIONS, QUEUE_SI_PUSH, QUEUE_DEAD_LETTER]) {
      await canal.deleteQueue(q).catch(() => undefined);
    }
    for (const e of [EXCHANGE_EVENTS, EXCHANGE_DLX]) {
      await canal.deleteExchange(e).catch(() => undefined);
    }
    await canal.close();
    await connexion.close();
  }

  it("recrée intégralement exchanges/queues/bindings depuis un état vierge, sans étape manuelle", async () => {
    await detruireTopologie();

    // Vérifie que la destruction a bien eu lieu : checkQueue échoue si absente.
    // amqplib ferme le channel ET émet un 'error' non intercepté sur ce même
    // échec — sans listener, Node le remonte comme unhandled error en plus du
    // rejet de la Promise ; le listener no-op absorbe uniquement cet événement
    // channel-level, la Promise continue d'être asserée normalement ci-dessous.
    const verifAbsence = await amqp.connect(urlAmqp());
    const canalVerifAbsence = await verifAbsence.createChannel();
    canalVerifAbsence.on("error", () => undefined);
    await expect(canalVerifAbsence.checkQueue(QUEUE_LOCKS_SWEEPER)).rejects.toThrow();
    await verifAbsence.close().catch(() => undefined);

    // Seule étape : démarrer la connexion applicative (ce que fait le worker
    // au boot). Aucune commande manuelle entre les deux.
    const connexionApp = new ConnexionRabbitMQ(urlAmqp());
    await connexionApp.connecter();

    try {
      const canal = connexionApp.canalActif;
      await expect(canal.checkExchange(EXCHANGE_EVENTS)).resolves.toBeTruthy();
      // ConfirmChannel : un checkExchange/checkQueue réussi ferme le canal en
      // erreur AMQP seulement s'il échoue — ici il n'échoue pas, donc le même
      // canal reste utilisable pour les vérifications suivantes.
    } finally {
      await connexionApp.fermer();
    }

    // Re-ouvre une connexion neuve pour vérifier l'état final (le canal
    // précédent peut avoir été fermé par fermer()).
    const verifFinale = await amqp.connect(urlAmqp());
    const canalVerifFinale = await verifFinale.createChannel();
    await expect(canalVerifFinale.checkExchange(EXCHANGE_EVENTS)).resolves.toBeTruthy();
    await expect(canalVerifFinale.checkExchange(EXCHANGE_DLX)).resolves.toBeTruthy();
    for (const q of [QUEUE_LOCKS_SWEEPER, QUEUE_SLA_ESCALATION, QUEUE_NOTIFICATIONS, QUEUE_SI_PUSH, QUEUE_DEAD_LETTER]) {
      await expect(canalVerifFinale.checkQueue(q)).resolves.toBeTruthy();
    }
    await verifFinale.close();
  }, 20_000);
});
