# 04 — User Stories de Réalisation (BMAD)

> **Projet :** PGD — Orange Côte d'Ivoire · **Version :** 2.0 · **Date :** 20 juillet 2026
> **Convention :** `PGD-xxx` · MoSCoW · estimation Fibonacci · exigence(s) `SF-PGD` tracée(s)
> **Definition of Done commune :** critères d'acceptation validés · tests unitaires + intégration passants · règle tracée dans l'audit si mutative · RBAC appliqué · contrat Zod dans `packages/contracts` · OpenAPI à jour

---

## Epic 0 — Socle monorepo

### PGD-001 · Initialiser le monorepo — *M · 5 pts*
En tant qu'équipe, je veux un monorepo pnpm + Turborepo opérationnel afin de partager types et outillage.
- `apps/api`, `apps/worker`, `apps/web` ; `packages/contracts`, `database`, `config`, `ui`.
- `turbo.json` avec pipelines `build`, `dev`, `lint`, `test`, `typecheck`.
- TypeScript strict partout ; ESLint + Prettier partagés.
- Règle de dépendance vérifiée : `packages/*` n'importe jamais `apps/*`.

### PGD-002 · Environnement Docker — *M · 5 pts*
- `docker-compose.yml` : `postgres`, `redis`, `rabbitmq` (`rabbitmq:3-management`), `api`, `worker`, `web`.
- Override dev avec hot reload et ports exposés.
- `.env.example` exhaustif ; validation Zod des variables au démarrage (`packages/config`) — échec explicite si une variable manque.
- Images multi-stage, exécution non-root.

### PGD-003 · Schéma Prisma et migrations — *M · 8 pts* · `03_Modele_Donnees_v2.md`
- `schema.prisma` complet : 30+ modèles, 17 énumérations.
- Extension `btree_gist` ; contrainte `EXCLUDE gist` anti-chevauchement des paliers.
- Index unique partiel `uq_formule_courante`.
- Migration initiale versionnée ; `db push` interdit hors dev local.

### PGD-004 · Seeds référentiels — *M · 8 pts* · §8 du modèle
- Tous les référentiels du §8, y compris normalisation des directions/services (pas d'import brut).
- Jeu de démonstration `SF-PGD-303` : comptes multi-ND, formules courantes + historiques, un ND `SUSPENDU`, un ND `RESILIE`.
- Seed idempotent (rejouable sans doublon).

### PGD-005 · Pipeline NestJS transverse — *M · 5 pts* · `SF-PGD-203`
- `ZodValidationPipe`, `HttpExceptionFilter` (codes normalisés `400/401/403/404/409/422`), `LoggingInterceptor`, `AuditInterceptor`.
- Enveloppe de réponse `{ data, error, meta }`.
- OpenAPI généré via `@nestjs/swagger`.

---

## Epic 1 — Authentification et sécurité

### PGD-010 · Authentification AD — *M · 5 pts* · `SF-PGD-001`, `007`
- `LdapProvider` réel (LDAP/LDAPS), identifiant `prenom.nom@orange.ci`.
- Résolution des groupes AD → rôles PGD à chaque ouverture de session.
- Échec journalisé dans `JOURNAL_SECURITE` avec facteur `AD`.

### PGD-011 · MFA à deux méthodes — *M · 8 pts* · `SF-PGD-002`, ADR-08
- Interface `MfaPort` ; implémentations `DuoProvider` (push/passcode) et `TotpProvider` (6 chiffres / 30 s).
- Déclenchement si le rôle porte `requiert_mfa` ; méthode selon `UTILISATEUR.mfa_methode`.
- `totp_secret` chiffré au repos, jamais retourné par l'API.
- Enrôlement TOTP : génération de secret + QR code + vérification d'un premier code.
- Chaque challenge journalisé avec le facteur (`DUO` ou `TOTP`).

### PGD-012 · Session et révocation — *M · 5 pts* · `SF-PGD-003`, `004`
- JWT court signé, cookie httpOnly + secure ; refresh token.
- Store de session Redis → révocation immédiate au logout.
- Re-challenge MFA à la bascule vers un rôle sensible.

### PGD-013 · Rate limiting et anti-bruteforce — *M · 3 pts* · `SF-PGD-005`
- Compteurs Redis sur `/auth/login` et `/auth/mfa/verify`.
- Verrouillage temporaire après N tentatives ; journalisé.

### PGD-014 · RBAC serveur — *M · 5 pts* · `SF-PGD-203`
- `@Roles()` + `RbacGuard` sur **tous** les endpoints mutatifs et de lecture sensible.
- Refus → `403` journalisé (`rbac_refus`).
- Test : aucune route mutative sans décorateur de rôle.

---

## Epic 2 — Registre client, lignes et formules *(lot 2)*

### PGD-020 · Recherche par ND — *M · 5 pts* · `SF-PGD-310`
En tant qu'initiateur, je veux rechercher une ligne par son ND afin de cibler précisément la ligne concernée.
- `GET /api/lignes?nd=...` résout compte, ligne, statut, formules.
- Insensible à la casse et aux espaces.
- ND inconnu → réponse claire **non bloquante** ; la saisie manuelle reste possible.
- Réponse < 1 s (index `idx_ligne_nd`).

### PGD-021 · Lignes d'un compte et sélection multiple — *M · 5 pts* · `SF-PGD-311`
- `GET /api/comptes/{numero}/lignes` → ND, formule courante, statut par ligne.
- Écran : case à cocher par ligne, sélection simple ou multiple, ≥ 1 requise.
- Récapitulatif reflétant les lignes retenues.
- Montant global agrégé sur les lignes (`R18`).

### PGD-022 · Formules d'une ligne — *M · 5 pts* · `SF-PGD-320`
- `GET /api/lignes/{id}/formules` → toutes les formules, courante et historiques.
- Chaque formule : libellé, période `date_debut → date_fin`, badge *Courante* / *Historique*.
- Formule courante présélectionnée ; sélection obligatoire par ligne (`R17`, bloquant).
- Si `LIGNE.historique_partiel` → mention « historique partiel » affichée.

### PGD-023 · Récurrent mensuel automatique — *M · 3 pts* · `SF-PGD-321`
- Sélection de formule → pré-remplissage de `DEMANDE_LIGNE.recurrent` depuis `recurrent_mensuel_ht`.
- Mise à jour à chaque changement de formule.
- Champ modifiable ; toute correction pose `recurrent_modifie = true` et empile une entrée dans `HISTORIQUE_MONTANT` avec `acteur_id`, `demande_ligne_id` (la ligne corrigée), `origine` et horodatage.
- Alimente le calcul prorata `restitué HT = récurrent ÷ 30 × jours`.

### PGD-024 · Statut de ligne — *M · 3 pts* · `SF-PGD-350`, `R15`, `R20`
- Badge couleur dès la sélection (vert `ACTIF`, jaune `SUSPENDU`, rouge `RESILIE`), conforme charte.
- `statut_ligne` figé dans `DEMANDE_LIGNE` au moment de la sélection.
- Ligne `RESILIE` à la soumission : lecture de `PARAMETRE_GLOBAL['politique_ligne_resiliee']` — `BLOQUANT` → `422` explicite ; `JUSTIFICATION_RENFORCEE` → commentaire + ≥ 1 pièce afférente exigés.
- Statut exploitable en filtre et en KPI.

### PGD-025 · Provider CRM bouchonné — *S · 3 pts* · `SF-PGD-052b`
- `CrmPort` + `CrmStubAdapter` alimentant comptes, lignes, formules, statuts depuis le jeu de démonstration.
- Bascule bouchon → réel par variable d'environnement, sans toucher aux services consommateurs.

---

## Epic 3 — Demandes et calcul

### PGD-030 · Création de demande par circuit — *M · 8 pts* · `SF-PGD-040`
- `POST /api/demandes` en `brouillon`, champs communs + `champs_circuit` (JSONB) selon DOBB / DXC / DF.
- Génération de la référence (`ReferenceService`).
- Dimensions analytiques (univers, facteur, direction, service) saisissables.

### PGD-031 · Calcul serveur des montants — *M · 5 pts* · `SF-PGD-041`, `042`, `R8`, `R18`
- `montant_ht = Σ DEMANDE_LIGNE.montant_ht_ligne` ; `TSC = HT × taux_tsc` ; `TVA = (HT + TSC) × taux_tva` ; `TTC = HT + TSC + TVA`.
- TSC et TVA activables ; taux lus depuis `PARAMETRE_CALCUL` (jamais en dur).
- Plancher 0 ; `numeric(15,2)` ; jamais de flottant.
- Tout recalcul empilé dans `HISTORIQUE_MONTANT` avec `origine` et horodatage ; `acteur_id` renseigné si un utilisateur est à l'origine, `NULL` pour un recalcul système (`R23`).

### PGD-032 · Service « Autre » nommé — *S · 2 pts* · `SF-PGD-330`
- Choix `AUTRE` en Responsabilité par Service (DOBB) → champ texte obligatoire.
- Autre valeur → champ masqué **et vidé**.
- Valeur reprise en fiche, audit et KPI de responsabilité.

### PGD-033 · Commentaire obligatoire — *M · 1 pt* · `SF-PGD-331`, `R14`
- Soumission bloquée si commentaire vide ou espaces seuls.
- Message d'aide explicite sous le champ.
- Contrôle **serveur** (le contrôle client est un confort, pas une garantie).

### PGD-034 · Pièces justificatives — *M · 5 pts* · `SF-PGD-050`, `051`, `R13`
- Upload via `GedPort` (bouchon stockage local/objet), typage par `PIECE_AFFERENTE`.
- Complétude des pièces obligatoires du motif vérifiée à la soumission.

### PGD-035 · Aperçu de routage — *S · 5 pts* · `SF-PGD-033`, `104`
- `POST /api/demandes/{id}/apercu-routage` → chaîne prévisionnelle + palier déclenché.
- Recalcul à chaque changement de montant ou de circuit.
- Simulateur admin surlignant le palier.

### PGD-036 · Soumission — *M · 8 pts* · `SF-PGD-060`, `R14`, `R15`, `R17`
- Transaction unique : contrôles (`R13`, `R14`, `R15`, `R17`) → calcul TTC → sélection du palier → instanciation de la chaîne → SLA première étape → journal d'audit.
- Statut `brouillon → soumis`.
- Échec de contrôle → `422` avec le détail par règle violée.

### PGD-037 · Abandon, rappel, modification — *S · 5 pts* · `SF-PGD-061`, `087`, `R6`
- Abandon et rappel possibles tant qu'aucune décision n'est prise.
- Modification d'une demande soumise → **re-routage** selon les paliers en vigueur, journalisé.

### PGD-038 · Ajustement au prorata — *S · 3 pts* · `SF-PGD-062`
- `restitué HT = récurrent ÷ 30 × jours contestés`, par ligne.

---

## Epic 4 — Moteur de règles et paliers

### PGD-040 · Moteur de routage pivot — *M · 13 pts* · `SF-PGD-030`, `R1`, `R2`, `R11`
- `RuleEngineService` : 5 variables d'entrée → chaîne ordonnée de tâches.
- Lecture des paliers en cache Redis, rechargement PostgreSQL si absent.
- Instanciation : première étape `EN_CORBEILLE`, suivantes `EN_ATTENTE`, contrôles (`C`) en `POST_CLOTURE`.
- **Zéro règle en dur** — test dédié : modifier un palier en base change le routage sans redéploiement.

### PGD-041 · Contrôle FRA au-delà de 5 M — *M · 3 pts* · `SF-PGD-088`, `R12`
- `TTC > 5 000 000` → étape de contrôle FRA instanciée obligatoirement.
- Clôture impossible sans `CONTROLE` de niveau `FRA`.

### PGD-042 · Administration des paliers — *M · 8 pts* · `SF-PGD-340`, `103`, `201`
- CRUD des paliers : `{ borne_min, borne_max, label_palier, source_fiche, date_effet, etapes[] }`.
- Contrôle des bornes : chevauchement rejeté par `EXCLUDE gist` → `422` lisible ; **trous** détectés et signalés.
- Écriture → invalidation de la clé de cache Redis correspondante.
- Défauts au seed = tranches actuelles, libellées « palier de subdélégation (provisoire) ».

### PGD-043 · Administration des référentiels — *S · 8 pts* · `SF-PGD-013`, `201`
- CRUD : circuits, rôles, motifs, pièces afférentes, paramètres de calcul, calendrier SLA, jours fériés, `PARAMETRE_GLOBAL`, modules.
- Chaque écriture invalide le cache concerné.

---

## Epic 5 — Corbeilles et traitement

### PGD-050 · Corbeille par rôle — *M · 5 pts* · `SF-PGD-071`, `R4`
- `GET /api/taches?role=&etat=` — un agent ne voit que les corbeilles de ses rôles.
- Colonnes : référence, client, montant TTC, échéance SLA, ancienneté, statut de verrou.

### PGD-051 · Claim atomique — *M · 8 pts* · `SF-PGD-072`, `R7`
- Verrou Redis `SET NX` + TTL, puis compare-and-set PostgreSQL en transaction.
- Aucune ligne retournée → **`409 Conflict`** ; verrou Redis libéré.
- **Test de concurrence obligatoire** : N requêtes simultanées → exactement 1 succès, N-1 en `409`.

### PGD-052 · Unclaim — *M · 2 pts* · `SF-PGD-073`
- Retour en `EN_CORBEILLE`, verrou libéré, action journalisée.

### PGD-052bis · Topologie RabbitMQ et socle worker — *M · 5 pts* · `SF-PGD-202`
- `apps/worker` NestJS standalone, connexion AMQP avec reconnexion automatique.
- Déclaration **par le code** (jamais à la main) : exchange topic durable `pgd.events`, exchange `pgd.dlx`, files durables `q.locks-sweeper`, `q.sla-escalation`, `q.notifications`, `q.si-push`, file `q.dead-letter`, bindings associés.
- Publication `persistent` + `publisher confirms` côté `apps/api` (`PublisherService`).
- Consommation en `ack` **manuel après commit** Prisma ; `prefetch = 1` sur `q.si-push`.
- Retry avec back-off exponentiel, 5 tentatives, puis routage vers `pgd.dlx`.
- Endpoint de santé incluant l'état de la connexion au broker.

### PGD-053 · Job locks-sweeper — *S · 5 pts* · `SF-PGD-074`
- Ordonnanceur 5 min publiant `lock.sweep` ; le consumer traite les tâches `RECLAMEE` avec `verrou_expire_at < now()` sans décision → `EN_CORBEILLE` + journal.
- Consumer idempotent : un rejeu du message ne produit aucun effet supplémentaire.

### PGD-054 · Escalade SLA — *S · 8 pts* · `SF-PGD-075`, `076`, `R9`
- Ordonnanceur 15 min publiant `sla.check` ; le consumer traite les tâches `EN_CORBEILLE` avec `echeance_sla < now()` → corbeille N+1, `niveau_escalade++`, journal + notification superviseur.
- Mise à jour conditionnelle SQL garantissant qu'une double livraison n'escalade pas deux fois.
- Escalade manuelle exposée à l'administrateur / superviseur.

### PGD-055 · Approbation avec revue champ par champ — *M · 8 pts* · `SF-PGD-080`, `081`
- Chaque champ marquable vu / corrigé ; corrections journalisées.
- Passage de la tâche en `APPROUVEE`, activation de la suivante.

### PGD-056 · Rejet motivé — *M · 3 pts* · `SF-PGD-082`
- Motif obligatoire ; retour à l'initiateur ; notification.

### PGD-057 · SoD — *M · 5 pts* · `SF-PGD-085`, `R3`
- `SodGuard` avant toute approbation : requête sur `JOURNAL_AUDIT` pour l'étape N-1 du même dossier.
- Violation → `403` journalisé (`sod_refus`).
- **Strictement serveur.**

### PGD-058 · Délégation — *S · 8 pts* · `SF-PGD-086`, `R21`, `R22`
- `DELEGATION` porte **trois** acteurs : `delegant_id` (titulaire absent), `delegataire_id` (agent qui reçoit), `role_code` (rôle délégué). Deux relations Prisma nommées vers `UTILISATEUR`.
- Délégation nominative bornée dans le temps (`debut` < `fin`) avec `note_interim` obligatoire ; délégant ≠ délégataire.
- Le délégataire voit la corbeille du rôle délégué **pendant la période uniquement**.
- **`R21` — SoD étendu :** toute action sous délégation est vérifiée contre l'étape N-1 pour le délégataire **et** pour le délégant. Sans cela, un titulaire ayant agi en amont peut valider en aval via son intérimaire.
- **`R22` :** rejet `422` si une délégation active existe déjà sur le même `(delegant_id, role_code)` avec une période recouvrante.
- Audit : chaque action sous délégation porte l'acteur réel **et** le titulaire représenté, plus la référence de la délégation.

### PGD-059 · Calcul SLA en heures ouvrées — *M · 8 pts* · `SF-PGD-028`, `R9`
- `SlaService` : jours ouvrés, plage horaire, jours fériés depuis `CALENDRIER_SLA`.
- `POST /api/sla/simuler` : durée → échéance.
- Tests couvrant : franchissement de week-end, de jour férié, démarrage hors plage horaire.

---

## Epic 6 — Restitution SI *(lot 2)*

### PGD-060 · Port de restitution SI — *S · 8 pts* · `SF-PGD-360`, `361`, ADR-13
- `BillingSiPort` + `BscsAdapter` + `GaiaAdapter` (bouchons phase 1).
- Routage de l'adaptateur par `PARAMETRE_GLOBAL['si_adaptateur_par_circuit']`.

### PGD-061 · Poussée automatique et idempotence — *S · 8 pts* · `SF-PGD-360`, `R16`
- Déclenchement automatique à la validation finale par publication d'un message `si.push` (dans la même transaction logique que la validation, publication après commit).
- États `EN_ATTENTE → ENVOYE → CONFIRME` ou `ERREUR`, avec `si_ref`, `si_horodatage`, `si_message`, `si_tentatives`.
- Idempotence : `si_idempotency_key` UNIQUE + verrou Redis ; un dossier `CONFIRME` n'est **jamais** repoussé, y compris en cas de redélivrance du message par le broker.
- Échec définitif → `q.dead-letter` + état `ERREUR` + notification, jamais de perte silencieuse.
- Chaque transition journalisée dans l'audit.

### PGD-062 · Rejeu manuel — *S · 3 pts* · `SF-PGD-360`
- Action « Pousser dans le SI » réservée au rôle habilité, disponible uniquement en état `ERREUR`.
- Rejeu **sans re-valider** le dossier ; incrémente `si_tentatives` ; plafonné par `si_max_tentatives`.
- État et identifiant SI visibles sur la fiche validée.

---

## Epic 7 — Contrôle, audit, notifications, KPI

### PGD-070 · Contrôle a posteriori — *S · 5 pts* · `SF-PGD-100`
- Constat `conforme | anomalie` + commentaire, niveaux `FRA | N1 | N2`.

### PGD-071 · Journal d'audit append-only — *M · 5 pts* · `SF-PGD-140`, `142`, `R5`
- Toute transition d'état écrite via `AuditService` ; aucun `UPDATE`/`DELETE` applicatif.
- Consultation par dossier ; journal de sécurité séparé.
- **Test** : tentative de modification d'une entrée d'audit → rejetée.

### PGD-072 · Export — *S · 5 pts* · `SF-PGD-141`
- Export d'une demande et de son audit en CSV et PDF.

### PGD-073 · Notifications — *S · 5 pts* · `SF-PGD-110`
- File `q.notifications` (routing key `notification.*`) : nouvelle tâche, avancement, rejet, validation, escalade, **erreur SI**.
- Canal in-app + `SmtpPort` (bouchon journalisant).

### PGD-074 · KPI — *S · 13 pts* · `SF-PGD-120`, `121`, `122`
- ~24 indicateurs sur 6 familles ; dimensions : HT/TTC, volume, évolution M-1→M, univers, motif, facteur, direction, service, **état SI**, **statut de ligne**.
- Distinction reçu vs traité (`si_etat = 'CONFIRME'`).
- Agrégations cachées en Redis (TTL court) ; vues matérialisées pour les KPI lourds.

---

## Epic 8 — Frontend

### PGD-079 · Intégration de la maquette exportée — *M · 5 pts* · `SF-PGD-170`
- Export Claude Design décompressé dans **`docs/design/`** et commité — export **modulaire** : `app.jsx`, `engine.jsx`, `data.jsx`, `ui.jsx`, `screens1→4.jsx`, `screens_auth.jsx`, `tweaks-panel.jsx`, `styles.css`, `index.html`, `logo-orange.png`, `_shots/`.
- `docs/design/README.md` consignant la provenance (URL du projet Claude Design), la date d'export et la version.
- Extraction des **tokens** (couleurs, typographie, échelle d'espacement, rayons, ombres) vers `packages/ui/tokens`.
- Inventaire des écrans et des composants de la maquette, avec la correspondance vers les stories `PGD-081` à `PGD-084`.
- Relevé écrit des **divergences maquette / PRD** dans `docs/design/DIVERGENCES.md` : chaque écart listé et tranché en faveur du PRD, la maquette étant signalée comme à corriger.
- **Analyse prioritaire de `engine.jsx` et `data.jsx`** : inventaire écrit de toute décision métier codée côté client (seuils de palier, chaînes de routage, calculs HT/TSC/TVA, listes de rôles). Aucune n'est portée — `R3` vaut aussi côté frontend ; tout vient de l'API.
- **Cartographie fichier → écran → story** (`PGD-081` à `PGD-084`), avec la colonne « à porter / à ignorer ». `screens3.jsx` (≈ 93 Ko) contient vraisemblablement l'écran « Nouvelle demande ».
- **`tweaks-panel.jsx` marqué hors périmètre** (panneau de réglages de prototypage), avec la raison consignée dans le `README.md`.
- Les fichiers de `docs/design/` restent **hors build** : ni copiés dans `apps/web`, ni importés, ni compilés. Ils servent de référence visuelle pour des composants React typés consommant l'API réelle.

### PGD-080 · Design system et charte — *M · 8 pts* · `SF-PGD-170`
- `packages/ui` : tokens de couleur, typographie, composants de base, **dérivés de la maquette importée en `PGD-079`**.
- Codes de statut : vert `ACTIF`, jaune `SUSPENDU`, rouge `RESILIE`.
- Accessibilité : contraste, navigation clavier, libellés explicites — à vérifier et corriger si la maquette ne les respecte pas.

### PGD-081 · Écran « Nouvelle demande » — *M · 13 pts* · `SF-PGD-310`, `311`, `320`, `321`, `330`, `331`, `350`
Écran central du lot 2, composant par composant :
- `RechercheNd` — recherche ND / compte / Case JADE.
- `SelecteurLignes` — liste des ND du compte, cases à cocher, badge de statut.
- `SelecteurFormule` — formules courante et historiques, badges, présélection.
- Champ récurrent pré-rempli et modifiable.
- Champ conditionnel « service Autre ».
- Commentaire obligatoire avec message d'aide.
- `ApercuRoutage` — chaîne temps réel et palier déclenché.

### PGD-082 · Corbeille et fiche dossier — *M · 13 pts*
- Liste des tâches avec échéance SLA et état de verrou ; bouton claim gérant le `409` avec un message clair.
- Fiche : contexte client, lignes retenues (ND, formule, récurrent, statut), montants, pièces, circuit visuel, journal, **état SI**.
- Revue champ par champ pour les valideurs.

### PGD-083 · Écrans d'administration — *S · 13 pts*
- Paliers (avec détection de chevauchement/trou), circuits, rôles, motifs, pièces afférentes, paramètres, calendrier SLA, paramètres globaux.
- Simulateur de montant surlignant le palier.

### PGD-084 · KPI et audit — *S · 8 pts*
- Tableaux de bord par profil (initiateur, valideur, pilotage) ; filtres par circuit, période, univers, statut de ligne, état SI.
- Consultation et export de l'audit.

---

## Epic 9 — Qualité et industrialisation

### PGD-090 · Tests unitaires et intégration — *M · 13 pts*
- Cibles prioritaires : moteur de règles, calcul des montants, SLA en heures ouvrées, SoD, politique ligne résiliée, idempotence SI.
- Couverture ≥ 80 % sur `modules/`.

### PGD-091 · Tests de concurrence sur le claim — *M · 5 pts* · `SF-PGD-072`
- N requêtes simultanées sur la même tâche → exactement 1 succès.
- Rejouable en CI.

### PGD-092 · Tests e2e des contrats d'API — *M · 8 pts*
- Parcours complets par circuit, de la création à la restitution SI.

### PGD-093 · CI — *S · 5 pts*
- Lint, typecheck, tests, build sur chaque push ; migrations vérifiées.

---

## Synthèse

| Epic | Stories | Points | Priorité dominante |
|---|---|---|---|
| E0 — Socle monorepo | 5 | 31 | Must |
| E1 — Auth & sécurité | 5 | 26 | Must |
| E2 — Lignes & formules | 6 | 24 | Must |
| E3 — Demandes & calcul | 9 | 42 | Must |
| E4 — Règles & paliers | 4 | 32 | Must |
| E5 — Corbeilles | 11 | 65 | Must |
| E6 — Restitution SI | 3 | 19 | Should |
| E7 — Contrôle/audit/KPI | 5 | 33 | Should |
| E8 — Frontend | 6 | 60 | Must |
| E9 — Qualité | 4 | 31 | Must |
| **Total** | **58** | **363** | — |
