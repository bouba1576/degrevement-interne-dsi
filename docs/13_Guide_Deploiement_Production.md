# Guide de déploiement production — PGD

Document opérationnel, pas un livrable BMAD. Rédigé à partir de l'état réel du
dépôt (`docker-compose.prod.yml`, `.env.prod.example`, les trois Dockerfiles,
`packages/config/src/env.schema.ts`) — chaque commande citée existe déjà dans
ce dépôt, rien n'est inventé. Les points non confirmés dans ce dépôt sont
marqués explicitement comme tels plutôt que devinés.

**Kubernetes n'est pas couvert ici** — ce guide décrit un déploiement Docker
Compose sur un serveur unique (`docker-compose.prod.yml`).

> **Note (19/08/2026) — le §3 ci-dessous décrit une architecture différente
> de celle retenue.** Il présuppose PostgreSQL/Redis/RabbitMQ hébergés en
> externe ; l'architecture réelle confirmée héberge ces trois services sur
> le même serveur unique que les applications, directement dans
> `docker-compose.prod.yml` (services `postgres`/`redis`/`rabbitmq`, volumes
> nommés pour la persistance). Le diagramme du §0 et le §3 n'ont pas été
> réécrits en conséquence — cf. `CLAUDE.md`, section « `docker-compose.prod.yml`
> — Postgres/Redis/RabbitMQ auto-hébergés » pour l'architecture à jour,
> avant de suivre les instructions plus bas dans ce document.

---

## 0. Vue d'ensemble

Trois images applicatives (`pgd-api`, `pgd-worker`, `pgd-web`), construites
depuis `apps/{api,worker,web}/Dockerfile`, déployées via
`docker-compose.prod.yml` qui les référence par tag — **jamais de `build:`
sur le serveur de déploiement**. Trois dépendances externes non fournies par
ce fichier compose : PostgreSQL 16, Redis 7, RabbitMQ 3 (management).

```
┌─────────────┐      ┌──────────────┐      ┌───────────────┐
│  pgd-web     │ HTTP │  pgd-api     │      │  pgd-worker    │
│  (Next.js)   │─────▶│  (NestJS)    │      │  (NestJS)      │
└─────────────┘      └──────┬───────┘      └───────┬────────┘
                             │                       │
                    ┌────────┼───────────────────────┼────────┐
                    │        ▼                       ▼        │
                    │  PostgreSQL 16   Redis 7   RabbitMQ 3    │
                    │  (externe — hébergement non confirmé)    │
                    └───────────────────────────────────────────┘
```

`pgd-web` ne parle jamais directement à Postgres/Redis/RabbitMQ — uniquement
à `pgd-api` en HTTP, via l'URL publique inlinée au build (§2).

---

## 1. Prérequis serveur

- Docker Engine + Docker Compose v2 (`docker compose`, pas `docker-compose`
  v1 — `docker-compose.prod.yml` utilise la syntaxe Compose Specification).
- Accès réseau **sortant** vers : le registre d'images (§2), PostgreSQL,
  Redis, RabbitMQ, l'AD réel Orange CI, l'API DUO.
- Ports à exposer selon la topologie retenue (reverse proxy ou exposition
  directe — non tranché dans ce dépôt) :
  - `3000` — `pgd-api`
  - `3001` — `pgd-web`
  - `3002` — `pgd-worker` (health check uniquement, pas une route utilisateur)
- **Dimensionnement serveur (CPU/RAM/disque) : non spécifié dans ce dépôt.**
  Aucune source ne fixe de recommandation — à établir séparément, pas deviné
  ici.

---

## 2. Construire et pousser les trois images

**Deux fichiers compose, deux façons de fournir les images — choisir l'un
des deux, jamais les deux sur le même hôte :**

| | `docker-compose.prod.yml` | `docker-compose.prod.build.yml` |
|---|---|---|
| Source de l'image | Registre (`DOCKER_REGISTRY`/`IMAGE_TAG`, §4) | `build:` local depuis les Dockerfiles |
| Prérequis sur l'hôte | Le fichier compose + `.env.prod` seuls | Le dépôt complet (`git clone`/`pull` — `build.context: .` a besoin des Dockerfiles et de tout ce qu'ils `COPY`) |
| `NEXT_PUBLIC_API_URL` | Fournie au pipeline de build externe, jamais dans `.env.prod` (§ ci-dessous) | Fournie dans `.env.prod` — ce fichier construit l'image lui-même |
| Temps de déploiement | `docker pull` (rapide) | Rebuild complet à chaque déploiement (~2 min/service, constaté en vérification) |
| Dépendance au registre Nexus (§0, point non confirmé) | Oui | Non — contourne entièrement cette question ouverte |

Cette section (§2) décrit la variante **registre**. Pour la variante
**build local**, cf. l'en-tête de `docker-compose.prod.build.yml` (même
niveau de détail) et lancer simplement :

```bash
git clone <ce dépôt> /opt/pgd && cd /opt/pgd
docker compose -f docker-compose.prod.build.yml --env-file .env.prod up -d --build
```

Le reste de cette section (§2) ne s'applique qu'à la variante registre —
**ne pas construire sur le serveur de déploiement** dans ce cas :
`docker-compose.prod.yml` n'a pas de directive `build:`, il attend des
images déjà poussées vers un registre.

```bash
# apps/api et apps/worker n'ont aucun ARG de build — inchangé.
docker build -f apps/api/Dockerfile    -t <registre>/pgd-api:<tag>    .
docker build -f apps/worker/Dockerfile -t <registre>/pgd-worker:<tag> .

# apps/web EXIGE NEXT_PUBLIC_API_URL au build — voir avertissement ci-dessous.
docker build -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://<url-publique-de-pgd-api> \
  -t <registre>/pgd-web:<tag> .

docker push <registre>/pgd-api:<tag>
docker push <registre>/pgd-worker:<tag>
docker push <registre>/pgd-web:<tag>
```

### ⚠️ `NEXT_PUBLIC_API_URL` — obligatoire à CE moment précis, jamais après

Next.js inline `NEXT_PUBLIC_API_URL` dans le bundle **client** au moment de
`next build` (`apps/web/lib/api.ts:116`) — jamais relu à l'exécution du
conteneur. `apps/web/Dockerfile` déclare `ARG NEXT_PUBLIC_API_URL` dans son
stage `build` précisément pour ce besoin. Conséquences concrètes :

- La définir dans `.env.prod` ou dans `docker-compose.prod.yml` (`environment:`)
  **n'a strictement aucun effet** — l'image tourne déjà avec un bundle figé.
- L'omettre au `docker build` fait retomber silencieusement le bundle sur
  `http://localhost:3000` (défaut codé en dur) — l'application semblera
  fonctionner en local puis échouera pour tout utilisateur réel.
- Si l'URL publique de `pgd-api` change un jour, **il faut reconstruire et
  repousser l'image `pgd-web`** — un changement de configuration au lancement
  ne suffit jamais.

**Registre d'images (`<registre>` ci-dessus) : non confirmé dans ce dépôt.**
Aucune source ne documente le pipeline réel qui construit et pousse ces
images vers Nexus (question ouverte, cf. `CLAUDE.md`, section « Sécurité —
vulnérabilités CRITICAL des images Docker »). À obtenir séparément avant de
suivre cette section telle quelle.

---

## 3. Dépendances externes — PostgreSQL, Redis, RabbitMQ

**Hébergement non confirmé dans ce dépôt** — `docker-compose.prod.yml` ne
fournit délibérément aucun de ces trois services (contrairement à
`docker-compose.yml`, dev, qui les auto-héberge). Ce qui est vérifié et
requis, quelle que soit la solution d'hébergement retenue :

| Service | Version minimale connue | Ce que l'application exige |
|---|---|---|
| PostgreSQL | 16 (`docker-compose.yml`, dev) | Une base dédiée, extension `pg_trgm` activée (recherche compte client, cf. CLAUDE.md « Index de performance ») |
| Redis | 7 (`docker-compose.yml`, dev) | Aucune persistance stricte requise — cache de configuration + verrous de claim, reconstructible (règle non négociable 4) |
| RabbitMQ | 3-management (`docker-compose.yml`, dev) | Un vhost dédié (`RABBITMQ_VHOST`), plugin management activé si supervision voulue |

Aucune de ces trois instances ne doit être partagée avec un environnement de
dev/recette — en particulier `JWT_SECRET`/`REFRESH_TOKEN_SECRET` (§4)
permettraient de forger des sessions valides sur l'autre environnement en cas
de fuite croisée si la même clé était réutilisée avec la même base.

---

## 4. Configuration — `.env.prod`

Copier `.env.prod.example` vers `.env.prod` (jamais commité — déjà dans
`.gitignore` au même titre que `.env`). Chaque variable y est documentée
avec sa contrainte réelle (schéma Zod, `packages/config/src/env.schema.ts`).

Points qui exigent une action, pas une simple copie :

- **Tous les secrets** (`JWT_SECRET`, `REFRESH_TOKEN_SECRET`) : générer avec
  `openssl rand -hex 32`, une valeur **distincte** de tout environnement de
  dev/recette, jamais copiée d'un exemple.
- `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_*` : vers les instances du §3.
- `KEYCLOAK_BASE_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`,
  `KEYCLOAK_CLIENT_SECRET` : royaume Keycloak réel — **SOURCE UNIQUE**
  d'authentification (identité et second facteur DUO, tous deux résolus côté
  Keycloak — décision actée le 24/08/2026, `MfaService`/`TotpProvider`/
  `DuoProvider` et tout le mécanisme `mfaMethode` retirés côté PGD le même
  jour, cf. `CLAUDE.md` « Architecture Keycloak — source unique »).
  `LdapPort`/`LdapProvider`/`AdApiProvider` et toute leur configuration
  (`LDAP_*`/`AD_API_*`) sont retirés aussi — Keycloak est le seul point
  d'authentification, sans exception. **Reste à confirmer avant un
  déploiement réel** : la forme exacte de la résolution DUO dans l'échange
  `/token` (cf. `CLAUDE.md`, même section) — un essai réel avec un compte DUO
  actif, fait personnellement par la personne pilotant le projet, doit
  trancher avant de considérer l'authentification pleinement fonctionnelle
  en prod pour les comptes concernés par DUO.
- `CORS_ORIGIN` : URL publique exacte de `pgd-web` (le cookie de session
  utilise `credentials: true`, une origine inexacte casse l'authentification
  silencieusement côté navigateur).
- `DOCKER_REGISTRY`, `IMAGE_TAG` : lues uniquement par `docker-compose.prod.yml`
  lui-même (jamais par l'application) — cf. §2.

`docker-compose.prod.yml` échoue explicitement (`${VAR:?message}`) si l'une
des variables sans défaut sûr est absente — pas de démarrage silencieux avec
une configuration incomplète.

---

## 5. Base de données — migrations et données de référence

### 5.1 Migrations

```bash
DATABASE_URL=<url_prod> pnpm --filter @pgd/database exec prisma migrate deploy
```

(`pnpm db:migrate` en local fait exactement ceci.) `migrate deploy`, jamais
`migrate dev` — non interactif, n'invente jamais de migration, échoue
proprement si l'historique de migrations ne correspond pas.

### 5.2 Données de référence — ⚠️ ne pas lancer `pnpm db:seed` tel quel

`pnpm db:seed` (`packages/database/prisma/seed/index.ts`) exécute **deux
choses dans le même script**, sans option pour les séparer aujourd'hui :

1. Les référentiels réels (circuits, rôles, paliers, motifs, sous-flux,
   calendrier SLA, etc.) — **nécessaires** en production.
2. `seedDemo()` — un jeu de données de **démonstration fictif** (comptes
   `CPT-DOBB-0001`/`CPT-DXC-0001`/`CPT-DF-0001`, clients inventés) — **jamais
   approprié en production**.

Avant tout premier déploiement réel, soit commenter l'appel à `seedDemo(prisma)`
dans `packages/database/prisma/seed/index.ts` pour ce run précis, soit
scinder le script en deux commandes distinctes (référentiels seuls / démo).
**Non fait dans ce dépôt à ce jour** — à traiter avant la première mise en
production, pas après coup une fois des comptes fictifs déjà en base.

### 5.3 Premier compte administrateur — aucun chemin UI ne le permet

Trouvaille importante, à anticiper : une base fraîchement migrée + seedée
(référentiels réels, sans démo) ne contient **aucune ligne `Utilisateur`**.
Or `RbacResolutionService.resoudre()` (Temps 2, cf. `CLAUDE.md` section
« Pré-enregistrement des utilisateurs AD ») refuse la connexion à quiconque
n'a pas déjà ≥1 `MembreRole` — **y compris un futur administrateur**. L'écran
d'administration « Utilisateurs » (qui sert normalement à pré-enregistrer un
compte) est lui-même une route protégée par `ADMIN_PGD` : personne ne peut
s'y connecter pour créer le tout premier compte.

Il n'existe aujourd'hui aucune route ni aucun seed pour ce cas précis.
`apps/api/scripts/bootstrap-premier-admin.ts` — script opérationnel
**permanent** (pas un jetable "-tmp", à conserver dans le dépôt) — comble ce
trou : mêmes contraintes que le pré-enregistrement normal (identifiantAd réel
de l'AD cible, mêmes validations Zod que l'API —
`preEnregistrerUtilisateurRequeteSchema`, `@pgd/contracts`). Simplifié le
24/08/2026 (retrait du mécanisme MFA côté PGD) : ce script ne fait plus que
créer le compte et le rôle `ADMIN_PGD` — Keycloak gère l'intégralité de
l'authentification (identité et second facteur), rien à enrôler côté PGD.

```bash
pnpm --filter @pgd/api exec ts-node --compiler-options '{"module":"commonjs"}' \
  scripts/bootstrap-premier-admin.ts \
  --identifiant <identifiant_ad_reel> \
  --nom "<nom>"
```

S'il n'y a rien à faire (le compte existe déjà), le script le dit
explicitement plutôt que d'échouer silencieusement.

Une fois ce premier compte créé, tout pré-enregistrement suivant peut passer
par l'écran d'administration normal (recherche annuaire ou saisie manuelle)
ou par `apps/api/scripts/enrolement-comptes.ts` pour un lot (même mécanisme,
`--fichier <chemin.json>`, format décrit par
`apps/api/scripts/exemple-comptes.json`).

---

## 6. Lancement

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Vérifier l'état des trois conteneurs :

```bash
docker compose -f docker-compose.prod.yml ps
```

Chaque image porte un `HEALTHCHECK` natif (Dockerfiles) — l'état `healthy`
apparaît dans `docker ps`/`docker compose ps` sans commande supplémentaire.

---

## 7. Vérification post-déploiement

```bash
# Liveness — chaque service répond sans dépendance externe
curl -f https://<url-api>/api/health
curl -f https://<url-worker-interne>:3002/health   # généralement pas exposé publiquement
curl -f https://<url-web>/login

# Readiness — confirme les connexions réelles (Postgres/Redis/RabbitMQ/
# Keycloak — identité ET second facteur, un seul champ `ad` couvre les deux
# depuis le 24/08/2026)
curl -s https://<url-api>/api/health/ready
# Attendu : {"data":{"statut":"ok","services":{"postgresql":true,"redis":true,
#            "rabbitmq":true,"ad":true}, ...}}
# "degrade" sur un des services signale une dépendance externe injoignable —
# ne pas considérer le déploiement terminé tant que "statut" n'est pas "ok".
```

Puis un parcours de connexion réel avec le premier compte admin créé au §5.3,
jusqu'à l'écran d'administration — seule vérification qui confirme que
Keycloak (identité + DUO, pas seulement `health/ready`) fonctionne de bout en
bout.

---

## 8. Retrait du mécanisme MFA côté PGD (24/08/2026)

`MfaService`/`TotpProvider`/`DuoProvider` et tout le mécanisme `mfaMethode`
(colonnes `Utilisateur.mfaMethode`/`totpSecret`/`totpActiveLe`, variables
`DUO_*`/`TOTP_*`) sont retirés — confirmé par la personne pilotant le projet
comme à retirer, pas à conserver en dormance, cf. `CLAUDE.md` « Architecture
Keycloak — source unique ». Keycloak gère l'intégralité du second facteur ;
la mesure d'urgence « bascule MFA » qui occupait cette section (§8, avant le
24/08/2026) n'a donc plus d'objet — il n'existe plus de bascule DUO↔TOTP côté
PGD à effectuer en cas d'indisponibilité DUO, cette question relève
désormais entièrement de la configuration du royaume Keycloak.

`bootstrap-premier-admin.ts`/`enrolement-comptes.ts` restent les deux
scripts opérationnels **permanents** pour créer des comptes (§5.3) — ils ne
gèrent plus aucun secret ni QR, seulement le compte et ses rôles.

---

## 9. Rotation et exploitation

- **Nouvelle version** : reconstruire et pousser les images (§2, avec
  `NEXT_PUBLIC_API_URL` inchangé sauf si l'URL publique change réellement),
  puis `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d`
  avec un `IMAGE_TAG` mis à jour dans `.env.prod`.
- **Migrations** : toujours `prisma migrate deploy` avant de redémarrer les
  conteneurs applicatifs sur une nouvelle version qui en dépend — jamais
  l'inverse (une image plus récente attendant un schéma pas encore migré).
- **Rotation de secrets** (`JWT_SECRET`/`REFRESH_TOKEN_SECRET` — `TOTP_ENCRYPTION_KEY`
  n'existe plus depuis le retrait du mécanisme MFA côté PGD, 24/08/2026) :
  suivre exactement la procédure déjà exécutée et documentée dans `CLAUDE.md`
  (section « Incident — secrets exposés dans l'historique Git ») —
  génération, mise à jour de `.env.prod`, `docker compose ... up -d
  --force-recreate` (jamais un simple `restart`, qui ne relit pas
  l'interpolation `.env`).
- **`docs/openapi.json`** : artefact versionné (committé), pas régénéré à la
  demande — régénérer après tout changement de contrat/contrôleur qui
  affecte une route documentée, avant de commiter (cf. `CLAUDE.md`, Phase
  10.5). Depuis l'hôte :
  ```bash
  # PowerShell — charger .env dans le process, puis exporter via cmd (le
  # parseur d'arguments de pnpm.ps1 mangle --compiler-options {"module":...}
  # différemment de pnpm.cmd/bash) :
  Get-Content .env | ForEach-Object { ... }   # cf. CLAUDE.md pour la boucle complète
  cd apps/api
  cmd /c 'npx ts-node --compiler-options "{\"module\":\"commonjs\"}" scripts/export-openapi.ts'
  ```
  Vérifier après coup que les routes attendues sont présentes (et les
  routes retirées, absentes) plutôt que supposer la régénération correcte.
- **Recréer les conteneurs dev après un changement de dépendances/contrat**
  (`docker compose up -d --force-recreate api worker web`, jamais un simple
  `restart` — cf. incident déjà documenté dans `CLAUDE.md`) : nécessaire
  après tout changement de `package.json` ou de variables d'environnement
  lues par `packages/config`. Un simple retrait de dépendances (jamais un
  ajout) ne demande pas de `pnpm install` supplémentaire dans le conteneur —
  vérifié en direct, 24/08/2026.
- **Logs** : `docker compose -f docker-compose.prod.yml logs -f <service>`.
  Aucune agrégation centralisée n'est configurée dans ce dépôt — à mettre en
  place séparément si nécessaire.

---

## Récapitulatif des points non confirmés dans ce dépôt

À obtenir/trancher avant un déploiement réel, pas devinés ici :

1. Registre Docker réel et pipeline qui y pousse les images (§2) — **sans
   objet si `docker-compose.prod.build.yml` est retenu** (build local,
   aucun registre requis).
2. Hébergement réel de PostgreSQL/Redis/RabbitMQ (§3).
3. Forme exacte de la résolution DUO dans l'échange Keycloak `/token` (§4 et
   `CLAUDE.md` « Architecture Keycloak — source unique ») — un essai réel
   avec un compte DUO actif, fait personnellement par la personne pilotant
   le projet, doit trancher avant un déploiement réel pour les comptes
   concernés.
4. Disponibilité du tenant DUO **côté royaume Keycloak** au moment du
   déploiement — entièrement une question de configuration du royaume
   depuis le 24/08/2026, PGD ne porte plus aucune configuration DUO propre
   (`DUO_*` retirés avec `MfaService`/`DuoProvider`, cf. §8).
5. Séparation référentiels/démo du script de seed (§5.2) — pas encore faite
   dans le dépôt.
6. Dimensionnement serveur (§1).
