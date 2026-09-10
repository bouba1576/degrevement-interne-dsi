# 02 — Architecture Monorepo (BMAD)

> **Projet :** PGD — Orange Côte d'Ivoire · **Version :** 3.0 · **Date :** 10 septembre 2026
> **Stack :** pnpm workspaces + Turborepo · NestJS 11 · Next.js 16 (App Router) · Prisma · PostgreSQL 16 · Redis (cache + verrous) · RabbitMQ (bus de messages) · Docker
>
> Révision complète — le document d'origine (22/07/2026) n'avait reçu aucune mise à jour depuis un seul commit initial et ne reflétait plus l'architecture réelle sur plusieurs points structurants (authentification, MFA, modules ajoutés). Reconstruit à partir de `CLAUDE.md` et du code réel, pas de la mémoire du document précédent. Source de vérité narrative et à jour au jour le jour : `CLAUDE.md`, à la racine du dépôt — ce document en est une synthèse stable, pas un journal de chantier.

---

## 1. Principes directeurs

1. **Règles métier externalisées** — matrice pivot, catalogue de rôles, motifs, paramètres de calcul, calendrier SLA, paliers de subdélégation : en base, cachés en Redis, servis par API. Jamais en dur.
2. **Ports et adaptateurs** — tout externe (authentification, GED, CRM, SMTP, restitution SI) est derrière une interface stable. Le passage bouchon → réel, ou entre deux fournisseurs réels, est une variable d'environnement.
3. **Affectation par corbeille (pull)** — jamais de désignation nominative en routage nominal ; la délégation est l'exception tracée.
4. **Invariants de sécurité côté serveur uniquement** — Guards NestJS + transactions Prisma, y compris en lecture (pas seulement en écriture). Le frontend ne porte aucune décision d'autorisation.
5. **PostgreSQL source de vérité** — Redis est un reflet volatil intégralement reconstructible.
6. **Journaux append-only** — non-répudiation, trois journaux distincts (métier, sécurité, activité administrative), chacun avec sa propre politique de rétention.
7. **Types partagés** — un seul package de contrats (Zod) consommé par le back et le front. Pas de duplication de DTO.

---

## 2. Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────────────┐
│  Utilisateur — Navigateur web                                         │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
┌───────────────────────────────┴───────────────────────────────────────┐
│  ENVIRONNEMENT DOCKER                                                  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  apps/web — Next.js 16 (App Router, React, Tailwind)           │    │
│  │  Écrans : connexion · accueil (KPI par profil) · nouvelle       │    │
│  │  demande (3 circuits) · mes demandes · corbeilles · dossier ·   │    │
│  │  contrôle a posteriori · consultation · reporting · admin       │    │
│  │  (12 onglets) · audit (sécurité + activité)                     │    │
│  └───────────────────────────┬──────────────────────────────────┘    │
│                              │ REST / JSON · cookies HttpOnly (session) │
│  ┌───────────────────────────┴──────────────────────────────────┐    │
│  │  apps/api — NestJS                                             │    │
│  │  Pipeline : Guards(Auth·Rbac·Sod·portée) → validation Zod       │    │
│  │             → Interceptors(JournalActivite·Logging·Enveloppe)   │    │
│  │             → Filters(erreurs normalisées)                      │    │
│  │  Modules : auth · demandes · lignes · taches · admin (12 sous-  │    │
│  │            référentiels) · kpi · reporting · audit · activite ·  │    │
│  │            notifications · referentiels · health                │    │
│  └──────┬────────────────────────────────────┬───────────────────┘    │
│         │                                     │                        │
│  ┌──────┴───────┐  ┌────────────────┐  ┌────┴──────────────────┐    │
│  │ apps/worker  │  │  PostgreSQL     │  │  Redis                 │    │
│  │ consumers    │  │  (Prisma)       │  │  cache invalidable ·   │    │
│  │ AMQP         │  │  source de      │  │  verrous de claim ·    │    │
│  │ locks-sweeper│  │  vérité         │  │  sessions · rate-limit │    │
│  │ sla-escalation│ └────────────────┘  └───────────────────────┘    │
│  │ notifications│                                                      │
│  │ si-push      │  ┌────────────────────────────────────────────┐    │
│  │ retention-   │  │  RabbitMQ — exchange topic `pgd.events`    │    │
│  │ journal-activ│  │  q.locks-sweeper · q.sla-escalation ·      │    │
│  └──────┬───────┘  │  q.notifications · q.si-push  (+ DLX)      │    │
│         └──────────┤                                              │    │
│                    └────────────────────────────────────────────┘    │
└────────────────────────────┬───────────────────────────────────────────┘
                             │ ports (interfaces stables)
        ┌────────────────────┼────────────────────────┐
        │                    │                        │
┌───────┴────────┐  ┌───────┴────────┐  ┌───────────┴──────────┐
│ INTERNES        │  │ SÉCURITÉ        │  │ EXTERNES              │
│ GED (documents,  │  │ Keycloak Direct │  │ BSCS  (dégrèvement)   │
│ bouchon disque)  │  │ Grant (identité │  │ GAIA  (dégrèvement)   │
│ CRM (import réel │  │ + DUO) — cible  │  │ SMTP  (mails, réel,   │
│ des comptes/     │  │ API AD réelle   │  │ envoi live suspendu   │
│ lignes/formules) │  │ — transitoire   │  │ sur cert. CA)         │
└─────────────────┘  └─────────────────┘  └──────────────────────┘
```

**Alignement sur le schéma technique cible :** RabbitMQ est le broker de messages (exchange topic + DLX). Redis conserve deux usages — cache invalidable de configuration et verrous distribués de claim (`SET NX`) — jamais de fonction de file. Un job de rétention (`JournalActiviteRetentionService`) est une exception délibérée à la règle « les crons publient un message » : agrégation + purge dans la même transaction Postgres, pas de retry/DLX à préserver pour cette opération.

---

## 3. Arborescence du monorepo

```
pgd/
├── package.json                    # workspaces pnpm + scripts Turborepo + pnpm.overrides (sécurité)
├── pnpm-workspace.yaml
├── turbo.json
├── docker-compose.yml              # dev — postgres · redis · rabbitmq · api · worker · web · adminer
├── docker-compose.override.yml     # dev — hot reload, ports exposés
├── docker-compose.prod.yml         # prod — serveur unique, postgres/redis/rabbitmq auto-hébergés,
│                                    #   images depuis un registre (DOCKER_REGISTRY, dépendance externe)
├── docker-compose.prod.build.yml   # prod — variante build local, pas de registre requis
├── docker/
│   ├── backup/                     # service pg_dump quotidien, rétention 7j, copie distante optionnelle (rclone)
│   └── all-in-one/                 # image unique API+Worker+Web+Redis interne, Postgres/RabbitMQ externes
├── .env.example / .env.prod.example / docker/all-in-one/.env.aio.example
├── CLAUDE.md                       # contexte permanent du dépôt — source narrative à jour, à consulter en premier
├── README.md
│
├── apps/
│   ├── api/                        # NestJS — API REST
│   │   ├── src/
│   │   │   ├── main.ts             # cookie-parser, préfixe /api, filtre d'exception, Swagger (/api/docs)
│   │   │   ├── app.module.ts
│   │   │   ├── common/
│   │   │   │   ├── guards/         auth · rbac · sod · corbeille-role · initiateur-demande ·
│   │   │   │   │                   delegant-membre-role · delegation-context · kpi-perimetre ·
│   │   │   │   │                   notification-destinataire · profil
│   │   │   │   ├── interceptors/   logging · response-envelope · journal-activite
│   │   │   │   ├── decorators/     roles · authenticated · public · current-user ·
│   │   │   │   │                   profil-requis · sans-journal-activite
│   │   │   │   ├── filters/        http-exception.filter.ts (enveloppe {data,error,meta} normalisée)
│   │   │   │   └── swagger/        zod-schema.ts — OpenAPI dérivé des schémas Zod réels, jamais un DTO resaisi
│   │   │   ├── infra/
│   │   │   │   ├── prisma/         prisma.module.ts · prisma.service.ts
│   │   │   │   └── redis/          redis.module.ts · cache.service.ts
│   │   │   └── modules/
│   │   │       ├── auth/           KeycloakPort (KeycloakDirectGrantProvider · AdApiProvider,
│   │   │       │                   sélection par AUTH_PROVIDER) · SessionService · RateLimitService ·
│   │   │       │                   JournalSecuriteService · RbacResolutionService
│   │   │       ├── demandes/       DemandeService · DemandeWorkflowService · MontantService ·
│   │   │       │                   PieceService (GedPort) · ReferenceService · RuleEngineService
│   │   │       ├── lignes/         LigneService · CompteService · CrmImportService (CrmPort)
│   │   │       ├── taches/         TacheService (claim double-verrou) · TacheWorkflowService ·
│   │   │       │                   DelegationService · ControleService · SodService
│   │   │       ├── admin/          12 sous-référentiels CRUD (circuits, paliers, rôles, motifs,
│   │   │       │                   libellés d'ajustement, sous-flux, opérateurs, points de contact,
│   │   │       │                   calendrier SLA, paramètres calcul/globaux, modules, utilisateurs)
│   │   │       │                   + moniteur (vue transverse ADMIN_PGD, relance/escalade)
│   │   │       ├── kpi/            KpiEngineService (26 KPI_DEFINITION pilotés par la donnée) +
│   │   │       │                   synthèse par profil (initiateur/valideur/pilotage)
│   │   │       ├── reporting/      ReportingService — dossiers transmis/rejetés/validés/en cours,
│   │   │       │                   export CSV/PDF
│   │   │       ├── audit/          journal métier par dossier + journal de sécurité (ADMIN_PGD)
│   │   │       ├── activite/       journal d'activité administrateur (navigation + actions)
│   │   │       ├── notifications/  in-app (source de vérité) + lecture/marquage
│   │   │       ├── referentiels/   lecture publique des référentiels admin (motifs, sous-flux,
│   │   │       │                   opérateurs, points de contact, univers FMI, membres de rôle...)
│   │   │       └── health/         /api/health, /api/health/ready
│   │   └── test/                   unitaires/intégration (contre Postgres/Redis/RabbitMQ réels) + e2e HTTP réel
│   │
│   ├── worker/                     # NestJS standalone — consumers AMQP (RabbitMQ)
│   │   └── src/
│   │       ├── jobs/               locks-sweeper · sla-escalation · scheduler ·
│   │       │                       journal-activite-retention (agrégation + purge, transaction unique)
│   │       ├── notifications/      NotificationService · SmtpPort (SmtpAdapter réel / SmtpStubAdapter) ·
│   │       │                       SmsPort (scaffolding, jamais câblé — aucune source de numéro)
│   │       └── si-push/            SiPushService · BillingSiPort (BscsAdapter/GaiaAdapter, bouchons)
│   │
│   └── web/                        # Next.js 16 — App Router
│       ├── app/
│       │   ├── login/
│       │   └── (app)/              admin · audit · consultation · controle · corbeilles ·
│       │                           dossiers/[id] · integrations · mes-demandes ·
│       │                           nouvelle-demande · reporting · layout.tsx (fetchSession + navigation)
│       ├── components/screens/     admin/ · audit/ · auth/ · consultation/ · controle/ ·
│       │                           corbeilles/ · dossier-detail/ · mes-demandes/ ·
│       │                           nouvelle-demande/ · pilotage/ · reporting/ · HomeScreen.tsx
│       ├── components/shared/      DossierTable, composants réutilisés entre écrans
│       └── lib/                    api.ts (client HTTP), periode.ts (granularités de filtre)
│
├── packages/
│   ├── contracts/                  # Zod schemas + types TS — SOURCE UNIQUE des contrats
│   │   └── src/{demande,tache,auth,admin-utilisateur,activite,kpi,audit,reporting,...}.ts
│   ├── database/                   # Prisma
│   │   ├── prisma/schema.prisma
│   │   ├── prisma/migrations/      versionnées, appliquées via `prisma migrate deploy`
│   │   └── prisma/seed/            référentiels + admins réels + jeu de démonstration
│   ├── config/                     # env.schema.ts (validation Zod au bootstrap), env.ts
│   ├── messaging/                  # topologie RabbitMQ, connexion, publisher, retry/DLX (consommé par apps/worker)
│   └── ui/                         # composants partagés (design system) + tokens de charte
│
└── docs/                           # livrables BMAD + rapports de chantier/sécurité horodatés
    └── design/                     # maquette Claude Design exportée (référence visuelle, jamais compilée)
```

**Règles de dépendance :** `apps/*` dépendent de `packages/*`. `packages/*` ne dépendent jamais de `apps/*`. `packages/contracts` ne dépend de rien d'autre que Zod. Aucune dépendance croisée entre `apps/`.

---

## 4. Moteur de règles et workflow

### 4.1 Routage à la soumission

`RuleEngineService` lit cinq variables — `circuit`, `segment`, `sous_flux`, `montant TTC`, `type_acteur` — et produit une chaîne ordonnée de tâches. Dans une **transaction Prisma unique** :

1. Le TTC dérive d'un montant HT saisi directement au niveau du dossier (`Demande.montantHt`), passé au moteur de taxes (`MontantService.calculer()`, assiette HT ou HT+TSC configurable) — plus une agrégation de lignes retenues (mécanisme abandonné, décision métier du 19/08/2026 ; `R15`/`R17`/`R18`/`R19`/`R20` sans objet depuis).
2. Sélection du **palier** : `CONFIGURATION_CIRCUIT` où `circuit` correspond et `borne_min ≤ TTC ≤ borne_max` (cache Redis, rechargé de PostgreSQL si absent).
3. Lecture des `ETAPE_REGLE` ordonnées.
4. Instanciation d'une `TACHE` par étape — la première en `EN_CORBEILLE`, les suivantes en `EN_ATTENTE` ; les tâches de contrôle (type `C`) en `POST_CLOTURE`.
5. Si `TTC > 5 000 000` : instanciation obligatoire de l'étape de contrôle **FRA** (`R12`) — câblée aujourd'hui uniquement sur le circuit DF (paliers DOBB/DXC sans étape FRA, question métier ouverte, cf. `CLAUDE.md`).
6. Calcul de l'échéance SLA de la première étape en heures ouvrées.
7. Écriture du journal d'audit.

### 4.2 Claim — double verrou

```
(a) Redis  : SET lock:tache:{id} {userId} NX PX {ttl}   → absorbe la contention
(b) Postgres (transaction, source de vérité) :
      UPDATE tache
      SET etat='RECLAMEE', agent_claim=:user, date_claim=now(),
          verrou_expire_at = now() + interval ':ttl seconds'
      WHERE id=:taskId AND etat='EN_CORBEILLE'
      RETURNING id;
(c) Aucune ligne retournée → 409 Conflict + libération du verrou Redis
```

Cycle : `EN_ATTENTE → EN_CORBEILLE → RECLAMEE → APPROUVEE | REJETEE` (+ `POST_CLOTURE` pour le contrôle a posteriori). L'`unclaim` ramène en `EN_CORBEILLE`. Le TTL du verrou (`ParametreGlobal.tache_verrou_ttl_secondes`, défaut 1800 s) est configurable en base sans redéploiement — un modal côté écran prévient l'agent avant expiration, avec option de prolonger.

### 4.3 Messagerie asynchrone — RabbitMQ

**Topologie.** Un exchange `topic` durable `pgd.events` ; quatre files durables liées par routing key ; un exchange `pgd.dlx` (dead-letter) avec la file `q.dead-letter` pour tout message rejeté ou ayant épuisé ses tentatives.

| File | Routing key | Déclencheur | Action |
|---|---|---|---|
| `q.locks-sweeper` | `lock.sweep` | `@Cron` (5 min) dans `apps/worker`, qui publie l'ordre | Tâches `RECLAMEE` avec `verrou_expire_at < now()` sans décision → `EN_CORBEILLE` + journal |
| `q.sla-escalation` | `sla.check` | `@Cron` (15 min) | Tâches `EN_CORBEILLE` avec `echeance_sla < now()` → `niveau_escalade++`, journal + notification (destinataire configurable, jamais deviné) |
| `q.notifications` | `notification.*` | Événement métier publié par l'API après commit | Écriture in-app (source de vérité) + envoi SMTP secondaire, jamais bloquant |
| `q.si-push` | `si.push` | Validation finale + rejeu manuel | Appel `BillingSiPort`, transition d'état SI, idempotence, journal |

**Garanties.** Publication `persistent` + `publisher confirms` côté API ; consommation en `ack` manuel après commit de la transaction Prisma, `prefetch = 1` sur `q.si-push`. Retry avec back-off exponentiel plafonné à 5 tentatives, puis routage vers `pgd.dlx`.

**Idempotence des consumers.** Aucun consumer ne présume une livraison unique (RabbitMQ garantit *at-least-once*). Chaque traitement est protégé par une mise à jour conditionnelle SQL ou une clé d'idempotence dédiée.

**Exception délibérée.** `JournalActiviteRetentionService` (rétention du journal d'activité, cf. §4.6) tourne en `@Cron` direct dans `apps/worker`, sans passer par RabbitMQ — agrégation et purge dans la même transaction Postgres (tout ou rien), aucune clé d'idempotence ni retry/DLX à préserver pour ce type d'opération.

### 4.4 Contrôle d'accès — RBAC, portée, SoD

Trois niveaux distincts, tous strictement serveur :

- **`RbacGuard`** — `@Roles(...)` par route, vérifie que l'un des rôles détenus (JWT de session) figure dans la liste requise. Répond à « cet utilisateur détient-il ce rôle ? », jamais à « a-t-il le droit sur CETTE ressource précise ? ».
- **Guards de portée** — `CorbeilleRoleGuard` (une tâche n'est traitée que par un membre de sa corbeille, délégation active acceptée), `InitiateurDemandeGuard` (un dossier n'est modifié que par son initiateur), `DelegantMembreRoleGuard` (on ne délègue que ce qu'on détient réellement, jamais une délégation reçue), `NotificationDestinataireGuard`, `KpiPerimetreGuard` (agrégats inter-circuits réservés aux validateurs/admin). Posés après sept incidents réels d'élévation de portée trouvés et corrigés — `apps/api/test/guard-coverage.spec.ts` verrouille structurellement qu'une nouvelle route mutative (ou de `KpiController`) ne peut être ajoutée sans entrée explicite dans une table route → guards attendus.
- **`SodGuard`** — R3/R21/R24 : un acteur ne valide pas l'étape N s'il est intervenu à l'étape N-1 du même dossier, étendu à la délégation (vérifie délégant **et** délégataire) et au contrôle a posteriori.

### 4.5 Configuration sans redéploiement

Matrice, catalogue, paliers et référentiels (12 sous-domaines admin) sont en base, exposés en cache Redis. Une écriture via un endpoint `admin` invalide la clé correspondante ; le moteur reprend la nouvelle configuration sans redémarrage.

### 4.6 Journal d'activité administrateur (PGD, 08-09/09/2026)

Distinct du journal métier (`JournalAudit`, par dossier) et du journal de sécurité (`JournalSecurite`, connexions/MFA/refus RBAC-SoD) : capture NAVIGATION (écran consulté) et ACTION (toute mutation serveur significative) pour un objectif de supervision administrative, avec une politique de rétention propre (six mois, paramétrable, agrégation avant purge — `JournalActiviteAgregat` conserve un comptage par jour/type/utilisateur une fois les lignes détaillées purgées). `@SansJournalActivite()` exclut les routes déjà couvertes par les deux autres journaux, pour ne jamais dupliquer un événement.

---

## 5. Sécurité

**⚠ Ce document décrit l'architecture ; il ne remplace pas un audit de conformité. Pour l'état de conformité détaillé (chiffrement, sessions, journalisation, contrôle d'accès) référé à un référentiel externe (OCIT), voir `docs/Audit_Conformite_Securite_OCIT_2026-09-10.md` — plusieurs non-conformités y sont documentées, certaines corrigées depuis (cf. `CLAUDE.md`).**

**Authentification — architecture réelle, pas celle du document d'origine.** L'authentification LDAP/AD dev + MFA propre à PGD (DUO/TOTP, `MfaService`/`TotpProvider`/`DuoProvider`) décrite dans la version précédente de ce document a été **entièrement retirée** (24/08/2026). L'architecture actuelle repose sur `KeycloakPort`, avec deux implémentations, sélection strictement serveur par `AUTH_PROVIDER` (jamais une tentative en cascade de l'une puis l'autre) :

- **`keycloak`** — `KeycloakDirectGrantProvider`, flux OAuth2 Direct Grant (`grant_type=password`) contre le royaume Keycloak réel. Keycloak résout identité **et** second facteur (DUO, déjà lié au royaume) en un seul échange — confirmé contre le vrai royaume le 09/09/2026 (le point `/token` bloque le temps de l'approbation Duo Mobile, puis renvoie le jeton directement).
- **`ad-api`** — `AdApiProvider`, appel REST direct à l'API AD réelle d'Orange CI, **mesure transitoire** (restaurée le 24/08/2026) en attendant que Keycloak soit confirmé définitivement opérationnel. **Ne déclenche aucun second facteur, pour aucun rôle** — y compris les rôles que `docs/09_Specifications_Fonctionnelles_PROD_v3.md` désigne explicitement comme exigeant une double authentification.
- **`AUTH_PROVIDER=ad-api` est le défaut actuel du schéma** (`packages/config/src/env.schema.ts`) — toute installation qui n'override pas explicitement vers `keycloak` hérite de cette absence de second facteur.

Session : JWT d'accès court (`JWT_EXPIRES_IN`, défaut 1h) signé + refresh token (7 j), store Redis pour révocation immédiate — vérifiée à **chaque** requête (pas seulement au refresh). `JWT_SECRET`/`REFRESH_TOKEN_SECRET` rotés le 17/08/2026 suite à une exposition dans l'historique Git (secrets de scaffold initial).

**Autorisation** — cf. §4.4. `RbacGuard` + guards de portée + `SodGuard`, tous strictement serveur.

**Non-répudiation** — `JOURNAL_AUDIT` et `JOURNAL_SECURITE` append-only (middleware Prisma qui rejette structurellement `update`/`delete`/`upsert` sur `JournalAudit`), rétention 10 ans (SOX). `JOURNAL_ACTIVITE` (§4.6) suit une politique distincte, plus courte, avec agrégation avant purge — ce n'est délibérément pas le même contrat que les deux autres.

**Anti-bruteforce** — `RateLimitService` (Redis), verrouillage après `RATE_LIMIT_LOGIN_MAX_TENTATIVES` échecs consécutifs (défaut 3) dans une fenêtre glissante, ne compte que les échecs.

**Autres constats de l'audit du 10/09/2026, à ne pas supposer résolus sans relecture du rapport dédié** — chiffrement au repos absent (aucune donnée sensible chiffrée en base), connexions sortantes majoritairement en clair (AD/Keycloak/Postgres/Redis/RabbitMQ, seul SMTP est en STARTTLS), pas de timeout de session par inactivité (TTL absolu), sessions concurrentes illimitées par compte.

---

## 6. Ports d'intégration

| Port | Adaptateur(s) | Rôle |
|---|---|---|
| `KeycloakPort` | `KeycloakDirectGrantProvider` (réel, cible) / `AdApiProvider` (réel, transitoire) — sélection par `AUTH_PROVIDER` | Authentification + résolution d'identité |
| `CrmPort` | `CrmImportService` (réel — import effectif des comptes/lignes/formules) | Registre client |
| `GedPort` | `GedStubAdapter` (bouchon — stockage disque local, `GED_STORAGE_PATH`, nom physique aléatoire) | Pièces justificatives |
| `SmtpPort` | `SmtpAdapter` (réel, STARTTLS + CA personnalisée — envoi live suspendu, CA racine manquante) / `SmtpStubAdapter` (journalise) — sélection par `SMTP_PROVIDER` | Notifications e-mail (6 types) |
| `SmsPort` | `SmsStubAdapter` (scaffolding, jamais câblé — aucune source de numéro sur `Utilisateur`) | Notifications SMS (non utilisé) |
| `BillingSiPort` | `BscsAdapter`/`GaiaAdapter` (bouchons), routés par circuit | Restitution du dégrèvement au SI |

Le basculement bouchon → réel, ou entre deux fournisseurs réels (`KeycloakPort`, `SmtpPort`), se fait par variable d'environnement, sans modifier les services consommateurs.

---

## 7. Décisions d'architecture (ADR)

| # | Décision | Motif |
|---|---|---|
| **ADR-01** | Monorepo pnpm + Turborepo | Types partagés sans publication, build incrémental, une seule CI |
| **ADR-02** | NestJS modulaire (Guards/Pipes/Interceptors) | Invariants de sécurité centralisés, services testables séparés du transport |
| **ADR-03** | PostgreSQL + Prisma | Intégrité relationnelle, transactions pour le claim, source de vérité |
| **ADR-04** | Redis double usage : cache de configuration invalidable et verrous distribués de claim — aucune fonction de file | Sépare l'état volatile à faible latence de l'acheminement fiable des messages |
| **ADR-05** | RabbitMQ comme broker de messages (exchange topic `pgd.events` + DLX) | Accusés, retry et dead-letter natifs pour la restitution SI et les escalades |
| **ADR-06** | Claim à double verrou (Redis `SET NX` + compare-and-set DB) | Sérialiser la contention sans sacrifier la source de vérité |
| **ADR-07** *(révisée)* | **Keycloak Direct Grant comme source unique d'authentification cible, `AdApiProvider` en coexistence transitoire** | Remplace l'ADR-07/ADR-08 d'origine (AD réel + `MfaProvider` DUO/TOTP propre à PGD) — mécanisme MFA propre retiré le 24/08/2026, Keycloak résout identité et second facteur en un seul échange ; la coexistence avec l'API AD reste une mesure d'attente, pas une architecture cible à deux fournisseurs permanents |
| **ADR-09** | Configuration pilotée par la donnée en base + cache | Révision de circuit sans redéploiement |
| **ADR-10** | Ports + bouchons pour GED/SMTP/BSCS/GAIA, CRM réel dès la Phase 3 | Isoler les externes non disponibles sans figer le cœur |
| **ADR-11** | Journaux append-only, trois journaux à contrats de rétention distincts | Non-répudiation (métier/sécurité, SOX 10 ans) sans imposer la même contrainte à un journal de supervision administrative (activité, six mois) |
| **ADR-12** | `packages/contracts` en Zod, source unique des types **et** de la documentation OpenAPI | Un seul endroit à modifier ; `docs/openapi.json` dérivé des mêmes schémas que la validation runtime, jamais un DTO Swagger resaisi à la main |
| **ADR-13** | `BillingSiPort` unique pour BSCS et GAIA | Idempotence et rejeu mutualisés, routage par circuit/univers |
| **ADR-14** | Consumers AMQP dans un process séparé (`apps/worker`) | L'API reste disponible même sous charge de jobs ; scaling indépendant par file |
| **ADR-15** | Fiches d'ajustement — abandon du rattachement à une ligne réelle (19/08/2026) | Décision métier confirmée : recherche par compte/case pour préremplir l'identité client, montant/formule redeviennent des champs de saisie libre ; R15/R17/R18/R19/R20 sans objet depuis |

---

## 8. Déploiement et exploitation

**Trois topologies de déploiement, pas une seule** :
- `docker-compose.prod.yml` — serveur unique, Postgres/Redis/RabbitMQ auto-hébergés dans le même compose, images applicatives tirées d'un registre (`DOCKER_REGISTRY`, dépendance externe encore en attente côté infrastructure Orange).
- `docker-compose.prod.build.yml` — variante sans registre (build local sur l'hôte de déploiement) ; **non symétrisée** avec la première (suppose toujours un hébergement Postgres/Redis/RabbitMQ externe, écart documenté et accepté).
- `docker/all-in-one/` — une seule image (API + Worker + Web + Redis interne dans le même conteneur, supervisé par `supervisord`), Postgres/RabbitMQ restent externes ; livrée en un seul fichier tar exportable.

**Conteneurisation** — Images multi-stage, utilisateur non-root, `HEALTHCHECK` explicite. Correctifs de sécurité appliqués et documentés (`CLAUDE.md`) : mise à jour `libgnutls30`, retrait de `npm`/`npx` du runtime, migration de l'image de base Node 20 → 24, `pnpm.overrides` (racine du monorepo) forçant les correctifs de plusieurs CVE transitives (multer, qs, sharp, postcss, nanoid, js-yaml et une dizaine d'outils de développement).

**Base** — Migrations Prisma versionnées, jamais de `db push` en recette/prod. Service de sauvegarde dédié (`docker/backup/`) : `pg_dump` quotidien, rétention locale 7 jours, copie distante optionnelle (`rclone`, destination non encore communiquée par l'infrastructure Orange à ce jour — sauvegarde locale seule tant qu'elle ne l'est pas).

**Réseau** — Connectivité vers Keycloak et/ou l'API AD réelle (selon `AUTH_PROVIDER`), le SI de facturation (BSCS/GAIA, bouchons à ce jour), et le relais SMTP interne (STARTTLS).

**Tests** — Unitaires/intégration contre Postgres/Redis/RabbitMQ réels (convention « tests contre référentiels », pas de mock pour l'infrastructure) · e2e HTTP réel (`supertest` contre l'app Nest complète, un fichier par circuit + un fichier générique) · pipeline CI (GitHub Actions, services réels, étape dédiée pour le claim concurrent).

---

## 9. Évolution vers la cible

Axes encore ouverts, tous documentés en détail (raisons, options envisagées, décisions en attente) dans `CLAUDE.md`, section « Questions ouvertes » : confirmation définitive de la disponibilité Keycloak avant retrait d'`AdApiProvider` (et, avec lui, la lacune MFA qu'il porte) ; remplacement des bouchons GED/BSCS/GAIA par les intégrations réelles ; reprise de la CA racine SMTP pour lever la suspension de l'envoi e-mail live ; seuils et rôles définitifs des fiches de subdélégation DOBB/DXC (bloque aujourd'hui toute soumission au-delà de 5 M FCFA sur ces deux circuits) ; clarification du mécanisme d'escalade (réaffectation manquante, automatique et manuelle) ; correctifs identifiés par l'audit de conformité OCIT du 10/09/2026, priorisés une fois le rapport complet revu.
