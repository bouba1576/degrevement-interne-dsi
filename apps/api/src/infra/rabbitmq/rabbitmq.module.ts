import { Global, Module, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { amqpUrl, loadEnv } from "@pgd/config";
import { ConnexionRabbitMQ } from "@pgd/messaging";
import { CONNEXION_RABBITMQ } from "./rabbitmq.constants";

// apps/api n'est ici qu'un PUBLISHER (si.push, PGD-061 : publication après le
// commit de la transaction de validation finale). La consommation vit
// exclusivement dans apps/worker — aucune dépendance croisée entre apps/*,
// seule la classe ConnexionRabbitMQ (@pgd/messaging) est partagée.
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

@Global()
@Module({
  providers: [
    {
      provide: CONNEXION_RABBITMQ,
      useFactory: () => new ConnexionRabbitMQLifecycle(urlAmqp())
    }
  ],
  exports: [CONNEXION_RABBITMQ]
})
export class RabbitMQModule {}
