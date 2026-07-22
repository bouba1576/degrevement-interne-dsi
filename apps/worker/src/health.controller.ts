import { Controller, Get, Inject } from "@nestjs/common";
import type { ConnexionRabbitMQ } from "@pgd/messaging";
import { CONNEXION_RABBITMQ } from "./rabbitmq/rabbitmq.constants";

@Controller("health")
export class HealthController {
  constructor(@Inject(CONNEXION_RABBITMQ) private readonly connexion: ConnexionRabbitMQ) {}

  @Get()
  liveness(): { statut: "ok"; horodatage: string } {
    return { statut: "ok", horodatage: new Date().toISOString() };
  }

  // État de la connexion au broker (CLAUDE.md — PGD-052bis).
  @Get("ready")
  readiness(): { statut: "ok" | "degrade"; rabbitmq: boolean; horodatage: string } {
    const rabbitmq = this.connexion.estConnecte();
    return { statut: rabbitmq ? "ok" : "degrade", rabbitmq, horodatage: new Date().toISOString() };
  }
}
