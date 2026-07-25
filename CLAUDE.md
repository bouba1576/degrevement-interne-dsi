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

## Règles métier (R1 → R24)

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
| `R24` | **SoD étendu au contrôle a posteriori** — un acteur ne réalise pas le contrôle de l'étape N (`typeActeur = 'C'`, ex. `FRA`) s'il est intervenu à l'étape bloquante N-1 du même dossier — même mécanisme que R3, `SodService.verifier` ne distingue jamais `typeActeur` (trouvé en essai de bout en bout, Phase 9, verrouillé par `sod-service.integration.spec.ts`, describe `R24`) |

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

**Le silence de la maquette n'est pas une décision de conception, et n'a aucune autorité sur le périmètre — seulement sur la mise en page.** La règle ci-dessus (« le PRD l'emporte ») couvrait le cas d'une contradiction ; elle ne couvrait pas le cas, distinct, d'une fonctionnalité **spécifiée** (PRD, MCD/MLD, contrats d'API, user stories) que la maquette n'a **jamais représentée** — ni bien ni mal, simplement absente. Ce silence n'autorise pas à omettre la fonctionnalité : elle se construit d'après les sources réelles (PRD, modèle de données, contrats `packages/contracts`, `docs/04_UserStories_Realisation.md`), au même titre qu'un écran qui contredirait la maquette. Déjà appliqué plusieurs fois sans être nommé comme règle : statut de ligne (coloré nulle part dans la maquette, exigé par PGD-081), état SI à quatre valeurs (la maquette le réduit à un booléen), anneau de focus clavier (la maquette ne le pose que sur les champs de saisie), scoping KPI par `profil` réel plutôt que le rattachement direction/service inventé par la maquette pour sa démo. **Nuance qui compte** : ça ne rouvre pas « ne rien inventer ». Combler un silence s'appuie sur une source réelle identifiée, jamais sur un choix libre — quand ni la maquette ni aucune source ne répond, ça reste une question ouverte à remonter (même traitement que `reaffecter`/`debloquer`), pas une occasion d'inventer. Chaque instance comblée ainsi est consignée dans `docs/design/DIVERGENCES.md`, catégorie dédiée « Spécifié, absent de la maquette » — distincte des écarts tranchés (contradiction) ci-dessus.

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

### `ldap-provider.integration.spec.ts` — Testcontainers ne tourne pas dans le conteneur `api` (trouvé en revue, Phase 9.2)

**Symptôme** : `pnpm --filter @pgd/api test` lancé via `docker compose exec api ...` échoue systématiquement sur `LdapProvider (OpenLDAP réel via Testcontainers)` (3 tests) avec `Could not find a working container runtime strategy` — les 163 autres tests passent. Signalé une fois comme « échec sans rapport » avant vérification explicite du contraire ; ne plus reproduire cette approximation.

**Cause, confirmée, pas supposée** : ce test (introduit Phase 2, `ded70d5`) démarre son propre serveur OpenLDAP éphémère via Testcontainers (`GenericContainer(...).start()`) — mécanisme *Docker-outside-of-Docker*, qui exige un accès au démon Docker de l'hôte. Ni `docker-compose.yml` ni `docker-compose.override.yml` ne montent `/var/run/docker.sock` (ou l'équivalent Windows) dans le conteneur `api` — vérifié par recherche, aucune occurrence. Exécuté depuis l'intérieur du conteneur `api`, Testcontainers n'a donc littéralement aucun démon à qui parler. Ce n'est pas un problème d'installation ni de version.

**Ce n'est pas un problème d'environnement durable** : exécuté **depuis l'hôte** (`pnpm --filter @pgd/api test`, PowerShell/Git Bash, pas `docker compose exec`), ce même test passe (vérifié en direct) — le poste de dev a Docker Desktop, donc un démon Docker directement joignable, et `.env` à la racine pointe déjà `DATABASE_URL`/`REDIS_URL` sur `localhost` (ports publiés) pour ce cas d'usage. Suite complète depuis l'hôte : **166/166**, LdapProvider compris.

**Geste** : pour toute vérification qui doit inclure `ldap-provider.integration.spec.ts` (recette, sweep de fin de phase), lancer `pnpm --filter @pgd/api test` **depuis l'hôte**, pas via `docker compose exec`. Pour un sweep ciblé qui ne touche pas `LdapProvider`, `docker compose exec api ...` reste légitime — mais alors dire explicitement « N/166, LdapProvider exclu (Testcontainers, conteneur sans accès au démon Docker) », jamais un total qui laisse croire à un échec sans rapport ou à une régression.

**Ne pas** : monter `/var/run/docker.sock` dans le conteneur `api` pour « corriger » ceci en conteneur — donner à un conteneur applicatif le contrôle du démon Docker de l'hôte est un changement de posture de sécurité, pas un correctif de test, et ne serait pris qu'après arbitrage explicite.

### Trois routes de liste paginée renvoyaient `data: null` — enveloppe HTTP silencieusement vidée (trouvé en construisant l'API client d'AdminScreen, Phase 9.2)

**Symptôme, jamais observé en test** : `GET /api/demandes` (`DemandesController.lister`), `GET /api/audit/securite` (`AuditController.journalSecurite`) et `GET /api/notifications` (`NotificationsController.lister`) renvoyaient chacun un corps HTTP `{ data: null, error: null, meta: { total: N } }` — `meta.total` correct, mais la liste elle-même absente. Aucun des trois n'a de test qui les appelle réellement en HTTP (`supertest`) : tous les tests existants appellent le service directement (`DemandeService.lister(...)`), jamais le contrôleur via une requête — ce qui explique que le défaut soit resté invisible malgré une suite verte.

**Cause, confirmée en lisant `ResponseEnvelopeInterceptor`, pas supposée** : les trois contrôleurs retournaient `{ demandes, meta: { total } }` / `{ entrees, meta }` / `{ notifications, meta }` — une clé de liste **autre que `data`**, à côté de `meta`. `estDejaEnveloppe()` (`response-envelope.interceptor.ts`) ne vérifie que la **présence** d'une clé `data`, `error` ou `meta` pour décider qu'un contrôleur a déjà enveloppé sa réponse lui-même ; dès que `meta` est présent, l'intercepteur fait `{ data: valeur.data ?? null, error: valeur.error ?? null, meta: valeur.meta ?? null }` — `valeur.data` n'existant pas, la liste réelle (`demandes`/`entrees`/`notifications`) est purement et simplement perdue.

**Corrigé** en alignant les trois contrôleurs sur la forme que l'intercepteur attend réellement : `return { data: demandes, meta: { total } }` (idem `entrees`/`notifications`) — zéro changement à l'intercepteur partagé, qui gérait déjà correctement ce cas (son propre commentaire le dit : « Un contrôleur peut déjà retourner `{ data, meta }` »). Vérifié : `pnpm --filter @pgd/api typecheck` vert, et un nouveau test unitaire `apps/api/test/response-envelope.interceptor.spec.ts` (aucune dépendance DB/Redis, isole l'intercepteur seul) pin le contrat : une réponse `{ data, meta }` traverse intacte ; une réponse `{ <autre-clé>, meta }` — la forme fautive exacte trouvée ici — perd sa liste (test qui documente le piège plutôt que d'empêcher l'intercepteur de le faire, cf. « Ne pas » ci-dessous).

**Ne pas** : élargir `estDejaEnveloppe()` pour deviner/fusionner une clé de liste arbitraire — l'intercepteur est un composant partagé et générique (tout contrôleur de l'API le traverse) ; lui apprendre à reconnaître des formes de contrôleur ad hoc serait exactement le genre de couplage fragile que la convention `{ data, meta }` existe pour éviter. Le contrat reste simple et à la charge du contrôleur : **toute réponse paginée doit être `{ data: [...], meta: { total } }`**, jamais une autre clé.

**Balayage complet effectué** (pas seulement les 3 routes trouvées en construisant AdminScreen) : les 18 fichiers `*.controller.ts` d'`apps/api/src` ont été inspectés — chaque type de retour `Promise<{...}>` inline et chaque type nommé (`TachesListeReponse`, `PaliersListeReponse`, `ImportCrmReponse`, `SanteDetail`, `CompteAvecLignes`, `FormulesDeLigne`, etc.). Aucune autre route ne porte une clé `meta` à côté d'une clé de liste autre que `data`. Deux formes cohabitent légitimement et ne se confondent jamais avec le piège : le total porté **dans** le DTO lui-même (`{taches, total}`, `{paliers, trous}` — jamais de clé `meta`, `estDejaEnveloppe()` ne se déclenche pas dessus), et `{data, meta}` — la forme correcte.

**Généralisé en test structurel, pas seulement pin des 3 cas connus** : `apps/api/test/envelope-contract.spec.ts` lit l'AST réel (compilateur TypeScript, déjà une dépendance) de chaque `*.controller.ts`, extrait tout `return { ... }` littéral, et échoue si une réponse porte `meta` sans `data` — sur **n'importe quelle route future**, sans table à tenir à jour. Contrairement à `guard-coverage.spec.ts` (une table route → guards attendus est nécessaire faute de décorateur marquant « ceci est une route de liste »), l'invariant « `meta` implique `data` » est universel et vérifiable sans connaître à l'avance quelles routes existeront — structurellement supérieur à une table pour ce cas précis, mais ce n'est pas un pattern général : un contrôle qui a besoin de savoir QUELLES routes sont concernées (guards de portée) reste nécessairement porté par une table, l'AST ne sait pas deviner une intention métier. Preuve que le test mord réellement : `{ demandes, meta }` réintroduit temporairement dans `DemandesController.lister` → échec avec fichier/ligne exacts ; revert (diff vide confirmé) → vert. Un test de non-régression qui n'a jamais été vu échouer sur le défaut qu'il prétend couvrir n'est qu'une hypothèse.

### `si-service.integration.spec.ts` — un test peut échouer parce que le conteneur `worker` réel consomme le message avant l'assertion (trouvé en sweep de fin d'étape, Phase 9.2)

**Symptôme** : `pnpm --filter @pgd/api test` lancé depuis l'hôte échoue de façon intermittente sur « rejeu manuel sous le plafond republie si.push sans lever d'erreur » — attend `{ etat: "ERREUR" }`, reçoit `{ etat: "ENVOYE" }`. Les 172 autres tests passent.

**Cause, confirmée en désactivant la variable, pas supposée** : ce test appelle `SiService.rejouerManuel()` directement (pas de mock de messagerie) contre la **vraie** connexion RabbitMQ (`ConnexionRabbitMQ`, `@pgd/messaging`) — il republie un message réel sur `si.push`. Si le conteneur `worker` du `docker compose` de dev tourne au même moment (cas normal : il tourne en continu pendant le développement), son consumer réel (`SiPushService`, `prefetch=1`) peut traiter ce message et faire passer `siEtat` à `ENVOYE` en base **avant** que l'assertion du test ne s'exécute — une vraie course entre le test et un consumer de production actif sur la même base/le même broker, pas une corruption de données. Reproduit dans les deux sens : `docker compose stop worker` puis relancer seulement ce fichier → **5/5 vert** ; `worker` actif → échec intermittent selon la latence du consumer.

**Ce n'est pas lié aux changements de cette session** : ni `si.service.ts` ni ce fichier de test n'ont été touchés depuis la Phase 4 (`git log` vérifié) — le défaut est pré-existant, simplement pas encore rencontré ou documenté.

**Geste** : si ce test échoue seul (les 172 autres verts) pendant un sweep depuis l'hôte, revérifier `docker compose ps worker` avant de le lire comme une régression — un `worker` actif suffit à l'expliquer. Pour une vérification déterministe de ce fichier précis, `docker compose stop worker` le temps du run, puis `docker compose start worker` ensuite (jamais `down`/`rm`, pas de perte d'état à ce prix).

**Ne pas** : mocker `ConnexionRabbitMQ` dans ce test pour le rendre silencieux vis-à-vis du worker — le test vérifie explicitement (commentaire du fichier) que le rejeu republie réellement sur le broker, un mock rendrait cette assertion vide de sens. Le bon correctif, s'il est fait un jour, isolerait le test (routing key ou file dédiée à l'exécution de test) plutôt que de couper la publication réelle — décision hors du périmètre de cette session, non prise ici.

**Ne pas confondre avec `ldap-provider.integration.spec.ts` ci-dessus — deux natures différentes, pas la même dette.** `ldap-provider` est un problème de **contexte d'exécution** (conteneur vs hôte) : déterministe et vert à 100 % depuis l'hôte, la couverture existe réellement, elle n'est simplement pas disponible dans tous les contextes de lancement. `si-service` est une **vraie course de concurrence** contre un processus tiers réel, reproductible peu importe où `pnpm test` est lancé (hôte ou conteneur) tant que `worker` tourne — une dette non résolue, pas une question de disponibilité. Les deux restent en l'état (non « réparés »), mais ne pas les traiter comme une seule et même catégorie de problème dans un futur compte-rendu.

### `GET /api/audit/securite` totalement inatteignable depuis la Phase 8 — collision d'ordre de routes (trouvé en vérifiant le périmètre ADMIN_PGD avant l'écran de consultation d'audit, Phase 9.2)

**Symptôme, jamais observé avant vérification en direct** : `curl` authentifié (n'importe quel rôle, y compris `ADMIN_PGD`) sur `GET /api/audit/securite` renvoyait systématiquement `500 ERREUR_INTERNE`, jamais le journal de sécurité ni un `403`. Le message serveur exact : `Inconsistent column data: Error creating UUID, invalid character... found "s" at 1`.

**Cause, confirmée en lisant les logs de boot Nest, pas supposée** : `AuditController` déclarait `@Get(":demandeId")` (`journalDemande`) **avant** `@Get("securite")` (`journalSecurite`). Express/Nest matchent les routes dans leur **ordre d'enregistrement** — une route à paramètre déclarée en premier absorbe tout, y compris un segment qui correspond textuellement à une route littérale déclarée après elle. `GET /api/audit/securite` était donc systématiquement intercepté par `journalDemande("securite")`, qui plante en essayant de parser `"securite"` comme un UUID. **Conséquence directe pour la sécurité** : `@Roles("ADMIN_PGD")` sur `journalSecurite` n'exécutait donc **jamais**, ni pour un admin ni pour quiconque — pas une fuite (personne ne pouvait rien lire, y compris un admin légitime), mais une route de code mort depuis son introduction en Phase 8 (`PGD-071`/`SF-PGD-006`), invisible à tous les tests existants (aucun n'appelle ces routes en HTTP réel — même défaut de couverture que le bug d'enveloppe ci-dessus).

**Corrigé** en réordonnant : `securite` (littéral) déclaré avant `:demandeId` (paramètre) dans le fichier. Aucun changement de logique, seulement l'ordre des méthodes. `:demandeId/export` n'était pas concerné (profondeur différente, deux segments contre un). Vérifié en direct dans les deux sens : session non-`ADMIN_PGD` → `403 ACCES_REFUSE` propre ; session `ADMIN_PGD` → `200` avec les entrées réelles (`meta.total: 344` au moment du test) ; `GET /api/audit/{demandeId}` toujours fonctionnel après le réordonnancement.

**Généralisé en test structurel** (même méthode AST que `envelope-contract.spec.ts`) : `apps/api/test/route-order.spec.ts` extrait, pour chaque contrôleur et chaque verbe HTTP, les routes dans leur ordre de déclaration réel, et échoue si une route à paramètre précède une route littérale de même profondeur — sur n'importe quel contrôleur futur, sans table à tenir à jour. Preuve que le test mord réellement : l'ancien ordre restauré temporairement → échec avec fichier/ligne exacts (`audit.controller.ts:26` avant `:32`) ; fix restauré → vert.

**Ne pas** : supposer qu'un test qui appelle le service directement (`AuditService.journalSecurite(...)`) aurait suffi à couvrir ceci — le bug est au niveau du **routage HTTP**, invisible tant qu'aucun test ne passe par une vraie requête. C'est la troisième fois cette phase que ce défaut de couverture précis (service testé, route jamais appelée en HTTP réel) cache un bug réel (cf. enveloppe HTTP ci-dessus) — un signal que la convention de test de ce projet (service-level, jamais HTTP réel) a un angle mort structurel, pas seulement trois coïncidences isolées.

### R6 (re-routage) est bien plus étroit que la question initialement posée ne le supposait (trouvé en construisant le déclencheur `Modifier` de `DossierDetailScreen`, Phase 9.2)

**Prémisse initiale, non vérifiée jusqu'à ce tour** : la question ouverte de longue date supposait qu'un « changement de montant ou de circuit » pouvait survenir sur un dossier déjà partiellement décidé, et que le mécanisme méritant vérification était la **préservation** des décisions déjà prises au milieu d'un re-routage. Les deux volets de cette prémisse sont faux, confirmés en lisant `packages/contracts/src/demande.ts` et `demande-workflow.service.ts`, pas supposés.

**`circuit` n'est pas modifiable par `PATCH /api/demandes/{id}`** : `modifierDemandeRequeteSchema = creerDemandeRequeteSchema.omit({ circuit: true }).partial()` — le champ est structurellement absent du schéma de requête, pas seulement ignoré s'il est envoyé. Le segment et le routage en dépendent, donc le circuit ne se change jamais après création.

**Le montant n'est jamais un champ direct de cette route** : `montantTtc` ne fait pas partie de `modifierDemandeRequeteSchema` non plus — le montant découle exclusivement des lignes retenues (`PUT /api/demandes/{id}/lignes`, `R18`), jamais d'une valeur saisie sur la demande elle-même.

**La fenêtre d'éligibilité de R6 est binaire, pas un état intermédiaire à préserver** : `DemandeWorkflowService.verifierAucuneDecision()` (partagée par `modifier`/`rappeler`/`abandonner`) lève `422 DECISION_DEJA_PRISE` dès qu'**une seule** étape porte `etat` dans `[APPROUVEE, REJETEE]` — définitivement, pour le reste du cycle de vie du dossier. Il n'existe donc aucun scénario réel où un re-routage doit « fusionner autour » de décisions déjà prises : soit zéro décision n'a encore été prise (le re-routage supprime et réinstancie toute la chaîne sans rien à préserver), soit au moins une décision existe (le serveur refuse la modification avant de toucher quoi que ce soit). La préservation vient du **refus avant écriture**, pas d'une logique de fusion.

**Vérifié en direct dans les deux sens** (Phase 9.2, déclencheur `Modifier` construit dans le même tour) :
- 0 décision (`DOBB-2026-629A73`) : `PATCH` réussi → chaîne de tâches supprimée puis réinstanciée, compteur d'escalade remis à zéro, nouvelle entrée `journalAudit` « re-routage », champs modifiés visibles.
- 1 décision (`DF-2026-56EB9D`, étape `FRA` déjà `APPROUVEE`) : bouton `Modifier` absent côté UI (`aucuneDecisionPrise` calculé côté client, confort d'affichage seulement) ; appel API direct → `422 DECISION_DEJA_PRISE` ; requête DB avant/après confirmant la tâche décidée (id, `dateDecision`, tous les champs) strictement inchangée.

**Ne pas** : rouvrir cette question comme si elle restait ouverte — elle est maintenant vérifiée en conditions réelles, dans les deux sens, et documentée ici pour ne pas la reposer en Phase 10+.

### `demande.statut` n'atteint jamais `EN_COURS` dans le backend réel — valeur d'énumération morte (trouvé en construisant `MesDemandesScreen`, confirmé en revue Phase 9.2)

**Constat, par recherche exhaustive, pas par lecture partielle** : `grep -rn "EN_COURS" apps/api/src` ne retourne aucune occurrence hors la déclaration de l'enum elle-même (`packages/contracts`, `schema.prisma`). Aucun chemin de code n'assigne jamais `statut = 'EN_COURS'` à une demande.

**Cause** : les transitions réelles de `demande.statut` ne mènent qu'à `VALIDE` (validation finale) ou `REJETE` (rejet) — `R10`. Chaque approbation intermédiaire fait avancer `etapeCourante`, jamais `statut`, qui reste `SOUMIS` pendant tout le cycle de vie « en cours de circuit ». `EN_COURS` existe dans l'énumération sans qu'aucun service ne l'atteigne jamais.

**Conséquences déjà présentes dans le code livré, aucune n'est un bug — des branches mortes inoffensives, à connaître avant d'en ajouter d'autres** :
- `MesDemandesScreen` : l'option de filtre « En cours » du sélecteur de statut ne retournera jamais de résultat (correcte par construction — elle interroge `statut = EN_COURS` fidèlement, c'est le backend qui ne produit jamais cette valeur).
- Badge Sidebar « Mes demandes » (`app/page.tsx`, `rafraichirCompteMesDemandes`) : calculé comme `SOUMIS + EN_COURS` — le second terme vaut toujours 0, le badge reflète en pratique uniquement `SOUMIS`. Documenté ici plutôt que simplifié : la formule reste correcte si `EN_COURS` devient un jour atteignable (cf. hypothèse ci-dessous), la simplifier maintenant serait recréer le même trou plus tard.
- `DossierDetailScreen` : `peutAbandonnerOuRappeler`/`peutModifier` testent `statut === "SOUMIS" || statut === "EN_COURS"` — la seconde moitié du test est une branche morte, `SOUMIS` seul suffit aujourd'hui.

**Hypothèse non vérifiée, à ne pas coder dessus** : `EN_COURS` a peut-être été prévu pour distinguer « soumis, aucune étape encore traitée » de « au moins une étape déjà décidée, circuit en cours » — une transition qui n'a jamais été implémentée, pas nécessairement une valeur à supprimer. Question business, pas technique : à trancher avec le même arbitrage que les autres valeurs d'énumération surnuméraires du projet (cf. « 34 rôles maquette vs 25 seedés »), pas une décision à prendre en passant.

**Ne pas** : retirer `EN_COURS` de l'énumération ou des trois endroits ci-dessus pour « nettoyer » — sans arbitrage métier explicite, ce serait deviner que la valeur est définitivement inutile plutôt que simplement jamais encore câblée.

### R24 — SoD étendu au contrôle a posteriori (formalisé, Phase 9, clôture)

**Non documenté avant ce tour, découvert en conditions réelles, pas en lisant le code d'abord** : lors de l'essai de bout en bout complet (connexion → soumission → claim/approbation → contrôle a posteriori sur un dossier DF réel, `DF-2026-AF5715`), la même identité (`jean.kouassi`, alors porteuse du rôle `DF`) a approuvé l'étape bloquante `ordre=4` (`DF`) puis tenté le contrôle FRA `ordre=5` sur le même dossier. La tentative a été refusée : `403`, `Refus SoD` journalisé dans `JOURNAL_SECURITE`, message « Vous êtes déjà intervenu à l'étape précédente de ce dossier. »

**Cause, confirmée en lisant `SodService.verifier`, pas supposée** : la vérification compare l'acteur courant à l'acteur de `JournalAudit` pour la tâche d'`ordre - 1` du même dossier, sans distinguer une étape de vérification (`typeActeur = 'V'`) d'une étape de contrôle (`typeActeur = 'C'`) — R3 s'applique donc uniformément à toute étape avec un prédécesseur direct, contrôle FRA compris, dès lors que le contrôle suit immédiatement (`ordre - 1`) l'étape que le même acteur a décidée. Ce n'était pas une hypothèse à vérifier avant ce tour : la question ne s'était simplement jamais posée, faute d'avoir jusqu'ici exercé claim+approbation ET contrôle a posteriori par le même acteur sur un même dossier réel.

**Formalisé en règle à part entière, pas laissé comme simple constat de session** : `R24` (table « Règles métier » ci-dessus) — même statut que `R21` en son temps pour la délégation, une clause qui étend R3 à un cas que la formulation d'origine ne nommait pas explicitement. Verrouillé structurellement par `apps/api/test/sod-service.integration.spec.ts`, nouveau describe `SodService — R24 (SoD étendu au contrôle a posteriori, typeActeur='C')` : construit une tâche bloquante `typeActeur='V'` à `ordre=1` (approuvée par un acteur) suivie d'une tâche de contrôle `typeActeur='C'` à `ordre=2`, puis vérifie le conflit (même acteur → conflit ; acteur distinct → pas de conflit). **Preuve que le test mord réellement, pas une hypothèse** : `SodService.verifier` temporairement modifié pour court-circuiter la vérification quand `typeActeur='C'` (simulant l'erreur qu'un futur refactor pourrait introduire, par exemple en pensant à tort qu'un contrôle « hors chemin bloquant » est hors SoD) → le nouveau test échoue précisément et uniquement sur l'assertion `conflit === true`, les 7 autres tests du fichier restent verts ; réversion → 8/8 verts. Sans ce test, la seule preuve de R24 aurait été l'observation ponctuelle de ce tour — jamais rejouée, donc jamais protégée contre une régression future.

**Conséquence pratique pour la suite des vérifications live** : réutiliser une seule identité de test à travers toute une chaîne DF (comme fait par commodité dans des vérifications précédentes plus ciblées) fonctionne pour les étapes de vérification classiques mais échoue avec un vrai `403` dès que cette identité touche à la fois la dernière étape bloquante et le contrôle FRA qui la suit. Une identité distincte est nécessaire pour le contrôle dès que l'acteur de l'étape précédente est connu.

**Ne pas** : conclure que R3/R24 sont mal implémentées — le comportement observé est cohérent avec la lettre de la règle (« un agent ne valide pas l'étape N s'il a agi à l'étape N-1 du même dossier », sans exception pour les étapes de contrôle) et a empêché exactement le scénario qu'il est censé empêcher. C'est une confirmation, pas un bug.

**Effet de bord découvert en construisant une identité de contrôle distincte** (`fra.controleur`, bootstrap TOTP) : reformulé et déplacé dans « Questions ouvertes » ci-dessous — ce n'est plus une hypothèse de bootstrap de test, c'est un blocage utilisateur réel confirmé (cf. « Repli DUO indisponible — bloquant confirmé, plus une hypothèse »).

### État des lieux Phase 9 — clôture (après `LoginScreen`, `MesDemandesScreen`, `AuditSecuriteScreen`, déclencheur `Modifier`)

Inventaire vérifié contre le contenu réel de `docs/design/` (noms de composants exportés), pas contre la mémoire d'une session précédente.

**Construit** : coquille (Sidebar/Topbar), `LoginScreen` (identifiants LDAP + défi MFA DUO/TOTP, cf. section dédiée ci-dessus), `HomeScreen`, `NouvelleDemandeScreen` (avec le correctif montant), `MesDemandesScreen`, `CorbeillesScreen`, `DossierDetailScreen`, `ControleScreen`, `AdminScreen` (7 onglets — clôt les écrans de `screens3.jsx`), `AuditSecuriteScreen`.

**Lacune résolue — `AuditSecuriteScreen`.** `GET /api/audit/securite` — inatteignable depuis la Phase 8 (cf. section dédiée ci-dessus) avant d'être corrigée dans le même tour — a désormais un écran réel (`components/screens/audit/`), volontairement restreint au journal de **sécurité** (connexions, MFA, refus RBAC/SoD), jamais présenté comme l'audit complet du système : l'en-tête de l'écran le dit explicitement, pour ne pas confondre avec le journal d'audit métier par dossier (déjà consultable dans `DossierDetailScreen`, toujours sans vue transversale côté serveur). Composant de table dédié (`JournalSecuriteTable`), pas de réutilisation forcée de `DossierTable` : les deux entités (`JournalSecuriteVue` vs `Demande`) n'ont aucun champ en commun. `JournalSecuriteVue.identifiantAd` ajouté côté serveur dans le même tour (résolu par jointure) pour éviter d'afficher des UUID bruts. Vérifié en direct : filtres compte/événement/dates fonctionnels seuls et combinés sur 383 événements réels, fallback « Compte inconnu ou supprimé » affiché correctement pour un compte de test supprimé plus tôt dans la session.

**Lacune résolue — `MesDemandesScreen`.** `GET /api/demandes?profil=initiateur` a désormais un écran réel (`components/screens/mes-demandes/MesDemandesScreen.tsx`) — filtres circuit/statut/recherche envoyés au serveur, pagination réelle, aucun sélecteur « initiateur » (structurellement inutile : un seul initiateur possible sur cet écran, déjà forcé côté serveur). `DossierTable` extrait en composant partagé (`components/shared/`), pensé pour être repris par l'écran de consultation d'audit à venir. Badge Sidebar « Mes demandes » câblé (SOUMIS + EN_COURS) — jusqu'ici jamais alimenté malgré la prop déjà présente sur `AppShell`. Vérifié en direct : 6 dossiers réels correctement scopés, filtre par statut, ouverture d'un dossier, badge exact (5).

**Lacune résolue — écran de connexion.** `screens_auth.jsx` (`LoginScreen`) a désormais une contrepartie réelle dans `apps/web` (`components/screens/auth/LoginScreen.tsx`, routes `/` et `/login`). Vérifié en direct par l'interface elle-même (pas par script) : identifiants+TOTP réussis → session → `HomeScreen` ; identifiants invalides → message lisible ; déconnexion → retour à `LoginScreen` ; compte `TOTP` sans secret enrôlé → message de non-provisionnement, sans champ de code ; DUO indisponible → `503 MFA_INDISPONIBLE` affiché lisiblement. Chaque vérification live des étapes précédentes de cette session (Phase 9.2 avant ce commit) avait posé un cookie de session hors application (`fetch` direct, login+MFA scriptés) — ce n'est plus nécessaire. `MfaChallenge`/`DemoAccounts`/sélecteur de persona du mockup restent hors périmètre (logique cliente jamais portée, même traitement que `RoleMenu`).

**Jalon — premier parcours complet.** Avec `LoginScreen`, l'application cesse d'être une collection d'écrans vérifiés isolément : un utilisateur peut désormais entrer (identifiants + MFA réels), agir (saisir/router/valider/administrer selon son rôle) et sortir (déconnexion) sans aucune intervention hors application. Chaque écran précédent avait été vérifié en direct individuellement, cookie posé à la main ; c'est la première fois que le chemin d'entrée lui-même fait partie du parcours vérifié.

**Autres écrans du mockup sans contrepartie** :
- `ConsultationScreen` (`screens2.jsx`) — réutilise `DossierExplorer` sur l'ensemble des dossiers, sans scope `profil`. Distinct du journal de sécurité (`AuditSecuriteScreen`, construit ce tour) : c'est une vue globale des demandes, pas un journal d'événements. Route backend déjà ouverte (`GET /api/demandes` sans `profil`, docs/06 §4), jamais câblée à un écran.
- La « Transitions des dossiers » de la maquette `AuditScreen` (`screens3.jsx`) — agrégation `JournalAuditVue` à travers tous les dossiers — n'a toujours aucune route serveur (cf. Questions ouvertes, « Aucun flux d'activité récent transversal n'existe »). `AuditSecuriteScreen` ne couvre que l'onglet « Sécurité » de cette même maquette, le seul avec une route réelle.
- `MasseScreen`, `IntegrationsScreen` (`screens4.jsx`) — aucune route backend, aucune trace nulle part : même famille que Utilisateurs/Moniteur (AdminScreen), jamais nommée comme telle jusqu'ici.

**Lacune résolue — déclencheur `Modifier` (R6).** `DossierDetailScreen` expose désormais le bouton conditionné à initiateur + statut ∈ {SOUMIS, EN_COURS} + aucune décision déjà prise ; formulaire minimal (`nomClient`/`libelle`/`commentaire` — ni `circuit` ni montant, non modifiables via cette route). Voir la section dédiée ci-dessus pour le détail de la vérification live et la correction de la prémisse initiale de la question (R6 est plus étroit qu'on ne le supposait). Entrée Sidebar « Modules », redondante avec l'onglet « Paramètres système » d'AdminScreen, retirée dans le même tour.

**Dans `DossierDetailScreen`, actions du mockup encore non couvertes** : `Déléguer`/`Réaffecter` restent exclus (route de recherche d'agent manquante, déjà consignée) ; Approuver/Rejeter sont des actions simples, pas la revue champ par champ **spécifiée par `PGD-055`/`SF-PGD-080`/`081`** (pas seulement montrée par le mockup `ApproveModal`) — backend déjà prêt (`approuverRequeteSchema.revue`), jamais peuplé côté écran. Entrée dédiée dans `docs/design/DIVERGENCES.md` (« Fonctionnalité spécifiée ET maquettée, non construite à l'écran »), pas seulement cette ligne — un écart de contrat d'interaction, pas un détail.

**Questions métier non tranchées** (inchangées, cf. « Questions ouvertes » plus bas) : seuils/rôles de subdélégation DOBB/DXC, N1/N2 jamais câblés dans aucun palier, destinataires des notifications ESCALADE/ERREUR_SI, rôle habilité au rejeu SI manuel et à l'export d'audit, rattachement agent→direction/service pour le scoping KPI, escalade SLA sans effet de déblocage réel.

**Essai de bout en bout unique, exécuté en clôture** : connexion → création de demande DF → ajout de lignes → aperçu de routage → soumission → claim et approbation (quatre étapes bloquantes, quatre identités distinctes — cf. section R3/SoD dédiée ci-dessus) → contrôle a posteriori FRA → consultation dans Mes demandes → vérification dans le journal de sécurité, sur un dossier fraîchement créé (`DF-2026-AF5715`), sans aucune intervention hors application au-delà du bootstrap des identités de test. Trouvaille non anticipée au passage : R3 (SoD) s'applique aussi au contrôle a posteriori, cf. section dédiée. Identités de test et groupes LDAP éphémères retirés de l'annuaire dev après vérification.

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

- Seuils et rôles définitifs de la fiche de subdélégation (défaut = tranches actuelles, paramétrable). **Conséquence concrète, pas seulement théorique** : faute de ces seuils pour DOBB/DXC, R12 (contrôle FRA) ne peut jamais s'y appliquer — voir l'entrée dédiée plus bas (« Aucun dossier DOBB ou DXC au-dessus de 5 000 000 FCFA ne peut être soumis aujourd'hui »), les deux se résolvent ensemble.
- Politique par défaut sur ligne `RESILIE` (défaut = `BLOQUANT`).
- Contrat exact des API BSCS / GAIA (bouchon en attendant).
- **Repli DUO indisponible — bloquant confirmé, plus une hypothèse (reformulé Phase 9, clôture).** Ce n'était pas seulement une question de « procédure formelle » à écrire : `Utilisateur.mfaMethode` a pour défaut `DUO` (`schema.prisma:171`) et **aucun chemin de code — ni route admin, ni self-service — ne le fait jamais passer à `TOTP`**, y compris après un enrôlement TOTP réussi (`POST /api/auth/mfa/enroll/totp/confirm` écrit `totpSecret`, jamais `mfaMethode`). Confirmé par recherche exhaustive (Phase 9, en construisant une identité de contrôle pour la vérification R24 ci-dessus) : `grep` de `mfaMethode` dans `apps/api/src` ne retourne que des lectures. **Conséquence concrète** : un utilisateur dont le rôle exige la MFA, `mfaMethode` encore à `DUO`, et qui rencontre `503 MFA_INDISPONIBLE` (DUO non configuré ou en panne) n'a **aucun recours applicatif** — ni pour enrôler TOTP (bloqué par la question déjà consignée plus haut, `mfa/verify` exige un second facteur déjà fonctionnel), ni pour signaler que son compte devrait utiliser TOTP à la place. Seule une écriture en base directe (hors application) débloque la situation — c'est ce qui a été fait pour la vérification de cette session, pas un contournement disponible à un utilisateur réel. À trancher avec le métier avant recette : soit une route de bascule `DUO → TOTP` (admin ou self-service, avec les mêmes garde-fous que l'enrôlement) doit être construite, soit DUO doit avoir une garantie de disponibilité qui rend ce chemin de repli non critique — les deux réponses sont légitimes, mais le statu quo actuel laisse un utilisateur MFA-obligatoire sans porte de sortie.
- **L'enrôlement TOTP doit-il être en libre-service depuis l'écran de connexion, ou rester un provisionnement administrateur ?** Question de sécurité, pas d'ergonomie — à trancher avec la même conversation que le point précédent (procédure de repli DUO). Trouvé en construisant `LoginScreen` (Phase 9.2) : `POST /api/auth/mfa/enroll/totp` et `.../confirm` exigent `@Authenticated()` (une session déjà valide) — un utilisateur dont `mfaMethode=TOTP` sans secret enrôlé ne peut jamais obtenir de session pour venir enrôler (`mfa/verify` échoue toujours sans `totpSecret`), déjà signalé dans le code (`auth.controller.ts`, commentaire « LIMITE NON RÉSOLUE ») comme délibérément non résolu. Une extension technique existe (amorcer l'enrôlement via le `challengeId` émis après la seule vérification LDAP+mot de passe, avant tout second facteur) mais a été refusée en revue : elle ouvrirait un chemin où un second facteur s'établit avec un seul facteur vérifié — exactement ce que le MFA existe pour empêcher, en particulier sur les rôles à `requiertMfa` (les plus sensibles). `LoginScreen` affiche donc un message explicite (« compte non provisionné pour l'authentification à deux facteurs, contactez votre administrateur ») plutôt qu'un échec silencieux ou une tentative d'enrôlement inline — décision délibérée, pas une lacune d'écran.
- **Aucune route de provisionnement TOTP n'existe aujourd'hui — ni admin, ni seed.** Vérifié en cherchant chaque écriture de `totpSecret` dans `apps/api/src` (une seule occurrence, `confirmEnrollTotp`, self-service authentifié) et dans `packages/database/prisma/seed/` (aucune). Le secret actuellement enrôlé pour le compte de démonstration (`jean.kouassi`) a été établi via ce même flux self-service lors d'une session antérieure — possible uniquement parce que le compte, à ce moment, ne détenait encore aucun rôle à `requiertMfa` (le login n'exige alors aucun second facteur, une session s'obtient directement). Ce n'est pas un mécanisme de provisionnement répétable : un nouvel utilisateur assigné dès la création à un rôle exigeant la MFA (`ADMIN_PGD`, `FRA`, etc.) ne peut aujourd'hui **jamais** enrôler de TOTP, par aucun chemin. À traiter avec les deux questions ci-dessus, pas seulement comme un défaut isolé.
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
- **`GET /api/notifications` — question fermée et implémentée (Phase 9.2).** `NotificationsController` (nouveau module `apps/api/src/modules/notifications/`) expose `GET /api/notifications` (pagination `page`/`limit`, filtre optionnel `lu`) et `PATCH /api/notifications/{id}/lu`. Périmètre forcé par construction sur `lister` (`where.destinataireId = utilisateur.id`, jamais un paramètre client — même garde que `profil=initiateur`), donc **pas de guard de propriété nécessaire sur cette route**, même raisonnement que `DemandesController.creer`. `marquerLue` agit sur une ressource déjà identifiée par id : porte `NotificationDestinataireGuard` (nouveau, même structure que `InitiateurDemandeGuard`), avec sa propre entrée `guard-coverage.spec.ts` (`TABLE_NOTIFICATIONS`). Vérifié dans les deux sens : `notification-destinataire.guard.spec.ts` (destinataire réel → autorisé ; tiers → 403 `PAS_DESTINATAIRE`, `RBAC_REFUS` journalisé) et `notifications.integration.spec.ts` (`lister` d'un destinataire n'expose jamais celles d'un autre ; filtre `lu` correctement borné ; `marquerLue` rejette 422 `NOTIFICATION_DEJA_LUE` sur une notification déjà lue et 404 sur un id inexistant). `docs/design/app.jsx` (`NotifDropdown`) n'a jamais fait foi ici — sa forme (`myTasks`/`myAlerts`) vient de la simulation client (`engine.jsx`/`data.jsx`, jamais portée), pas du modèle réel `Notification` (`destinataireId`/`type`/`canal`/`lu`/`horodatage`). Reste à faire côté écran : `apps/web` ne consomme pas encore cette route — à câbler avec la cloche de notification quand `DossierDetailScreen`/corbeilles seront repris.
- **« Mes demandes » — question fermée et implémentée (Phase 9.2).** `listerDemandesQuerySchema` porte désormais `profil: z.enum(["initiateur"]).optional()` ; `DemandesController.lister` injecte `@CurrentUser()` et transmet `utilisateur.id` à `DemandeService.lister(query, utilisateurId)`, qui force `where.initiateurId = utilisateurId` quand `profil === "initiateur"` — jamais un `initiateurId` accepté en paramètre client, même garde que `GET /api/kpi?profil=initiateur`. Additif, pas une restriction : sans `profil`, la liste reste non scopée (docs/06 §4, choix documenté, inchangé). Vérifié dans les deux sens par un test d'intégration dédié (`demande-workflow.integration.spec.ts`, describe `DemandeService.lister`) : avec `profil=initiateur`, le dossier d'un autre agent reste invisible ; sans `profil`, il reste visible. **Pas d'entrée `guard-coverage.spec.ts`** — `lister` reste une route `GET`, structurellement exclue de `listerRoutesEcriture()` (vérifié, pas supposé) ; la portée y est un filtre de `WHERE`, pas un guard de route. Reste à faire côté écran : `apps/web` ne consomme pas encore `profil=initiateur` — à câbler avec la tuile « mes demandes » quand `DossierDetailScreen`/corbeilles seront repris.
- **Aucune route ne sert le fichier réel d'une pièce jointe — touche `GedPort`, pas seulement une route manquante (trouvé en construisant `PiecesTab`, `DossierDetailScreen`, Phase 9.2).** `POST /api/demandes/{id}/pieces` et `DELETE .../pieces/{pieceId}` existent ; `GedStubAdapter.stocker` écrit un vrai fichier sur disque (`GED_STORAGE_PATH`), et `PieceJointe.gedRef` porte déjà la référence — mais `GedPort` (`apps/api/src/modules/demandes/ports/ged.port.ts`) n'expose aujourd'hui que `stocker`/`supprimer`, aucune méthode de lecture. Servir le fichier exige donc d'étendre le **port**, pas juste d'ajouter une route qui l'appellerait : un `GedPort.lire(gedRef): Promise<Buffer>` (ou équivalent stream) à ajouter à l'interface ET à `GedStubAdapter`, avant que la route `GET /api/demandes/{id}/pieces/{pieceId}` ait quoi que ce soit à appeler. La GED est un bouchon commutable depuis la Phase 1 (`Ports d'intégration`) — un vrai adaptateur GED (Orange) devra implémenter cette même méthode. `PiecesTab` affiche nom/type/taille et permet ajout/suppression, sans lien de téléchargement : absence constatée, pas un lien mort ajouté en devinant une route. Ouverture de la future route : même principe que le reste du dossier (docs/06 §4) — la pièce appartient à un dossier déjà lisible.
- **Aucune route ne liste ou ne recherche les utilisateurs — trois besoins distincts qui appellent la même route absente (Phase 9.2), regroupés ici plutôt que traités séparément.** (1) `POST /api/taches/{id}/deleguer` (`TacheActionBanner`) exige `delegataireId` (uuid) sans aucun moyen de le résoudre depuis un nom/identifiant AD — un champ texte demandant un UUID brut aurait été une UX qui ne fonctionne pas, omis plutôt que construit sur une supposition. (2) La résolution `agentClaimId` → nom pour un collègue de corbeille (`CorbeillesScreen`) reste une comparaison d'identifiants (« récupéré par vous » vs générique), jamais un nom, faute de route. (3) L'onglet « Utilisateurs » de la maquette `AdminScreen` (`docs/design/screens3.jsx`, `UsersView`) n'a aucune route derrière — exclu du rendu, pas remplacé par un onglet vide. Les trois se résolvent par la MÊME route manquante (recherche/listing d'utilisateurs, probablement bornée par rôle ou par corbeille plutôt qu'un annuaire ouvert — question de portée à trancher en même temps que la route elle-même) : à traiter comme un seul chantier, pas trois tickets séparés.
- **Le contrôle a posteriori N1/N2 est-il prévu sur un circuit, ou seul le contrôle FRA (R12, > 5 M) s'applique ?** Trouvé en construisant `ControleScreen` (Phase 9.2) : `ControleService.NIVEAU_PAR_ROLE` sait mapper trois rôles (`FRA`/`CONTROLE_N1`/`CONTROLE_N2`) vers l'enum `EnumNiveauControle`, les trois existent au catalogue (`roles.seed.ts`) — mais `packages/database/prisma/seed/referentiels/paliers.seed.ts` ne câble QUE `FRA` dans une `EtapeRegle` (déclenché par le montant TTC > 5M, R12, indépendant du circuit). Aucune `ConfigurationCircuit` ne porte `CONTROLE_N1` ou `CONTROLE_N2` : dans l'état actuel du référentiel, **aucun dossier, sur aucun circuit, ne peut produire de tâche de contrôle N1 ou N2** — le mécanisme de contrôle a posteriori se réduit en pratique au FRA de R12. Ce n'est pas un défaut de code (le service et le seed reflètent fidèlement les sources disponibles en Phase 8), mais une fonctionnalité livrée partiellement inerte. Question business, pas technique, à rapprocher de la question des « 34 rôles maquette vs 25 seedés » (`docs/design/DIVERGENCES.md`, même famille : référentiel incomplet ou surnuméraire selon le cas) : soit N1/N2 doivent être configurés (il manque des paliers dans les fiches de subdélégation), soit ils ne servent jamais et `CONTROLE_N1`/`CONTROLE_N2` sont deux rôles morts à retirer du catalogue. `ControleScreen` n'invente aucun découpage par circuit en attendant — il affiche les niveaux réellement présents dans les données, sans ensemble présupposé (le CRUD admin des paliers, Phase 5.5, permet de configurer N1/N2 plus tard sans toucher au code).
- **Aucun dossier DOBB ou DXC au-dessus de 5 000 000 FCFA ne peut être soumis aujourd'hui — R12 rejette systématiquement.** Trouvé en cherchant un dossier réel pour tester `ControleScreen` (Phase 9.2) : `paliers.seed.ts` ne seede qu'un palier unique non borné pour `DOBB` et `DXC` (`seedPalierMetierUnique`, sans étape `FRA`) — seul `DF` a des bornes chiffrées et câble `FRA` dans ses brackets 5M–50M et >50M (04_MCD_MLD_PGD_PROD.md §3.3, le seul endroit où des seuils réels existent). Conséquence directe, pas hypothétique : un dossier B2B (DOBB) ou B2C (DXC) dont le TTC dépasse 5M reçoit systématiquement `422 R12_CONTROLE_FRA` à la soumission, sans recours — aucune configuration ne peut jamais satisfaire R12 pour ces deux circuits en l'état. Un blocage fonctionnel réel sur deux circuits sur trois, précisément sur les dossiers à fort montant, pas un simple manque de configuration abstrait. Le message d'erreur renvoyé (`"Contrôle FRA obligatoire au-delà de 5 000 000 XOF — absent du palier sélectionné."`, affiché verbatim par `NouvelleDemandeScreen`) est factuellement exact mais n'indique pas à l'initiateur qu'il s'agit d'une lacune de configuration hors de son contrôle plutôt que d'une erreur de saisie corrigible. **Question à porter au métier** : « R12 (contrôle FRA obligatoire au-delà de 5 M, PO6-07) est-il applicable aux trois circuits, ou spécifique au DF ? Si applicable partout, les paliers DOBB et DXC au-dessus de 5 M doivent inclure une étape FRA — en leur absence, tout dossier B2B ou B2C dépassant 5 M est aujourd'hui insoumissible. » Corrigeable sans code via le CRUD admin des paliers (Phase 5.5, PGD-042) dès que la réponse est connue — une décision métier, pas technique. À rapprocher directement du premier point de cette liste (« seuils et rôles définitifs de la fiche de subdélégation ») : ce blocage est la conséquence concrète de ce seuil jamais fourni, pas un problème distinct — les deux se résolvent ensemble le jour où les fiches de subdélégation réelles de DOBB/DXC arrivent.
- **`Controle` s'écrit depuis la Phase 8, ne se lit nulle part — même situation que les notifications avant cette semaine.** `ControleService.soumettre` crée une ligne `Controle` et renvoie son `ControleVue`, mais aucune route ne liste les contrôles déjà réalisés (ni par dossier au-delà de l'entrée `JournalAudit` correspondante, ni en agrégat). `ControleScreen` (Phase 9.2) n'affiche donc que la file en attente (`GET /api/taches?etat=POST_CLOTURE`), jamais de section « Contrôles réalisés » — absence constatée, pas une table vide construite en devinant une forme de réponse. À traiter comme étape API dédiée (probablement `GET /api/controle?...` avec pagination) quand un lot backend sera repris, même famille de trou que `GET /api/notifications` avant sa fermeture.
- **Aucun flux d'activité récente transversal n'existe — même lot, trouvé au même moment.** `GET /api/audit/{demandeId}` (`AuditController`) est scopé à UN seul dossier ; `GET /api/audit/securite` est un flux transversal mais sémantiquement différent (journal de SÉCURITÉ — connexions, refus RBAC/SoD — pas les actions métier « approuvé »/« rejeté »/« soumis »), et réservé `ADMIN_PGD`. Il n'existe aujourd'hui aucune route qui agrège `JournalAudit` à travers plusieurs dossiers pour un flux « activité récente » de type tableau de bord. La section « Activité récente » de `docs/design/screens1.jsx` (`HomeScreen`, fonction `recentActivity`) n'a donc pas été portée — omise plutôt qu'alimentée par un appel inventé. À traiter comme sa propre étape API (nouvelle route d'agrégation, avec sa propre décision de portée — probablement scopée aux dossiers où l'utilisateur est initiateur ou détient une tâche, à trancher explicitement, pas par défaut) plutôt que construite en passant pendant l'écran d'accueil.
- **`DELETE /api/demandes/{id}` (suppression physique d'un BROUILLON) — question fermée et implémentée (Phase 9.2).** Restreinte au statut `BROUILLON` (422 `DEMANDE_NON_SUPPRIMABLE` sinon) et à l'initiateur (`InitiateurDemandeGuard`, entrée dans `guard-coverage.spec.ts`). Suppression physique en cascade (`DemandeLigne`/`HistoriqueMontant`/`PieceJointe`, `onDelete: Cascade`), plus nettoyage explicite des fichiers GED réels (`GedPort.supprimer`, jamais couvert par la seule cascade SQL) ; aucune trace `JournalAudit` à trancher, `creer`/`definirLignes` n'y écrivent jamais. **Reste à faire, pas encore une lacune côté serveur** : `NouvelleDemandeScreen` (apps/web) ne câble pas encore d'action « Supprimer ce brouillon » — l'endpoint existe, l'écran ne l'appelle pas. La déférence de création au premier `PUT .../lignes` (déjà en place) réduit le flux de brouillons orphelins, mais ne couvre pas ceux déjà créés avant cette route — un nettoyage périodique ou un écran dédié reste à envisager si le stock existant devient un problème réel.

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

## Phase 10 — Qualité (docs/05 §10, en cours)

### 10.1 — Couverture `src/modules/**` (baseline puis progrès ciblé)

Baseline mesurée en ouverture de phase : **73.84 % statements / 66.55 % branches / 64.31 % functions / 72.79 % lines**, sous la cible ≥80 %. Écart concentré sur `auth/` (33.09 %) plutôt que réparti uniformément — `session.service.ts` (20.8 %) et `rate-limit.service.ts` (33.3 %) portent respectivement la révocation de session JWT et le verrouillage anti-bruteforce, la couche la moins couverte du module le plus sensible (porte d'entrée de toute session applicative). Aucun test n'existait pour l'un ou l'autre avant ce tour.

Comblé par `apps/api/test/session-service.integration.spec.ts` (intégration réelle contre Redis, pas de mock — révocation immédiate vérifiée en supprimant la session Redis plutôt qu'en attendant l'expiration de la signature JWT, `marquerMfaSatisfaite`, `rafraichir` avec jeton invalide/session révoquée) et `rate-limit-service.integration.spec.ts` (seuil lu depuis l'environnement réel via `loadEnv()`, jamais supposé ; isolation par action et par identifiant — un utilisateur ne peut jamais consommer le quota d'un autre). `session.service.ts` : 20.8 % → 97.9 %. `rate-limit.service.ts` : 33.3 % → 100 %. `auth/** ` global : 33.09 % → 60 %.

**Ports à 0 % (`ldap.port.ts`, `mfa.port.ts`, `crm.port.ts`, `ged.port.ts`) vérifiés, pas exclus par supposition** : lecture des quatre fichiers confirme des interfaces TypeScript pures (effacées à la compilation) plus une seule ligne `export const XXX_PORT = "..."` chacune — le 0 % ne porte que sur cette ligne unique de constante, pas un trou de couverture réel. Aucun effort à y consacrer.

**Restant, volontairement pas traité dans ce tour** : `lignes/services` (47.77 %), `demandes.controller.ts` (57.74 %). Distinction posée avant d'y revenir : `CrmStubAdapter` (bouchon, remplacé avant recette, cf. « Ports d'intégration ») ne mérite pas le même investissement de couverture que `crm-import.service.ts` (logique métier qui consomme `CrmPort` via l'interface, survit intégralement au remplacement de l'adaptateur). Le même principe vaudra pour `GedStubAdapter`/`BscsAdapter`/`GaiaAdapter`.

### 10.2 / 10.4 — Pipeline CI (premier pipeline du projet)

**Aucune CI n'existait avant ce tour** (`.github/workflows` absent, confirmé par recherche, pas supposé) — chaque sweep de fin de phase de ce projet, jusqu'ici, a été rejoué manuellement sur un poste de dev. `.github/workflows/ci.yml` : services Postgres 16/Redis 7/RabbitMQ 3-management réels (pas de mock, cohérent avec la convention « tests contre référentiels »), configurés avec les identifiants/ports par défaut qu'`apps/api/test/setup-env.ts` et `apps/worker/test/setup-env.ts` posent déjà (`??=`) — aucune variable `DATABASE_URL`/`REDIS_URL`/`RABBITMQ_*` dupliquée dans le workflow, la coïncidence avec les mêmes valeurs qu'un `pnpm test` lancé depuis un poste de dev est délibérée.

**T1 (claim concurrent, PGD-051/R7) posé comme étape dédiée et nommée**, avant la suite complète — pas noyé dans un résumé générique : jusqu'ici rejoué uniquement à la main (« rejoué cinq fois pour écarter le flakiness », Phase 6). Un échec futur s'identifie immédiatement dans l'UI CI comme « la concurrence du claim est cassée », et ne peut pas disparaître silencieusement si la tâche `test` générique est réorganisée plus tard.

**Vérifié en conditions réelles avant d'être considéré fiable, pas seulement écrit** : trois conteneurs Postgres/Redis/RabbitMQ jetables montés sur des ports distincts de la stack de dev (pour partir d'un état réellement vierge, pas d'une base déjà migrée/seedée), migrations + seed rejoués dessus, puis suite complète — `apps/api` (35/35 suites, 195/195 tests, `ldap-provider.integration.spec.ts` et `si-service.integration.spec.ts` compris, aucun worker actif pour entrer en course avec ce dernier) et `apps/worker` (7/7 suites, 25/25 tests, RabbitMQ réel — topologie, si-push, sla-escalation, locks-sweeper, notifications, retry). Conteneurs jetables détruits après vérification.

**Le run #1 (premier push réel) a échoué — la validation locale précédente n'était pas la reproduction fidèle qu'elle prétendait être.** Étape « Appliquer les migrations » en échec. Cause confirmée, pas supposée : `apps/api/test/setup-env.ts`/`apps/worker/test/setup-env.ts` ne s'exécutent que comme `setupFiles` Jest — ils ne couvrent jamais les étapes qui invoquent Prisma en CLI brute (`migrate`, `seed`), qui tournent avant tout process Jest et sans `.env` (fichier gitignored, absent d'un checkout propre ; `packages/database/.env` existe aussi en local et est gitignoré de la même façon, découvert à cette occasion). Le commentaire du workflow affirmant qu'aucune variable `DATABASE_URL`/`REDIS_URL`/`RABBITMQ_*` n'était nécessaire était une supposition non vérifiée, pas un fait — et la « validation locale contre un environnement vierge » réalisée avant le premier push avait involontairement masqué exactement ce trou : chaque commande avait été lancée avec un export manuel de ces variables dans le shell, jamais rejouée depuis le fichier de workflow tel qu'il est réellement écrit. C'est précisément ce que le push réel, demandé explicitement plutôt que déduit d'une répétition locale, a fait remonter — la différence entre une hypothèse et une garantie.

**Corrigé** en posant `DATABASE_URL`/`REDIS_URL`/`RABBITMQ_*` au niveau du job, alignées sur les services déjà définis. **Revalidé localement une seconde fois, plus rigoureusement** : les deux fichiers `.env` (racine et `packages/database/.env`) temporairement déplacés hors du dépôt (pas seulement des variables shell explicites, qui avaient déjà failli une fois à représenter fidèlement le fichier de workflow), sur des conteneurs Postgres/Redis/RabbitMQ jetables distincts de la stack de dev — `generate` → `migrate` → `seed` → T1 → suite complète `apps/api` (35/35) et `apps/worker` (7/7), tout vert sans aucune variable héritée d'un `.env` local. `.env` restaurés, conteneurs détruits après vérification.

**Run #2, sur un vrai runner GitHub Actions, toutes les 17 étapes en succès** — `checkout` → `pnpm install` → `prisma generate` → migrations → seed → `lint` → `typecheck` → `build` → **T1 (SF-PGD-072, R7)** → suite complète (`api`+`worker`+`ui`). Premier pipeline de ce projet réellement vert de bout en bout sur une infrastructure CI, pas seulement reproduit localement.

### 10.3 — e2e par circuit, en HTTP réel

Formalise le parcours vérifié à la main en clôture de Phase 9 (connexion, création, lignes, aperçu de routage, soumission, claim+approbation, contrôle a posteriori) — un fichier par circuit, **véritables requêtes HTTP via `supertest`** contre l'app Nest complète (`apps/api/test/helpers/e2e-app.ts`, même montage que `main.ts` : cookie-parser, préfixe `/api`, filtre d'exception, intercepteurs), pas des appels de service directs. Authentification par session mintée directement (`SessionService.creerSession`, cookie posé sur la requête) plutôt que par un login LDAP réel — l'authentification AD/MFA est déjà couverte ailleurs (`ldap-provider.integration.spec.ts`, `LoginScreen`), ce que ces e2e vérifient est le **circuit** une fois authentifié, pas l'authentification elle-même. `CorbeilleRoleGuard`/`RbacGuard` ne relisent jamais `MembreRole` en base (confirmé en lisant les deux guards, pas supposé) — ils font confiance aux rôles portés par le JWT de la session, donc aucun bootstrap LDAP/`MembreRole` n'est nécessaire pour ces tests.

**Ferme un angle mort structurel déjà documenté trois fois cette phase** (bug d'enveloppe HTTP, collision d'ordre de routes, route d'audit inatteignable — CLAUDE.md, Phase 9.2) : aucun test de ce projet n'appelait ces routes en HTTP réel avant ce tour, seulement au niveau service. `dobb-circuit.e2e-spec.ts` / `dxc-circuit.e2e-spec.ts` / `df-circuit.e2e-spec.ts` sont les trois premiers à le faire pour le parcours de validation complet.

**DOBB et DXC restent délibérément sous 5M (R12)** — aucun palier DOBB/DXC ne câble d'étape FRA (confirmé par requête directe contre les paliers seedés avant d'écrire ces tests, pas supposé), question métier non tranchée (cf. Questions ouvertes, « Aucun dossier DOBB ou DXC au-dessus de 5 000 000 FCFA ne peut être soumis aujourd'hui »). Le parcours nominal de chaque test ne dépend donc pas d'un arbitrage à venir. Le rejet R12 au-dessus du seuil est vérifié **explicitement**, dans son propre test par circuit (`422 R12_CONTROLE_FRA`), plutôt que simplement évité — si les paliers DOBB/DXC gagnent un jour une étape FRA, ce test précis échouera et signalera le changement, pas un silence.

**DF couvre le seul palier réellement doté d'un contrôle FRA aujourd'hui** — cinq étapes (`RESPONSABLE_DF`/`MANAGER_DF`/`MANAGER_SENIOR_DF`/`DF` bloquantes, `FRA` en contrôle post-clôture), montant 6,5M HT (même ordre de grandeur que le dossier `DF-2026-AF5715` vérifié à la main en Phase 9). Acteur du contrôle FRA délibérément distinct du dernier approbateur bloquant (`DF`) — R24 (cf. section dédiée ci-dessus) interdirait sinon le contrôle par la même identité ; reproduit ici par construction, pas revérifié (R24 est déjà couvert unitairement par `sod-service.integration.spec.ts`).

**Preuve que le test DF mord réellement, pas une hypothèse** : `RuleEngineService.instancierChaine` temporairement saboté (`if (false && etape.typeActeur === "C")`, empêchant toute instanciation de tâche de contrôle) → le test échoue précisément sur l'assertion `statut === "VALIDE"` (reste à `SOUMIS`) ; revert → vert. Les cinq tests (`dobb`×2, `dxc`×2, `df`×1) tournent aussi bien isolément qu'en parallèle (Jest, un process par fichier, aucune interférence observée).

**Intégrés au pipeline CI comme étape dédiée**, immédiatement après T1 — même traitement, pas noyés dans la suite générique : `pnpm --filter @pgd/api test:e2e` (`**/test/**/*.e2e-spec.ts`, script déjà présent dans `apps/api/package.json` avant ce tour, jamais utilisé jusqu'ici). Tournent contre les mêmes conteneurs jetables que T1/la suite complète — pas la stack de dev persistante, aucune raison de s'en écarter une fois le pipeline en place.

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
