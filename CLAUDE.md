# CLAUDE.md — PGD (Plateforme de Gestion des Dégrèvements)

Contexte permanent du dépôt. À lire avant toute intervention.

---

## Projet

Plateforme de gestion des dégrèvements pour **Orange Côte d'Ivoire** (DSI / AIP — Études & Ingénierie IT). Architecte SI : Aroun KONÉ. Méthode **BMAD**.

Elle dématérialise le cycle : **saisie → routage automatique → validation multi-niveaux → restitution SI → contrôle a posteriori → archivage**, sur trois circuits :

| Circuit | Périmètre | Code process |
|---|---|---|
| **DOBB** | B2B | `PO2_B-17` |
| **DXC** | B2C | `PO5-G-07` |
| **DF** | Wholesale / Opérateurs | `PO6-07` |

---

## Stack

**Monorepo** pnpm workspaces + Turborepo · TypeScript strict partout
**Backend** NestJS · Prisma · PostgreSQL 16 · Redis (cache + verrous) · RabbitMQ (bus de messages, `@golevelup/nestjs-rabbitmq` ou `amqplib`)
**Frontend** Next.js (App Router) · React · Tailwind
**Sécurité** Active Directory (LDAP/LDAPS) · MFA Cisco DUO **ou** TOTP · JWT + session Redis
**Infra** Docker Compose · migrations Prisma versionnées

---

## Structure

```
apps/api        NestJS — API REST
apps/worker     NestJS standalone — consumers AMQP (RabbitMQ)
apps/web        Next.js — interface
packages/contracts   Zod + types — SOURCE UNIQUE des contrats
packages/database    Prisma schema, migrations, seeds
packages/config      validation Zod de l'environnement
packages/messaging   topologie RabbitMQ, connexion, publisher, retry/DLX — utilisé par apps/worker
packages/ui          design system
docs/                livrables BMAD 00 → 07
```

**Règle de dépendance :** `apps/*` dépendent de `packages/*`. `packages/*` n'importent **jamais** `apps/*`. Aucune dépendance croisée entre `apps/`.

---

## Règles non négociables

1. **Aucune règle métier codée en dur.** Matrice pivot, catalogue de rôles, motifs, taux, calendrier SLA, paliers de subdélégation : tous en base, cachés en Redis, invalidés à l'écriture. Un seuil écrit dans le code est un bug.
2. **Invariants de sécurité côté serveur uniquement.** RBAC, SoD, verrous : Guards NestJS et transactions Prisma. Un contrôle côté client est un confort, jamais une garantie. **Ceci vaut aussi en lecture, pas seulement en écriture.** Un `@Roles()`/`@Authenticated()` au niveau route répond à « cet utilisateur est-il authentifié / détient-il ce rôle ? », jamais à « a-t-il le droit d'accéder à CE périmètre précis ? » — les deux questions sont distinctes, et confondre la première pour la seconde a produit la même classe de faille sept fois de suite en Phase 8 (guards de portée manquants sur les routes de tâches/délégation/demandes) puis une huitième fois sur une lecture agrégée (`profil` de `GET /api/kpi`, non vérifié contre l'identité réelle de l'appelant). Toute nouvelle route — lecture ou écriture — doit répondre explicitement à la question de portée, pas seulement à celle d'authentification.

   **Contremesure structurelle à la récidive** : chaque correctif ci-dessus a été vérifié individuellement au moment où il a été écrit, mais aucune suite ne les rejouait ensemble — `guard-order.spec.ts` ne verrouillait que l'ORDRE des guards sur trois routes, pas leur PRÉSENCE sur les autres. `apps/api/test/guard-coverage.spec.ts` (Phase 8, post-8.5) lit les métadonnées de guards (comme `guard-order.spec.ts`) contre une **table explicite route → guards attendus** pour `DemandesController`, `TachesController` et `KpiController`, et échoue dans les deux sens : un guard attendu disparaît d'une route déjà répertoriée, **ou** une nouvelle route d'écriture (ou une nouvelle route de `KpiController`) apparaît sans entrée dans la table. Ce second sens compte autant que le premier — sans lui, une route ajoutée en Phase 9/10 sans garde de portée passerait silencieusement. **Toute nouvelle route mutative ou toute nouvelle route de `KpiController` doit gagner une entrée dans une des trois tables de ce fichier, dans le même changement qui l'introduit.**
3. **Journaux append-only.** Aucun `UPDATE` ni `DELETE` applicatif sur `JOURNAL_AUDIT` et `JOURNAL_SECURITE`. Rétention 10 ans (SOX).
4. **PostgreSQL est la source de vérité.** Redis est un reflet volatil intégralement reconstructible.
5. **Affectation par corbeille (pull).** Jamais de désignation nominative en routage nominal ; la délégation est l'exception tracée.
6. **Français** pour tout le domaine : entités, colonnes, énumérations, libellés, messages d'erreur utilisateur.
7. **Montants** en XOF, `numeric(15,2)` (jamais de flottant), plancher 0. Le **routage s'appuie sur le TTC**.
8. **SLA en heures ouvrées** via `CALENDRIER_SLA` (jours ouvrés, plage horaire, fériés).
9. **`packages/contracts` est la source unique des types.** Pas de DTO dupliqué entre back et front.

---

## Règles métier (R1 → R23)

| Réf. | Règle |
|---|---|
| `R1` | Routage sur le montant TTC |
| `R2` | Au-delà des seuils : terminaison DF puis DGA/DG |
| `R3` | **SoD** — un agent ne valide pas l'étape N s'il est intervenu à l'étape N-1 du même dossier |
| `R4` | Une tâche n'est traitée que par un membre du rôle de sa corbeille |
| `R5` | Toute transition d'état est journalisée |
| `R6` | Re-routage après modification selon les paliers en vigueur |
| `R7` | Claim atomique — conflit → `409` |
| `R8` | Plancher des montants à 0 |
| `R9` | SLA en heures ouvrées |
| `R10` | La validation finale déclenche la restitution SI |
| `R11` | Aucune règle métier en dur |
| `R12` | Contrôle **FRA obligatoire** au-delà de 5 000 000 FCFA |
| `R13` | Pièces obligatoires du motif présentes à la soumission |
| `R14` | **Commentaire obligatoire** à la soumission |
| `R15` | Ligne `RESILIE` → bloquée ou justification renforcée (`PARAMETRE_GLOBAL`) |
| `R16` | Restitution SI **idempotente** |
| `R17` | Une **formule** sélectionnée par ligne retenue |
| `R18` | Le TTC agrège les lignes retenues |
| `R19` | Une seule formule courante par ligne |
| `R20` | `statut_ligne` figé dans `DEMANDE_LIGNE` à la sélection |
| `R21` | **SoD étendu à la délégation** — vérifier délégataire **et** délégant (`DELEGATION.delegant_id`) sur l'étape N-1 |
| `R22` | Pas de deux délégations actives concurrentes sur le même `(delegant_id, role_code)` avec périodes recouvrantes — **contrainte `EXCLUDE` GIST en base**, pas seulement en service |
| `R23` | `HISTORIQUE_MONTANT` porte `acteur_id` et `demande_ligne_id` (tous deux nullables) — `SF-PGD-042`. `CHECK (acteur_id IS NOT NULL OR origine = 'RECALCUL')` : **implication, pas équivalence** — un recalcul peut avoir un acteur |

---

## Mécanismes structurants

### Claim à double verrou
```
1. Redis  : SET lock:tache:{id} {userId} NX PX {ttl}     → absorbe la contention
2. Postgres (transaction, source de vérité) :
     UPDATE tache SET etat='RECLAMEE', agent_claim=…, date_claim=now(),
            verrou_expire_at = now() + …
     WHERE id=:id AND etat='EN_CORBEILLE' RETURNING id;
3. Aucune ligne → 409 Conflict + libération du verrou Redis
```

Cycle : `EN_ATTENTE → EN_CORBEILLE → RECLAMEE → APPROUVEE | REJETEE` (+ `POST_CLOTURE` pour le contrôle).

### Moteur de règles pivot
Cinq variables — `circuit`, `segment`, `sous_flux`, `montant TTC`, `type_acteur` — produisent une chaîne ordonnée de tâches. Format de règle :
```
RÈGLE = { circuit, segment, sous_flux, borne_min, borne_max, étapes[] }
```
Lecture en cache Redis, rechargement PostgreSQL si absent. Toute écriture d'administration invalide la clé.

### Convention R12 — contrôle FRA (à ne pas casser)

`EtapeRegle` n'a pas de champ dédié pour distinguer un contrôle FRA d'un contrôle générique N1/N2 (`typeActeur` reste seulement `V`/`A`/`C`, non glosé — cf. Questions ouvertes). R12 (« TTC > 5M exige un contrôle FRA ») repose donc sur une convention purement par donnée, posée en Phase 5 faute d'un champ de schéma dédié :

> Un contrôle FRA = une `EtapeRegle` avec `roleCode = 'FRA'` **et** `typeActeur = 'C'` (`RuleEngineService.ROLE_CODE_FRA`, `possedeControleFra()`).

**Fragilité assumée** : le catalogue de rôles est à 25/34 et sera corrigé. Si le rôle `FRA` est renommé ou supprimé sans mettre à jour cette convention, R12 ne lève **aucune erreur** — une chaîne sans étape `FRA` se lit silencieusement comme « aucun contrôle requis ». Le test `rule-engine.integration.spec.ts` (« le rôle FRA existe dans le référentiel des rôles ») est le seul garde-fou : il échoue en CI si `ROLE_CODE_FRA` disparaît du référentiel. **Ne pas renommer/supprimer le rôle `FRA` sans mettre à jour `RuleEngineService` et ce test dans le même changement.**

### Messagerie RabbitMQ (`apps/worker`)

Exchange topic durable `pgd.events` · exchange `pgd.dlx` + file `q.dead-letter`.

| File | Routing key | Rythme | Rôle |
|---|---|---|---|
| `q.locks-sweeper` | `lock.sweep` | cron 5 min → publie | Libère les verrous expirés sans décision |
| `q.sla-escalation` | `sla.check` | cron 15 min → publie | Escalade les tâches dont le SLA est dépassé |
| `q.notifications` | `notification.*` | événement | in-app + SMTP (bouchon) |
| `q.si-push` | `si.push` | validation + rejeu | Restitution au SI, idempotente, `prefetch=1` |

**Non négociable côté messagerie :**
- Publication `persistent` + `publisher confirms`.
- `ack` **manuel**, émis **après** le commit de la transaction Prisma — jamais avant.
- Retry avec back-off exponentiel, 5 tentatives max, puis routage vers `pgd.dlx`.
- Tout consumer est **idempotent** : RabbitMQ garantit *at-least-once*, jamais *exactly-once*. Protéger par mise à jour conditionnelle SQL ou par clé d'idempotence (`si_idempotency_key`).
- Les déclenchements périodiques restent portés par `@nestjs/schedule` dans `apps/worker`, qui **publie un message** au lieu d'exécuter le traitement en ligne (préserve retry et DLX).
- Redis n'est **pas** un broker ici : cache de configuration et verrous de claim uniquement.

**R9 dans `SlaEscalationService`** — la nouvelle échéance après escalade est calculée avec `ajouterHeuresOuvrees` (`packages/database/src/calendrier-sla.util.ts`), **jamais** un delta brut en millisecondes : un bug initial (Phase 6) faisait `now + slaHeures*3600*1000`, ce qui aurait poussé une échéance en dehors des heures/jours ouvrés. La fonction est désormais **partagée** entre `CalendrierSlaService` (`apps/api`) et `SlaEscalationService` (`apps/worker`) via `@pgd/database` — ne jamais la dupliquer dans un des deux apps, R9 doit rester une seule implémentation.

**Portée volontairement partielle de `SlaEscalationService`** : il incrémente `niveau_escalade` et repousse `echeance_sla`, il ne réaffecte **jamais** `role_corbeille` vers une « corbeille N+1 » — cf. Questions ouvertes.

**Gotcha dev (`docker-compose.override.yml`)** : le service `worker` tourne en `nest start --watch` avec bind-mount du dépôt. Le compilateur TypeScript en mode watch ne surveille pas `node_modules` : si `packages/database` (ou tout autre package partagé) est reconstruit (`pnpm --filter @pgd/database build`) pendant que le conteneur tourne, il faut `docker compose restart worker` pour que le nouveau `dist`/`.d.ts` soit pris en compte — sinon le conteneur reste bloqué sur la dernière erreur de compilation vue avant la reconstruction.

### Notifications (PGD-073, Phase 8.3)

`NotificationService` (`apps/worker/src/notifications/notification.service.ts`) consomme `q.notifications` (liaison générique `notification.*`, aucune topologie nouvelle) et distingue deux familles de destinataire :

- **Déterminé par la donnée** : `NOUVELLE_TACHE` (tous les `MembreRole` du `role_corbeille` de la tâche), `AVANCEMENT`/`REJET`/`VALIDATION` (l'`initiateur_id` de la demande) — jamais de doute possible, résolu directement.
- **Paramétrable, jamais deviné** : `ESCALADE` (superviseur SLA) et `ERREUR_SI` (exploitation) — aucune source (docs/01/03/04) ne nomme le rôle destinataire (cf. Questions ouvertes, deux entrées distinctes). Chaque type lit sa propre clé `PARAMETRE_GLOBAL` (`destinataire_notification_escalade_sla`, `destinataire_notification_erreur_si`, toutes deux seedées à `{"roleCode": null}`) — **pattern réutilisé de R15** (config globale plutôt qu'endpoint dédié). Tant que `roleCode` est `null`, le service ne notifie **personne** et journalise un `WARN` explicite ; il ne devine jamais un rôle par défaut. Vérifié en direct (Phase 8.3) dans les deux sens : rôle configuré → notification créée + `SmtpPort.envoyer()` appelé avec l'identifiant AD réel du membre ; rôle non configuré → zéro ligne `Notification`, aucune erreur.

Publication toujours **après commit**, jamais avant (même principe que `si.push`) : `TacheWorkflowService.approuver/rejeter` et `SlaEscalationService.escalader`/`SiPushService.traiter` publient sur les routing keys dédiées (`notification.nouvelle_tache`, `notification.avancement`, `notification.rejet`, `notification.validation`, `notification.escalade`, `notification.erreur_si`) une fois la transaction Prisma commitée.

### KPI (PGD-074, Phase 8.4)

`KpiEngineService` (`apps/api/src/modules/kpi/services/kpi-engine.service.ts`) agrège directement sur `DEMANDE` (jamais via `JOURNAL_AUDIT`), piloté entièrement par `KPI_DEFINITION` (26 lignes seedées, 6 familles) — aucun indicateur en dur.

**Convention « reçu vs traité »** (docs/04 §3.2/§1008) : le schéma n'a pas de colonne booléenne `degrevement_saisi_si` — `KpiDefinition.surDossiersTraites` force `si_etat = CONFIRME`. Même fragilité assumée que la convention FRA de R12 : si le drapeau est mal positionné en base, aucune erreur ne se déclenche.

**Cache Redis TTL court (60 s), sans invalidation à l'écriture** — décision volontaire, pas un oubli : trop de chemins d'écriture touchent `DEMANDE` (soumission, approbation, rejet, si-push, contrôle, correction de montant) pour qu'une invalidation ciblée reste fiable ; une invalidation non fiable donnerait une illusion de fraîcheur pire qu'un TTL assumé. Vues matérialisées **non implémentées** — docs/04 les recommande pour les KPI « lourds », mais c'est une optimisation prématurée sans problème de performance démontré ; les index de Phase 4 (`universFmiCode+facteurCode+siEtat+dateCloture`, etc.) couvrent déjà les dimensions du référentiel.

**Périmètre de `profil` — vérifié contre des données réelles, jamais déclaratif** (trouvé en revue avant 8.5, même classe de faille que l'audit RBAC d'avant 8.2, mais sur une lecture agrégée) :
- `profil=initiateur` : forcé à `Demande.initiateurId = appelant.id`, quoi que le client demande — aucune ambiguïté, la colonne existe déjà.
- `profil=valideur` : forcé aux dossiers portant une `Tache.roleCorbeille` réellement détenu par l'appelant (`utilisateur.roles` du JWT, même source que `RbacGuard` — pas une requête `MembreRole` supplémentaire).
- `profil=pilotage` (ou profil absent, le cas par défaut le plus large) : **aucun rattachement utilisateur → direction/service n'existe dans le modèle** pour vérifier un droit de portée globale — décision d'accès binaire (pas un filtre de données), portée par `KpiPerimetreGuard` (`apps/api/src/common/guards/kpi-perimetre.guard.ts`) au niveau route, exactement comme `CorbeilleRoleGuard` pour les tâches. Refus journalisé (`RBAC_REFUS`) comme toute violation de rôle. `ADMIN_PGD` reste un choix provisoire (cf. Questions ouvertes) mais la route n'est plus ouverte à tout authentifié. `KpiEngineService` ne revérifie pas ce périmètre — il suppose l'autorisation acquise (même principe que `TacheWorkflowService` vis-à-vis de `SodGuard`).
- La clé de cache Redis intègre l'identité/les rôles de l'appelant quand le profil scope sur eux (`init:{id}` / `val:{roles triés}`) — sans ça, deux appelants différents demandant le même profil partageraient un résultat en cache pendant le TTL.

### Maquette de référence (frontend)

Source de vérité visuelle, **versionnée dans le dépôt** — export Claude Design, pas d'import à la demande :

- Emplacement : **`docs/design/`**
- Structure : export **modulaire** JSX + CSS (`app`, `engine`, `data`, `ui`, `screens1→4`, `screens_auth`, `tweaks-panel`, `styles.css`, `_shots/`)
- Écarts tranchés : `docs/design/DIVERGENCES.md`
- Provenance : `https://claude.ai/design/p/0a54ca6a-9e31-48e2-8f3c-c9476f354136?file=PGD+-+Plateforme+Du00E9gru00E8vements+%28autonome%29.html`

**Fait foi :** mise en page, charte, typographie, espacements, états et libellés des composants. **Correction (Phase 9.0/9, étape 3)** : les codes couleur de statut de ligne (ACTIF/SUSPENDU/RESILIE) n'ont **jamais fait partie de la maquette** — mention erronée introduite en rédaction sans vérification de source. `docs/design/` ne colore le statut de ligne nulle part (recherche dédiée, négative). Le mapping `--statut-ligne-actif/suspendu/resilie` (`packages/ui/tokens/semantic.ts`) est une **décision de design assumée sans source dans la maquette** — vert/jaune/rouge choisis par cohérence avec les autres familles sémantiques (statut demande, urgence SLA), pas extraits. Voir `docs/design/DIVERGENCES.md`.
**Ne fait pas foi :** règles métier, autorisations, calculs, routage, validations. En cas de divergence, **le PRD l'emporte**, l'écart est consigné dans `DIVERGENCES.md`.

**Hors build** : ne rien copier dans `apps/web`, ne rien importer, ne rien compiler. En dériver des composants React typés consommant l'API réelle.

**`engine.jsx` et `data.jsx` ne sont jamais portés.** Ils contiennent la logique de simulation du prototype — routage, seuils de palier, calculs — reproduite côté client pour la démo. Toute décision métier qui s'y trouve vient de l'**API** (`docs/06_Contrats_API.md`), jamais du frontend : `R3` vaut aussi côté client. Les lire sert à comprendre les formes de données attendues, pas à les recopier.

**`tweaks-panel.jsx` est hors périmètre** — panneau de réglages de prototypage, à ne pas porter.

Fichiers volumineux (`screens3.jsx` ≈ 93 Ko) : lecture **par section ciblée**, jamais en entier.

### Contraintes d'intégrité à poser en SQL manuel

Prisma ne sait pas les exprimer : elles vont dans la migration, pas dans le schéma.

| Table | Contrainte |
|---|---|
| `configuration_circuit` | `EXCLUDE USING gist (circuit =, segment =, coalesce(sous_flux,'') =, numrange(borne_min, borne_max, '[]') &&) WHERE (actif)` — anti-chevauchement des paliers |
| `delegation` | `EXCLUDE USING gist (delegant_id =, role_code =, tstzrange(debut, fin) &&) WHERE (active)` — `R22` |
| `delegation` | `CHECK (fin > debut)` · `CHECK (delegant_id <> delegataire_id)` |
| `historique_montant` | `CHECK (acteur_id IS NOT NULL OR origine = 'RECALCUL')` — `R23`, **jamais** une équivalence |
| `formule` | Index unique partiel `ON formule(ligne_id) WHERE courante` — `R19` |
| `demande` | `CHECK` de plancher 0 sur `montant_ht`, `montant_tsc`, `montant_tva`, `montant_ttc` |

`ligne.formule_courante_id` doit pointer vers une formule **de cette ligne** : non exprimable en FK simple, à vérifier en service (ou trigger).

### Index de performance à poser en SQL manuel

Le mode `insensitive` de Prisma compile en `ILIKE`, qu'aucun index btree standard (fonctionnel ou non) ne peut servir dès qu'il y a un joker en tête (`'%…%'`). Un `@@index` simple dans `schema.prisma` ne suffit donc jamais à lui seul dès qu'une recherche insensible à la casse est en jeu — vérifier par `EXPLAIN ANALYZE`, pas par supposition.

| Table | Index | Sert |
|---|---|---|
| `ligne` | `CREATE INDEX idx_ligne_nd_lower ON ligne (LOWER(nd))` | Recherche par ND (`SF-PGD-310`) — égalité stricte, la requête compare `LOWER(nd) = LOWER($1)`, jamais `ILIKE` |
| `compte_client` | `CREATE INDEX ... USING gin (numero_compte gin_trgm_ops)` + idem `nom_client` (extension `pg_trgm`) | Recherche compte (`SF-PGD-052`) — sous-chaîne réelle (`q=` tape une partie du numéro ou du nom), un index fonctionnel `LOWER()` ne l'accélère pas ; seul un index trigramme sert un `ILIKE '%…%'` |

### Ports d'intégration
| Port | Phase 1 |
|---|---|
| `LdapPort`, `MfaPort` (DUO + TOTP) | **Réels** |
| `JadePort`, `CrmPort`, `GedPort`, `SmtpPort`, `BillingSiPort` (BSCS, GAIA) | Bouchons commutables par variable d'environnement |

### Incident récurrent — `EACCES` sur les volumes `node_modules` en conteneur dev

Deuxième occurrence (Phase 4 sur `api`, Phase 6 sur `worker`) du même incident — à ne plus redécouvrir en Phase 7/8.

- **Symptôme** : `pnpm install` exécuté à l'intérieur d'un conteneur `docker-compose.override.yml` (mode dev, `user: node`) échoue avec `EACCES: permission denied, mkdir '/repo/node_modules/.pnpm/...'`.
- **Cause** : les volumes nommés `pgd_node_modules_*` (`pgd_node_modules_root`, `pgd_node_modules_api`, `pgd_node_modules_worker`, etc.) sont créés au premier démarrage du conteneur et prennent l'UID du processus qui les initialise. Si ce premier remplissage se fait sous un autre UID que `node` (ex. étape de build image en `root`, ou un volume recréé après ajout d'une dépendance), les écritures suivantes en tant que `node` sont refusées.
- **Geste** : exécuter l'install en root, puis rendre la propriété à `node` :
  ```bash
  docker compose exec -u root <service> sh -lc "cd /repo && pnpm install --filter <package>... && chown -R node:node /repo/node_modules /repo/apps/<service>/node_modules /repo/packages/*/node_modules"
  docker compose restart <service>
  ```
- **Ne pas** : supprimer/recréer les volumes par réflexe — l'incident se résout par un `chown`, pas par une perte de cache d'installation.

**Incident apparenté (Phase 7, reproduit en Phase 8)** — un `pnpm install` exécuté ainsi (root, dans le conteneur Linux) contre le dépôt monté en bind (`.:/repo`, partagé avec l'hôte Windows) peut corrompre les symlinks `node_modules` d'un **package partagé aussi consommé directement sur l'hôte** (ex. `packages/messaging`, utilisé à la fois par les conteneurs et par `pnpm --filter @pgd/messaging build` lancé depuis PowerShell/Git Bash). Symptôme : `tsc -p tsconfig.json` échoue en hôte avec `Cannot find module '...\node_modules\typescript\bin\tsc'` alors que le lien existe (`ls`/`readlink` le montrent) — un symlink POSIX créé côté conteneur Linux ne se résout pas toujours côté Windows natif à travers le partage de fichiers Docker Desktop. Geste : `rm -rf packages/<nom>/node_modules && pnpm install` **depuis l'hôte** (jamais depuis le conteneur) pour ce package précis.

**Déclencheur précis identifié en Phase 8** : ce n'est pas seulement un `pnpm install` ciblant directement `packages/messaging` qui casse le symlink — un `pnpm install --filter @pgd/api...` (le suffixe `...` inclut les dépendances de workspace) lancé dans le conteneur `api` relie **aussi** `@pgd/messaging` en cascade, silencieusement, sans qu'aucune commande n'ait mentionné ce package. Symptôme observé cette fois côté **Jest** (pas `tsc`) : `Cannot find module 'amqplib' from '.../packages/messaging/dist/connexion.js'`, alors que `ls packages/messaging/node_modules/amqplib` affiche des fichiers réels — le symlink pointait vers un chemin relatif (`../../../node_modules/.pnpm/...`) au lieu d'un chemin absolu, cassé après la réécriture côté conteneur. Retenir : **tout** `pnpm install --filter <app>...` lancé dans un conteneur dev est suspect pour **tous** les `packages/*` dont `<app>` dépend, pas seulement celui explicitement visé par `--filter`.

**Incident apparenté (Phase 8)** — même famille, déclenchement différent : `docker compose up -d worker api` échoue avec `failed to create symlink: ... file exists` sur un volume `pgd_node_modules_messaging` **fraîchement créé** (pas un ancien volume corrompu). Cause : au premier montage d'un volume nommé vide, Docker le peuple depuis le contenu de l'image à ce chemin ; si ce peuplement est interrompu ou entre en conflit (bind mount hôte Windows + image Linux), la copie initiale laisse un mélange fichier réel / lien symbolique incohérent. Geste : `docker compose down <services>` puis `docker volume rm <volume>` puis `docker compose up -d <services>` — le volume vide se repeuple proprement depuis l'image reconstruite. Ne pas tenter de réparer le contenu du volume à la main.

**Leçon distincte (Phase 8)** — `docker compose restart <service>` ne rejoue **jamais** le `Dockerfile` : il relance le même conteneur depuis la même image. Un correctif posé dans le `Dockerfile` (ex. `apt-get install procps`, déjà présent dans `apps/worker/Dockerfile` pour fournir `ps` à `nest start --watch` en mode watch) ne s'applique qu'aux conteneurs **recréés** depuis une image reconstruite. Un conteneur démarré avant l'ajout de cette ligne continue de tourner sans `ps`, et `nest start --watch` plante au premier redémarrage à chaud (`Error: spawn ps ENOENT`, `tree-kill` interne à l'incapacité de lister les PID enfants) sans rapport avec le code applicatif. Geste : `docker compose build <service> && docker compose up -d <service>` — jamais `restart` seul — après **tout** changement de `Dockerfile`, même correctif déjà documenté dans une phase antérieure.

**Rappel** — ajouter une dépendance npm à un `apps/*/package.json` (ex. `pdfkit` en Phase 8) et lancer `pnpm install` **depuis l'hôte** ne l'installe pas dans le `node_modules` du conteneur dev : c'est un volume nommé séparé (`pgd_node_modules_api`), non partagé avec l'hôte. Symptôme en conteneur : `Cannot find module 'pdfkit'` (TS2307) en compilation watch, alors que `pnpm typecheck`/`build` sur l'hôte est vert. Geste : appliquer le geste `EACCES` ci-dessus (install en root dans le conteneur concerné, puis `chown`) après tout ajout de dépendance, avant de considérer la vérification live terminée.

---

## Codes d'erreur

| Code | Usage |
|---|---|
| `400` | Validation de schéma |
| `401` | Non authentifié |
| `403` | RBAC ou SoD |
| `404` | Ressource introuvable |
| `409` | Conflit de verrou (claim) |
| `422` | Règle métier violée (`R13`–`R17`) |
| `429` | Rate limit |

Enveloppe : `{ data, error: { code, message, details }, meta }`.

---

## Décisions actées (ne pas rouvrir sans arbitrage)

| # | Décision |
|---|---|
| D1 | Backend en **NestJS** — le schéma technique indiquant « Next.js » est une erreur de libellé |
| D2 | **RabbitMQ** comme bus de messages (exchange topic + DLX) ; **BullMQ écarté**. Redis conserve cache et verrous, sans fonction de file |
| D3 | MFA : interface `MfaPort` avec **DUO et TOTP** — le TOTP sert de repli hors ligne |
| D4 | **BSCS et GAIA** derrière un `BillingSiPort` unique, routés par circuit |
| D5 | Frontend **inclus** dans le monorepo |
| D6 | Le **ND** est l'identifiant fonctionnel de ligne ; le compte reste l'entité de rattachement |
| D7 | Les tranches de routage deviennent des **paliers de subdélégation** (`label_palier`) — structure pivot inchangée |
| D8 | `JadeProvider` ajouté aux ports (bouchon phase 1) |

---

## Questions ouvertes

- Seuils et rôles définitifs de la fiche de subdélégation (défaut = tranches actuelles, paramétrable).
- Politique par défaut sur ligne `RESILIE` (défaut = `BLOQUANT`).
- Contrat exact des API BSCS / GAIA (bouchon en attendant).
- Procédure formelle de repli en cas d'indisponibilité DUO (mitigée par le TOTP).
- **Sémantique de `ENUM_TYPE_ACTEUR` (`V`/`A`/`C`)** : non glosée dans les sources. Ne pas deviner l'expansion. Stocker les codes, porter le libellé en seed.
- **Écart AD de dev → AD Orange réel.** `LdapProvider` est du code de production sans branche de simulation (validé en Phase 2), mais testé contre un annuaire OpenLDAP de développement, pas contre l'AD Orange CI. Avant la recette, à coordonner avec l'infrastructure Orange :
  - schéma d'annuaire réel (OU, attributs `mail`/`memberOf` ou équivalent — l'annuaire de dev suppose `ou=users`/`ou=groups` et une recherche par `mail`, à confirmer côté Orange) ;
  - convention `GG-DGR-*` à confirmer nom pour nom face aux groupes AD réels ;
  - compte de service (`LDAP_BIND_DN`/`LDAP_BIND_PASSWORD`) à provisionner côté AD Orange, avec droit de lecture sur les groupes ;
  - cohérence entre les groupes AD réels et les 25 rôles seedés (`packages/database/prisma/seed/referentiels/roles.seed.ts`) — recouvre partiellement le point « catalogue de rôles 25/34 » déjà signalé, mais porte spécifiquement sur le nommage des groupes, pas sur le nombre de rôles.
- **L'escalade SLA n'a aucun effet de déblocage tant que la hiérarchie de rôles d'escalade n'est pas définie — question resserrée en Phase 9.0, à trancher avec le métier avant recette.** `SlaEscalationService.escalader()` (`apps/worker/src/jobs/sla-escalation.service.ts`) incrémente `niveau_escalade` et repousse `echeance_sla`, mais ne réaffecte jamais la tâche : en l'état, une tâche dont le SLA expire reste dans la même corbeille avec le même rôle, et un acteur absent continue de bloquer le circuit. **Question fermée à poser au métier** (la maquette `docs/design/engine.jsx:319-337` — `escalader()`/`runAutoEngine()` — suggère une réponse cohérente avec le modèle existant, sans faire foi : elle avance simplement le dossier à `dossier.taches[ordre+1]`, l'étape suivante déjà instanciée dans la MÊME chaîne, pas un rôle externe) : **« l'escalade transfère-t-elle la tâche à l'étape suivante de la chaîne du dossier, ou à un rôle superviseur externe ? »** Si la réponse est « étape suivante de la chaîne », l'implémentation est nettement plus simple que ce qu'imaginait la question initiale (pas de table de succession entre corbeilles à construire). Deviner resterait inventer une règle métier (règle non négociable 1).
- **Destinataire de la notification superviseur à l'escalade SLA.** Même trou, symétrique : aucune source ne désigne qui reçoit la notification (le titulaire du rôle actuel ? un superviseur de circuit ? un rôle nommé ?). Non implémenté tant que non tranché. Le destinataire est un **superviseur métier** — à ne pas confondre avec le point suivant (exploitation).
- **Destinataire de la notification `ERREUR_SI`.** Question distincte de la précédente, à ne pas fusionner : le destinataire d'une escalade SLA relève du métier (un superviseur de circuit), celui d'une erreur de restitution SI relève de l'**exploitation** (équipe SI-ops ou support technique) — deux publics différents, deux réponses différentes. Non implémenté (Phase 8, notifications) tant que non tranché.
- **Rôle habilité au rejeu manuel SI** (`POST /api/demandes/{id}/si/pousser`, PGD-062) — `ADMIN_PGD` par défaut (précédent `escalade-manuelle`), un rôle SI-ops dédié serait plus cohérent avec la nature financière de l'action. Contrairement à `escalade-manuelle` ou `import-crm` (réversibles, sans effet externe), pousser au SI de facturation a une conséquence financière réelle — le précédent ne transfère pas automatiquement. À trancher avec le métier.
- **Rôle habilité à l'export de l'audit** (`GET /api/audit/{demandeId}/export`, PGD-072) — aucune source (`docs/01` SF-PGD-141) ne nomme de rôle de contrôle pour cette extraction nominative sur dix ans. `ADMIN_PGD` par défaut provisoire (même famille de décision que le rejeu manuel SI ci-dessus). La consultation simple (`GET /api/audit/{demandeId}`, sans export) reste ouverte à tout utilisateur authentifié — même niveau d'accès que la lecture de la demande elle-même (docs/06 §4), pas une divulgation nouvelle. Le journal de sécurité (`GET /api/audit/securite`) est `ADMIN_PGD` sans ambiguïté : événements croisant tous les utilisateurs, fonction d'administration par nature.
- **Rattachement utilisateur → direction/service : faut-il le modéliser ?** (docs/06 §10, PGD-074) — question requalifiée en Phase 9.0. Le trou initial (« quel rôle pour `profil=pilotage` ? ») était mal posé : `profil=initiateur`/`valideur` sont vérifiés contre des données réelles (`initiateurId`, `roleCorbeille` détenu) depuis la Phase 8.4bis, et `profil=pilotage` est restreint à `ADMIN_PGD` (cf. section « KPI (PGD-074, Phase 8.4) » ci-dessus) — ce n'était pas un oubli de modélisation RBAC, c'est qu'**aucun rattachement utilisateur → direction/service n'existe dans le schéma**, point confirmé en Phase 9.0 : la maquette (`docs/design/data.jsx` — `USERS[].direction`/`.service`, table `DIRECTIONS`) invente ce rattachement pour sa démo précisément parce qu'il n'a jamais été modélisé côté serveur. La question qui reste n'est donc plus « quel rôle pour pilotage » (tranchée : `ADMIN_PGD`, provisoire) mais **« faut-il ajouter un rattachement agent → direction/service au modèle, pour un scoping KPI plus fin que pilotage-vs-le-reste ? »** — à trancher avec le métier, pas une décision technique.
- **`GET /api/notifications` n'existe pas encore — différé volontairement, pas un oubli** (Phase 9.2, construction de la coquille applicative). `docs/design/app.jsx` (`NotifDropdown`) suppose une liste de notifications côté client ; aucun endpoint réel ne la sert. La coquille (`Sidebar`/`Topbar`, `packages/ui`) a été construite SANS cloche de notification plutôt que d'appeler une route qui n'existe pas ou d'inventer une forme de réponse en passant pendant du travail frontend. Cette route mérite ses propres décisions, à traiter comme une étape API dédiée (pas un ajout incidental) : pagination, marquage comme lu, et surtout une garde de portée garantissant qu'un utilisateur ne lit QUE ses propres notifications (même famille de risque que les guards de portée manquants de la Phase 8 — cf. règle non négociable 2). Quand cette étape sera traitée, `apps/api/test/guard-coverage.spec.ts` doit gagner une entrée pour cette route dans la même table qui couvre déjà `DemandesController`/`TachesController`/`KpiController`.
- **« Mes demandes » n'a aucun endpoint scopé côté serveur — trouvé en construisant HomeScreen (Phase 9.2), lot avec les deux points ci-dessus/dessous.** `GET /api/demandes` (`DemandesController.lister`, `listerDemandesQuerySchema`) n'a **aucun** champ `initiateurId` et ne reçoit même pas `@CurrentUser()` — il retourne l'intégralité des demandes du système, sans notion de portée. Contrairement à `GET /api/kpi?profil=initiateur` (où `KpiEngineService` force `initiateurId = utilisateur.id` dans le `WHERE` réel, jamais confié au client), il n'existe ici aucun mécanisme équivalent. **Ne pas construire de tuile « mes demandes » en filtrant côté client la liste non scopée** — le `total` renvoyé serait celui de TOUTES les demandes, et un filtrage d'affichage sur une liste non bornée par le serveur est exactement la classe de faille qui a produit huit occurrences en Phase 8 (guards de portée manquants) puis une neuvième sur `profil` de KPI. HomeScreen (Phase 9.2) a été construit SANS cette tuile plutôt que de contourner le trou côté client. À traiter comme sa propre étape API : ajouter `initiateurId` à `listerDemandesQuerySchema`, filtrer par défaut sur l'appelant côté service (jamais un paramètre que le client pourrait élargir), et donner à `DemandesController` sa première entrée dans `apps/api/test/guard-coverage.spec.ts` (absent aujourd'hui — ce fichier ne couvre que les routes d'écriture de `DemandesController`/`TachesController`/`KpiController`, jamais `lister`).
- **Aucun flux d'activité récente transversal n'existe — même lot, trouvé au même moment.** `GET /api/audit/{demandeId}` (`AuditController`) est scopé à UN seul dossier ; `GET /api/audit/securite` est un flux transversal mais sémantiquement différent (journal de SÉCURITÉ — connexions, refus RBAC/SoD — pas les actions métier « approuvé »/« rejeté »/« soumis »), et réservé `ADMIN_PGD`. Il n'existe aujourd'hui aucune route qui agrège `JournalAudit` à travers plusieurs dossiers pour un flux « activité récente » de type tableau de bord. La section « Activité récente » de `docs/design/screens1.jsx` (`HomeScreen`, fonction `recentActivity`) n'a donc pas été portée — omise plutôt qu'alimentée par un appel inventé. À traiter comme sa propre étape API (nouvelle route d'agrégation, avec sa propre décision de portée — probablement scopée aux dossiers où l'utilisateur est initiateur ou détient une tâche, à trancher explicitement, pas par défaut) plutôt que construite en passant pendant l'écran d'accueil.

---

## Tests contre référentiels (convention posée en revue de Phase 5)

Les tests d'intégration tournent contre le Postgres de dev réel (pas de mock), partagé entre fichiers de test **exécutés en parallèle par Jest** (pas de `runInBand`). Deux incidents distincts l'ont révélé : un test a un temps écrasé les 12 jours fériés seedés (pollution silencieuse, détectée seulement par comptage de lignes) ; un service de recalcul a planté en heurtant, dans un autre worker, une demande créée par un fichier de test différent (course, pas de corruption persistante). Deux modes d'échec différents, même cause racine : une écriture sur une table partagée sans convention d'isolement.

**Clé fermée** (espace de clés fixe, seedé — aucune fixture jetable équivalente n'a de sens) : `Circuit` (3 valeurs ENUM), `ParametreCalcul` (1 ligne par circuit), `ParametreGlobal` (clés seedées fixes), `CalendrierSla` (une seule ligne "Calendrier CI"), `Module`. Sur ces tables : **snapshot en `beforeAll`, restauration INCONDITIONNELLE en `afterEach`** — jamais un `try/finally` en fin de corps de test (si une assertion échoue avant la restauration manuelle, la donnée reste corrompue et contamine les tests suivants, avec un échec qui n'apparaît que plus tard, ailleurs, sans lien apparent).

**Clé ouverte** (`Role`, `Motif`/`PieceAfferente`, `ConfigurationCircuit`/`EtapeRegle` — l'admin peut créer une nouvelle ligne à volonté) : chaque test crée sa propre ligne jetable à clé unique (`TEST_..._${Date.now()}`) et la supprime en fin de test ; ne jamais lire-puis-écrire une ligne seedée partagée.

**Requêtes qui scannent un ensemble partagé sans le borner à ses propres lignes** (ex. `WHERE circuit = 'DOBB' AND statut = 'BROUILLON'`, sans filtre de propriété) : le code de production lui-même doit tolérer qu'une ligne du lot ait bougé entre la lecture et l'écriture (un utilisateur peut soumettre/supprimer son brouillon pendant qu'un admin change le taux) — `updateMany` avec la condition répétée plutôt qu'un `update` par id, cf. `AdminParametresCalculService.recalculerBrouillons`.

Vérifié en revue de Phase 5 : les 65 tests de `apps/api/test/` respectent cette convention (état au 21/07/2026) — seuls `Circuit`, `ParametreCalcul`, `ParametreGlobal`, `CalendrierSla` y sont réellement exercés en écriture, tous via snapshot/restore. Si une collision réapparaît malgré cette convention en Phase 6+, la base de test dédiée (schéma Postgres séparé, migré/seedé à part) devient l'option de repli — pas par précaution, mais sur constat.

**`JournalAudit` ne se nettoie JAMAIS en fin de test** (Phase 8, T6) — un middleware Prisma (`interdireMutationAudit`, `packages/database/src/audit-immuable.util.ts`) rejette structurellement tout `update`/`updateMany`/`delete`/`deleteMany`/`upsert` sur ce modèle, y compris depuis un test. Avant T6, huit fichiers de test faisaient `journalAudit.deleteMany({ where: { demandeId } })` en `afterEach` ; tous cassaient dès le middleware activé. Corrigé en retirant ces appels : `demande_id`/`tache_id` passent à `NULL` par `ON DELETE SET NULL` quand la demande/tâche de test est supprimée, et les lignes d'audit de test survivent, orphelines — exactement le comportement voulu en production. N'écrivez jamais de nettoyage `journalAudit.delete*` dans un nouveau test, il échouera.

**`pnpm typecheck` couvre aussi `test/` depuis la Phase 6** (`tsconfig.test.json`) — `tsc -p tsconfig.json` seul n'a jamais typé que `src` (`rootDir`), et `ts-jest` tourne en `isolatedModules` (transpile par fichier, sans vérification croisée) : un changement de signature de constructeur dans `src` pouvait rester invisible dans `test` jusqu'à l'exécution, voire jamais si le chemin de code concerné n'était pas exercé par le test. Trouvé en Phase 6 quand `TacheService` a gagné un troisième paramètre (`DelegationService`) sans que le test de claim ne soit mis à jour — le test passait quand même (`delegationService` valait `undefined`, jamais lu par les méthodes exercées). Ne jamais retirer `tsconfig.test.json` du script `typecheck`.

---

## Convention de commit

Deux niveaux :

1. **Commit d'étape** — à chaque étape numérotée terminée ET vérifiée (sweep vert : `lint` + `typecheck` + `build` + `test`). Une étape = un commit, créé sans validation préalable : c'est du travail déjà vérifié.
2. **Commit de clôture de phase** — après validation explicite de la phase. Marque le point de reprise stable.

**Ne jamais commiter :**
- du code dont le sweep n'est pas vert ;
- un travail en cours interrompu par une question posée à l'utilisateur ;
- des fixtures de test ou données de démo modifiées temporairement (cf. l'incident `calendrier_sla` en Phase 5 — douze jours fériés réels remplacés par une ligne unique pour un test destructif, jamais commité) ;
- des fichiers de configuration locale, secrets, `.env` réel, volumes Docker.

Vérifier le `.gitignore` avant tout commit (`node_modules`, `.pnpm-store`, `dist`, `.env`, `*.tsbuildinfo`, `coverage`, `.next` — tout ce qui relève de l'environnement local doit y figurer).

**Format des messages** — Conventional Commits, sujet en français, avec le numéro d'étape ou de phase :
```
feat(ui): Modal sur Radix Dialog (9.1)
fix(api): CorbeilleRoleGuard sur les routes de tâches (8.1)
chore(web): migration Tailwind v4 vers @theme (9.1)
test(worker): T8 volets ack et dead-letter (6.5)
docs: convention R12 et questions ouvertes
```
Types : `feat`, `fix`, `chore`, `test`, `docs`, `refactor`, `perf`. Portées : `api`, `worker`, `web`, `ui`, `database`, `config`, `contracts`, `messaging`, `docs`.

Le corps du message, quand il apporte quelque chose, dit : ce qui a été vérifié (en direct, en test, les deux) ; les bugs trouvés en chemin ; les points laissés ouverts. Pour un correctif de sécurité, le corps dit **ce qui était exploitable** — c'est ce qui rend l'historique lisible dans six mois :
```
fix(api): vérification d'appartenance à la corbeille (8.1)

Avant ce correctif, un utilisateur authentifié connaissant un id de tâche
pouvait la réclamer et la traiter hors de son rôle : le filtrage par rôle
n'existait qu'à l'affichage (TacheService.lister), jamais à l'action.
R4 non vérifié sur claim/unclaim/approuver/rejeter.

Vérifié en direct : agent hors rôle → 403 journalisé, agent du rôle → 200,
délégataire actif → 200, délégation expirée → 403.
```

---

## Commandes

```bash
pnpm install
pnpm db:migrate          # migrations Prisma
pnpm db:seed             # référentiels + jeu de démonstration
pnpm dev                 # api + worker + web
pnpm test                # unitaires + intégration
pnpm test:e2e
pnpm lint && pnpm typecheck && pnpm build
docker compose up
```

---

## Avant de considérer une tâche terminée

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` verts
- [ ] Aucune règle métier codée en dur
- [ ] Toute opération mutative journalisée
- [ ] Tout endpoint porte un décorateur de rôle
- [ ] Contrats Zod dans `packages/contracts`, pas de type dupliqué
- [ ] Migration Prisma versionnée et rejouable sur base vierge
- [ ] Libellés et messages en français
