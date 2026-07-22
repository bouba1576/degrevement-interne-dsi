import { z } from "zod";

// Variables validées au démarrage — une seule fois, au bootstrap de chaque app.
// Périmètre Phase 1 + Phase 2 (socle, DB, cache, messagerie, ports HTTP, AD, MFA,
// session). Les variables des phases suivantes (ports SI/GED/SMTP/CRM/JADE)
// seront ajoutées quand leurs modules seront écrits — ne pas les anticiper ici
// (cf. CLAUDE.md, règle 1 : rien en dur avant d'exister).
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  API_PORT: z.coerce.number().int().positive().default(3000),
  WEB_PORT: z.coerce.number().int().positive().default(3001),
  WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(3002),

  DATABASE_URL: z.string().url({ message: "DATABASE_URL doit être une URL PostgreSQL valide" }),

  REDIS_URL: z.string().url({ message: "REDIS_URL doit être une URL Redis valide" }),

  RABBITMQ_HOST: z.string().min(1, "RABBITMQ_HOST est requis"),
  RABBITMQ_PORT: z.coerce.number().int().positive().default(5672),
  RABBITMQ_MANAGEMENT_PORT: z.coerce.number().int().positive().default(15672),
  RABBITMQ_USER: z.string().min(1, "RABBITMQ_USER est requis"),
  RABBITMQ_PASSWORD: z.string().min(1, "RABBITMQ_PASSWORD est requis"),
  RABBITMQ_VHOST: z.string().min(1).default("/pgd"),

  CORS_ORIGIN: z.string().default("http://localhost:3001"),

  // --- Phase 2 : session ------------------------------------------------
  JWT_SECRET: z.string().min(32, "JWT_SECRET doit faire au moins 32 caractères"),
  JWT_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_SECRET: z.string().min(32, "REFRESH_TOKEN_SECRET doit faire au moins 32 caractères"),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("7d"),
  SESSION_COOKIE_NAME: z.string().default("pgd_session"),
  REFRESH_COOKIE_NAME: z.string().default("pgd_refresh"),
  COOKIE_SECURE: z.coerce.boolean().default(true),

  // --- Phase 2 : Active Directory (LdapPort — réel, SF-PGD-001) ---------
  LDAP_URL: z.string().min(1, "LDAP_URL est requis (ldap:// ou ldaps://)"),
  LDAP_BIND_DN: z.string().min(1, "LDAP_BIND_DN est requis"),
  LDAP_BIND_PASSWORD: z.string().min(1, "LDAP_BIND_PASSWORD est requis"),
  LDAP_BASE_DN: z.string().min(1, "LDAP_BASE_DN est requis"),
  LDAP_USER_DOMAIN: z.string().default("orange.ci"),

  // --- Phase 2 : MFA (MfaPort — réel, SF-PGD-002, ADR-08) ----------------
  DUO_CLIENT_ID: z.string().min(1, "DUO_CLIENT_ID est requis"),
  DUO_CLIENT_SECRET: z.string().min(1, "DUO_CLIENT_SECRET est requis"),
  DUO_API_HOST: z.string().min(1, "DUO_API_HOST est requis"),
  DUO_REDIRECT_URI: z.string().min(1, "DUO_REDIRECT_URI est requis"),

  TOTP_ISSUER: z.string().default("PGD Orange CI"),
  // AES-256-GCM : 32 octets exactement, fournis en hex (64 caractères).
  TOTP_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "TOTP_ENCRYPTION_KEY doit être 32 octets en hexadécimal (64 caractères)"),

  // --- Phase 2 : rate limiting anti-bruteforce (SF-PGD-005) --------------
  RATE_LIMIT_LOGIN_MAX_TENTATIVES: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_LOGIN_FENETRE_SECONDES: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_LOGIN_VERROUILLAGE_SECONDES: z.coerce.number().int().positive().default(900),

  // --- Phase 4 : GedPort (bouchon stockage local, SF-PGD-050) ------------
  GED_STORAGE_PATH: z.string().default("/tmp/pgd-ged"),
  GED_MAX_TAILLE_OCTETS: z.coerce.number().int().positive().default(10_485_760),

  // --- Phase 6 : claim double verrou (SF-PGD-072, PGD-051) ---------------
  // Paramètre opérationnel (durée de détention d'un verrou de claim), pas une
  // règle métier chiffrée — aucune source ne fixe cette valeur ; le
  // locks-sweeper (PGD-053, cron 5 min) libère toute tâche RECLAMEE dont le
  // verrou a expiré sans décision, donc ce TTL doit rester significativement
  // plus long que l'intervalle du sweeper.
  TACHE_VERROU_TTL_SECONDES: z.coerce.number().int().positive().default(1800)
});

export type Env = z.infer<typeof envSchema>;
