# PROMPT — Claude Code · Réalisation de la PGD

> À coller dans Claude Code au démarrage du dépôt, après avoir placé les livrables BMAD dans `docs/` et le `CLAUDE.md` à la racine.

---

## Prompt d'amorçage

```
Tu vas réaliser la PGD (Plateforme de Gestion des Dégrèvements) pour Orange
Côte d'Ivoire, dans un monorepo, à partir des livrables BMAD présents dans
`docs/`.

## Avant de coder

Lis dans cet ordre :
1. `CLAUDE.md` — contexte permanent, règles non négociables, décisions actées
2. `docs/00_Charte_Projet_Consolidee.md` — périmètre et arbitrages
3. `docs/01_PRD_Consolide.md` — exigences SF-PGD
4. `docs/02_Architecture_Monorepo.md` — architecture cible et ADR
5. `docs/03_Modele_Donnees_v2.md` — MCD/MLD, à projeter en schema.prisma
6. `docs/04_UserStories_Realisation.md` — 58 stories PGD-xxx
7. `docs/05_Plan_Implementation.md` — 10 phases séquencées
8. `docs/06_Contrats_API.md` — routes, codes d'erreur, exemples
9. `docs/07_Strategie_Tests_Recette.md` — tests critiques et scénarios

Puis présente-moi un plan pour la Phase 1 et attends ma validation avant
d'écrire du code.

## Méthode de travail

- Avance **phase par phase** selon `docs/05_Plan_Implementation.md`. Ne démarre
  pas une phase avant que la précédente soit verte (lint, typecheck, tests,
  build) et que je l'aie validée.
- À l'intérieur d'une phase, avance **story par story** (PGD-xxx). Annonce la
  story, implémente, teste, puis passe à la suivante.
- Écris les tests **avec** le code, pas après. Une story sans test n'est pas
  terminée.
- Si une exigence des documents est ambiguë ou contradictoire, **arrête-toi et
  demande** plutôt que de choisir seul. Les documents portent des questions
  ouvertes explicites — ne les tranche pas à ma place.

## Règles à ne jamais enfreindre

1. Aucune règle métier codée en dur. Seuils, chaînes de validation, taux,
   rôles, motifs, calendrier : tout est en base, caché en Redis, invalidé à
   l'écriture. Un seuil dans le code est un bug, pas un raccourci.
2. RBAC, SoD et verrous sont appliqués **côté serveur uniquement**, par des
   Guards NestJS et des transactions. Un contrôle côté client est un confort.
3. `JOURNAL_AUDIT` et `JOURNAL_SECURITE` sont append-only. Aucun service
   n'expose de méthode de modification ou de suppression.
4. PostgreSQL est la source de vérité. Redis ne contient rien qui ne puisse
   être reconstruit.
5. Les montants sont en `numeric(15,2)`, jamais en flottant. Plancher 0. Le
   routage s'appuie sur le TTC.
6. Le domaine s'écrit en français : entités, colonnes, énumérations, libellés,
   messages d'erreur utilisateur. Le code technique (variables internes,
   noms de fichiers) suit les conventions TypeScript usuelles.
7. `packages/contracts` est la source unique des types. Aucun DTO dupliqué
   entre backend et frontend.
8. Les migrations Prisma sont versionnées. `db push` est réservé au
   développement local.

## Points de vigilance particuliers

Ces mécanismes sont ceux où une erreur passe inaperçue en test manuel :

- **Claim concurrent** (PGD-051) — double verrou Redis `SET NX` puis
  compare-and-set PostgreSQL. Le test de concurrence (50 requêtes simultanées,
  exactement 1 succès) est obligatoire et doit tourner en CI.
- **SoD** (PGD-057) — requête sur `JOURNAL_AUDIT` pour l'étape N-1 du même
  dossier. Vérifie aussi le cas négatif : l'agent doit pouvoir traiter un autre
  dossier.
- **SLA en heures ouvrées** (PGD-059) — teste le franchissement de week-end,
  de jour férié, et le démarrage hors plage horaire.
- **Idempotence SI** (PGD-061) — clé unique + verrou Redis. Un dossier
  `CONFIRME` ne doit jamais être repoussé.
- **Externalisation des règles** (PGD-040) — le test décisif : modifier un
  palier en base change le routage sans redéploiement.

## Première tâche

Phase 1 — Socle (PGD-001 à PGD-005) :

1. Monorepo pnpm + Turborepo, TypeScript strict, ESLint/Prettier partagés
2. `packages/config` — validation Zod de l'environnement, échec explicite si
   une variable manque
3. `packages/database` — `schema.prisma` complet depuis
   `docs/03_Modele_Donnees_v2.md` (30+ modèles, 17 énumérations, extension
   `btree_gist`, contrainte EXCLUDE gist anti-chevauchement, index unique
   partiel sur la formule courante), migration initiale
4. Seeds idempotents : tous les référentiels du §8 du modèle de données, plus
   le jeu de démonstration multi-ND (`SF-PGD-303`)
5. `apps/api` — bootstrap NestJS avec Prisma, Redis, ZodValidationPipe,
   HttpExceptionFilter (codes normalisés), Logging et Audit interceptors,
   enveloppe `{ data, error, meta }`, OpenAPI
6. `docker-compose.yml` — postgres, redis, rabbitmq (image `rabbitmq:3-management`, ports 5672 + 15672), api, worker, web

Critère de sortie : `docker compose up` démarre tout, `GET /api/health` répond,
la base contient les référentiels et le jeu de démonstration.

Commence par me proposer l'arborescence complète et le contenu de
`schema.prisma`, avant d'écrire le reste.
```

---

## Prompts de continuation

À utiliser au démarrage de chaque phase suivante.

### Phase 2 — Sécurité
```
Phase 2 — Sécurité (PGD-010 à 014), selon docs/05 §2.

Rappel : AD et MFA sont réels dès cette phase, pas bouchonnés. `MfaPort` porte
deux implémentations (DUO push/passcode et TOTP 6 chiffres/30 s) — le TOTP est
le repli en cas d'indisponibilité DUO, décision ADR-08.

Le secret TOTP est chiffré au repos et n'est jamais retourné par l'API.

Critère de sortie : un utilisateur AD se connecte, subit le MFA si son rôle
porte `requiert_mfa`, et ne voit que ce que son rôle autorise. Ajoute un test
qui échoue si une route mutative n'a pas de décorateur de rôle.
```

### Phase 3 — Lignes et formules
```
Phase 3 — Registre client, lignes et formules (PGD-020 à 025), selon docs/05 §3.

C'est le cœur du lot « Nouvelle demande ». Attention à trois points :
- La recherche par ND doit répondre en moins d'une seconde et rester
  insensible à la casse et aux espaces.
- Un ND inconnu renvoie 200 avec data null, jamais 404 — la saisie manuelle
  doit rester possible.
- `statut_ligne` est figé dans DEMANDE_LIGNE au moment de la sélection (R20) :
  une évolution ultérieure du statut ne doit pas réécrire l'historique du
  dossier.
```

### Phase 5 — Moteur de règles
```
Phase 5 — Moteur de règles et paliers (PGD-040 à 043), selon docs/05 §5.

Le format pivot est { circuit, segment, sous_flux, borne_min, borne_max,
étapes[] }. Rien de ce format ne doit apparaître en dur dans le code.

Le test décisif de cette phase : modifier un palier directement en base,
invalider le cache, soumettre une demande, et constater que la chaîne produite
reflète le nouveau palier — sans redéploiement ni redémarrage. Écris ce test.
```

### Phase 6 — Corbeilles
```
Phase 6 — Corbeilles et traitement (PGD-050 à 059), selon docs/05 §6.

Phase la plus critique du projet. Commence par PGD-051 (claim double verrou) et
son test de concurrence avant toute autre story — c'est le mécanisme dont
dépend l'intégrité de tout le workflow.

Ordre suggéré : claim + test de concurrence → unclaim → SlaService → worker
AMQP (topologie RabbitMQ : exchange `pgd.events`, quatre files durables, DLX)
→ locks-sweeper → escalation → approbation → rejet → SodGuard → délégation.

Sur la messagerie : ack manuel après commit Prisma, publisher confirms,
consumers idempotents (livraison at-least-once), retry back-off puis
dead-letter. Redis ne sert PAS de file : cache et verrous uniquement.
```

### Phase 7 — Restitution SI
```
Phase 7 — Restitution SI (PGD-060 à 062), selon docs/05 §7.

BSCS et GAIA sont derrière un `BillingSiPort` unique, routés par
PARAMETRE_GLOBAL['si_adaptateur_par_circuit']. Bouchons en phase 1 : le contrat
réel n'est pas encore fourni par l'équipe SI.

L'idempotence est l'exigence centrale (R16) : deux appels concurrents sur le
même dossier ne produisent qu'un seul envoi, et un dossier CONFIRME n'est
jamais repoussé.
```

### Phase 9 — Frontend

**Préalable manuel (vous, avant de lancer Claude Code) :** exporter le projet
Claude Design en zip, le décompresser dans `docs/design/` du dépôt, commiter.

**9.0 — Analyse de la maquette (à lancer en premier, seul)**
```
La maquette est dans docs/design/ (export Claude Design commité). C'est un
export MODULAIRE, pas un HTML unique :

  app.jsx  engine.jsx  data.jsx  ui.jsx
  screens1.jsx  screens2.jsx  screens3.jsx  screens4.jsx  screens_auth.jsx
  tweaks-panel.jsx  styles.css  index.html  logo-orange.png  _shots/

Ne code rien. L'ordre d'analyse ci-dessous n'est pas indifférent : commence par
le point 1, c'est le plus important.

1. PRIORITÉ — lis engine.jsx (39 Ko) et data.jsx (31 Ko).

   Ces deux fichiers portent vraisemblablement la logique qui rendait le
   prototype démonstrable : jeux de données factices et, potentiellement, une
   reproduction du routage, des seuils de palier et des calculs HT/TSC/TVA
   côté client.

   Donne-moi l'inventaire écrit de TOUTE décision métier qui s'y trouve :
   seuils, chaînes de validation, formules de calcul, listes de rôles,
   conditions d'affichage dépendant d'une règle.

   Aucune n'est portée. R3 (zéro règle en dur) vaut aussi côté frontend : ces
   décisions viennent exclusivement de l'API (docs/06_Contrats_API.md). Lire
   ces fichiers sert à comprendre les FORMES de données attendues, pas à
   recopier la logique.

2. Cartographie. Table à quatre colonnes :
   fichier · écran · story PGD-0xx · à porter / à ignorer.

   screens3.jsx fait 93 Ko : l'écran « Nouvelle demande » (PGD-081) s'y trouve
   probablement. tweaks-panel.jsx est vraisemblablement un panneau de réglages
   de prototypage — confirme-le et marque-le « à ignorer ».

   Lis les gros fichiers par sections ciblées, jamais en entier.

3. Tokens. Extraction depuis styles.css (36 Ko) vers packages/ui/tokens :
   couleurs, typographie, échelle d'espacement, rayons, ombres. ui.jsx (15 Ko)
   donne la structure des composants de base pour packages/ui.

4. docs/design/DIVERGENCES.md — écarts entre la maquette et
   docs/01_PRD_Consolide.md (champs manquants, libellés, règles d'affichage,
   statuts, accessibilité). Chaque écart tranché en faveur du PRD.

5. docs/design/README.md — provenance, date d'export, version, et la liste des
   fichiers écartés du portage avec la raison.

Tous ces fichiers restent HORS BUILD : rien n'est copié dans apps/web, rien
n'est importé, rien n'est compilé. Ils sont une référence visuelle dont tu
dérives des composants React typés consommant l'API réelle.

Présente-moi les points 1 et 2 AVANT de toucher aux tokens. J'attends ton
analyse avant de te donner le feu vert pour la suite.
```

**9.1 et suivantes — Implémentation**
```
Phase 9 — Frontend (PGD-079 à 084), selon docs/05 §9.

La maquette de docs/design/, analysée en 9.0, fait foi pour la mise en page, la
charte, la typographie, les espacements, les états de composants et les codes
couleur de statut (vert ACTIF, jaune SUSPENDU, rouge RESILIE). Elle ne fait
foi ni pour les règles métier, ni pour les autorisations, ni pour les calculs :
docs/design/DIVERGENCES.md recense les écarts déjà tranchés en faveur du PRD.

Rappel : engine.jsx et data.jsx ne sont jamais portés. Toute logique qu'ils
contiennent vient de l'API. tweaks-panel.jsx est hors périmètre.

L'écran « Nouvelle demande » (PGD-081) est la pièce maîtresse : recherche ND,
sélection multiple de lignes, sélecteur de formule avec badges courante/
historique, récurrent pré-rempli et modifiable, champ conditionnel « service
Autre », commentaire obligatoire, aperçu de routage temps réel avec le palier
déclenché.

Le frontend ne porte aucune décision d'autorisation : il reflète ce que l'API
autorise. Le 409 sur claim doit produire un message clair, pas une erreur
technique. Aucune règle de routage, aucun seuil de palier, aucun calcul de
montant ne doit être dupliqué côté client : tout vient de l'API.

Accessibilité : si la maquette ne respecte pas les contrastes ou la navigation
clavier, corrige-la plutôt que de la reproduire à l'identique.
```

---

## Utilisation

1. Créer le dépôt et y placer :
   - `CLAUDE.md` à la racine
   - `docs/00` à `docs/07`
2. Ouvrir Claude Code dans le dépôt.
3. Coller le prompt d'amorçage.
4. Valider le plan de Phase 1 proposé.
5. Enchaîner phase par phase avec les prompts de continuation.

**Recommandation :** valider chaque sortie de phase avant d'enchaîner. Les six jalons de démonstration (`docs/05` §3) sont les points naturels de revue avec le métier.
