import { Global, Module, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { amqpUrl, loadEnv } from "@pgd/config";
import { ConnexionRabbitMQ } from "@pgd/messaging";
import { CONNEXION_RABBITMQ } from "./rabbitmq.constants";

// amqpUrl() encode correctement le vhost (RABBITMQ_VHOST vaut littéralement
// "/pgd" — cf. RABBITMQ_DEFAULT_VHOST dans docker-compose.yml — donc le
// segment d'URL doit être percent-encodé en "%2Fpgd", pas concaténé tel
// quel : une concaténation directe résoudrait vers le vhost "pgd", qui
// n'existe pas sur le broker). Une seule source pour cette construction,
// jamais deux implémentations divergentes.
function urlAmqp(): string {
  return amqpUrl(loadEnv());
}

class ConnexionRabbitMQLifecycle extends ConnexionRabbitMQ implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.connecter();
  }

  async onModuleDestroy(): Promise<void> {
    await this.fermer();
  }
}

// Topologie déclarée par le code à la connexion (ConnexionRabbitMQ.connecter
// → declarerTopologie) : démarrer sur un broker vierge suffit à tout créer,
// jamais une manipulation manuelle dans la console de gestion (T8).
@Global()
@Module({
  providers: [
    {
      provide: CONNEXION_RABBITMQ,
      useFactory: () => new ConnexionRabbitMQLifecycle(urlAmqp()),
    },
  ],
  exports: [CONNEXION_RABBITMQ],
})
export class RabbitMQModule {}
