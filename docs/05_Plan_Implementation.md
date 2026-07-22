# 05 — Plan d'Implémentation (BMAD)

> **Projet :** PGD — Orange Côte d'Ivoire · **Version :** 2.0 · **Date :** 20 juillet 2026
> **Exécutant :** Claude Code · **Cible :** monorepo pnpm + Turborepo

---

## 1. Principe de séquencement

Chaque phase produit un incrément **démontrable et testé**. Aucune phase ne démarre sans que la précédente soit verte (lint + typecheck + tests + build). Le socle et les invariants de sécurité passent avant toute fonctionnalité : un moteur de règles écrit sur un modèle de données instable coûte plus cher à reprendre qu'à écrire.

---

## 2. Phases

### Phase 1 — Socle (PGD-001 → 005)

**Objectif :** monorepo qui démarre, base migrée et seedée, pipeline NestJS en place.

| Étape | Contenu |
|---|---|
| 1.1 | Monorepo pnpm + Turborepo, TypeScript strict, ESLint/Prettier |
| 1.2 | `packages/config` — validation Zod des variables d'environnement |
| 1.3 | `packages/database` — `schema.prisma` complet, migration initiale, `btree_gist` |
| 1.4 | Seeds : référentiels + jeu de démonstration multi-ND |
| 1.5 | `apps/api` — bootstrap NestJS, Prisma, Redis, pipeline transverse, OpenAPI |
| 1.6 | `docker-compose.yml` opérationnel (dont `rabbitmq` + console de gestion) |

**Sortie de phase :** `docker compose up` démarre tout ; `GET /api/health` répond ; la base contient les référentiels et le jeu de démonstration.

---

### Phase 2 — Sécurité (PGD-010 → 014)

**Objectif :** aucun endpoint accessible sans authentification et autorisation.

| Étape | Contenu |
|---|---|
| 2.1 | `LdapProvider` + résolution des groupes AD |
| 2.2 | `MfaPort` avec `DuoProvider` et `TotpProvider` ; enrôlement TOTP |
| 2.3 | Session JWT + refresh + store Redis + révocation |
| 2.4 | Rate limiting Redis sur les endpoints d'authentification |
| 2.5 | `AuthGuard` + `RbacGuard` sur toutes les routes |
| 2.6 | `JOURNAL_SECURITE` alimenté à chaque événement |

**Sortie de phase :** un utilisateur AD se connecte, subit le MFA si son rôle l'exige, et ne voit que ce que son rôle autorise. Test : aucune route mutative sans décorateur de rôle.

---

### Phase 3 — Registre client, lignes et formules (PGD-020 → 025)

**Objectif :** le cœur du lot « Nouvelle demande ».

| Étape | Contenu |
|---|---|
| 3.1 | `CrmPort` + bouchon alimentant comptes/lignes/formules |
| 3.2 | Recherche par ND (< 1 s), insensible casse/espaces, échec non bloquant |
| 3.3 | Lignes d'un compte, sélection multiple |
| 3.4 | Formules d'une ligne (courante + historiques), mode dégradé |
| 3.5 | Récurrent pré-rempli, modifiable, historisé |
| 3.6 | Statut de ligne figé à la sélection, politique `RESILIE` |

**Sortie de phase :** l'API expose tout le contexte nécessaire à l'écran de saisie. Tests couvrant les trois statuts de ligne.

---

### Phase 4 — Demandes et calcul (PGD-030 → 038)

| Étape | Contenu |
|---|---|
| 4.1 | Création en brouillon par circuit, `champs_circuit` |
| 4.2 | `MontantService` — agrégation sur lignes, TSC, TVA, TTC, plancher 0 |
| 4.3 | `HISTORIQUE_MONTANT` sur tout recalcul et toute correction |
| 4.4 | Service « Autre », commentaire obligatoire |
| 4.5 | Pièces justificatives + complétude par motif |
| 4.6 | Soumission transactionnelle avec les contrôles `R13/R14/R15/R17` |
| 4.7 | Abandon, rappel, modification avec re-routage |
| 4.8 | Prorata |

**Sortie de phase :** une demande passe de `brouillon` à `soumis` avec tous les contrôles serveur, sur les trois circuits.

---

### Phase 5 — Moteur de règles et paliers (PGD-040 → 043)

| Étape | Contenu |
|---|---|
| 5.1 | `RuleEngineService` pivot, cache Redis, invalidation |
| 5.2 | Instanciation de la chaîne + SLA première étape |
| 5.3 | Contrôle FRA obligatoire au-delà de 5 M |
| 5.4 | Aperçu de routage et simulateur |
| 5.5 | Administration des paliers : bornes, chevauchement, trous |
| 5.6 | Administration des référentiels avec invalidation de cache |

**Sortie de phase :** **test décisif** — modifier un palier en base change le routage sans redéploiement ni redémarrage.

---

### Phase 6 — Corbeilles et traitement (PGD-050 → 059)

**Phase la plus critique.** Le claim concurrent et le SoD sont les deux points où une erreur d'implémentation est invisible en test manuel et coûteuse en production.

| Étape | Contenu |
|---|---|
| 6.1 | Corbeille par rôle |
| 6.2 | **Claim double verrou** + test de concurrence |
| 6.3 | Unclaim |
| 6.4 | `SlaService` heures ouvrées (week-end, fériés, hors plage) |
| 6.5 | `apps/worker` + topologie RabbitMQ (exchange `pgd.events`, quatre files durables, DLX) |
| 6.6 | `locks-sweeper` |
| 6.7 | `sla-escalation` + escalade manuelle |
| 6.8 | Approbation avec revue champ par champ |
| 6.9 | Rejet motivé |
| 6.10 | **`SodGuard`** |
| 6.11 | Délégation avec note d'intérim |

**Sortie de phase :** un dossier traverse une chaîne complète, la contention est sérialisée, l'absence d'un acteur ne bloque pas le circuit.

---

### Phase 7 — Restitution SI (PGD-060 → 062)

| Étape | Contenu |
|---|---|
| 7.1 | `BillingSiPort` + `BscsAdapter` + `GaiaAdapter` bouchonnés |
| 7.2 | File `si-push`, transitions d'état, idempotence |
| 7.3 | Rejeu manuel plafonné, sans re-validation |
| 7.4 | Journalisation de chaque transition |

**Sortie de phase :** la validation finale déclenche la poussée ; une erreur est visible, tracée et rejouable ; un dossier confirmé n'est jamais repoussé.

---

### Phase 8 — Contrôle, audit, notifications, KPI (PGD-070 → 074)

| Étape | Contenu |
|---|---|
| 8.1 | Contrôle a posteriori FRA / N1 / N2 |
| 8.2 | Audit append-only + test d'immuabilité |
| 8.3 | Export CSV / PDF |
| 8.4 | Notifications in-app + SMTP bouchonné |
| 8.5 | KPI : agrégations, cache, vues matérialisées |

---

### Phase 9 — Frontend (PGD-079 → 084)

**Préalable :** intégrer la maquette exportée dans `docs/design/` avant d'écrire le moindre composant (étape 9.0). Coder l'interface « au jugé » puis tenter de la rapprocher de la maquette coûte plus cher que l'inverse.

| Étape | Contenu |
|---|---|
| 9.0 | **Intégration de la maquette** (`docs/design/`, export commité) + extraction des tokens + relevé des divergences maquette/PRD + repérage des règles en dur à retirer |
| 9.1 | `packages/ui` — tokens, composants, charte |
| 9.2 | Authentification et navigation par rôle |
| 9.3 | **Écran « Nouvelle demande »** — ND, lignes, formules, récurrent, statut, service Autre, commentaire, aperçu de routage |
| 9.4 | Corbeille et fiche dossier (dont état SI) |
| 9.5 | Écrans d'administration + simulateur |
| 9.6 | KPI et audit |

---

### Phase 10 — Qualité et industrialisation (PGD-090 → 093)

| Étape | Contenu |
|---|---|
| 10.1 | Couverture ≥ 80 % sur `modules/` |
| 10.2 | Test de concurrence sur le claim en CI |
| 10.3 | e2e des parcours par circuit |
| 10.4 | Pipeline CI complet |
| 10.5 | Documentation d'exploitation et OpenAPI publiée |

---

## 3. Jalons de démonstration

| Jalon | Après phase | Démonstration attendue |
|---|---|---|
| **J1** | 2 | Connexion AD + MFA, RBAC effectif |
| **J2** | 4 | Saisie complète d'une demande multi-ND avec formules et statuts |
| **J3** | 5 | Modification d'un palier en base → routage changé sans redéploiement |
| **J4** | 6 | Circuit complet de validation, claim concurrent, escalade sur SLA dépassé |
| **J5** | 7 | Validation finale → poussée SI, erreur simulée, rejeu réussi |
| **J6** | 9 | Parcours utilisateur de bout en bout sur les trois circuits |

---

## 4. Ordre de dépendance strict

```
Phase 1 (socle)
   └─> Phase 2 (sécurité)
         ├─> Phase 3 (lignes/formules)
         │      └─> Phase 4 (demandes/calcul)
         │             └─> Phase 5 (règles/paliers)
         │                    └─> Phase 6 (corbeilles)
         │                           └─> Phase 7 (SI)
         │                                  └─> Phase 8 (audit/KPI)
         └─> Phase 9 (frontend, au fil des APIs disponibles)
                └─> Phase 10 (qualité, transverse et continue)
```

La phase 9 peut démarrer dès la fin de la phase 3 pour l'écran de saisie, en suivant la disponibilité des endpoints. La phase 10 n'est pas une phase finale : les tests sont écrits **avec** chaque phase, la phase 10 consolide et industrialise.

---

## 5. Critères de sortie transverses

Aucune phase n'est close si l'un de ces points échoue :

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` sont verts.
- Aucune règle métier codée en dur (revue explicite).
- Toute opération mutative est journalisée.
- Tout endpoint porte un décorateur de rôle.
- Les contrats Zod de `packages/contracts` sont la source unique des types.
- Les migrations Prisma sont versionnées et rejouables sur base vierge.
