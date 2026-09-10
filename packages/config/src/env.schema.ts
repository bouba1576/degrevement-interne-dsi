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
  JWT_EXPIRES_IN: z.string().default("1h"),
  REFRESH_TOKEN_SECRET: z.string().min(32, "REFRESH_TOKEN_SECRET doit faire au moins 32 caractères"),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("7d"),
  SESSION_COOKIE_NAME: z.string().default("pgd_session"),
  REFRESH_COOKIE_NAME: z.string().default("pgd_refresh"),
  // z.coerce.boolean() était le bug réel : Boolean("false") === true en JS
  // (toute chaîne non vide est truthy) — COOKIE_SECURE=false n'avait donc
  // JAMAIS d'effet, quelle que soit la valeur écrite dans .env. Invisible en
  // dev (Chrome/Firefox traitent http://localhost comme un contexte
  // sécurisé même sans HTTPS — le cookie Secure s'y stocke quand même),
  // découvert en prod (vraie IP, cette exception ne s'applique plus :
  // Set-Cookie émis mais silencieusement rejeté par le navigateur, session
  // jamais utilisable). z.enum + transform, jamais un simple .transform sur
  // z.string() : une valeur ni "true" ni "false" (typo, "False", "0") doit
  // faire échouer loadEnv() au démarrage, pas se réinterpréter en silence —
  // même discipline d'échec fermé que le reste du projet (AdApiProvider,
  // KeycloakDirectGrantProvider).
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  // --- KeycloakPort (fournisseur cible d'authentification) — AUTH_PROVIDER
  // restaure une sélection à deux fournisseurs (AdApiProvider, mesure
  // transitoire, cf. CLAUDE.md « Restauration transitoire — AdApiProvider ») :
  // un seul actif à la fois, jamais une tentative en cascade, même mécanique
  // que l'ancien LDAP_PROVIDER/le SMTP_PROVIDER actuel. Nomme le DOMAINE
  // (authentification), pas une implémentation précise — reste valable si un
  // troisième fournisseur apparaît un jour.
  //
  // Défaut basculé sur "ad-api" le 24/08/2026 (demande explicite, même jour
  // que la restauration) — ⚠️ ce chemin ne déclenche aucune étape MFA, ni
  // PGD ni Keycloak, pour AUCUN rôle, y compris SM_DF/DF/DGA_DG/ADMIN qui
  // exigent la double authentification selon docs/09. Mesure transitoire
  // acceptée explicitement par la personne pilotant le projet, en attendant
  // que Keycloak soit confirmé définitivement opérationnel — cf. CLAUDE.md,
  // section dédiée, pour le détail et la date de retrait/restriction prévue.
  AUTH_PROVIDER: z.enum(["keycloak", "ad-api"]).default("ad-api"),
  // Base uniquement (schéma+hôte+port) — le chemin documenté
  // (/ci.orange.ldap/rs-interface/authenticate) est fixe, ajouté par
  // AdApiProvider, pas paramétrable ici. Vide par défaut — sans objet tant
  // que AUTH_PROVIDER=keycloak, mais AUTH_PROVIDER vaut désormais "ad-api"
  // par défaut : cette valeur doit être renseignée dans tout environnement
  // qui n'override pas explicitement AUTH_PROVIDER=keycloak, sous peine
  // d'échec fermé silencieux (fetch sur une base vide).
  AD_API_URL: z.string().default(""),
  AD_API_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

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
  // Défaut 3 (pas 5) — E2.1, docs/15_Conformite_Exigences_Securite_OCIT.md,
  // audit du 10/09/2026 (docs/Audit_Conformite_Securite_OCIT_2026-09-10.md) :
  // "3 tentatives infructueuses max".
  RATE_LIMIT_LOGIN_MAX_TENTATIVES: z.coerce.number().int().positive().default(3),
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
  SMTP_FROM: z.string().default("")

  // TACHE_VERROU_TTL_SECONDES retirée le 25/08/2026 — devenue configurable
  // par l'administration (ParametreGlobal, cle "tache_verrou_ttl_secondes",
  // TacheService.ttlVerrouSecondes()), demande explicite : un paramètre
  // opérationnel sans source métier figée n'a pas sa place dans une variable
  // d'environnement qui exige un redéploiement pour changer.
});

export type Env = z.infer<typeof envSchema>;
