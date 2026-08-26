# Image unique PGD (API + Worker + Web + Redis interne)

Variante alternative aux trois images séparées (`apps/api|worker|web/Dockerfile`,
orchestrées par `docker-compose.prod.yml`) : **un seul** conteneur qui lance
les trois process Node applicatifs plus un Redis interne, supervisés par
`supervisord`. Livrée en un seul fichier `docker save` pour un transfert/
déploiement simplifié (une seule image à charger, un seul `docker run`).

**PostgreSQL et RabbitMQ restent volontairement hors de cette image** — ce
sont les deux services qui portent un état durable réel (données métier,
audit à rétention 10 ans, messages en file avec retry/DLX). Les bundler
dans un conteneur applicatif qu'on recrée à chaque déploiement de code
effacerait cet état. Ils doivent tourner ailleurs (autre conteneur, autre
machine, service managé) et être atteignables depuis `DATABASE_URL`/
`RABBITMQ_HOST`. Redis, lui, est bundlé — c'est un cache/verrou volatil,
intégralement reconstructible (CLAUDE.md, règle non négociable 4), sans
risque à le loger dans le même conteneur que le code qui le consomme.

Pour un déploiement multi-conteneurs classique (recommandé pour une
production avec supervision/scaling indépendants par service), utiliser
plutôt `docker-compose.prod.yml`/`docker-compose.prod.build.yml`.

## Construire l'image

`NEXT_PUBLIC_API_URL` doit être fourni **au build** (Next.js l'inline dans
le bundle client, jamais relu à l'exécution du conteneur) :

```bash
docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://<hote-public>:3000 \
  -f docker/all-in-one/Dockerfile \
  -t pgd-app:latest \
  .
```

## Lancer le conteneur

```bash
cp docker/all-in-one/.env.aio.example .env.aio
# éditer .env.aio : DATABASE_URL / RABBITMQ_* (externes), secrets JWT, etc.

docker run -d --name pgd-app \
  -p 3000:3000 -p 3001:3001 -p 3002:3002 \
  --env-file .env.aio \
  pgd-app:latest
```

- **3000** : API (NestJS, `/api/health`, `/api/docs`)
- **3001** : Web (Next.js)
- **3002** : Worker (endpoint de santé HTTP uniquement, pas d'interface)
- **6379** (Redis) : jamais publié, interne au conteneur uniquement.

## Migrations Prisma — geste manuel, jamais automatique au démarrage

Cohérent avec la convention déjà en place pour `docker-compose.prod.yml`
(`docs/13_Guide_Deploiement_Production.md` §Migrations) : appliquer les
migrations est un geste opérationnel distinct, jamais silencieux au
démarrage du conteneur (éviter une migration accidentelle sur un simple
`docker restart`, et éviter toute dépendance réseau au registre npm au
runtime pour ce geste).

```bash
docker exec -it pgd-app sh -c \
  "cd /repo/packages/database && node_modules/.bin/prisma migrate deploy"
```

## Exporter l'image en un seul fichier tar

```bash
docker save -o pgd-app.tar pgd-app:latest
```

Sur la machine de déploiement (Docker installé, pas nécessairement ce
dépôt) :

```bash
docker load -i pgd-app.tar
docker run -d --name pgd-app -p 3000:3000 -p 3001:3001 -p 3002:3002 \
  --env-file .env.aio pgd-app:latest
```

## Vérification de santé

Un seul `HEALTHCHECK` Docker (`docker/all-in-one/healthcheck.sh`) vérifie
les quatre process : liveness HTTP de l'api (`/api/health`), du worker
(`/health`), du web (`/login`), et `redis-cli ping` sur Redis interne — un
seul service en échec suffit à faire échouer le healthcheck du conteneur,
pas seulement une panne totale.

```bash
docker inspect --format='{{.State.Health.Status}}' pgd-app
docker logs pgd-app          # logs des 4 process, entrelacés (supervisord)
docker exec pgd-app supervisorctl -c /repo/docker/all-in-one/supervisord.conf status
```
