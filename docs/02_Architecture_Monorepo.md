# 02 — Architecture Monorepo (BMAD)

> **Projet :** PGD — Orange Côte d'Ivoire · **Version :** 2.0 · **Date :** 20 juillet 2026
> **Stack :** pnpm workspaces + Turborepo · NestJS · Next.js · Prisma · PostgreSQL · Redis (cache + verrous) · RabbitMQ (bus de messages) · Docker

---

## 1. Principes directeurs

1. **Règles métier externalisées** — matrice pivot, catalogue de rôles, motifs, paramètres de calcul, calendrier SLA, paliers de subdélégation : en base, cachés en Redis, servis par API. Jamais en dur.
2. **Ports et adaptateurs** — tout externe (AD, MFA, JADE, CRM, GED, SMTP, BSCS, GAIA) est derrière une interface stable. Le passage bouchon → réel est une variable d'environnement.
3. **Affectation par corbeille (pull)** — jamais de désignation nominative en routage nominal.
4. **Invariants de sécurité côté serveur uniquement** — Guards NestJS + transactions Prisma. Le frontend ne porte aucune décision d'autorisation.
5. **PostgreSQL source de vérité** — Redis est un reflet volatil intégralement reconstructible.
6. **Journaux append-only** — non-répudiation.
7. **Types partagés** — un seul package de contrats (Zod) consommé par le back et le front. Pas de duplication de DTO.

---

## 2. Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────────────┐
│  Utilisateur — Navigateur web (HTTPS)                                 │
└───────────────────────────────┬───────────────────────────────────────┘
                                │
┌───────────────────────────────┴───────────────────────────────────────┐
│  ENVIRONNEMENT DOCKER                                                  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  apps/web — Next.js (App Router, React, Tailwind)             │    │
│  │  Écrans : saisie 3 circuits · corbeille · fiche · circuit ·   │    │
│  │           admin · KPI · audit                                  │    │
│  └───────────────────────────┬──────────────────────────────────┘    │
│                              │ REST / JSON · Bearer + cookie session   │
│  ┌───────────────────────────┴──────────────────────────────────┐    │
│  │  apps/api — NestJS                                             │    │
│  │  Pipeline : Guards(Auth · Rbac · Sod) → Pipes(Zod)             │    │
│  │             → Interceptors(Audit · Logging) → Filters(Errors)  │    │
│  │  Modules : auth · demandes · lignes · workflow · rules ·       │    │
│  │            controle · audit · notifications · admin · kpi ·    │    │
│  │            sla · integration-si                                 │    │
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
│  └──────┬───────┘  │  RabbitMQ — exchange topic `pgd.events`    │    │
│         └──────────┤  q.locks-sweeper · q.sla-escalation ·      │    │
│                    │  q.notifications · q.si-push  (+ DLX)      │    │
│                    └────────────────────────────────────────────┘    │
└────────────────────────────┬───────────────────────────────────────────┘
                             │ ports (interfaces stables)
        ┌────────────────────┼────────────────────────┐
        │                    │                        │
┌───────┴────────┐  ┌───────┴────────┐  ┌───────────┴──────────┐
│ INTERNES        │  │ SÉCURITÉ        │  │ EXTERNES              │
│ JADE (CASES)    │  │ Active Directory│  │ BSCS  (dégrèvement)   │
│ GED (documents) │  │ MFA : DUO       │  │ GAIA  (dégrèvement)   │
│ CRM (clients)   │  │       TOTP      │  │ SMTP  (mails)         │
└─────────────────┘  └─────────────────┘  └──────────────────────┘
   [bouchons ph.1]      [réels ph.1]         [bouchons ph.1]
```

**Alignement sur le schéma technique source :** RabbitMQ est le broker de messages (décision D2 de la charte, révisée). Redis conserve deux usages — cache invalidable de configuration et verrous distribués de claim (`SET NX`) — mais n'assure plus de fonction de file. Les deux responsabilités sont ainsi séparées : Redis pour l'état volatile à faible latence, RabbitMQ pour l'acheminement fiable des messages (accusés, retry, dead-letter).

---

## 3. Arborescence du monorepo

```
pgd/
├── package.json                    # workspaces pnpm + scripts Turborepo
├── pnpm-workspace.yaml
├── turbo.json
├── docker-compose.yml              # postgres · redis · rabbitmq · api · worker · web
├── docker-compose.override.yml     # dev (hot reload, ports exposés)
├── .env.example
├── CLAUDE.md                       # contexte permanent du dépôt
├── README.md
│
├── apps/
│   ├── api/                        # NestJS — API REST
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── common/
│   │   │   │   ├── guards/         auth.guard.ts · rbac.guard.ts · sod.guard.ts
│   │   │   │   ├── interceptors/   audit.interceptor.ts · logging.interceptor.ts
│   │   │   │   ├── pipes/          zod-validation.pipe.ts
│   │   │   │   ├── filters/        http-exception.filter.ts
│   │   │   │   └── decorators/     roles.decorator.ts · current-user.decorator.ts · idempotent.decorator.ts
│   │   │   ├── infra/
│   │   │   │   ├── prisma/         prisma.module.ts · prisma.service.ts
│   │   │   │   ├── redis/          redis.module.ts · cache.service.ts · lock.service.ts · session.store.ts
│   │   │   │   └── messaging/      rabbitmq.module.ts · publisher.service.ts (producers AMQP)
│   │   │   └── modules/
│   │   │       ├── auth/           ldap.provider · mfa/{duo,totp}.provider · session.service
│   │   │       ├── demandes/       demandes.service · montant.service · reference.service
│   │   │       ├── lignes/         lignes.service · formules.service  ← lot 2
│   │   │       ├── workflow/       taches.controller · claim.service · escalation.service
│   │   │       ├── rules/          rule-engine.service · config.repository
│   │   │       ├── controle/
│   │   │       ├── audit/          audit.service (append-only) · export.service
│   │   │       ├── notifications/
│   │   │       ├── admin/          circuits · roles · motifs · parametres · calendrier-sla · paliers · modules
│   │   │       ├── kpi/
│   │   │       ├── sla/            sla.service (heures ouvrées)
│   │   │       └── integration-si/ billing-si.port · bscs.adapter · gaia.adapter  ← lot 2
│   │   └── test/                   e2e
│   │
│   ├── worker/                     # NestJS standalone — consumers AMQP (RabbitMQ)
│   │   └── src/processors/         locks-sweeper · sla-escalation · notifications · si-push
│   │
│   └── web/                        # Next.js — App Router
│       ├── app/
│       │   ├── (auth)/login
│       │   ├── (app)/
│       │   │   ├── demandes/nouvelle       # écran « Nouvelle demande » (lot 2)
│       │   │   ├── demandes/[id]
│       │   │   ├── corbeille
│       │   │   ├── admin/{circuits,paliers,roles,motifs,parametres,calendrier}
│       │   │   ├── kpi
│       │   │   └── audit
│       │   └── layout.tsx
│       ├── components/
│       │   ├── demande/  RechercheNd · SelecteurLignes · SelecteurFormule · BadgeStatutLigne · ApercuRoutage
│       │   ├── corbeille/ ListeTaches · BoutonClaim
│       │   └── ui/       (design system)
│       └── lib/          api-client.ts · hooks/
│
├── packages/
│   ├── contracts/                  # Zod schemas + types TS — SOURCE UNIQUE
│   │   └── src/{demande,ligne,formule,tache,role,palier,si,kpi,audit}.ts
│   ├── database/                   # Prisma
│   │   ├── prisma/schema.prisma
│   │   ├── prisma/migrations/
│   │   └── prisma/seed/            circuits · paliers · roles · motifs · pieces · sla · kpi · referentiels · demo
│   ├── config/                     # env (validation Zod), constantes, énumérations
│   └── ui/                         # composants partagés + tokens de charte
│
└── docs/                           # livrables BMAD 00 → 07
    └── design/                     # maquette Claude Design exportée (modulaire)
                                    #   README.md      provenance, export, fichiers écartés
                                    #   DIVERGENCES.md écarts maquette/PRD tranchés
                                    #   app · ui · screens1-4 · screens_auth  → référence visuelle
                                    #   styles.css                            → source des tokens
                                    #   engine · data                         → simulation, JAMAIS portée
                                    #   tweaks-panel                          → hors périmètre
                                    #   _shots/                               → captures
                                    #   non compilé, hors build
```

**Règles de dépendance :** `apps/*` dépendent de `packages/*`. `packages/*` ne dépendent jamais de `apps/*`. `packages/contracts` ne dépend de rien d'autre que Zod. Aucune dépendance croisée entre `apps/`.

---

## 4. Moteur de règles et workflow

### 4.1 Routage à la soumission

`RuleEngineService` lit cinq variables — `circuit`, `segment`, `sous_flux`, `montant TTC`, `type_acteur` — et produit une chaîne ordonnée de tâches. Dans une **transaction Prisma unique** :

1. Calcul du TTC (agrégé sur les lignes retenues — `SF-PGD-031`).
2. Sélection du **palier** : `CONFIGURATION_CIRCUIT` où `circuit` correspond et `borne_min ≤ TTC ≤ borne_max` (cache Redis, rechargé de PostgreSQL si absent).
3. Lecture des `ETAPE_REGLE` ordonnées.
4. Instanciation d'une `TACHE` par étape — la première en `EN_CORBEILLE`, les suivantes en `EN_ATTENTE` ; les tâches de contrôle (type `C`) en `POST_CLOTURE`.
5. Si `TTC > 5 000 000` : instanciation obligatoire de l'étape de contrôle **FRA** (`R12`).
6. Calcul de l'échéance SLA de la première étape en heures ouvrées.
7. Écriture du journal d'audit.

### 4.2 Claim — double verrou

```
(a) Redis  : SET lock:tache:{id} {userId} NX PX {ttl}   → absorbe la contention
(b) Postgres (transaction, source de vérité) :
      UPDATE tache
      SET etat='RECLAMEE', agent_claim=:user, date_claim=now(),
          verrou_expire_at = now() + interval ':lock hours'
      WHERE id=:taskId AND etat='EN_CORBEILLE'
      RETURNING id;
(c) Aucune ligne retournée → 409 Conflict + libération du verrou Redis
```

Cycle : `EN_ATTENTE → EN_CORBEILLE → RECLAMEE → APPROUVEE | REJETEE`. L'`unclaim` ramène en `EN_CORBEILLE`.

### 4.3 Messagerie asynchrone — RabbitMQ

**Topologie.** Un exchange `topic` durable `pgd.events` ; quatre files durables liées par routing key ; un exchange `pgd.dlx` (dead-letter) avec la file `q.dead-letter` pour tout message rejeté ou ayant épuisé ses tentatives.

| File | Routing key | Déclencheur | Action |
|---|---|---|---|
| `q.locks-sweeper` | `lock.sweep` | Ordonnanceur `@Cron` (5 min) dans `apps/worker`, qui publie l'ordre | Tâches `RECLAMEE` avec `verrou_expire_at < now()` sans décision → `EN_CORBEILLE` + journal |
| `q.sla-escalation` | `sla.check` | Ordonnanceur `@Cron` (15 min) | Tâches `EN_CORBEILLE` avec `echeance_sla < now()` → corbeille N+1, `niveau_escalade++`, journal + notification |
| `q.notifications` | `notification.*` | Événement métier publié par l'API | Émission in-app + SMTP (bouchon) |
| `q.si-push` | `si.push` | Validation finale + rejeu manuel | Appel `BillingSiPort`, transition d'état SI, idempotence par `si_idempotency_key`, journal |

**Garanties.** Publication `persistent` (delivery mode 2) et `publisher confirms` côté API ; consommation en `ack` manuel après commit de la transaction Prisma, `prefetch = 1` sur `q.si-push` pour sérialiser les appels au SI. Retry par requeue avec back-off exponentiel plafonné à 5 tentatives, puis routage vers `pgd.dlx`. La `q.dead-letter` est supervisée : tout message y arrivant lève une alerte.

**Idempotence des consumers.** Aucun consumer ne présume une livraison unique (RabbitMQ garantit *at-least-once*). Chaque traitement est protégé soit par une mise à jour conditionnelle SQL, soit par la clé d'idempotence dédiée (`si_idempotency_key` pour `q.si-push`).

**Ordonnancement.** Les déclenchements périodiques restent portés par `@nestjs/schedule` dans `apps/worker`, qui publie un message plutôt que d'exécuter le traitement en ligne — ce qui préserve le retry et la dead-letter pour les jobs cron.

### 4.4 SoD

`SodGuard` s'exécute avant toute approbation et vérifie qu'aucune action de l'agent courant n'existe sur l'étape N-1 du même dossier (requête sur `JOURNAL_AUDIT`). Violation → `403` journalisé. Strictement serveur.

### 4.5 Configuration sans redéploiement

Matrice, catalogue, paliers et référentiels sont en base, exposés en cache Redis par `ConfigRepository`. Une révision est une écriture via les endpoints `admin` qui **invalide la clé de cache** correspondante ; le moteur reprend la nouvelle configuration sans redéploiement ni redémarrage.

---

## 5. Sécurité

**Authentification** — Étape 1 : `LdapProvider` valide `prenom.nom@orange.ci` + mot de passe contre l'AD réel. Étape 2 : `MfaProvider` (interface) déclenche selon la politique de rôle et la préférence utilisateur soit `DuoProvider` (push / passcode), soit `TotpProvider` (code 6 chiffres / 30 s, hors ligne). Session : **JWT court** signé (cookie httpOnly + secure) + **refresh token**, store Redis pour révocation immédiate. Re-challenge MFA à la bascule vers un rôle sensible.

**Autorisation** — `RbacGuard` applique le RBAC par route et par action selon le catalogue (`@Roles()`). Un valideur ne voit que ses corbeilles ; un initiateur ne valide pas.

**Non-répudiation** — `JOURNAL_AUDIT` et `JOURNAL_SECURITE` append-only, aucun `UPDATE`/`DELETE` applicatif. Rétention 10 ans.

**Autres** — Rate limiting et anti-bruteforce Redis · secrets hors code · HTTPS partout · données financières jamais en query string · logs d'audit sur connexion, MFA et actions sensibles.

---

## 6. Ports d'intégration

| Port | Adaptateur phase 1 | Rôle |
|---|---|---|
| `LdapPort` | **Réel** | Authentification + résolution groupes AD |
| `MfaPort` | **Réel** (`DuoProvider`, `TotpProvider`) | Second facteur |
| `JadePort` | Bouchon | Récupération des CASES |
| `CrmPort` | Bouchon | Registre client : comptes, lignes (ND), formules, statuts |
| `GedPort` | Bouchon (stockage local/objet) | Pièces justificatives |
| `SmtpPort` | Bouchon (journalise) | Notifications e-mail |
| `BillingSiPort` | Bouchon (`BscsAdapter`, `GaiaAdapter`) | Restitution du dégrèvement au SI |

Le basculement bouchon → réel se fait par variable d'environnement, sans modifier les services consommateurs.

---

## 7. Décisions d'architecture (ADR)

| # | Décision | Motif |
|---|---|---|
| **ADR-01** | Monorepo pnpm + Turborepo | Types partagés sans publication, build incrémental, une seule CI |
| **ADR-02** | NestJS modulaire (Guards/Pipes/Interceptors) | Invariants de sécurité centralisés, services testables séparés du transport |
| **ADR-03** | PostgreSQL + Prisma | Intégrité relationnelle, transactions pour le claim, source de vérité |
| **ADR-04** | Redis double usage : cache de configuration invalidable et verrous distribués de claim (`SET NX`) — aucune fonction de file | Sépare l'état volatile à faible latence de l'acheminement fiable des messages |
| **ADR-05** | **RabbitMQ retenu comme broker de messages** (exchange topic `pgd.events` + DLX) | Aligné sur le schéma technique cible ; accusés, retry et dead-letter natifs pour la restitution SI et les escalades ; ouvre le routage inter-applicatif futur |
| **ADR-06** | Claim à double verrou (Redis `SET NX` + compare-and-set DB) | Sérialiser la contention sans sacrifier la source de vérité |
| **ADR-07** | AD réel + MFA réel dès la phase 1 | Sécurité non simulée pour les rôles sensibles |
| **ADR-08** | **`MfaProvider` à deux implémentations (DUO + TOTP)** | Répond au risque d'indisponibilité DUO ; TOTP fonctionne hors ligne |
| **ADR-09** | Configuration pilote-données en base + cache | Révision de circuit sans redéploiement |
| **ADR-10** | Ports + bouchons pour JADE/CRM/GED/SMTP/BSCS/GAIA | Isoler les externes non disponibles sans figer le cœur |
| **ADR-11** | Journaux append-only | Non-répudiation, conformité SOX |
| **ADR-12** | `packages/contracts` en Zod, source unique des types | Un seul endroit à modifier ; validation runtime alignée sur les types statiques |
| **ADR-13** | **`BillingSiPort` unique pour BSCS et GAIA** | Idempotence et rejeu mutualisés, routage par circuit/univers |
| **ADR-14** | Consumers AMQP dans un process séparé (`apps/worker`) | L'API reste disponible même sous charge de jobs ; scaling indépendant par file |
| **ADR-15** | Build/buy orchestration : option **build** (NestJS) | Décision comité projet à confirmer ; l'externalisation des règles limite le coût d'une bascule BPM ultérieure |

---

## 8. Déploiement et exploitation

**Conteneurisation** — Tous les services sous Docker. `docker-compose.yml` orchestre `postgres`, `redis`, `rabbitmq` (image `rabbitmq:3-management`, console 15672 en dev), `api`, `worker`, `web`. Images multi-stage, non-root. La topologie AMQP (exchanges, files, bindings, DLX) est déclarée au démarrage du worker et versionnée dans le code — jamais créée à la main dans la console.

**Base** — Migrations Prisma versionnées, jamais de `db push` en recette/prod. Sauvegardes RPO ≤ 1 h, rétention 10 ans. Extension `btree_gist` requise (anti-chevauchement des paliers).

**Redis** — Instance dédiée. Persistance activée pour les files ; le cache et les verrous restent reconstructibles.

**Réseau** — Connectivité vers l'AD (LDAP/LDAPS), l'API MFA, et à terme JADE/CRM/GED/SMTP/BSCS/GAIA.

**Observabilité** — Logs structurés (Interceptor), latence p95, profondeur des files RabbitMQ et taux de messages non acquittés, alerte sur remplissage de `q.dead-letter`, sur taux d'erreur et sur indisponibilité AD/MFA/RabbitMQ.

**Tests** — Unitaires (services, moteur de règles, calcul SLA en heures ouvrées) · intégration (transactions de claim sous concurrence, consumers AMQP sur RabbitMQ éphémère via Testcontainers) · e2e (contrats d'API) · charge (claim concurrent).

---

## 9. Évolution vers la cible

Trois axes : remplacer les bouchons (JADE, CRM, GED, SMTP, BSCS, GAIA) par les intégrations réelles sans toucher au cœur ; acter build vs buy pour l'orchestration ; cadrer la reprise de données (dossiers en cours, archivage légal, purge/anonymisation) et formaliser la procédure de repli MFA avec la sécurité. L'architecture modulaire et les ports sont conçus pour absorber ces évolutions sans réécrire la logique métier.
