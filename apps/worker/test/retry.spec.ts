import type { Channel, ConsumeMessage } from "amqplib";
import { avecRetry, EN_TETE_TENTATIVES, NB_TENTATIVES_MAX } from "@pgd/messaging";

// T8, volet 1 — ack MANUEL, émis APRÈS le traitement, jamais avant.
// Volet « retry + DLX » — 5 tentatives max puis nack sans requeue (routage
// DLX via x-dead-letter-exchange posé sur la queue, cf. topology.ts).
describe("avecRetry — T8 (ack après traitement, retry, DLX)", () => {
  function messageFactice(tentatives = 0): ConsumeMessage {
    return {
      content: Buffer.from("{}"),
      fields: { exchange: "pgd.events", routingKey: "lock.sweep", deliveryTag: 1, redelivered: false, consumerTag: "c1" } as never,
      properties: { headers: { [EN_TETE_TENTATIVES]: tentatives } } as never
    } as ConsumeMessage;
  }

  function canalFactice(): jest.Mocked<Pick<Channel, "ack" | "nack" | "publish">> {
    return { ack: jest.fn(), nack: jest.fn(), publish: jest.fn() } as never;
  }

  it("n'ack QU'APRÈS le retour réussi de traiter() — jamais avant", async () => {
    const canal = canalFactice();
    let ackAppeleAvantFinDuTraitement = false;
    const ordre: string[] = [];

    const traiter = async () => {
      ordre.push("traitement-debut");
      await new Promise((r) => setTimeout(r, 5));
      if (canal.ack.mock.calls.length > 0) ackAppeleAvantFinDuTraitement = true;
      ordre.push("traitement-commit"); // représente le commit Prisma
    };

    const handler = avecRetry(canal as never, traiter);
    await handler(messageFactice());

    expect(ackAppeleAvantFinDuTraitement).toBe(false);
    expect(ordre).toEqual(["traitement-debut", "traitement-commit"]);
    expect(canal.ack).toHaveBeenCalledTimes(1);
    expect(canal.nack).not.toHaveBeenCalled();
  });

  it("republie avec x-retry-count incrémenté après un échec, sous le seuil", async () => {
    const canal = canalFactice();
    const traiter = jest.fn().mockRejectedValueOnce(new Error("échec transitoire"));

    const handler = avecRetry(canal as never, traiter);
    await handler(messageFactice(2));

    expect(canal.publish).toHaveBeenCalledTimes(1);
    const [, , , options] = canal.publish.mock.calls[0]!;
    expect((options as { headers: Record<string, unknown> }).headers[EN_TETE_TENTATIVES]).toBe(3);
    expect(canal.ack).toHaveBeenCalledTimes(1); // le message original est ack (remplacé par la republication)
    expect(canal.nack).not.toHaveBeenCalled();
  });

  it(`republie ENCORE à la tentative ${NB_TENTATIVES_MAX} pile — pas de DLX un coup trop tôt`, async () => {
    // Frontière exacte : x-retry-count vaut déjà NB_TENTATIVES_MAX-1 en entrée
    // (4), donc tentativeActuelle=5=NB_TENTATIVES_MAX, PAS >NB_TENTATIVES_MAX
    // → doit encore republier, pas partir en DLX. Sans ce cas, le seul test
    // "au-delà" ne prouverait pas que le seuil n'est pas déclenché un cran
    // trop tôt (off-by-one).
    const canal = canalFactice();
    const traiter = jest.fn().mockRejectedValueOnce(new Error("échec transitoire"));

    const handler = avecRetry(canal as never, traiter);
    await handler(messageFactice(NB_TENTATIVES_MAX - 1));

    expect(canal.publish).toHaveBeenCalledTimes(1);
    const [, , , options] = canal.publish.mock.calls[0]!;
    expect((options as { headers: Record<string, unknown> }).headers[EN_TETE_TENTATIVES]).toBe(NB_TENTATIVES_MAX);
    expect(canal.nack).not.toHaveBeenCalled();
  });

  it(`nack sans requeue (→ DLX) au-delà de ${NB_TENTATIVES_MAX} tentatives — jamais de perte silencieuse`, async () => {
    const canal = canalFactice();
    const traiter = jest.fn().mockRejectedValue(new Error("échec persistant"));

    const handler = avecRetry(canal as never, traiter);
    await handler(messageFactice(NB_TENTATIVES_MAX));

    expect(canal.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    expect(canal.publish).not.toHaveBeenCalled();
    expect(canal.ack).not.toHaveBeenCalled();
  });
});
