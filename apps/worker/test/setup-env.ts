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
process.env.LDAP_URL ??= "ldap://127.0.0.1:3890";
process.env.LDAP_BIND_DN ??= "cn=admin,dc=pgd,dc=orange,dc=com";
process.env.LDAP_BIND_PASSWORD ??= "admin";
process.env.LDAP_BASE_DN ??= "dc=pgd,dc=orange,dc=com";
process.env.DUO_CLIENT_ID ??= "test";
process.env.DUO_CLIENT_SECRET ??= "test";
process.env.DUO_API_HOST ??= "api-test.duosecurity.com";
process.env.DUO_REDIRECT_URI ??= "http://localhost:3000/api/auth/mfa/duo/callback";
process.env.TOTP_ENCRYPTION_KEY ??= "a".repeat(64);
// eslint-disable-next-line @typescript-eslint/no-var-requires
process.env.GED_STORAGE_PATH ??= require("node:path").join(require("node:os").tmpdir(), "pgd-ged-test");
