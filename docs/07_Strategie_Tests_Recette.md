# 07 — Stratégie de Tests et Recette (BMAD)

> **Projet :** PGD — Orange Côte d'Ivoire · **Version :** 2.0 · **Date :** 20 juillet 2026

---

## 1. Pyramide de tests

| Niveau | Outil | Cible | Couverture visée |
|---|---|---|---|
| **Unitaire** | Jest | Services purs : moteur de règles, calcul des montants, SLA en heures ouvrées, politique ligne résiliée, idempotence | ≥ 80 % sur `modules/` |
| **Intégration** | Jest + Testcontainers (PostgreSQL, Redis et RabbitMQ réels) | Transactions, claim concurrent, contraintes de base, invalidation de cache, publication/consommation AMQP, rejeu et dead-letter | Chemins critiques 100 % |
| **e2e API** | Supertest | Contrats d'API, codes d'erreur, RBAC, SoD | Parcours par circuit |
| **Charge** | k6 / autocannon | Claim concurrent, listing corbeille, recherche ND | Seuils du §4 |
| **Frontend** | Vitest + Testing Library | Composants de saisie, gestion du `409` | Composants critiques |

**Règle :** les tests sont écrits **avec** chaque phase, pas après. Une phase n'est pas close sans ses tests.

---

## 2. Tests critiques non négociables

Ces sept tests couvrent les points où une erreur est invisible en test manuel et coûteuse en production.

### T1 — Claim concurrent
N requêtes simultanées (N ≥ 50) sur la même tâche `EN_CORBEILLE` → **exactement 1** succès, N-1 en `409`. Aucune double attribution. Rejouable en CI.

### T2 — SoD
Un agent approuve l'étape N-1 puis tente d'approuver l'étape N du même dossier → `403`, journalisé en `sod_refus`. Vérifier aussi qu'il **peut** approuver l'étape N d'un **autre** dossier.

**Volet délégation (`R21`) :** le titulaire T approuve l'étape N-1, délègue son rôle à D, puis D tente d'approuver l'étape N du même dossier → `403`. Le contournement du SoD par l'intérim est le scénario que cette vérification existe pour empêcher. Contrôler à l'inverse que D **peut** approuver un dossier sur lequel T n'est pas intervenu.

### T3 — Zéro règle en dur
Modifier un palier directement en base, invalider le cache, soumettre une demande → la chaîne produite reflète le nouveau palier, **sans redéploiement ni redémarrage**.

### T4 — SLA en heures ouvrées
Échéance calculée depuis : vendredi 17 h + 8 h → lundi ; veille de jour férié ; démarrage hors plage horaire (22 h) ; franchissement de plusieurs week-ends.

### T5 — Idempotence de la poussée SI
Deux appels concurrents de poussée sur le même dossier → un seul envoi effectif. Un dossier `CONFIRME` ne peut pas être repoussé (`422`). **Variante messagerie :** republier deux fois le même message `si.push` (redelivery simulée) → un seul appel au `BillingSiPort`, la seconde consommation est acquittée sans effet.

### T6 — Immuabilité de l'audit
Tentative d'`UPDATE` ou de `DELETE` applicatif sur `JOURNAL_AUDIT` → rejetée. Vérifier qu'aucun service n'expose de méthode de modification.

### T7 — Anti-chevauchement des paliers et des délégations
Créer un palier chevauchant un palier actif → `422` avec message lisible. Détecter et signaler un **trou** entre deux paliers.

**Volet délégation (R22), ajouté suite à revue de l'audit Phase 2 — les six contraintes SQL manuelles sont confirmées présentes (`pg_constraint`) mais aucune n'est encore vérifiée par son comportement aux limites.** Une `EXCLUDE` peut exister et laisser passer un cas limite selon que les bornes sont inclusives (`[]`) ou semi-ouvertes (`[)`). À tester en Phase 6, sur PostgreSQL réel (pas seulement sur le contenu de la migration) :
1. Deux `DELEGATION` actives sur le même `(delegant_id, role_code)` avec des périodes clairement recouvrantes → insertion rejetée par `excl_delegation_concurrente`.
2. **Cas limite des bornes jointives** : une délégation se terminant exactement quand une autre commence (`fin` de la première = `debut` de la seconde), même `delegant_id`/`role_code` → vérifier explicitement le comportement (accepté ou rejeté) et l'aligner sur l'intention métier ; ne pas supposer que `tstzrange` est inclusif par défaut sans le tester.
3. Symétrique pour les paliers (`configuration_circuit`) : deux tranches dont l'une se termine exactement où l'autre commence, avec `borne_max`/`borne_min` égaux → même vérification, la contrainte utilise `numrange(..., '[]')` (inclusif des deux côtés), ce qui a une conséquence directe sur ce cas précis à confirmer par le test, pas par lecture du DDL.

### T8 — Fiabilité de la messagerie RabbitMQ
Sur RabbitMQ éphémère (Testcontainers), quatre garanties :
1. **Ack après commit** — provoquer une exception après le traitement métier mais avant l'`ack` : le message est redélivré et le traitement rejoué sans doublon d'effet (consumer idempotent).
2. **Pas de perte au redémarrage** — publier, arrêter le worker, le relancer : le message est toujours consommé (file durable + message `persistent`).
3. **Dead-letter** — un message échouant systématiquement atteint `q.dead-letter` après le nombre de tentatives configuré, et n'y arrive pas avant.
4. **Topologie déclarative** — démarrer sur un broker vierge : exchanges, files, bindings et DLX sont créés par le code, sans intervention manuelle.

---

## 3. Scénarios de recette métier

### R1 — DOBB nominal multi-ND
Initiateur DOBB · recherche par ND · compte à 3 lignes · sélection de 2 lignes · choix d'une formule historique sur l'une, courante sur l'autre · récurrent pré-rempli puis corrigé sur une ligne · service « Autre » nommé · commentaire renseigné · soumission → chaîne conforme au palier · claim par le Responsable · approbation · progression jusqu'à validation finale · poussée SI confirmée.
**Attendu :** `si_etat = CONFIRME`, `ref_si` présent, audit complet, correction du récurrent tracée.

### R2 — Ligne résiliée
Sélection d'un ND en statut `RESILIE` · badge rouge affiché · soumission tentée.
**Attendu (mode `BLOQUANT`) :** `422` `R15_LIGNE_RESILIEE`. Après bascule du paramètre en `JUSTIFICATION_RENFORCEE` : soumission acceptée si commentaire **et** pièce afférente présents, refusée sinon.

### R3 — Commentaire manquant
Soumission avec commentaire vide, puis avec espaces seuls.
**Attendu :** `422` `R14_COMMENTAIRE_REQUIS` dans les deux cas.

### R4 — Formule non sélectionnée
Ligne retenue sans formule choisie.
**Attendu :** `422` `R17_FORMULE_REQUISE`.

### R5 — DF au-delà de 5 M avec contrôle FRA
Demande DF à 12 M FCFA · chaîne incluant FRA · tentative de clôture sans contrôle FRA.
**Attendu :** clôture refusée. Après enregistrement du contrôle FRA : clôture possible.

### R6 — Claim concurrent en conditions réelles
Deux valideurs du même rôle réclament la même tâche simultanément.
**Attendu :** un obtient la tâche, l'autre reçoit un message clair (« Cette tâche vient d'être réclamée »). Aucun double traitement.

### R7 — Escalade sur SLA dépassé
Tâche `EN_CORBEILLE` non réclamée au-delà de son SLA (simulateur de temps).
**Attendu :** transfert vers la corbeille N+1, `niveau_escalade` incrémenté, journal + notification superviseur. Le circuit n'est pas bloqué.

### R8 — Verrou expiré
Tâche réclamée puis abandonnée sans décision, au-delà du TTL.
**Attendu :** `locks-sweeper` la remet en `EN_CORBEILLE`, événement journalisé.

### R9 — SoD en conditions réelles
Un agent membre de deux rôles consécutifs valide l'étape N-1 puis tente l'étape N.
**Attendu :** refus explicite, journalisé, dossier non bloqué (un autre membre du rôle peut traiter).

### R10 — Erreur SI et rejeu
Adaptateur bouchonné forcé en erreur à la validation finale.
**Attendu :** `si_etat = ERREUR`, message visible sur la fiche, notification `erreur_si`. Rejeu manuel par le rôle habilité → `CONFIRME`, **sans re-valider** le dossier. Compteur de tentatives incrémenté.

### R11 — Révision d'un palier
Administrateur modifie les bornes d'un palier · nouvelle demande soumise dans la nouvelle borne.
**Attendu :** chaîne conforme au nouveau palier, sans redéploiement. Aperçu temps réel aligné. Tentative de chevauchement rejetée.

### R12 — Délégation
Valideur absent · délégation nominative bornée avec note d'intérim.
**Attendu :** le délégataire voit la corbeille du rôle délégué pendant la période uniquement ; action tracée avec mention de la délégation.

### R13 — MFA de repli
Utilisateur à rôle sensible configuré en `TOTP` · connexion avec code de l'application d'authentification.
**Attendu :** accès accordé, événement journalisé avec facteur `TOTP`. Code erroné → refus journalisé, rate limiting après N tentatives.

### R14 — DXC nominal
Circuit B2C · saisie simple mono-ND · formule Internet · récurrent auto · prorata sur période contestée.
**Attendu :** montants conformes, chaîne DXC respectée.

### R15 — ND inconnu
Recherche d'un ND absent du registre.
**Attendu :** message non bloquant, **pas de `404`**, saisie manuelle possible.

---

## 4. Seuils de performance

| Opération | Cible |
|---|---|
| Recherche par ND | < 1 s |
| Remontée des formules | < 1 s |
| Listing corbeille (100 tâches) | < 500 ms |
| Claim | < 200 ms |
| Aperçu de routage | < 300 ms |
| p95 global API | < 800 ms |

---

## 5. Jeu de données de recette

Le seed de démonstration (`SF-PGD-303`) doit couvrir :

- Un compte B2B avec **3 ND** : un `ACTIF` (2 formules), un `SUSPENDU`, un `RESILIE`.
- Un compte B2C mono-ND avec formule Internet et historique.
- Un compte Wholesale pour DF avec montants dans les trois tranches (≤ 5 M, 5 M–50 M, > 50 M).
- Une ligne marquée `historique_partiel = true` (mode dégradé).
- Des utilisateurs couvrant tous les rôles, dont un membre de deux rôles consécutifs (pour R9) et un en `TOTP` (pour R13).
- Des demandes dans chaque statut, dont une en `si_etat = ERREUR` (pour R10).

---

## 6. Definition of Done — recette

Une story est recettée quand : ses critères d'acceptation sont validés en démonstration · ses règles métier apparaissent dans le journal d'audit · les codes d'erreur retournés correspondent au contrat · aucun contournement client n'est possible (vérifié par appel direct de l'API) · la documentation `SF-PGD` est à jour.
