# 00 — Charte Projet Consolidée (BMAD)

> **Projet :** PGD — Plateforme de Gestion des Dégrèvements
> **Client :** Orange Côte d'Ivoire — DSI / AIP — Études & Ingénierie IT
> **Architecte SI :** Aroun KONÉ
> **Version :** 2.0 — Consolidation pour réalisation · **Date :** 20 juillet 2026
> **Destinataire d'exécution :** Claude Code (monorepo)

---

## 1. Objet de ce document

Ce document consolide en une source unique de vérité : les livrables BMAD v1.1 (PRD, Architecture, User Stories, MCD/MLD), les Spécifications Fonctionnelles PROD v2.0, le lot d'améliorations « Nouvelle demande » (Brief + Backlog + PRD v1.0 issus de Claude Design), le schéma d'architecture technique et le support de présentation projet.

Il ouvre la **phase de réalisation**. Tous les livrables aval (`01` à `07`) en découlent.

---

## 2. Arbitrages de consolidation (décisions actées)

Les documents sources présentaient des divergences. Elles sont tranchées ici et font foi.

| # | Divergence constatée | Décision retenue | Justification |
|---|---|---|---|
| **D1** | Schéma technique : « Backend Next.js » | **NestJS** | Erreur de libellé du schéma. Toute l'architecture BMAD, le MLD et les 35 user stories backend ciblent NestJS. |
| **D2** | Schéma technique : **RabbitMQ** comme broker vs **BullMQ/Redis** en architecture | **RabbitMQ** ; BullMQ écarté | Décision d'architecture du client, alignée sur le schéma technique cible. RabbitMQ apporte nativement les accusés de réception, le retry avec back-off et la dead-letter queue — garanties déterminantes pour la restitution SI (`si-push`) et les escalades SLA, dont la perte silencieuse est inacceptable. Redis reste requis pour le cache de configuration invalidable et les verrous de claim, mais n'assure plus de fonction de file : les deux responsabilités sont séparées. |
| **D3** | MFA : Cisco DUO seul (MLD) vs DUO **ou** Microsoft Authenticator TOTP (schéma) | **Interface `MfaProvider`** avec deux implémentations : `DuoProvider` et `TotpProvider` | Répond au risque ouvert « procédure de repli DUO ». Le TOTP fonctionne hors ligne et sert de repli auto-hébergé. Sélection par utilisateur et par politique de rôle. |
| **D4** | SI de dégrèvement : **BSCS** et **GAIA** (schéma) vs « SI de facturation » générique (PRD lot 2) | **Port unique `BillingSiPort`** avec adaptateurs `BscsAdapter` et `GaiaAdapter`, routés par circuit/univers | Isole deux SI cibles derrière un contrat unique ; l'idempotence et le rejeu sont mutualisés. |
| **D5** | Frontend : « hors périmètre » (archi v1.1) vs maquette hi-fi validée (SF v2.0) | **Frontend inclus** dans le monorepo, React + Next.js, **implémenté d'après la maquette Claude Design** (voir §2bis) | Le design est validé et la réalisation est confiée en un seul lot. La maquette fait foi pour la mise en page, la charte et les composants ; elle ne fait pas foi pour les règles métier, qui restent portées par le PRD et l'API. |
| **D6** | Identification client par compte (v1.1) vs par **ND** (lot 2) | **ND devient l'identifiant fonctionnel de ligne** ; le compte reste l'entité de rattachement | Objectif G1 du brief. Impose les nouvelles entités `LIGNE` et `FORMULE`. |
| **D7** | Tranches de routage (v1.1) vs **paliers de subdélégation** (lot 2) | **Renommage sémantique** : `CONFIGURATION_CIRCUIT` devient le porteur des paliers, avec `label_palier`. Structure pivot inchangée. | Le format pivot absorbe la nouvelle fiche de subdélégation sans refonte du moteur. |
| **D8** | JADE cité comme source CASES (schéma) et vue Initiateur (SLA) | **`JadeProvider`** ajouté aux ports d'intégration (bouchon en phase 1) | Explicite une intégration jusqu'ici implicite. |

**Points restant à confirmer par le métier** (n'empêchent pas le démarrage — valeurs par défaut paramétrables) :
- Seuils et rôles définitifs de la fiche de subdélégation (défaut = tranches actuelles).
- Politique par défaut sur ligne **RESILIE** : blocage vs justification renforcée (défaut = blocage).
- Contrat exact des API BSCS / GAIA (défaut = adaptateur bouchonné, état `EN_ATTENTE`).
- Procédure de repli en cas d'indisponibilité DUO (mitigée par D3, à formaliser avec la sécurité).
- **Sémantique de `ENUM_TYPE_ACTEUR` (`V` / `A` / `C`)** — les sources posent les trois codes sans jamais les gloser. `A` est ambigu (*Approbateur* ou *Avis* ?), `V` également (*Validateur* ou *Visa* ?). Les codes restent la valeur stockée ; le libellé lisible est porté en seed, donc corrigeable sans migration. À trancher avec le référent processus.

---

## 3. Périmètre de réalisation

### 3.1 Inclus

| Domaine | Contenu |
|---|---|
| **Backend** | NestJS modulaire — 10 modules métier, moteur de règles pivot, corbeilles claim/unclaim, SLA heures ouvrées, SoD, RBAC, audit append-only, KPI |
| **Frontend** | Next.js (App Router) — écrans de saisie 3 circuits, corbeille, fiche dossier, circuit de validation, admin, KPI, audit |
| **Données** | PostgreSQL via Prisma — 30+ entités (MLD v1.1 + extensions lot 2), seeds référentiels |

### 2bis. Source de vérité du design d'interface

La maquette hi-fi de référence est **exportée depuis Claude Design et versionnée dans le dépôt**, sous `docs/design/`.

- **Emplacement :** `docs/design/` (export zip décompressé, commité)
- **Structure :** export **modulaire** — `app.jsx`, `engine.jsx`, `data.jsx`, `ui.jsx`, `screens1→4.jsx`, `screens_auth.jsx`, `tweaks-panel.jsx`, `styles.css`, `index.html`, `logo-orange.png`, `_shots/`
- **Provenance :** `https://claude.ai/design/p/0a54ca6a-9e31-48e2-8f3c-c9476f354136?file=PGD+-+Plateforme+Du00E9gru00E8vements+%28autonome%29.html`

**Inventaire et traitement de chaque fichier :**

| Fichier | Taille | Nature présumée | Traitement |
|---|---|---|---|
| `engine.jsx` | 39 Ko | **Logique de simulation** — routage, seuils, calculs reproduits pour la démo | **Analyser en priorité, ne pas porter.** Chaque décision métier qui s'y trouve vient de l'API |
| `data.jsx` | 31 Ko | Jeux de données factices | Ne pas porter. Sert à comprendre les formes de données attendues |
| `screens3.jsx` | 93 Ko | Écrans — contient vraisemblablement « Nouvelle demande » (`PGD-081`) | Référence visuelle principale |
| `screens1.jsx` · `screens2.jsx` · `screens4.jsx` | 47 / 54 / 22 Ko | Écrans | Référence visuelle |
| `screens_auth.jsx` | 18 Ko | Écrans d'authentification | Référence visuelle (`PGD-082`) |
| `ui.jsx` | 15 Ko | Composants de base réutilisables | Référence structurante pour `packages/ui` |
| `styles.css` | 36 Ko | Charte, tokens | **Source d'extraction des tokens** |
| `app.jsx` | 25 Ko | Racine, navigation | Référence pour l'arborescence de routes |
| `tweaks-panel.jsx` | 24 Ko | Panneau de réglages de prototypage | **Hors périmètre** — artefact de démo, à ne pas porter |
| `index.html` | 3 Ko | Point d'entrée du prototype | Hors périmètre |
| `logo-orange.png` | 2 Ko | Logo | À reprendre |
| `_shots/` | — | Captures d'écran | Référence visuelle, hors build |

**Point d'attention majeur.** `engine.jsx` et `data.jsx` portent la logique qui rendait le prototype démonstrable : routage, seuils de palier, calculs HT/TSC/TVA sont vraisemblablement reproduits côté client. **Rien de tout cela n'est porté** — `R3` (zéro règle en dur) vaut aussi côté frontend, et ces décisions viennent exclusivement de l'API. L'analyse de ces deux fichiers est le premier travail de l'étape 9.0, avant même l'extraction des tokens.

**Pourquoi l'export plutôt que le MCP `claude_design`** — le design est validé (arbitrage D5) et n'a plus vocation à bouger pendant la réalisation. Le figer dans le dépôt apporte trois choses qu'un import à la demande ne donne pas : la maquette est **versionnée avec le code**, donc toute divergence tranchée est traçable au même titre qu'un commit ; elle est lisible **sans dépendance d'authentification** (`/design-login`) par n'importe quel développeur reprenant le dépôt ; et sa lecture est **ciblée** (recherche par composant, lecture par plage de lignes) au lieu de charger un HTML monolithique en contexte à chaque session.

Le MCP `claude_design` reste utilisable ponctuellement si la maquette devait évoluer : dans ce cas, réexporter et **remplacer** le contenu de `docs/design/` par un commit dédié, plutôt que de faire coexister deux sources.

**Portée de la maquette (fait foi) :** mise en page, hiérarchie visuelle, charte de couleurs, typographie, espacements, états de composants, codes de statut de ligne (vert `ACTIF`, jaune `SUSPENDU`, rouge `RESILIE`), libellés d'interface en français.

**Hors portée (ne fait pas foi) :** règles métier, autorisations, calculs de montants, chaîne de routage, validations de soumission. Toute divergence entre la maquette et le PRD consolidé se tranche **en faveur du PRD**, et la maquette est signalée comme à corriger. Le frontend ne porte aucune décision d'autorisation : il reflète ce que l'API autorise.

| **Sécurité** | AD/LDAP réel, MFA (DUO + TOTP), JWT + session Redis, RBAC, SoD, journaux non répudiables |
| **Intégrations** | AD (réel), MFA (réel), JADE / CRM / GED / SMTP / BSCS / GAIA (ports + bouchons commutables) |
| **Lot 2 « Nouvelle demande »** | 9 améliorations : ND, multi-ND, multi-formules, récurrent auto, service « Autre », commentaire obligatoire, paliers de subdélégation, statut de ligne, poussée SI |
| **Industrialisation** | Monorepo, Docker Compose, migrations versionnées, tests (unit/intégration/e2e/charge), OpenAPI, CI |

### 3.2 Exclus de la phase 1

Ajustement en masse multi-lignes (tables cadrées non peuplées) · connecteurs BI externes · signature électronique qualifiée · reprise de données historiques · refonte des KPI au-delà des dimensions actées.

---

## 4. Objectifs et indicateurs de succès

| # | Objectif | Indicateur |
|---|---|---|
| **G1** | Identification de la ligne par ND sur les 3 circuits | Recherche ND opérationnelle DOBB/DXC/DF |
| **G2** | Comptes multi-lignes et multi-formules | Sélection multiple ND + choix de formule |
| **G3** | Fiabilisation de la saisie | Taux de champs incomplets en anomalie en baisse |
| **G4** | Routage conforme à la fiche de subdélégation | Aperçu de chaîne aligné sur les paliers publiés |
| **G5** | Sécurisation par statut de ligne | Blocage/alerte sur ligne résiliée |
| **G6** | Automatisation de la restitution SI | Ressaisie SI supprimée ; traçabilité de la poussée |
| **G7** | Zéro règle métier codée en dur | Révision de circuit sans redéploiement |
| **G8** | Aucun blocage de circuit par absence d'acteur | Corbeille partagée + escalade + délégation opérationnelles |
| **G9** | Non-répudiation intégrale | Journal append-only, rétention 10 ans (SOX) |

---

## 5. Parties prenantes

| Rôle | Intérêt |
|---|---|
| Initiateurs DOBB / DXC / DF | Saisie rapide et fiable, identification par ND |
| Vérificateurs / Valideurs | Routage lisible, contexte ligne complet, corbeille non bloquante |
| DF / DGA-DG | Respect des paliers de subdélégation |
| FRA | Contrôle obligatoire au-delà de 5 M FCFA |
| Contrôle N1 / N2 | Traçabilité état SI et statut de ligne |
| Équipe SI facturation (BSCS/GAIA) | Contrat d'intégration de la restitution |
| Administrateur PGD | Paramétrage paliers, référentiels, connecteurs |
| DSI / AIP | Conformité architecture et exploitabilité |

---

## 6. Contraintes structurantes

1. **Aucune règle métier en dur** — matrice pivot, catalogue de rôles, motifs, paramètres de calcul, calendrier SLA, paliers : tous en base, servis par API, cachés en Redis avec invalidation.
2. **Affectation par corbeille (pull)** — jamais de désignation nominative en routage nominal ; la délégation est l'exception tracée.
3. **Invariants de sécurité côté serveur uniquement** — RBAC, SoD, verrous : Guards NestJS et transactions. Le client ne peut rien contourner.
4. **Journaux append-only** — aucun `UPDATE`/`DELETE` applicatif sur `JOURNAL_AUDIT` / `JOURNAL_SECURITE`.
5. **PostgreSQL source de vérité** — Redis est un reflet volatil intégralement reconstructible.
6. **Idempotence** des opérations mutatives critiques (claim, poussée SI).
7. **Français** pour tout le domaine métier (entités, énumérations, libellés, messages).
8. **Montants en XOF**, `numeric(15,2)`, plancher 0, routage sur le **TTC**.
9. **SLA en heures ouvrées** via `CALENDRIER_SLA` (jours ouvrés, plage horaire, fériés).

---

## 7. Risques et parades

| Risque | Impact | Parade |
|---|---|---|
| Paliers de subdélégation non finalisés | Routage non conforme | Paramétrage Admin ; défaut = tranches actuelles, libellées « palier » |
| API BSCS/GAIA indisponible en recette | US-09 non démontrable | Adaptateur bouchonné, état « en attente de raccordement », idempotence, rejeu |
| Historique de formules incomplet côté SI/CRM | Imputation approximative | Mode dégradé : formule courante seule + marquage « historique partiel » |
| Dégrèvement sur ligne résiliée | Perte financière | Règle `R15` bloquante par défaut, paramétrable |
| Indisponibilité DUO | Blocage rôles sensibles | `TotpProvider` de repli (D3) + procédure sécurité à formaliser |
| Contention sur claim concurrent | Double traitement | Double verrou Redis `SET NX` + compare-and-set PostgreSQL → `409` |
| Listes de responsabilité hétérogènes (fiches DOBB) | Référentiel pollué | Normalisation avant seed, pas d'import brut |
| Absence prolongée d'un acteur | Circuit bloqué | Escalade SLA + `locks-sweeper` + délégation avec note d'intérim |

---

## 8. Livrables BMAD de la phase de réalisation

| Fichier | Contenu |
|---|---|
| `00_Charte_Projet_Consolidee.md` | Le présent document |
| `01_PRD_Consolide.md` | Exigences fonctionnelles unifiées, référentiel `SF-PGD` complet |
| `02_Architecture_Monorepo.md` | Architecture cible, arborescence monorepo, ADR |
| `03_Modele_Donnees_v2.md` | MCD/MLD v2.0 (v1.1 + extensions lot 2) |
| `04_UserStories_Realisation.md` | Backlog d'implémentation ordonnancé |
| `05_Plan_Implementation.md` | Découpage en phases, séquencement, jalons |
| `06_Contrats_API.md` | Contrats REST, conventions d'erreur, OpenAPI |
| `07_Strategie_Tests_Recette.md` | Pyramide de tests + scénarios de recette |
| `PROMPT_CLAUDE_CODE.md` | Prompt d'amorçage pour l'exécution |
| `CLAUDE.md` | Fichier de contexte permanent du dépôt |
