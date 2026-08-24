import { z } from "zod";

// Variables validées au démarrage — une seule fois, au bootstrap de chaque app.
// Périmètre Phase 1 + Phase 2 (socle, DB, cache, messagerie, ports HTTP,
// authentification, session). Les variables des phases suivantes (ports
// SI/GED/SMTP/CRM/JADE) seront ajoutées quand leurs modules seront écrits —
// ne pas les anticiper ici (cf. CLAUDE.md, règle 1 : rien en dur avant d'exister).
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

  // --- Keycloak (KeycloakPort — réel, SOURCE UNIQUE d'authentification,
  // décision actée le 24/08/2026, remplace LdapPort/LdapProvider/
  // AdApiProvider/OpenLDAP retirés dans le même chantier) -----------------
  KEYCLOAK_BASE_URL: z.string().min(1, "KEYCLOAK_BASE_URL est requis"),
  KEYCLOAK_REALM: z.string().min(1, "KEYCLOAK_REALM est requis"),
  KEYCLOAK_CLIENT_ID: z.string().min(1, "KEYCLOAK_CLIENT_ID est requis"),
  KEYCLOAK_CLIENT_SECRET: z.string().min(1, "KEYCLOAK_CLIENT_SECRET est requis"),
  // Généreux et distinct d'un timeout réseau classique (cf.
  // KeycloakDirectGrantProvider) : si la résolution DUO côté Keycloak
  // bloque la réponse /token le temps d'une approbation Duo Mobile, un
  // timeout court couperait une authentification légitime en cours. Valeur
  // provisoire (60s), jamais vérifiée contre un vrai délai d'attente DUO —
  // à ajuster une fois la forme réelle de la résolution DUO confirmée.
  KEYCLOAK_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),

  // --- Phase 2 : rate limiting anti-bruteforce (SF-PGD-005) --------------
  RATE_LIMIT_LOGIN_MAX_TENTATIVES: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_LOGIN_FENETRE_SECONDES: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_LOGIN_VERROUILLAGE_SECONDES: z.coerce.number().int().positive().default(900),

  // --- Phase 4 : GedPort (bouchon stockage local, SF-PGD-050) ------------
  GED_STORAGE_PATH: z.string().default("/tmp/pgd-ged"),
  GED_MAX_TAILLE_OCTETS: z.coerce.number().int().positive().default(10_485_760),

  // --- SmtpPort (SF-PGD-110, config réelle reçue le 24/08/2026) ----------
  // Sélecteur de fournisseur, même mécanique que CRM_PROVIDER/LDAP_PROVIDER
  // (bouchons commutables, cf. CLAUDE.md « Ports d'intégration ») — défaut
  // "stub" (SmtpStubAdapter, journalise seulement), jamais un remplacement
  // non explicite. Le reste est optionnel/vide par défaut : sans objet tant
  // que SMTP_PROVIDER=stub, et un envoi réel avec un hôte vide échoue de
  // toute façon côté nodemailer — même discipline d'échec fermé qu'ailleurs,
  // sans validation dédiée ici.
  SMTP_PROVIDER: z.enum(["stub", "smtp"]).default("stub"),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  SMTP_FROM: z.string().default(""),

  // --- Phase 6 : claim double verrou (SF-PGD-072, PGD-051) ---------------
  // Paramètre opérationnel (durée de détention d'un verrou de claim), pas une
  // règle métier chiffrée — aucune source ne fixe cette valeur ; le
  // locks-sweeper (PGD-053, cron 5 min) libère toute tâche RECLAMEE dont le
  // verrou a expiré sans décision, donc ce TTL doit rester significativement
  // plus long que l'intervalle du sweeper.
  TACHE_VERROU_TTL_SECONDES: z.coerce.number().int().positive().default(1800)
});

export type Env = z.infer<typeof envSchema>;
