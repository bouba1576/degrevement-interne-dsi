# 01 — PRD Consolidé (BMAD)

> **Projet :** PGD — Orange Côte d'Ivoire · **Version :** 2.0 · **Date :** 20 juillet 2026
> **Base :** PRD backend v1.1 + Spécifications Fonctionnelles PROD v2.0 + PRD lot « Nouvelle demande » v1.0
> **Convention d'identifiants :** `SF-PGD-0xx à 2xx` (socle) · `SF-PGD-3xx` (lot « Nouvelle demande »)
> **Priorité :** M = Must · S = Should · C = Could · W = Won't (phase 1)

---

## 1. Vision produit

La PGD dématérialise intégralement le cycle de vie d'une demande de dégrèvement : **saisie → routage automatique → validation multi-niveaux → restitution SI → contrôle a posteriori → archivage**, pour les trois circuits **DOBB (B2B, PO2_B-17)**, **DXC (B2C, PO5-G-07)** et **DF (Wholesale/Opérateurs, PO6-07)**.

Elle remplace un processus papier/Excel où le routage dépend de la mémoire des acteurs, où l'imputation se fait au compte (et non à la ligne), où l'absence d'un valideur bloque le circuit, et où la saisie finale dans le SI de facturation est manuelle et génératrice d'écarts.

**Trois piliers non négociables :** règles métier externalisées (aucune en dur), corbeilles partagées anti-blocage, traçabilité non répudiable.

---

## 2. Personas et rôles

Le catalogue consolidé comprend **34 rôles dédupliqués**, mappés sur des groupes AD selon la convention `GG-DGR-*`.

| Type | Rôles | Caractéristique |
|---|---|---|
| **Métier (par circuit)** | Initiateur, Responsable, Manager, Manager Senior, DOBB, DXC | Cantonnés à leur circuit |
| **Pivot (multi-circuits)** | SM MOA Finance & FRA, DFA, DF, DGA/DG | Interviennent sur plusieurs circuits |
| **Contrôle** | FRA, Contrôle N1, Contrôle N2, Fiabilisation | Interviennent en post-clôture |
| **Système** | Administrateur PGD, Superviseur, Service technique | Hors matrice de décision |

**SLA par profil** (heures ouvrées, `SLA_PROFIL`) :

| Profil | SLA | Minuteur bloquant |
|---|---|---|
| Initiateur | Vue JADE | Non |
| Responsable / Manager / Manager Senior | 8 h | Oui |
| DOBB / DF / DGA-DG | 24 h | Oui |
| FRA | 48 h | Oui |
| Fiabilisation / Contrôle | 240 h (10 j) | Oui |

---

## 3. Exigences — Socle (SF-PGD-0xx à 2xx)

### 3.1 Authentification et session

| ID | Exigence | Prio |
|---|---|---|
| `SF-PGD-001` | Authentification étape 1 contre l'**Active Directory** réel (LDAP/LDAPS), identifiant `prenom.nom@orange.ci` | M |
| `SF-PGD-002` | Authentification étape 2 **MFA** pour les rôles marqués `requiert_mfa` — via `MfaProvider` : **Cisco DUO** (push/passcode) ou **TOTP** (Microsoft Authenticator, code 6 chiffres / 30 s, hors ligne) | M |
| `SF-PGD-003` | Session **JWT court** signé (cookie httpOnly + secure) + **refresh token** et store de session **Redis** permettant la révocation immédiate | M |
| `SF-PGD-004` | Re-challenge MFA à la bascule vers un rôle sensible | S |
| `SF-PGD-005` | **Rate limiting** et anti-bruteforce sur les endpoints d'authentification (Redis) | M |
| `SF-PGD-006` | Journalisation de toute tentative (AD, MFA, ouverture/fermeture de session) avec le facteur concerné dans `JOURNAL_SECURITE` | M |
| `SF-PGD-007` | Résolution de l'appartenance aux groupes AD → rôles PGD à chaque ouverture de session | M |

### 3.2 Demandes et calcul

| ID | Exigence | Prio |
|---|---|---|
| `SF-PGD-020` | Toute règle métier (matrice pivot, rôles, motifs, taux, calendrier, paliers) est **externalisée en base**, servie par API, cachée en Redis avec invalidation à l'écriture | M |
| `SF-PGD-030` | Le routage est déterministe à partir de 5 variables : `circuit`, `segment`, `sous_flux`, `montant TTC`, `type_acteur` | M |
| `SF-PGD-031` | Le montant global d'une demande **agrège les lignes retenues** | M |
| `SF-PGD-033` | **Aperçu temps réel** de la chaîne d'approbation (`buildChainPreview`) avant soumission | S |
| `SF-PGD-040` | Création d'une demande en **brouillon** selon le circuit, avec les champs propres à sa fiche | M |
| `SF-PGD-041` | Calcul serveur des montants : `TSC = HT × taux_tsc` (3 % par défaut), `TVA = (HT + TSC) × taux_tva` (18 %), `TTC = HT + TSC + TVA`. TSC et TVA activables. Plancher 0. | M |
| `SF-PGD-042` | Tout recalcul ou correction manuelle est empilé dans `HISTORIQUE_MONTANT` avec acteur, origine et horodatage | M |
| `SF-PGD-043` | Le **routage s'appuie sur le TTC** | M |
| `SF-PGD-050` | Pièces justificatives : upload, typage par `PIECE_AFFERENTE`, stockage via `GedProvider` | M |
| `SF-PGD-051` | Complétude des pièces **obligatoires** liées au motif vérifiée à la soumission (DOBB/DF) | M |
| `SF-PGD-052` | Recherche client par **n° de compte** (insensible casse/espaces) | M |
| `SF-PGD-052b` | Alimentation du registre client (comptes, lignes, formules, statuts) par le **SI client / CRM** ; bouchon en phase 1 | M |
| `SF-PGD-053` | Recherche par **n° de Case JADE** via `JadeProvider` | S |
| `SF-PGD-060` | Soumission : verrouille le brouillon, calcule le TTC, instancie la chaîne, journalise | M |
| `SF-PGD-061` | **Abandon** et **rappel** d'une demande par l'initiateur tant qu'aucune décision n'est prise | S |
| `SF-PGD-062` | Ajustement au **prorata** : `restitué HT = récurrent ÷ 30 × jours contestés` | S |
| `SF-PGD-063` | Ajustement en **masse multi-lignes** | W |

### 3.3 Corbeilles et traitement

| ID | Exigence | Prio |
|---|---|---|
| `SF-PGD-070` | Cycle de vie de tâche : `EN_ATTENTE → EN_CORBEILLE → RECLAMEE → APPROUVEE \| REJETEE`, plus `POST_CLOTURE` pour le contrôle | M |
| `SF-PGD-071` | Corbeille **partagée par rôle** ; un agent ne voit que les corbeilles de ses rôles | M |
| `SF-PGD-072` | **Claim atomique** : verrou Redis `SET NX` + TTL, puis compare-and-set PostgreSQL (`WHERE etat='EN_CORBEILLE'`). Aucune ligne retournée → **`409 Conflict`** | M |
| `SF-PGD-073` | **Unclaim** volontaire → retour en `EN_CORBEILLE`, journalisé | M |
| `SF-PGD-074` | Job **`locks-sweeper`** : libération périodique des verrous expirés (`verrou_expire_at < now()` sans décision), journalisée | S |
| `SF-PGD-075` | **Escalade SLA** (`sla-escalation`) : tâche `EN_CORBEILLE` dont `echeance_sla < now()` → corbeille N+1, journal + notification superviseur | S |
| `SF-PGD-076` | **Escalade manuelle** exposée à l'administrateur / superviseur | S |
| `SF-PGD-080` | **Approbation** avec revue champ par champ | M |
| `SF-PGD-081` | Revue champ par champ : chaque champ peut être marqué vu/corrigé ; commentaire complétable en aval | M |
| `SF-PGD-082` | **Rejet** avec motif obligatoire ; retour à l'initiateur | M |
| `SF-PGD-085` | **SoD** : `SodGuard` bloque toute approbation par un agent déjà intervenu à l'étape N-1 du même dossier (requête sur `JOURNAL_AUDIT`) → `403` journalisé | M |
| `SF-PGD-086` | **Délégation** nominative avec `note_interim`, bornée dans le temps, tracée | S |
| `SF-PGD-087` | **Re-routage** après modification d'une demande déjà soumise | S |
| `SF-PGD-088` | Contrôle **FRA obligatoire** au-delà de **5 000 000 FCFA** (PO6-07) — `CONTROLE` de niveau `FRA` requis avant clôture | M |

### 3.4 Contrôle, audit, notifications, KPI

| ID | Exigence | Prio |
|---|---|---|
| `SF-PGD-100` | Contrôle **a posteriori** N1 / N2 : constat `conforme \| anomalie` + commentaire | S |
| `SF-PGD-103` | Édition des paliers avec contrôle des bornes : **ni chevauchement ni trou** (contrainte `EXCLUDE gist`) | M |
| `SF-PGD-104` | **Simulateur de montant** surlignant le palier déclenché et la chaîne résultante | S |
| `SF-PGD-110` | **Notifications** : nouvelle tâche, avancement, rejet, validation, escalade. Canal in-app + SMTP (bouchon) | S |
| `SF-PGD-120` | **KPI** : ~24 indicateurs sur 6 familles (dossiers reçus, dossiers traités, top motif, facteurs, responsabilité direction, responsabilité service) | S |
| `SF-PGD-121` | Dimensions KPI : montant HT/TTC, volume, évolution M-1→M, univers FMI, motif, facteur, direction, service, **état SI**, **statut de ligne** | S |
| `SF-PGD-122` | Distinction **reçu vs traité** via `degrevement_saisi_si` | M |
| `SF-PGD-140` | **Journal d'audit append-only** : toute transition d'état, acteur, action, détail, horodatage. Aucun `UPDATE`/`DELETE` applicatif | M |
| `SF-PGD-141` | **Export** d'une demande et de son audit (CSV / PDF) | S |
| `SF-PGD-142` | Rétention **10 ans** (SOX) | M |

### 3.5 Administration et exploitation

| ID | Exigence | Prio |
|---|---|---|
| `SF-PGD-170` | **Charte graphique** : codes couleur de statut cohérents (vert actif, jaune suspendu, rouge résilié) | M |
| `SF-PGD-201` | Configuration **éditable sans redéploiement** ; l'écriture invalide la clé de cache Redis correspondante | M |
| `SF-PGD-202` | **Traitements asynchrones** sur RabbitMQ (exchange topic `pgd.events`) avec workers dédiés : `q.locks-sweeper`, `q.sla-escalation`, `q.notifications`, `q.si-push`, plus une dead-letter queue supervisée. Consommation en accusé manuel après commit ; retry avec back-off plafonné ; consumers idempotents (livraison *at-least-once*) | M |
| `SF-PGD-203` | RBAC serveur sur **tous** les endpoints (`@Roles()` + `RbacGuard`) | M |
| `SF-PGD-204` | **Observabilité** : logs structurés, latence p95, profondeur des files RabbitMQ et messages non acquittés, alerte sur remplissage de la dead-letter queue, sur taux d'erreur et sur indisponibilité AD/MFA/RabbitMQ | S |
| `SF-PGD-205` | **Docker** : tous les services conteneurisés, orchestration Compose pour dev/recette | M |

---

## 4. Exigences — Lot « Nouvelle demande » (SF-PGD-3xx)

### 4.1 Modèle de données — extensions

| ID | Exigence | Prio |
|---|---|---|
| `SF-PGD-300` | Nouvelle entité **`LIGNE`** rattachée au compte client : `{ nd, compte_client, libelle_ligne, statut (ACTIF\|SUSPENDU\|RESILIE), formule_courante_id }`. Le **ND** (Numéro de Désignation) est l'identifiant fonctionnel, indexable, unique par compte. | M |
| `SF-PGD-301` | Nouvelle entité **`FORMULE`** rattachée à la ligne : `{ id, libelle, recurrent_mensuel_ht, date_debut, date_fin (null = courante), courante }`. La ligne conserve l'**historique** des formules. | M |
| `SF-PGD-302` | Extensions de `DEMANDE` : table de liaison **`DEMANDE_LIGNE`** `{ nd, formule_id, recurrent, statut_ligne }` (multi-ND) ; `responsabilite_service_autre` (libellé libre) ; bloc **`si`** `{ etat, ref_si, horodatage, message, tentatives }` ; `commentaire` **obligatoire**. | M |
| `SF-PGD-303` | Jeu de démonstration : registre client étendu, plusieurs lignes par compte, chacune avec formule courante + ≥ 1 formule historique + un statut. En PROD : `SF-PGD-052b`. | M |

### 4.2 Recherche et sélection de la ligne

| ID | Exigence | Critères d'acceptation | Prio |
|---|---|---|---|
| `SF-PGD-310` | **Recherche par ND** aux côtés des recherches compte (`052`) et Case JADE (`053`). Résout : compte, ligne, statut, formules. | Champ « ND » présent et documenté · ND valide → pré-remplissage compte + contexte · ND inconnu → message **non bloquant**, saisie manuelle possible · insensible casse et espaces | M |
| `SF-PGD-311` | **Sélection multiple de ND** d'un même compte : liste des lignes (ND, formule courante, statut), sélection simple ou multiple. | Case à cocher par ligne · ≥ 1 ligne sélectionnable · récapitulatif reflète les lignes retenues · chaque ligne porte sa formule et son récurrent · montant global **agrège** les lignes (`031`/`043`) | M |

### 4.3 Formules et récurrent

| ID | Exigence | Critères d'acceptation | Prio |
|---|---|---|---|
| `SF-PGD-320` | **Remontée de toutes les formules** de la ligne (courante et historiques) avec choix. | Libellé + période `date_debut → date_fin` + badge *Courante* / *Historique* · sélection **obligatoire** d'une formule par ligne (bloquant) · formule courante **présélectionnée** par défaut · historique indisponible → mode dégradé « historique partiel » | M |
| `SF-PGD-321` | **Récurrent mensuel** affiché et pré-rempli dès la sélection de la formule. | Mise à jour à chaque changement de formule · champ reste **modifiable** · toute correction empilée dans `HISTORIQUE_MONTANT` (`042`) avec acteur et horodatage · alimente le prorata (`062`) | M |

### 4.4 Fiabilisation de la saisie

| ID | Exigence | Critères d'acceptation | Prio |
|---|---|---|---|
| `SF-PGD-330` | **Service « Autre » nommé** : dans Responsabilité par Service (DOBB), le choix « AUTRE » fait apparaître un champ texte obligatoire. | `AUTRE` sélectionné → `responsabilite_service_autre` affiché et requis · valeur reprise dans la fiche, l'audit et les KPI (`121`) · autre valeur → champ masqué et **vidé** | S |
| `SF-PGD-331` | **Commentaire obligatoire** à la soumission, tous circuits. | Soumission bloquée si vide ou espaces seuls · message d'aide explicite · cohérent avec la revue champ par champ (`081`) | M |

### 4.5 Routage et subdélégation

| ID | Exigence | Critères d'acceptation | Prio |
|---|---|---|---|
| `SF-PGD-340` | **Paliers de subdélégation** externalisés et paramétrables. Chaque palier = `{ min, max, label, etapes[] }`. Tant que la fiche officielle n'est pas fournie, les **tranches actuelles** servent de défaut, libellées « palier de subdélégation ». | Simulateur surligne le palier déclenché (`104`) · changement de palier recalcule la chaîne (`087`) · bornes contrôlées (chevauchements / trous, `103`) · aperçu temps réel aligné (`033`) · invariants conservés : TTC (`043`), terminaison DF puis DGA/DG (`R2`), SoD (`R3`) | M |

### 4.6 Statut de ligne

| ID | Exigence | Critères d'acceptation | Prio |
|---|---|---|---|
| `SF-PGD-350` | **Statut de ligne** (`ACTIF`, `SUSPENDU`, `RESILIE`) affiché dès la sélection et rattaché au dossier. | Badge couleur conforme charte (`170`) · statut persisté sur `DEMANDE_LIGNE.statut_ligne`, affiché en fiche et circuit · ligne **RESILIE** → comportement paramétrable Admin : (a) **alerte bloquante** *(défaut)* ou (b) justification renforcée (commentaire + pièce afférente) · exploitable en filtre et KPI | M |

### 4.7 Automatisation SI

| ID | Exigence | Critères d'acceptation | Prio |
|---|---|---|---|
| `SF-PGD-360` | **Restitution automatique au SI de facturation** à la validation finale (`070`, `R10`), via `BillingSiPort` (adaptateurs `BscsAdapter` / `GaiaAdapter`, bouchonnés en phase 1). États : `EN_ATTENTE → ENVOYE → CONFIRME` ou `ERREUR`, avec `ref_si`, `horodatage`, `message`, `tentatives`. | Déclenchement auto à la clôture · **relance manuelle** « Pousser dans le SI » par le rôle habilité en cas d'erreur · **idempotence** : dossier déjà confirmé jamais repoussé · chaque transition journalisée (`140`) · fiche validée affiche l'état et l'identifiant SI · erreur visible, tracée et **rejouable** sans re-valider · KPI « dégrèvements saisis dans le SI » reflète les états réels | S |
| `SF-PGD-361` | **Contrat d'intégration** BSCS / GAIA : authentification, format, accusé de réception, gestion d'erreur, rejeu ; ordonnancé par le job `si-push` (`202`). | À confirmer avec l'équipe SI — bouchon conforme au contrat provisoire | S |

---

## 5. Règles invariantes

| Réf. | Règle |
|---|---|
| `R1` | Le routage s'appuie exclusivement sur le **montant TTC**. |
| `R2` | Au-delà des seuils, la chaîne se termine par **DF** puis **DGA/DG**. |
| `R3` | **SoD** : un agent ne peut valider une étape s'il est intervenu à l'étape N-1 du même dossier. |
| `R4` | Une tâche ne peut être traitée que par un membre du rôle de sa corbeille. |
| `R5` | Toute transition d'état est journalisée de façon non répudiable. |
| `R6` | Le **re-routage** après modification tient compte des paliers en vigueur. |
| `R7` | Le claim est atomique ; en cas de conflit, `409`. |
| `R8` | Les montants ont un plancher de 0. |
| `R9` | Les SLA se décomptent en **heures ouvrées**. |
| `R10` | La validation finale **déclenche la restitution SI automatique**. |
| `R11` | Aucune règle métier n'est codée en dur. |
| `R12` | Le contrôle **FRA** est obligatoire au-delà de 5 M FCFA. |
| `R13` | Les pièces obligatoires du motif doivent être présentes à la soumission. |
| **`R14`** | Le **commentaire est obligatoire** à la soumission de toute demande. |
| **`R15`** | Un dégrèvement sur **ligne RESILIE** est **bloqué** ou soumis à justification renforcée (paramètre Admin, défaut = bloqué). |
| **`R16`** | La restitution SI est **idempotente** ; chaque tentative est journalisée. |
| **`R17`** | Une formule doit être **sélectionnée par ligne retenue** avant soumission. |

---

## 6. Exigences non fonctionnelles

| Domaine | Exigence |
|---|---|
| **Performance** | Recherche par ND et remontée des formules **< 1 s** · listing corbeille < 500 ms · claim < 200 ms · p95 API < 800 ms |
| **Concurrence** | Le claim supporte la contention concurrente sans double attribution (test de charge dédié) |
| **Traçabilité** | Toute pré-sélection automatique (récurrent, statut, formule) et toute correction manuelle horodatées |
| **Configurabilité** | Paliers, règle « ligne résiliée », connecteurs SI, taux, calendrier : éditables par l'Admin **sans redéploiement** |
| **Sécurité** | HTTPS partout · secrets hors code (variables d'environnement / coffre) · données financières jamais en query string · JWT courts + refresh · rate limiting Redis |
| **Disponibilité** | RPO ≤ 1 h · sauvegardes régulières PostgreSQL et Redis |
| **Rétention** | 10 ans (SOX) sur les journaux |
| **Accessibilité** | Contraste conforme, navigation clavier, libellés de formulaire explicites |
| **Langue** | Français intégral pour le domaine et l'interface |

---

## 7. Traçabilité objectifs → exigences

| Objectif | Exigences |
|---|---|
| G1 — ND | `300`, `310` |
| G2 — Multi-lignes / multi-formules | `300`, `301`, `311`, `320` |
| G3 — Fiabilisation | `321`, `330`, `331`, `R14` |
| G4 — Subdélégation | `340`, `103`, `104`, `R6` |
| G5 — Statut de ligne | `350`, `R15` |
| G6 — Automatisation SI | `360`, `361`, `R10`, `R16` |
| G7 — Zéro règle en dur | `020`, `201`, `R11` |
| G8 — Anti-blocage | `071`–`076`, `086` |
| G9 — Non-répudiation | `140`, `142`, `006`, `R5` |
