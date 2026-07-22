import { envSchema, type Env } from "./env.schema";

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;

  const result = envSchema.safeParse(source);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Configuration d'environnement invalide.\n${detail}\n\nVérifiez votre .env par rapport à .env.example.`
    );
  }

  cached = result.data;
  return cached;
}

export function amqpUrl(env: Env): string {
  const { RABBITMQ_USER, RABBITMQ_PASSWORD, RABBITMQ_HOST, RABBITMQ_PORT, RABBITMQ_VHOST } = env;
  const vhost = encodeURIComponent(RABBITMQ_VHOST);
  return `amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@${RABBITMQ_HOST}:${RABBITMQ_PORT}/${vhost}`;
}

export type { Env } from "./env.schema";
