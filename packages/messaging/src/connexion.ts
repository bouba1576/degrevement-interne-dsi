import amqp, { type ChannelModel, type ConfirmChannel } from "amqplib";
import { declarerTopologie } from "./topology";

// PGD-052bis (SF-PGD-202) — connexion AMQP avec reconnexion automatique.
// ConfirmChannel (pas Channel simple) : publisher confirms sur toute
// publication (CLAUDE.md — "Publication persistent + publisher confirms").
export class ConnexionRabbitMQ {
  private modele?: ChannelModel;
  private canal?: ConfirmChannel;
  private reconnexionPlanifiee = false;
  private fermeeVolontairement = false;

  constructor(
    private readonly url: string,
    private readonly delaiReconnexionMs = 5000
  ) {}

  async connecter(): Promise<void> {
    this.fermeeVolontairement = false;
    this.modele = await amqp.connect(this.url);
    this.modele.on("close", () => {
      if (!this.fermeeVolontairement) this.planifierReconnexion();
    });
    this.modele.on("error", () => {
      // 'close' suit toujours 'error' sur une perte de connexion — la
      // reconnexion est planifiée là, pas ici, pour éviter un double essai.
    });

    this.canal = await this.modele.createConfirmChannel();
    // prefetch=1 (PGD-061, cf. topology.ts) : un seul canal partagé pour tout
    // le worker (publisher + tous les consumers) — le réglage s'applique donc
    // à chaque consumer déclaré dessus, pas seulement à q.si-push.
    await this.canal.prefetch(1);
    await declarerTopologie(this.canal);
  }

  async fermer(): Promise<void> {
    this.fermeeVolontairement = true;
    await this.canal?.close();
    await this.modele?.close();
  }

  private planifierReconnexion(): void {
    if (this.reconnexionPlanifiee) return;
    this.reconnexionPlanifiee = true;
    setTimeout(() => {
      this.reconnexionPlanifiee = false;
      this.connecter().catch(() => this.planifierReconnexion());
    }, this.delaiReconnexionMs);
  }

  get canalActif(): ConfirmChannel {
    if (!this.canal) {
      throw new Error("ConnexionRabbitMQ : canal non initialisé — appeler connecter() d'abord.");
    }
    return this.canal;
  }

  estConnecte(): boolean {
    return !!this.modele && !!this.canal;
  }
}
