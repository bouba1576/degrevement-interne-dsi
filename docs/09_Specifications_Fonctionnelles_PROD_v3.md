# Spécifications Fonctionnelles — Version PROD (consolidée)
## Plateforme de Gestion des Dégrèvements (PGD)

**Orange Côte d'Ivoire — Direction du Système d'Information**
Version du document : 3.0 (PROD consolidée) · Date : 31 juillet 2026
Statut : Spécification de référence pour le développement de la version de production
Base : maquette interactive haute-fidélité validée (MVP fonctionnel v1.0)

> **Note de version 3.0** — Ce document consolide les spécifications PROD v2.0 et le **lot d'améliorations « Nouvelle demande »** (exigences `SF-PGD-3xx`) : recherche par ND, sélection multiple de lignes, remontée des formules, récurrent automatique, service « Autre » nommé, commentaire obligatoire, paliers de subdélégation, statut de ligne et automatisation de la restitution SI. Les évolutions sont intégrées dans les sections concernées (§6, §8, §11, §19, §20, §22) et signalées par le préfixe « **[v3.0]** ».

---

## 0. À propos de ce document

Ce document spécifie **l'intégralité des fonctionnalités implémentées** dans la maquette interactive de la PGD et constitue le **référentiel de développement de la version PROD**. Contrairement au document v1.0 (vue fonctionnelle d'ensemble), il fournit le niveau de détail nécessaire à l'industrialisation : règles métier chiffrées, codes de rôles et groupes AD, machines à états, modèle de données, contrats d'intégration et exigences non-fonctionnelles.

Chaque exigence porte un identifiant `SF-PGD-xxx` pour la traçabilité (cahier de recettes, matrice de couverture).

**Convention de lecture**
- 🟢 **Implémenté** : comportement présent et démontrable dans la maquette → à porter à l'identique.
- 🟡 **Simulé (bouchon)** : logique fonctionnelle présente, dépendance externe simulée → à raccorder en PROD.
- 🔵 **PROD** : exigence nouvelle propre à l'industrialisation (persistance, sécurité, exploitation).

---

## 1. Contexte & objectifs

### 1.1 Objet
La **PGD** automatise le cycle de vie des demandes d'ajustement (dégrèvements) émises par les directions métier d'Orange Côte d'Ivoire :

> **Saisie → routage automatique (matrice de décision) → validation multi-niveaux → validation finale et saisie SI → contrôle a posteriori → archivage.**

### 1.2 Objectifs de la version PROD
| # | Objectif |
|---|----------|
| O1 | Dématérialiser et tracer 100 % des demandes de dégrèvement, multi-circuits. |
| O2 | Garantir un routage déterministe par montant, sans règle codée en dur (matrice externalisée). |
| O3 | Faire respecter les SLA en heures ouvrées avec escalade automatique. |
| O4 | Assurer la séparation des tâches (SoD) et la traçabilité de bout en bout (conformité SOX). |
| O5 | Restituer un pilotage chiffré (KPI) par circuit, univers FMI, motif et responsabilité. |
| O6 | Permettre à l'administration de reconfigurer processus, tranches, rôles et calcul sans redéploiement. |

### 1.3 Périmètre des circuits (directions)
| Code | Direction | Segment | TVA | Sous-flux |
|------|-----------|---------|-----|-----------|
| **DOBB** | Direction Opérations B2B | Entreprises (B2B) | 18 % | Réclamation, Recouvrement, ADV, Facturation |
| **DXC** | Direction Expérience Client | Grand public (B2C) | 18 % | Réclamation, Geste commercial |
| **DF** | Direction Wholesale & Opérateurs | Opérateurs (Wholesale) | 18 % | Réclamation opérateur |

De nouveaux circuits sont créables dynamiquement par l'administrateur (§11). Aucun circuit n'est figé dans le code.

---

## 2. Glossaire & acronymes

| Terme | Définition |
|-------|-----------|
| **Dégrèvement / Ajustement** | Avoir ou correction de facturation accordé à un client/opérateur. |
| **Circuit** | Chaîne de traitement propre à une direction (DOBB, DXC, DF…). |
| **Matrice de décision** | Table consolidée associant, par circuit et par tranche de montant, une chaîne ordonnée d'étapes (rôle, type, SLA). |
| **Tranche** | Intervalle de montant TTC (FCFA) déclenchant une chaîne de validation donnée. |
| **Étape (tâche)** | Unité de traitement assignée à un rôle ; type **V** (vérification) ou **A** (approbation). |
| **Corbeille** | File de tâches partagée par un rôle = un groupe AD (mode *pull*). |
| **Claim / Unclaim** | Récupération / libération d'une tâche (verrou nominatif). |
| **SoD** | *Separation of Duties* — séparation des tâches. |
| **SLA** | Délai contractuel de traitement, décompté en **heures ouvrées**. |
| **FMI** | Univers de pilotage : **F**ixe / **M**obile / **I**nternet. |
| **TSC** | Taxe spéciale sur les communications. |
| **FRA** | Fraude & Revenue Assurance (profil de contrôle Wholesale). |
| **RBAC** | *Role-Based Access Control*. |
| **2FA / MFA** | Double authentification / authentification multi-facteurs. |

---

## 3. Acteurs, rôles & contrôle d'accès (RBAC)

### 3.1 Principe directeur
🟢 **SF-PGD-001** — Les profils sont **strictement issus de la matrice de décision**. Tout rôle absent d'une chaîne de validation/contrôle est **élagué** de la plateforme (procédure automatique au chargement de la configuration), à l'exception des Initiateurs (point d'entrée) et de l'Administrateur. Cette règle garantit qu'aucun rôle « orphelin » n'est exposé.

### 3.2 Catalogue des rôles (référentiel implémenté)
Chaque rôle porte : `code`, libellé, `niveau` hiérarchique, `type`, et **groupe Active Directory** rattaché.

| Code | Libellé | Niv. | Type | Groupe AD | Circuit |
|------|---------|:---:|:---:|-----------|:---:|
| `INIT_DOBB` | Chargé de réclamation B2B | 1 | I | `GG-DGR-DOBB-INIT` | DOBB |
| `INIT_DXC` | Gestionnaire B2C | 1 | I | `GG-DGR-DXC-INIT` | DXC |
| `INIT_DF` | Back office opérateur | 1 | I | `GG-DGR-DF-INIT` | DF |
| `VER_DOBB` | Vérificateur DOBB | 2 | V | `GG-DGR-DOBB-VER` | DOBB |
| `VER_DXC` | Chargé de réclamation B2C | 2 | V | `GG-DGR-DXC-VER` | DXC |
| `VER_DF` | Vérificateur Wholesale | 2 | V | `GG-DGR-DF-VER` | DF |
| `RESP_DOBB` | Responsable DOBB | 3 | A | `GG-DGR-DOBB-RESP` | DOBB |
| `MGR_DOBB` | Manager DOBB | 4 | A | `GG-DGR-DOBB-MGR` | DOBB |
| `DIR_DOBB` | Directeur DOBB | 5 | A | `GG-DGR-DOBB-DIR` | DOBB |
| `RESP_DXC` | Responsable réclamation B2C | 3 | V | `GG-DGR-DXC-RESP` | DXC |
| `MRF_DXC` | Manager réclamation & facturation B2C | 4 | V | `GG-DGR-DXC-MRF` | DXC |
| `MSRF_DXC` | Manager Sénior réclamation & facturation B2C | 5 | V | `GG-DGR-DXC-MSRF` | DXC |
| `DIR_DXC` | Directeur Expérience Client | 5 | A | `GG-DGR-DXC-DIR` | DXC |
| `SM_DF` | Senior Manager Wholesale | 4 | A | `GG-DGR-DF-SM` | DF |
| `DF` | Directeur Financier | 6 | A | `GG-DGR-DF-DIR` | * (pivot) |
| `DGA_DG` | DGA / Directeur Général | 7 | A | `GG-DGR-DG` | * (pivot) |
| `CTRL_N1` | Contrôle à froid N1 (sécurisation des opérations) | 8 | C | `GG-DGR-CTRL-N1` | * |
| `CTRL_N2` | Contrôle mensuel N2 (FRA) | 9 | C | `GG-DGR-CTRL-N2` | * |
| `SUPERVISEUR` | Superviseur PGD | 10 | S | `GG-DGR-SUP` | * |
| `ADMIN` | Administrateur PGD | 11 | X | `GG-DGR-ADMIN` | * |

> Types : **I** = Initiateur · **V** = Vérificateur · **A** = Approbateur · **C** = Contrôleur · **S** = Superviseur · **X** = Administrateur.
> Les rôles `DF` et `DGA_DG` sont **mutualisés multi-circuits** (pivots financiers/terminaux).

### 3.3 Navigation conditionnée par le rôle
🟢 **SF-PGD-002** — Le menu et les actions s'adaptent dynamiquement au profil :

| Entrée de menu | Condition d'affichage (type de rôle) |
|----------------|--------------------------------------|
| Tableau de bord | tous |
| Nouvelle demande / Ajustement en masse / Mes demandes | Initiateur (I) |
| Corbeilles | Vérificateur (V) ou Approbateur (A) |
| Contrôle a posteriori | Contrôleur (C) |
| Consultation | Superviseur, DF, DGA/DG, Admin, Contrôleur |
| Journal d'audit | Superviseur, Admin, Contrôleur |
| Administration / Intégrations / Modules | Admin uniquement |

### 3.4 Bascule de rôle (démonstration) → comptes nominatifs (PROD)
🟢 **SF-PGD-003** — La maquette propose une **bascule de persona** (Initiateur, Vérificateur, Valideur, Directeur Financier, Contrôleur, Superviseur, Administrateur) avec re-challenge 2FA si le rôle cible est sensible.
🔵 **SF-PGD-003b (PROD)** — En production, la bascule libre est remplacée par l'**affectation réelle des rôles via les groupes AD** ; un utilisateur cumulant plusieurs rôles dispose d'un sélecteur de contexte limité à ses habilitations effectives.

---

## 4. Authentification & sécurité

### 4.1 Connexion Active Directory + 2FA
🟡 **SF-PGD-010** — Parcours en deux étapes :
1. **Identifiant AD** `prenom.nom@orange.ci` + mot de passe d'entreprise.
2. **Double authentification** par code à usage unique (OTP 6 chiffres).

🟢 **SF-PGD-011** — La **2FA est obligatoire** pour les rôles à pouvoir financier, terminal ou d'administration. Liste implémentée (`MFA_ROLES`) : **`SM_DF`, `DF`, `DGA_DG`, `ADMIN`**. Les autres profils ouvrent la session après la seule étape AD.
🟢 **SF-PGD-012** — **Re-challenge 2FA** déclenché à chaque bascule vers un rôle sensible (fonction `requiresMfa(user)`).
🟢 **SF-PGD-013** — Écran de connexion illustré + **comptes de démonstration** étiquetés « 2FA » ou « simple » (à retirer en PROD).

### 4.2 Journal de sécurité
🟢 **SF-PGD-014** — Toutes les opérations d'authentification (succès/échec AD, succès/échec 2FA, ouvertures et fermetures de session) sont **horodatées et tracées** dans un journal de sécurité dédié (`secLog`). La déconnexion est journalisée explicitement.

### 4.3 Exigences PROD
🔵 **SF-PGD-015 (PROD)** — Intégration réelle **LDAP/Active Directory** (bind, résolution des groupes `GG-DGR-*`), provider 2FA d'entreprise (TOTP / push), gestion de session avec expiration et révocation, protection CSRF/XSS, chiffrement en transit (TLS) et au repos.

---

## 5. Modèle de configuration externalisée

🟢 **SF-PGD-020** — **Aucune règle métier n'est codée en dur.** Le moteur lit exclusivement une configuration externalisée (objet `CONFIG` + matrice `CIRCUITS`). En PROD cette configuration est persistée et éditable par l'Admin (§11).

### 5.1 Paramètres de calcul (`CONFIG`)
| Paramètre | Valeur par défaut implémentée | Éditable Admin |
|-----------|-------------------------------|:---:|
| TSC — actif | `true` | ✔ |
| TSC — taux | `0,03` (3 %) | ✔ |
| TSC — base | HT | ✔ |
| TVA — actif | `true` | ✔ |
| TVA — taux | `0,18` (18 %) | ✔ |
| TVA — base | HT | ✔ |
| Affichage ligne « HT + TSC » | `true` | ✔ |
| Devise | `FCFA` | ✔ |

### 5.2 Calendrier métier des SLA (modèle type GLPI)
| Paramètre | Défaut implémenté | Éditable Admin |
|-----------|-------------------|:---:|
| Jours ouvrés | Lundi → Vendredi (`[1,2,3,4,5]`) | ✔ |
| Heure de début de journée ouvrée | 8 h 00 | ✔ |
| Heure de fin de journée ouvrée | 18 h 00 | ✔ |
| Jours fériés (exclus du décompte) | `2026-01-01, 04-06, 05-01, 08-07, 08-15, 11-01, 12-25` | ✔ |

### 5.3 Référentiels associés
- **Univers FMI** : Fixe / Mobile / Internet.
- **Facteurs de dégrèvement** : `interne` (structurel) / `externe` (conjoncturel).
- **Motifs par circuit** (listes complètes implémentées) :
  - **DOBB** : 27 motifs réels (PO2_B-17) — *Contestation facture, Abattement, Abattement (data tracking), Abattement (fraude BR mix), Anomalie facturation, Anomalie SI, Cession non effective, Data roaming, Erreur de saisie, Facturation manuelle de frais, Geste commercial, Migration non effective, Modification non effective, Résiliation non effective, Service non livré facturé, Surconsommation, Suspension non effective, Technique, Transfert non effectif, Problème technique/dérangement, Annulation d'avoir, Annulation de paiement, Forcement, Paiement, Transfert de paiement, Remboursement, Winback client fibre optique, Autres.*
  - **DXC** : Réclamation client, Geste commercial, Erreur de facturation, Double facturation, Résiliation contestée, Abattement, Surconsommation.
  - **DF** : Tarif erroné, Écart de volume, Double facturation, Non-respect SLA, Lien résilié facturé, Geste commercial opérateur.
- **Canaux de remontée** : CRM, DIMELO, E-mail, Courrier, Agence, Centre d'appel, Outlook.
- **Responsabilité DOBB — Direction** : DOBB, DXC, MARKETING, MARKETING B2B, DRSI, SI, DIE, DT, DMS, DM/DRSI, LE CLIENT, CLIENT, TOP MANAGEMENT, INDÉTERMINÉE, AUTRE.
- **Responsabilité DOBB — Service** : FACTURATION, ADV FIXE INTERNET, ADV MOBILE, ADV MOBILE MENTLEY, ADV (Ascom), ORANGE BUSINESS MAIL, COMMERCIAL, RECOUVREMENT, DÉRANGEMENT, CONFIGURATION DES OFFRES, PÔLE PROVISIONNING, ANOMALIE DIMELO, PROJET VIRAGE, ÉQUIPE TASKFORCE, INDÉTERMINÉ, AUTRE.

---

## 6. Matrice de décision & moteur de routage

### 6.1 Structure
🟢 **SF-PGD-030** — Pour chaque circuit, une liste de **tranches** `{min, max, label, etapes[]}` (max `null` = infini). Chaque étape : `{role, type (V|A), bloquant (bool), sla (heures)}`. Les tâches de **contrôle a posteriori** sont définies séparément (`controle[]`), hors chemin bloquant.

🔵 **[v3.0] SF-PGD-340 — Paliers de la nouvelle fiche de subdélégation** — Les tranches sont **réexprimées en paliers de subdélégation** `{ min, max, label, etapes[] }` alignés sur la **nouvelle fiche de subdélégation** publiée par la Direction Financière, et restent **externalisés et paramétrables** par l'Admin (aucune règle codée en dur). Tant que la fiche officielle n'est pas fournie, les **tranches actuelles servent de valeurs par défaut**, explicitement libellées « palier de subdélégation ». L'aperçu temps réel (§6.4), le simulateur de montant (`SF-PGD-104`) et la validation des bornes (`SF-PGD-103`) s'appliquent aux paliers. Invariants `R1/R2/R3/R6` conservés.
> **Dépendance :** seuils, rôles et paliers éventuels par direction/service à intégrer au référentiel `CIRCUITS`.

### 6.2 Tranches & chaînes implémentées (montants en FCFA TTC)

**DOBB**
| Tranche | Chaîne ordonnée (rôle · type) |
|---------|-------------------------------|
| ≤ 4,99 M (`0 – 4 999 999`) | Vérificateur (V) → Responsable (A) → Directeur (A) |
| 5 M – 50 M (`5 000 000 – 50 000 000`) | Vérificateur (V) → Responsable (A) → Manager (A) → Directeur (A) → **DF (A)** |
| > 50 M (`50 000 001 – ∞`) | Vérificateur (V) → Responsable (A) → Manager (A) → Directeur (A) → DF (A) → **DGA/DG (A)** |
| Contrôle | CTRL_N1 (a posteriori) |

**DXC** — *fidèle à la matrice officielle B2C / FTTH (slide « Circuit de validation DXC »).* Acteurs vérificateurs (V) puis validateurs (A).
| Tranche | Chaîne ordonnée (rôle · type) |
|---------|-------------------------------|
| ≤ 500 k (`0 – 500 000`) | Chargé réclam. B2C (V) → Responsable réclam. B2C (V) → **Directeur Exp. Client (A)** |
| 500 k – 5 M (`500 001 – 5 000 000`) | Chargé (V) → Responsable (V) → Manager réclam. & fact. (V) → Manager Sénior réclam. & fact. (V) → **Directeur Exp. Client (A)** |
| 5 M – 30 M (`5 000 001 – 30 000 000`) | … (4 vérificateurs) → **Chargé/Responsable FRA (V)** → SM MOA Finance & FRA (A) → Directeur Exp. Client (A) → **DFA (A)** |
| 30 M – 50 M (`30 000 001 – 50 000 000`) | … → Chargé/Responsable FRA (V) → SM MOA Finance & FRA (A) → Directeur Exp. Client (A) → DFA (A) → **DF (A)** |
| > 50 M (`50 000 001 – ∞`) | … → Chargé/Responsable FRA (V) → SM MOA Finance & FRA (A) → Directeur Exp. Client (A) → DFA (A) → DF (A) → **DGA/DG (A)** |
| Contrôle | CTRL_N1 (sécurisation des opérations DXC) + CTRL_N2 (mensuel, FRA) — a posteriori |

**DF (Wholesale)** — *fidèle à la slide « Circuit de validation DF ».*
| Tranche | Chaîne |
|---------|--------|
| ≤ 5 M (`0 – 5 000 000`) | SM Back Office Opérateurs & Credit Mgmt (V) → SM Vente Wholesale & Roaming (A) |
| 5 M – 50 M (`5 000 001 – 50 000 000`) | SM Back Office (V) → SM Vente Wholesale & Roaming (A) → SM MOA Finance & FRA (A) → Directeur Marketing (A) → DFA (A) → **DF (A)** |
| > 50 M (`50 000 001 – ∞`) | Directeur Marketing (V) → DFA (A) → DF (A) → **DGA/DG (A)** |
| Contrôle | CTRL_N1 (a posteriori) |

### 6.3 Sélection de tranche & instanciation
🟢 **SF-PGD-031** — À la soumission, le moteur sélectionne la tranche telle que `ttc ≥ min ET (max = null OU ttc ≤ max)`, puis instancie une tâche par étape : la **première** passe à l'état `EN_CORBEILLE`, les suivantes à `EN_ATTENTE`. Les tâches de contrôle sont créées à l'état `POST_CLOTURE`.
🟢 **SF-PGD-032** — Invariant montant : au-delà des seuils, **DF puis DGA/DG** sont automatiquement ajoutés (visibles dans le tableau ci-dessus). Le contrôle a posteriori est toujours ajouté hors chemin bloquant.

### 6.4 Aperçu temps réel du routage
🟢 **SF-PGD-033** — À la saisie du montant, la plateforme affiche en direct la **tranche déclenchée** et la **chaîne de validation prévue** (`buildChainPreview`), avant soumission.

---

## 7. Calcul des montants

🟢 **SF-PGD-040** — Formule implémentée (`calcMontants`) :
```
TSC = HT × taux_TSC           (si TSC activée, base HT)
TVA = HT × taux_TVA           (si TVA activée, base HT)
HT + TSC                      (ligne intermédiaire affichable)
TTC = HT + TSC + TVA
```
🟢 **SF-PGD-041** — Chaque taxe est **activable/désactivable par demande** (overrides `applyTsc` / `applyTva`) ; à défaut, la demande suit la configuration globale.
🟢 **SF-PGD-042** — Calcul **en temps réel** et **traçabilité des montants** : chaque modification empile une entrée dans `montantsHistory` `{ts, acteur, evt, ht, tsc, tva, htTsc, ttc, applyTsc, applyTva}`.
🟢 **SF-PGD-043** — Le **routage s'opère sur le TTC**.

---

## 8. Saisie d'une demande

### 8.1 Formulaires par circuit
🟢 **SF-PGD-050** — Le formulaire s'adapte au circuit, fidèle aux modèles métier réels :

- **DXC (B2C, réf. PO5-G-07)** : client, compte, formule Internet, motif, libellé, récurrent mensuel ; circuit de signature affiché.
- **DOBB (B2B, réf. PO2_B-17)** : référence client, n° d'appel, formule d'abonnement, descriptif de la contestation, localisation (National/International), canal de remontée, période contestée (`{debut, fin, jours}`), point de contact, récurrent, **responsabilité par direction et par service**, agents réclamation/responsable, dates de réception BO & OCI, pièce afférente, et les 27 motifs réels.
- **DF (Wholesale, format MÉMO/FRA)** : `memoDe`, `memoA`, `memoObjet`, `memoObjectif`, `memoContexte`, `memoObservation`, opérateur, **montant en € (`montantEuro`)** en référence devise opérateur, signataires Wholesale.

### 8.2 Champs communs
🟢 **SF-PGD-051** — Date de demande (obligatoire), date de saisie (auto), agent + matricule, univers FMI, facteur de dégrèvement, motif (liste + « Autres »), contact client, libellé, commentaire, pièces justificatives (Facture, Mémo, Justificatif, Contrat, Fiche de calcul…).
🟢 **[v3.0] SF-PGD-330 — Service « Autre » nommé** — Dans **Responsabilité par Service** (DOBB), le choix **« Autre »** affiche un **champ texte obligatoire** (`responsabiliteServiceAutre`) pour nommer le service ; la valeur est reprise dans la fiche, l'audit et les **KPI de responsabilité par service** (`SF-PGD-121`). Toute autre valeur masque et vide le champ.
🟢 **[v3.0] SF-PGD-331 — Commentaire obligatoire** — Le **commentaire est obligatoire** à la soumission de toute demande (tous circuits) : soumission bloquée si commentaire vide ou espaces seuls, avec message d'aide explicite. Cohérent avec la revue champ par champ (`SF-PGD-081`) : le commentaire global reste complétable en aval.

### 8.3 Pré-remplissage client par n° de compte
🟢 **SF-PGD-052** — Registre client indexé par n° de compte (`CLIENT_REGISTRY`). À la première demande, les infos client sont saisies ; elles sont **enregistrées** (`registerClient`) puis **rechargées automatiquement** (`findClient`) aux demandes suivantes (nom, formule).
🔵 **SF-PGD-052b (PROD)** — Le registre est alimenté par le SI client / CRM réel ; la recherche compte interroge la source de vérité.

#### 8.3bis Recherche & sélection de la ligne par ND [v3.0]
🟢 **SF-PGD-310 — Recherche par ND** — L'écran de saisie propose une **recherche par ND (Numéro de Désignation)** aux côtés des recherches n° de compte (`SF-PGD-052`) et n° de Case JADE. Un ND résout : compte client, ligne, statut et formules. Recherche insensible à la casse et aux espaces (cohérent `findClient`). ND inconnu → message **non bloquant**, la saisie manuelle reste possible.
🟢 **SF-PGD-311 — Sélection multiple de ND** — Lorsqu'un compte porte **plusieurs ND**, la plateforme liste ses lignes (ND, formule courante, statut) avec **case à cocher** et permet une **sélection simple ou multiple** (≥ 1 ligne). Chaque ligne retenue porte sa propre formule et son propre récurrent (§8.3ter). Le montant global agrège les lignes ; le **routage porte sur le TTC total** (`SF-PGD-031/043`).

#### 8.3ter Formules & récurrent mensuel [v3.0]
🟢 **SF-PGD-320 — Remontée de toutes les formules** — Pour une ligne sélectionnée, la plateforme fait remonter **toutes les formules (courante et historiques)** avec **choix**. Chaque formule affiche libellé, période (`dateDebut → dateFin`) et badge *Courante* / *Historique* ; le choix d'une formule par ligne est **obligatoire** (bloquant), la formule courante étant présélectionnée.
🟢 **SF-PGD-321 — Récurrent mensuel automatique** — Dès la **sélection de la formule**, le **récurrent mensuel** (`recurrentMensuelHT`) s'affiche et **pré-remplit** le champ récurrent, **modifiable**. Mise à jour à chaque changement de formule ; toute correction manuelle est empilée dans `montantsHistory` (`SF-PGD-042`) avec acteur et horodatage. En ajustement au prorata (`SF-PGD-062`) : `restitué HT = récurrent ÷ 30 × jours`.

#### 8.3quater Statut de la ligne [v3.0]
🟢 **SF-PGD-350 — Statut de la ligne concernée** — Le **statut** de la ligne (`ACTIF`, `SUSPENDU`, `RESILIE`) est affiché dès la sélection (badge couleur : vert Actif / jaune Suspendu / rouge Résilié, charte `SF-PGD-170`) et rattaché au dossier (`lignes[].statutLigne`). **Ligne Résiliée** : comportement paramétrable (Admin) — (a) **alerte bloquante** par défaut, ou (b) **justification renforcée**. Statut exploitable en filtre / KPI.

### 8.4 Génération de la référence
🟢 **SF-PGD-053** — Format `<DIRECTION><AAMMJJ>.<HHMM>.<6 chiffres>` — ex. `DOBB260602.2129.470026` (`genRef`).

---

## 9. Ajustement en masse (B2C)

🟢 **SF-PGD-060** — Fiche de **restitution pour dérangement collectif** (réf. PO5-G-07-ERQ1) : traitement d'un lot de clients en un seul dossier (`createDossierMasse`, indicateur `masse = true`).
🟢 **SF-PGD-061** — **Saisie ligne par ligne via fenêtre dédiée** alimentant un tableau récapitulatif : Client/NCLI, n° Fibre, n° CASE, formule, période de non-connexion, jours, récurrent HT.
🟢 **SF-PGD-062** — **Calcul au prorata** : `restitué HT = récurrent mensuel HT ÷ 30 × jours de non-connexion`. TSC/TVA/TTC cumulés sur le lot.
🟢 **SF-PGD-063** — Le lot est routé selon le **TTC total**. Un bandeau oriente vers le formulaire unitaire pour les cas individuels.

---

## 10. Cycle de vie, corbeilles & traitement des tâches

### 10.1 Machine à états du dossier
🟢 **SF-PGD-070** — Statuts implémentés (`STATUTS`) :
```
brouillon → soumis → en_cours → { valide | rejete | abandonne }
```
| Statut | Déclencheur |
|--------|-------------|
| `brouillon` | création / rappel par l'initiateur |
| `soumis` | soumission, instanciation des tâches |
| `en_cours` | au moins une étape franchie |
| `valide` | dernière approbation → **restitution SI automatique** (§22.2, [v3.0] SF-PGD-360) + activation contrôle a posteriori |
| `rejete` | rejet motivé à une étape |
| `abandonne` | abandon initiateur avant étape critique |

### 10.2 Machine à états de la tâche
🟢 **SF-PGD-071** — États implémentés :
`EN_ATTENTE` → `EN_CORBEILLE` → `RECLAMEE` → `VERIFIEE` | `APPROUVEE` | `REJETEE` | `ESCALADEE`.
Tâches de contrôle : `POST_CLOTURE` → `A_CONTROLER` → `FAIT`.

### 10.3 Corbeilles partagées par rôle
🟢 **SF-PGD-072** — **Une corbeille = un rôle = un groupe AD.** Tous les membres habilités voient les tâches non récupérées (mode *pull*), évitant tout blocage en cas d'absence.
🟢 **SF-PGD-073** — **Récupérer (claim)** pose un **verrou nominatif de 4 h** (`verrouExpireH = 4`) ; **Libérer (unclaim)** remet la tâche en file. Vues : file de la corbeille, mes tâches récupérées, tâches verrouillées par un collègue.
🟢 **SF-PGD-074** — Corbeilles initiateur : **Demandes en cours**, **validées**, **rejetées**, chacune avec recherche, filtres et tri.

### 10.4 Minuteur SLA
🟢 **SF-PGD-075** — Sur une tâche, **compte à rebours en heures ouvrées** avec code couleur : vert (confortable), jaune (< 4 h), rouge (dépassé). Présent en corbeille et en détail.

---

## 11. Validation, vérification & décisions

### 11.1 Revue champ par champ
🟢 **SF-PGD-080** — À la validation, la demande est **conforme par défaut** ; le valideur **signale uniquement les champs en anomalie** (objet `revue[] {champ, verdict ok|ko, motif}`).
🟢 **SF-PGD-081** — Tout champ signalé exige un **commentaire obligatoire** ; le **commentaire global** est le récapitulatif automatique des anomalies (complétable).
🟢 **SF-PGD-082** — Décision : **Approuver** (aucune anomalie) ou **Rejeter avec motifs** (≥ 1 anomalie ; motif obligatoire). La revue (nb champs validés/invalides + motifs) est journalisée et affichée dans le circuit du dossier.

### 11.2 Séparation des tâches (SoD)
🟢 **SF-PGD-083** — Contrôle **bloquant** (`sodViolation`) : un acteur ayant agi à l'étape N-1 ne peut agir à l'étape N du même dossier (vérifié sur approbation **et** rejet).

### 11.3 Délégation
🟢 **SF-PGD-084** — Délégation nominative (`delegate`) avec **note d'intérim** conservée pour l'audit ; candidats limités au rôle (matrice) de la tâche ; libère le verrou éventuel.

### 11.4 Actes de l'initiateur
🟢 **SF-PGD-085** — **Abandon** (`abandon`) : possible tant qu'aucune approbation (type A) n'a eu lieu (`canAbandon`, `etapeCritiqueAtteinte`).
🟢 **SF-PGD-086** — **Rappel** (`rappeler`) : l'initiateur ramène le dossier en `brouillon` pour correction, avant toute approbation.
🟢 **SF-PGD-087** — **Modification après rejet + re-routage** (`modifyResubmit`) : correction des montants/libellé → recalcul TSC/TVA/TTC, re-soumission, et **re-routage** avec recalcul de la chaîne si la tranche change (événement « Re-routage » journalisé).

---

## 12. Gestion des SLA (calendrier métier)

### 12.1 Décompte en heures ouvrées
🟢 **SF-PGD-090** — Les SLA sont décomptés en **heures ouvrées** uniquement (`heuresOuvrees`, `echeanceSla`) : seuls comptent les jours ouvrés et, en leur sein, la plage horaire de travail ; les jours fériés sont exclus. Précision de calcul : pas de 30 min.

### 12.2 SLA de référence par profil (`SLA_REF`, en heures ouvrées)
| Profil | SLA |
|--------|-----|
| Vérificateurs (`VER_*`) | 8 h |
| Responsables (`RESP_*`) | 8 h |
| Managers / Senior Managers (`MGR_DOBB`, `SM_DF`, `MRF_DXC`, `MSRF_DXC`) | 8 h |
| Directeurs (`DIR_*`) | 24 h |
| Directeur Financier (`DF`) | 24 h |
| DGA / DG (`DGA_DG`) | 24 h |
| FRA (`SLA_FRA`) | 48 h |
| Contrôle / Fiabilisation (`CTRL_N1`, `CTRL_N2`) | 240 h (10 jours) |

> Ces valeurs de référence sont **appliquées automatiquement** à toutes les chaînes de la matrice au chargement de la configuration.

### 12.3 Escalade
🟢 **SF-PGD-091** — **Escalade automatique** (`runAutoEngine`) : lorsqu'une corbeille reste inactive au-delà du SLA, la tâche passe à `ESCALADEE` et la suivante (N+1) est ouverte ; le superviseur est notifié. Si étape terminale, alerte superviseur sans escalade.
🟢 **SF-PGD-092** — **Expiration automatique du verrou** : un claim de plus de 4 h est libéré automatiquement (tâche remise en corbeille, événement journalisé).
🟢 **SF-PGD-093** — **Escalade manuelle** (`escalader`) par le superviseur/admin avec motif.
🟢 **SF-PGD-094** — **Simulateur de temps** (+4 h / +24 h / +72 h, `advanceTime`) pour démontrer verrous et escalades (outil de démo ; à retirer/garder en environnement de test PROD).
🔵 **SF-PGD-095 (PROD)** — Le moteur temps réel (intervalle 20 s en maquette) devient un **ordonnanceur serveur** (job planifié) avec notifications réelles.

### 12.4 Configuration visuelle du calendrier
🟢 **SF-PGD-096** — Interface Admin : grille hebdomadaire des jours ouvrés, règle horaire à curseurs, jours fériés en puces, **simulateur d'échéance** (durée → date d'échéance calculée).

---

## 13. Administration & configurabilité

### 13.1 Designer de processus (sans code)
🟢 **SF-PGD-100** — Layout deux volets : liste des processus (gauche) + canvas (droite).
🟢 **SF-PGD-101** — **Création de processus** via assistant : code, segment, nom, TVA, motifs, sous-flux, clients exemples.
🟢 **SF-PGD-102** — **Composition de la chaîne** en timeline verticale : étapes avec rôle, type (V/A), SLA, membres ; insertion entre deux étapes, glisser-déposer, duplication, suppression.
🟢 **SF-PGD-103** — **Tranches de montant** éditables avec **validation des bornes** (détection des chevauchements et des trous).
🟢 **SF-PGD-104** — **Simulateur de montant** surlignant la tranche déclenchée.
🟢 **SF-PGD-105** — **Publication immédiate** sans redéploiement.

### 13.2 Moniteur d'exécution
🟢 **SF-PGD-106** — Visualisation des instances en cours **par étape**. Actions superviseur : **relancer** la corbeille (`relancer`), **réaffecter** la tâche à un autre rôle (`reaffecter`), **débloquer** un verrou forcé (`debloquer`), **escalader**, ouvrir le dossier.

### 13.3 Rôles, utilisateurs & référentiels
🟢 **SF-PGD-107** — **Rôles & corbeilles** : catalogue ; les rôles **présents dans la matrice** sont mis en avant, ceux hors matrice grisés ; création/édition/suppression, membres habilités.
🟢 **SF-PGD-108** — **Gestion des utilisateurs** : liste, profils affectés, rattachement rôles/corbeilles.
🟢 **SF-PGD-109** — **Motifs & circuits** : référentiel des sous-flux et motifs par circuit.

### 13.4 Paramètres de calcul
🟢 **SF-PGD-110** — Activation/désactivation et **taux paramétrable** TSC/TVA, affichage HT+TSC, devise, calendrier SLA (cf. §5, §12).

### 13.5 Intégrations (adaptateurs)
🟡 **SF-PGD-111** — Écran des dépendances externes — **CRM, Active Directory/LDAP, GED, SMTP** — à interface stable (bouchons remplaçables). Inclut un **import de réclamation CRM** (`importFromCRM`) et un **journal des notifications** (bouchon SMTP).

### 13.6 Modules & extensibilité
🟢 **SF-PGD-112** — Registre des modules activables. État implémenté :
| Module | Code | Activé | Version |
|--------|------|:---:|---|
| KPI & pilotage | `kpi` | ✔ | — |
| Contrôle a posteriori | `controle` | ✔ | — |
| Ajustement en masse | `masse` | ✔ | 0.9 |
| Moteur SLA & escalade | `sla` | ✔ | 0.9 |
| Designer de processus (no-code) | `designer` | ✔ | 0.8 |
| Connecteur BI externe (Power BI / Tableau) | `bi` | à venir | — |
| Signature électronique qualifiée (eIDAS) | `esign` | à venir | — |

---

## 14. Tableau de bord & KPIs

🟢 **SF-PGD-120** — Le tableau de bord propose des **vues adaptées au profil** : Initiateur, Validateur, Pilotage global.

### 14.1 KPIs Initiateur
Demandes initiées, en cours, validées, rejetées, **respect des SLA** (%, alerte si < 80 %).

### 14.2 KPIs Validateur
En attente (mes corbeilles), en cours de traitement (récupérées par moi), validées par moi, rejetées par moi, **respect des SLA** (%).

### 14.3 KPIs Pilotage (réf. feuille KPI)
🟢 **SF-PGD-121** — Implémentés :
- **Délai moyen de traitement** (soumission → validation), **taux d'approbation**, **dossiers en circuit** (+ tâches en retard SLA), **montant validé cumulé**.
- **Dossiers reçus vs traités** (volume + montant TTC), **dégrèvements saisis dans le SI** (volume + montant).
- **Montant du mois M** et **évolution M-1 → M**.
- **Montant par univers FMI** (Fixe/Mobile/Internet), dossiers traités par univers, **top motif par univers**.
- **Facteurs de dégrèvement** (interne vs externe : montant & %).
- **Statistiques par motif** (volume, montant, % du global).
- **Top responsabilité par direction et par service** (montant & %).
- Répartition des statuts, charge par corbeille, dossiers nécessitant attention.

---

## 15. Contrôle a posteriori

🟢 **SF-PGD-130** — Contrôles à froid **asynchrones, hors chemin bloquant** : **N1** (fiabilisation, déclenché à la validation) et **N2** (mensuel, DXC). Le contrôleur enregistre un constat **conforme / anomalie** (`controler`) ; les anomalies sont signalées et tracées.
🟢 **SF-PGD-131** — Écran de contrôle avec KPI : à contrôler, contrôlés conformes, anomalies relevées (signalées au superviseur).

---

## 16. Traçabilité & audit

🟢 **SF-PGD-140** — **Journal d'audit** complet par dossier (`audit[] {ts, acteur, action, commentaire}`) : Soumission, Récupération, Libération, Vérification, Approbation, Rejet, Délégation, Escalade (auto/manuelle), Expiration de verrou, Modification, Re-routage, Relance, Réaffectation, Déblocage, Contrôle a posteriori, Import CRM, Publipostage, Archivage, Validation finale.
🟢 **SF-PGD-141** — **Journal d'audit global** (toutes instances) avec recherche et filtres.
🟢 **SF-PGD-142** — **Journal de sécurité** distinct (authentification).
🟢 **SF-PGD-143** — Affichage de la **revue champ par champ** dans le circuit du dossier.
🔵 **SF-PGD-144 (PROD)** — Conservation longue durée et inaltérabilité (conformité SOX) : journal immuable côté serveur, horodatage de confiance, politique de rétention.

---

## 17. Actes complémentaires & exports

🟢 **SF-PGD-150** — **Publipostage** (`publipostage`) : génération du courrier de réponse au client pour un dossier validé.
🟢 **SF-PGD-151** — **Archivage** (`archiver`) des dossiers clôturés.
🟢 **SF-PGD-152** — **Exports** : CSV (fiche dossier + journal d'audit ; journal global) et **PDF** de la fiche de dégrèvement (avec montants détaillés et journal d'audit, mise en page Orange CI).

---

## 18. Notifications

🟢 **SF-PGD-160** — Compteur de tâches en attente dans la barre supérieure ; liste des actions requises (accès direct au dossier).
🟡 **SF-PGD-161** — Journal des notifications simulé (bouchon SMTP) : nouvelle tâche, avancement, rejet, validation.
🔵 **SF-PGD-162 (PROD)** — Notifications réelles e-mail (SMTP entreprise) et, à terme, push/in-app, déclenchées par les événements du moteur.

---

## 19. Modèle de données (entités principales)

> Structures issues de l'implémentation (à transposer en schéma relationnel/documentaire PROD).

### 19.1 Dossier
`id, ref, circuit, segment, sousFlux, motif, libelle, commentaire, client {nom, compte, formule}, contactClient, refClient, univers (Fixe|Mobile|Internet), facteur (interne|externe), agent, matricule, dateDemande, recurrent, pieces[] {nom, type}` ;
**champs DOBB** : `numeroAppel, descriptifContestation, pointContact, agentReclamation, agentResponsable, responsabiliteDirection, responsabiliteService, dateReceptionBO, dateReceptionOCI, pieceAfferente, localisation, canal, periode {debut, fin, jours}` ;
**champs DF/MÉMO** : `memoDe, memoA, memoObjet, memoObjectif, memoContexte, memoObservation, montantEuro, memo` ;
**montants** : `ht, tsc, tva, ttc, tauxTva, applyTsc, applyTva, montantsHistory[]` ;
**workflow** : `statut, etapeCourante, tranche, taches[], controles[], audit[]` ;
**dates / acteurs** : `dateCreation, dateSoumission, dateValidation, createdBy, createdByName, saisiSI` ;
**masse** : `masse (bool), lignes[]` ;
**[v3.0] lignes/ND** : `lignes[] { nd, formuleId, recurrent, statutLigne (ACTIF|SUSPENDU|RESILIE) }` (multi-ND, cf. §8.3bis) ;
**[v3.0] responsabilité** : `responsabiliteServiceAutre` (libellé libre si `responsabiliteService = "AUTRE"`) ;
**[v3.0] restitution SI** : `si { etat (EN_ATTENTE|ENVOYE|CONFIRME|ERREUR), refSI, horodatage, message, tentatives }` ;
**actes** : `courrierGenere, archive`.

#### 19.1bis Entités Ligne & Formule [v3.0]
🔵 **SF-PGD-300 — Ligne** — Une **ligne** appartient à un **compte client** (un compte peut porter plusieurs lignes) : `{ nd, compte, libelleLigne, statut (ACTIF|SUSPENDU|RESILIE), formuleCouranteId, formules[] }`. `nd` = **Numéro de Désignation**, identifiant fonctionnel unique par compte, indexable pour la recherche.
🔵 **SF-PGD-301 — Formule** — Rattachée à la ligne : `{ id, libelle, recurrentMensuelHT, dateDebut, dateFin (null=courante), courante }`. La ligne conserve l'**historique** des formules.
🔵 **SF-PGD-302 — Extensions du Dossier** — Champs `lignes[]`, `responsabiliteServiceAutre`, `si` et contrainte `commentaire` obligatoire (cf. ci-dessus).
🟢 **SF-PGD-303 — Jeu de démonstration** — En maquette, le registre client est étendu (plusieurs ND par compte, chacun avec formule courante + ≥ 1 formule historique et un statut) ; en PROD, alimentation par le SI client / CRM (`SF-PGD-052b`).

### 19.2 Tâche
`id, ordre, role, type (V|A|C), bloquant, sla, etat, agentClaim, dateClaim, verrouExpireH (4), decision, commentaire, acteur, acteurNom, dateAction, dateEnCorbeille, revue[], delegueA, noteInterim, escaladeMotif, escaladeDepuis, escaladeAuto`.

### 19.3 Ligne de montant historisée
`{ts, acteur, evt, ht, tsc, tva, htTsc, ttc, applyTsc, applyTva}`.

### 19.4 Entrée de revue
`{champ, verdict (ok|ko), motif}`.

### 19.5 Référentiels
`ROLES (code, libelle, niveau, type, ad, circuit)`, `CIRCUITS (tranches, controle, tva, sousFlux)`, `USERS (id, nom, initiales, couleur, roles[], titre, login)`, `MOTIFS`, `CANAUX`, `RESP_DIRECTION`, `RESP_SERVICE`, `CONFIG`, `CLIENT_REGISTRY`.

---

## 20. Règles métier invariantes (récapitulatif de recette)

| # | Règle |
|---|-------|
| R1 | Le routage dépend **uniquement** du TTC et de la matrice du circuit. |
| R2 | Au-delà des seuils : DF puis DGA/DG obligatoires (terminal). |
| R3 | Un acteur ne peut traiter deux étapes consécutives du même dossier (SoD). |
| R4 | Le rejet exige un motif ; ≥ 1 champ en anomalie ⇒ rejet. |
| R5 | Abandon/Rappel impossibles après la première approbation (étape critique). |
| R6 | Modification après rejet ⇒ recalcul + re-routage (recalcul de chaîne si changement de tranche). |
| R7 | SLA en heures ouvrées uniquement ; jours fériés exclus. |
| R8 | Verrou de claim = 4 h, libération automatique à expiration. |
| R9 | Dépassement SLA en corbeille ⇒ escalade auto N+1 (ou alerte si terminal). |
| R10 | Validation finale ⇒ saisie SI + activation du contrôle a posteriori (non bloquant). |
| R11 | Seuls les rôles présents dans la matrice (+ Initiateur + Admin) sont exposés. |
| R12 | 2FA obligatoire pour SM_DF, DF, DGA_DG, ADMIN. |
| R13 | Chaque transition est journalisée (audit) ; chaque auth est journalisée (sécurité). |
| **R14 [v3.0]** | Le **commentaire est obligatoire** à la soumission de toute demande. |
| **R15 [v3.0]** | Un dégrèvement sur **ligne Résiliée** est **bloqué ou soumis à justification renforcée** (paramètre Admin). |
| **R16 [v3.0]** | La restitution SI est **idempotente** ; chaque tentative est journalisée. |

---

## 21. Charte graphique & ergonomie

🟢 **SF-PGD-170** — Identité Orange Côte d'Ivoire : logo officiel, accent orange `#FF7900`, fond de menu noir, couleurs fonctionnelles (vert `#32C832`, rouge `#CD3C14`, jaune, bleu `#4BB4E6`) pour les statuts. Typographie Helvetica/Arial, coins nets, densité « enterprise » ajustable. Pictogrammes au trait. Écran de connexion illustré.

---

## 22. Du MVP à la PROD — exigences d'industrialisation

> Synthèse des éléments à raccorder/durcir. Le **cœur fonctionnel et les règles métier sont prêts** ; l'effort PROD porte sur la persistance, les intégrations et l'exploitation.

### 22.1 Persistance & API
🔵 **SF-PGD-200** — Remplacer l'**état en mémoire** par une base de données transactionnelle + API serveur (CRUD dossiers/tâches/audit, idempotence des transitions, verrous concurrents fiables, intégrité référentielle).
🔵 **SF-PGD-201** — Persistance de la **configuration éditable** (matrice, rôles, motifs, calendrier, paramètres de calcul) avec versionnage et publication contrôlée.

### 22.2 Intégrations réelles (remplacer les bouchons 🟡)
| Système | Usage | À raccorder |
|---------|-------|-------------|
| **Active Directory / LDAP** | Authentification, groupes `GG-DGR-*`, membres de corbeilles | Bind + provisioning des rôles |
| **2FA d'entreprise** | OTP/push pour rôles sensibles | Provider TOTP/push |
| **CRM** | Import de réclamations, pré-remplissage client | API CRM (`importFromCRM`) |
| **GED** | Stockage des pièces justificatives & courriers | Dépôt/lecture documents |
| **SMTP** | Notifications | Serveur mail entreprise |
| **SI de facturation** | Saisie du dégrèvement validé | Restitution **automatisée** ([v3.0] SF-PGD-360/361) |
| **BI externe** | Power BI / Tableau | Connecteur (module `bi`) |

### 22.2bis Automatisation de la restitution SI [v3.0]
🟡 **SF-PGD-360** — À la **validation finale** (`R10`), le dégrèvement est **restitué automatiquement au SI de facturation** via un adaptateur d'intégration (bouchon en maquette, API réelle en PROD). Déclenchement automatique à la clôture ; **relance manuelle** (« Pousser dans le SI ») possible en cas d'erreur, par rôle habilité. États `si.etat` : `EN_ATTENTE → ENVOYE → CONFIRME` (ou `ERREUR`), avec `refSI`, `horodatage`, `message`, `tentatives`. **Idempotence** (pas de double poussée) ; chaque transition **journalisée** (`SF-PGD-140`) et **rejouable** sans re-valider le dossier. La fiche validée affiche l'état SI et l'identifiant SI ; le KPI « dégrèvements saisis dans le SI » (`SF-PGD-121`) reflète les états réels.
🔵 **SF-PGD-361 (PROD)** — Contrat d'intégration avec le SI de facturation (authentification, format, accusé de réception, gestion d'erreur, rejeu), ordonnancé par le job serveur (`SF-PGD-202`), sous RBAC serveur (`SF-PGD-203`).

### 22.3 Ordonnancement
🔵 **SF-PGD-202** — Le moteur temps réel (intervalle court de démo) devient un **job serveur planifié** : expiration des verrous, détection de dépassement SLA, escalades, relances de notification.

### 22.4 Sécurité & conformité
🔵 **SF-PGD-203** — TLS, chiffrement au repos, gestion de session, RBAC serveur (ne jamais se reposer sur le filtrage UI), journal immuable, rétention SOX, RGPD/loi ivoirienne sur les données personnelles, traçabilité des accès.

### 22.5 Exploitation
🔵 **SF-PGD-204** — Supervision (logs applicatifs, métriques, alerting), sauvegarde/restauration, environnements (dev/recette/prod), reprise sur incident, journalisation des erreurs.

---

## 23. Hors périmètre PROD (phase 1)

- Signature électronique qualifiée eIDAS (`esign`, à venir).
- Application mobile native.
- Connecteurs BI externes (`bi`, à venir).
- Tout circuit/règle non décrit dans la matrice publiée (créable ultérieurement par l'Admin sans développement).

---

---

## 24. Traçabilité du lot d'améliorations [v3.0]

| Amélioration | User story | Exigences |
|--------------|-----------|-----------|
| Recherche par ND | US-01 | SF-PGD-310 |
| Sélection multiple de ND | US-02 | SF-PGD-311 |
| Remontée de toutes les formules | US-03 | SF-PGD-320 |
| Récurrent mensuel à la sélection | US-04 | SF-PGD-321 |
| Service « Autre » nommé | US-05 | SF-PGD-330 |
| Commentaire obligatoire | US-06 | SF-PGD-331 |
| Routage / paliers de subdélégation | US-07 | SF-PGD-340 |
| Statut de la ligne | US-08 | SF-PGD-350 |
| Automatisation SI | US-09 | SF-PGD-360 / 361 |
| Modèle de données | — | SF-PGD-300 / 301 / 302 / 303 |
| Règles invariantes | — | R14 / R15 / R16 |

*Fin du document — Spécifications Fonctionnelles PROD v3.0 (consolidée).*
