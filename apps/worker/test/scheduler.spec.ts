import type { ConfirmChannel } from "amqplib";
import { ROUTING_KEY_LOCK_SWEEP, ROUTING_KEY_SLA_CHECK, type ConnexionRabbitMQ } from "@pgd/messaging";
import { SchedulerService } from "../src/jobs/scheduler.service";

// T8, volet 4 — les crons PUBLIENT un message, ils n'exécutent jamais le
// traitement en ligne. Preuve structurelle : SchedulerService ne dépend QUE
// de la connexion RabbitMQ (aucune injection de LocksSweeperService ni
// SlaEscalationService), et ses méthodes appellent channel.publish, jamais un
// service de traitement.
describe("SchedulerService — T8 (les crons publient, n'exécutent rien en ligne)", () => {
  function connexionFactice(): { connexion: ConnexionRabbitMQ; canal: jest.Mocked<Pick<ConfirmChannel, "publish">> } {
    const canal = { publish: jest.fn((_ex, _rk, _content, _opts, cb?: (e: unknown) => void) => cb?.(null)) } as never;
    const connexion = { canalActif: canal } as unknown as ConnexionRabbitMQ;
    return { connexion, canal: canal as never };
  }

  it("publierLockSweep publie lock.sweep sur pgd.events — n'exécute aucun traitement directement", async () => {
    const { connexion, canal } = connexionFactice();
    const scheduler = new SchedulerService(connexion);

    await scheduler.publierLockSweep();

    expect(canal.publish).toHaveBeenCalledTimes(1);
    const [exchange, routingKey] = canal.publish.mock.calls[0]!;
    expect(exchange).toBe("pgd.events");
    expect(routingKey).toBe(ROUTING_KEY_LOCK_SWEEP);
  });

  it("publierSlaCheck publie sla.check sur pgd.events — n'exécute aucun traitement directement", async () => {
    const { connexion, canal } = connexionFactice();
    const scheduler = new SchedulerService(connexion);

    await scheduler.publierSlaCheck();

    expect(canal.publish).toHaveBeenCalledTimes(1);
    const [exchange, routingKey] = canal.publish.mock.calls[0]!;
    expect(exchange).toBe("pgd.events");
    expect(routingKey).toBe(ROUTING_KEY_SLA_CHECK);
  });

  it("SchedulerService ne reçoit aucune dépendance vers un service de traitement (garde structurelle)", () => {
    // Si un jour quelqu'un ajoute LocksSweeperService/SlaEscalationService au
    // constructeur pour "gagner du temps", ce test échoue : la seule
    // dépendance légitime est la connexion RabbitMQ.
    expect(SchedulerService.length).toBe(1);
  });
});
