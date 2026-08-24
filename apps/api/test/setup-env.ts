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
// Placeholders — jamais résolus par la suite générale : KeycloakDirectGrantProvider
// n'appelle le royaume qu'à la première utilisation réelle (chaque test), donc
// aucun appel réseau tant qu'aucune route d'authentification n'est exercée.
// Les fichiers dédiés (keycloak-direct-grant-provider*.spec.ts) pointent
// explicitement KEYCLOAK_BASE_URL vers leur propre serveur HTTP local avant
// d'instancier — mémoïsation de loadEnv() par fichier, jamais partagée.
process.env.KEYCLOAK_BASE_URL ??= "http://127.0.0.1:1";
process.env.KEYCLOAK_REALM ??= "test";
process.env.KEYCLOAK_CLIENT_ID ??= "test";
process.env.KEYCLOAK_CLIENT_SECRET ??= "test";
process.env.KEYCLOAK_TIMEOUT_MS ??= "300";
// eslint-disable-next-line @typescript-eslint/no-var-requires
process.env.GED_STORAGE_PATH ??= require("node:path").join(require("node:os").tmpdir(), "pgd-ged-test");
