import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { loadEnv } from "@pgd/config";
import { WorkerModule } from "./worker.module";

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(WorkerModule);
  await app.listen(env.WORKER_HEALTH_PORT);
  // eslint-disable-next-line no-console
  console.log(
    `[worker] démarré sur http://localhost:${env.WORKER_HEALTH_PORT} (health: /health/ready) — locks-sweeper + sla-escalation actifs`
  );
}

bootstrap();
