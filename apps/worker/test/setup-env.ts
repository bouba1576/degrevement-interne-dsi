// Valeurs de base pour packages/config — chaque suite peut surcharger avant
// le premier appel à loadEnv() (mémoïsé au premier appel dans ce module).
process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.DATABASE_URL ??= "postgresql://pgd:pgd@127.0.0.1:5432/pgd?schema=public";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";
process.env.RABBITMQ_HOST ??= "127.0.0.1";
process.env.RABBITMQ_USER ??= "pgd";
process.env.RABBITMQ_PASSWORD ??= "pgd";
process.env.JWT_SECRET ??= "test-jwt-secret-0000000000000000";
process.env.REFRESH_TOKEN_SECRET ??= "test-refresh-secret-000000000000";
process.env.KEYCLOAK_BASE_URL ??= "http://127.0.0.1:1";
process.env.KEYCLOAK_REALM ??= "test";
process.env.KEYCLOAK_CLIENT_ID ??= "test";
process.env.KEYCLOAK_CLIENT_SECRET ??= "test";
process.env.KEYCLOAK_TIMEOUT_MS ??= "300";
// eslint-disable-next-line @typescript-eslint/no-var-requires
process.env.GED_STORAGE_PATH ??= require("node:path").join(require("node:os").tmpdir(), "pgd-ged-test");
