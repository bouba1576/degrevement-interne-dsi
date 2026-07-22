# Maquette PGD — docs/design/

Export **Claude Design**, décompressé et commité tel quel. Source de vérité visuelle uniquement (mise en page, charte, typographie, espacements, états de composants, codes couleur de statut) — **jamais** pour les règles métier, les autorisations ou les calculs. En cas de divergence avec `docs/01_PRD_Consolide.md`, le PRD l'emporte : voir `DIVERGENCES.md`.

- **Provenance** : `https://claude.ai/design/p/0a54ca6a-9e31-48e2-8f3c-c9476f354136?file=PGD+-+Plateforme+Du00E9gru00E8vements+%28autonome%29.html`
- **Date d'export** : 2026-07-20 (horodatage des fichiers sur le dépôt)
- **Analysé** : Phase 9.0 (2026-07-22), avant tout code frontend

## Fichiers

| Fichier | Contenu | Statut |
|---|---|---|
| `app.jsx` | Coquille racine : store/contexte global, routing, sidebar, garde d'authentification, exports XLS/CSV/PDF côté client | Structure/layout : référence visuelle. Logique métier et exports côté client : **hors périmètre**, l'API réelle fait foi |
| `data.jsx` | Jeu de données factices + matrice de décision (paliers, chaînes de rôles, motifs, calendrier) | **Jamais porté** — sert uniquement à comprendre les formes de données attendues |
| `engine.jsx` | Fonctions de calcul/règles/workflow reproduites côté client (HT/TSC/TVA, sélection de palier, claim/approve/reject, SoD, escalade…) | **Jamais porté** — toute décision métier vient de l'API (`docs/06_Contrats_API.md`), R3 vaut aussi côté frontend |
| `screens_auth.jsx` | Écrans d'authentification (login AD 2 étapes, MFA) | Référence visuelle — remplacer la logique AD/OTP factice par l'auth réelle |
| `screens1.jsx` | `HomeScreen`, `NouvelleDemandeScreen` (PGD-081, monolithique ~460 lignes), `PiecesJointes`, `CalcLine` | Référence visuelle — `NouvelleDemandeScreen` **doit être décomposé** (RechercheNd/SelecteurLignes/SelecteurFormule/ApercuRoutage), il n'existe pas déjà découpé dans la maquette |
| `screens2.jsx` | `CorbeillesScreen`, `DossierDetailScreen`, `ApproveModal`, `RejectModal`, `DelegateModal`, `AbandonModal`, `ModifyModal`, `ReaffecterModal` | Référence visuelle pour tous, **sauf `ReaffecterModal`** — voir « Exclusions » ci-dessous |
| `screens3.jsx` | `DashboardScreen` (PGD-084), `ControleScreen` (PGD-070), `AdminScreen` (PGD-083, PGD-042, PGD-043), `AuditScreen` (PGD-071/072) | Référence visuelle |
| `screens4.jsx` | `MasseScreen`, `IntegrationsScreen`, `ModulesScreen` | **Hors périmètre entier** — voir « Exclusions » |
| `tweaks-panel.jsx` | Panneau de réglages de prototypage (édition de thème en direct) | **Hors périmètre entier** — outillage d'auteur Claude Design, pas une fonctionnalité PGD |
| `ui.jsx` | Primitives de design system (`Icon`, `Badge`, `Modal`, `StatusBadge`, `WorkflowStepper`, `SlaTimer`…) | Référence directe pour `packages/ui` (PGD-080) |
| `styles.css` | Couleurs, typographie, échelle d'espacement, rayons, ombres | Source des tokens `packages/ui` (Phase 9, point 3) |
| `index.html`, `logo-orange.png`, `_shots/` | Coquille HTML du prototype, logo, captures d'écran | Référence uniquement (logo réutilisable tel quel) |

## Fichiers/écrans exclus du portage, avec raison

- **`tweaks-panel.jsx`** (fichier entier) — confirmé par son propre commentaire d'en-tête comme outillage d'édition de thème pour l'auteur du prototype, sans rapport avec une fonctionnalité PGD.
- **`screens4.jsx`** (fichier entier — `MasseScreen`, `IntegrationsScreen`, `ModulesScreen`) — les commentaires internes du fichier citent des codes « PGD-27 », « PGD-25 », « PGD-26 » qui n'existent pas dans la numérotation `PGD-0NN` de `docs/04_UserStories_Realisation.md`. `MasseScreen` (ajustement en masse) recoupe en outre une fonctionnalité explicitement exclue de la Phase 1 (`docs/00_Charte_Projet_Consolidee.md` §3.2). Aucun des trois écrans ne correspond à une story confirmée du backlog actuel.
- **`ReaffecterModal`** (dans `screens2.jsx`) — réaffectation manuelle d'une tâche vers un rôle arbitraire, hors chaîne de validation. Aucune story ne couvre ce mécanisme (recherché explicitement, absent de docs/01 et docs/04). **Ni la logique ni la coquille visuelle ne sont portées** : un bouton présent mais non câblé finit par être câblé par quelqu'un qui suppose la spécification existante ailleurs. Voir `DIVERGENCES.md`.
- **Bouton/action « déblocage manuel » (`debloquer` dans `engine.jsx`)** — même raisonnement que `ReaffecterModal` : lève un verrou de claim hors du mécanisme automatique (`LocksSweeperService`). Aucune story ne le couvre. **Ni la logique ni la coquille ne sont portées.**
- **Mécanisme de SLA de correction sur dossier rejeté** (`rejetSla()`, `CONFIG.rejets`, panneau `RejetsSlaPanel` dans `screens3.jsx`) — **contredit** `docs/04_MCD_MLD_PGD_PROD.md`, qui indique explicitement l'absence de minuteur bloquant pour l'Initiateur (`minuteur_bloquant = FALSE`). Invention de la maquette, pas un trou de spécification. La coquille visuelle de `RejetsSlaPanel` peut être portée à titre de référence de mise en page uniquement, sans jamais y câbler de logique de délai.
- **`RoleMenu`, `DemoAccounts`, `MfaChallenge`** (bascule de persona) — mécanisme de démonstration (changer d'identité sans se reconnecter) sans équivalent en production, où un utilisateur a une identité unique.

## Fichiers/actions à coquille visuelle acceptée, sans effet câblé

- `relancer()` (relance de notification), `publipostage()` (génération de courrier), `archiver()` (archivage) — mentionnés une fois dans `docs/04_MCD_MLD_PGD_PROD.md` comme actions Initiateur, sans story ni SF-PGD dédiés. Contrairement à `reaffecter`/`debloquer`, ce sont des actions **sans effet sur le workflow** (pas de contournement d'un contrôle d'accès ou d'un état) — la coquille visuelle peut être portée, le câblage attend une spécification.
