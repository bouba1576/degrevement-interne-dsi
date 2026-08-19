# Dossier de Réalisation — Maquette PGD

**Produit :** Plateforme de Gestion des Dégrèvements (PGD)
**Entité :** Orange Côte d'Ivoire — Direction du Système d'Information
**Version :** 1.0 · **Date :** 31 juillet 2026
**Objet :** Description de réalisation de la maquette interactive haute-fidélité — écrans, profils, actions, règles de construction et champs des formulaires par direction métier.
**Références :** `Specifications_Fonctionnelles_PROD_PGD.md` (v2.0), spec consolidée v3.0.

---

## 1. Objectif du document

Ce document décrit **ce que la maquette réalise concrètement** : la carte des écrans (rôle, objectif, contenu), les profils utilisateur et leurs actions autorisées, les règles de construction transverses, et le détail des champs des formulaires de saisie par circuit (DOBB, DXC, DF) ainsi que l'ajustement en masse. Il sert de guide de lecture de la maquette et de base au développement PROD.

## 2. Architecture applicative de la maquette

| Fichier | Rôle |
|---------|------|
| `index.html` | Point d'entrée, chargement des scripts et styles. |
| `data.jsx` | **Configuration externalisée** : circuits, rôles, motifs, référentiels, `CONFIG`, jeu de démonstration. Aucune règle codée ailleurs. |
| `engine.jsx` | Moteur : calcul des montants, sélection de tranche/routage, machine à états, SLA en heures ouvrées, escalade, audit. |
| `app.jsx` | Store global, navigation conditionnée par le rôle (RBAC), bascule de persona, layout (sidebar + topbar). |
| `screens_auth.jsx` | Écran de connexion AD + challenge 2FA. |
| `screens1.jsx` | Accueil / tableau de bord · Nouvelle demande. |
| `screens2.jsx` | Mes demandes · Corbeilles · Détail dossier. |
| `screens3.jsx` | Dashboard KPI · Contrôle a posteriori · Administration · Journal d'audit. |
| `screens4.jsx` | Ajustement en masse · Intégrations · Modules. |
| `ui.jsx` | Composants d'interface réutilisables (champs, badges, tableaux, modales). |
| `styles.css` | Charte graphique Orange CI. |

**Principe fondateur :** le moteur lit exclusivement `data.jsx`. Changer un circuit, une tranche, un rôle ou un motif ne demande **aucune modification de code**.

---

## 3. Carte des écrans

Chaque écran est routé dans `app.jsx` (`route === …`). Visibilité pilotée par le type de rôle (§4).

### 3.1 Connexion (`screens_auth.jsx`)
- **Objectif :** authentifier l'utilisateur et sécuriser les rôles à pouvoir financier/administration.
- **Contenu :** identifiant AD `prenom.nom@orange.ci` + mot de passe, puis **2FA (OTP 6 chiffres)** pour les rôles sensibles (`SM_DF`, `DF`, `DGA_DG`, `ADMIN`). Illustration de plateforme, comptes de démonstration étiquetés « 2FA » / « simple ».
- **Rôle :** point d'entrée unique ; journalise chaque tentative dans le journal de sécurité.

### 3.2 Tableau de bord / Accueil (`home` → `HomeScreen`)
- **Objectif :** donner à chaque profil sa vue synthétique dès la connexion.
- **Contenu :** vues adaptées — **Initiateur** (demandes initiées, en cours, validées, rejetées, respect SLA), **Validateur** (mes corbeilles, récupérées, validées/rejetées par moi, SLA), **Pilotage** (délai moyen, taux d'approbation, montant validé, FMI, motifs, responsabilités…).
- **Rôle :** cockpit personnalisé + accès direct aux actions requises.

### 3.3 Nouvelle demande (`nouvelle` → `NouvelleDemandeScreen`)
- **Objectif :** saisir une demande de dégrèvement dans le formulaire du circuit de l'initiateur.
- **Contenu :** formulaire adaptatif par circuit (§6), calcul des montants en temps réel, **aperçu temps réel du routage** (tranche/palier déclenché + chaîne prévue), pièces justificatives.
- **Rôle :** produire un dossier conforme et le soumettre au circuit.

### 3.4 Mes demandes (`mes` → `MesDemandesScreen`)
- **Objectif :** suivre les dossiers créés par l'initiateur.
- **Contenu :** corbeilles **En cours / Validées / Rejetées**, recherche, filtres, tri, compteur.
- **Rôle :** suivi et actes initiateur (abandon, rappel, modification après rejet).

### 3.5 Corbeilles (`corbeilles` → `CorbeillesScreen`)
- **Objectif :** traiter les tâches de vérification/approbation en mode *pull*.
- **Contenu :** file partagée du rôle, mes tâches récupérées, tâches verrouillées par un collègue ; **minuteur SLA** en heures ouvrées (vert/jaune/rouge) ; actions **Récupérer/Libérer** (verrou 4 h).
- **Rôle :** point de travail des vérificateurs et approbateurs.

### 3.6 Détail dossier (`detail` → `DossierDetailScreen`)
- **Objectif :** consulter et décider sur un dossier.
- **Contenu :** synthèse (client, montants détaillés, motif), **circuit de validation** avec revue champ par champ, journal d'audit du dossier, actions selon le rôle (approuver, rejeter avec motifs, déléguer, escalader, publipostage, export PDF/CSV).
- **Rôle :** écran central de décision et de traçabilité.

### 3.7 Contrôle a posteriori (`controle` → `ControleScreen`)
- **Objectif :** contrôle à froid **N1** (fiabilisation) et **N2** (mensuel, DXC), hors chemin bloquant.
- **Contenu :** file à contrôler, saisie d'un constat **conforme / anomalie**, KPI (à contrôler, conformes, anomalies signalées).
- **Rôle :** sécurisation des opérations et FRA.

### 3.8 Consultation (`consultation` → `ConsultationScreen`)
- **Objectif :** recherche transverse en lecture (superviseur, DF, DGA/DG, contrôle, admin).
- **Contenu :** recherche multicritère sur toutes les instances, accès en lecture aux dossiers.
- **Rôle :** pilotage et supervision sans droit d'action métier.

### 3.9 Journal d'audit (`audit` → `AuditScreen`)
- **Objectif :** traçabilité globale (superviseur, admin, contrôle).
- **Contenu :** journal de toutes les transitions (soumission, claim, décisions, escalades, re-routage, etc.) + journal de sécurité, recherche et filtres.
- **Rôle :** conformité et investigation.

### 3.10 Administration (`admin` → `AdminScreen`)
- **Objectif :** configurer la plateforme sans code (Admin uniquement).
- **Contenu :** **designer de processus** (chaîne en timeline, étapes rôle/type/SLA, drag & drop), **tranches/paliers** éditables avec validation des bornes, **simulateur de montant**, rôles & corbeilles, utilisateurs, motifs & circuits, paramètres de calcul (TSC/TVA, devise), calendrier SLA, moniteur d'exécution.
- **Rôle :** externalisation totale de la configuration.

### 3.11 Intégrations (`integrations` → `IntegrationsScreen`)
- **Objectif :** gérer les dépendances externes (Admin).
- **Contenu :** CRM, AD/LDAP, GED, SMTP, **SI de facturation**, import réclamation CRM, journal des notifications (bouchons remplaçables en PROD).
- **Rôle :** cartographie et raccordement des adaptateurs.

### 3.12 Modules (`modules` → `ModulesScreen`)
- **Objectif :** activer/désactiver les modules (Admin).
- **Contenu :** KPI, contrôle, masse, SLA, designer (actifs) ; connecteur BI et signature eIDAS (à venir).
- **Rôle :** extensibilité maîtrisée.

---

## 4. Profils utilisateur & actions

Le menu et les actions sont **conditionnés par le type de rôle** (`app.jsx` / `Sidebar`) : **I** Initiateur · **V** Vérificateur · **A** Approbateur · **C** Contrôleur · **S** Superviseur · **X** Admin. Rôles pivots multi-circuits : `DF`, `DGA_DG`.

| Profil | Écrans visibles | Actions principales |
|--------|-----------------|---------------------|
| **Initiateur** (`INIT_DOBB/DXC/DF`) | Tableau de bord, Nouvelle demande, Mes demandes | Créer/soumettre une demande, ajustement en masse, **abandonner** (avant 1ʳᵉ approbation), **rappeler** en brouillon, **modifier après rejet** (recalcul + re-routage). |
| **Vérificateur** (`VER_*`, `RESP_DXC`, `MRF/MSRF_DXC`, `VER_DF`) | Tableau de bord, Corbeilles, Détail | Récupérer/libérer une tâche, **revue champ par champ**, approuver la vérification ou **rejeter avec motifs**, déléguer. |
| **Approbateur** (`RESP/MGR/DIR_DOBB`, `DIR_DXC`, `SM_DF`) | Tableau de bord, Corbeilles, Détail | Approuver / rejeter, déléguer ; soumis à la **SoD** (pas deux étapes consécutives). |
| **DF / DGA-DG** (pivots) | Tableau de bord, Consultation, Corbeilles | Approbation **terminale** au-delà des seuils ; 2FA obligatoire. |
| **Contrôleur** (`CTRL_N1`, `CTRL_N2`) | Tableau de bord, Contrôle a posteriori, Consultation, Audit | Constat **conforme / anomalie** à froid (hors chemin bloquant), signalement au superviseur. |
| **Superviseur** (`SUPERVISEUR`) | Tableau de bord, Consultation, Audit | Moniteur d'exécution : **relancer** une corbeille, **réaffecter**, **débloquer** un verrou, **escalade manuelle**. |
| **Administrateur** (`ADMIN`) | Tout le pilotage + Administration, Intégrations, Modules | Configurer processus/tranches/rôles/motifs/calendrier/calcul, activer les modules, gérer les intégrations ; 2FA obligatoire. |

**Règles d'accès :**
- Seuls les rôles **présents dans la matrice** (+ Initiateur + Admin) sont exposés ; les rôles orphelins sont élagués.
- La **bascule de persona** (maquette) sera remplacée en PROD par l'affectation réelle via groupes AD.
- **2FA obligatoire** : `SM_DF`, `DF`, `DGA_DG`, `ADMIN`.

---

## 5. Règles de construction transverses

1. **Configuration externalisée** — aucune règle métier codée ; tout dans `data.jsx`, éditable par l'Admin.
2. **Routage déterministe** — sélection de tranche/palier sur le **TTC** ; `ttc ≥ min ET (max=null OU ttc ≤ max)`. Au-delà des seuils, **DF puis DGA/DG** ajoutés automatiquement.
3. **Aperçu temps réel** — la chaîne prévue s'affiche pendant la saisie du montant, avant soumission.
4. **Calcul des montants** — `TSC = HT×taux`, `TVA = HT×taux`, `TTC = HT+TSC+TVA` ; taxes activables par demande ; chaque modification historisée (`montantsHistory`).
5. **Machine à états** — dossier : `brouillon → soumis → en_cours → {valide|rejete|abandonne}` ; tâche : `EN_ATTENTE → EN_CORBEILLE → RECLAMEE → {VERIFIEE|APPROUVEE|REJETEE|ESCALADEE}`.
6. **Corbeilles partagées** — une corbeille = un rôle = un groupe AD ; mode *pull* ; verrou de claim **4 h** avec libération automatique.
7. **SLA en heures ouvrées** — jours ouvrés + plage horaire ; fériés exclus ; escalade auto au dépassement.
8. **Séparation des tâches (SoD)** — un acteur ne traite pas deux étapes consécutives du même dossier.
9. **Décision par revue** — conforme par défaut ; on signale les champs en anomalie ; ≥ 1 anomalie ⇒ rejet motivé.
10. **Traçabilité** — chaque transition journalisée (audit dossier + global) ; chaque authentification journalisée (sécurité).
11. **Génération de référence** — `<DIRECTION><AAMMJJ>.<HHMM>.<6 chiffres>`.
12. **Charte** — accent orange `#FF7900`, menu noir, couleurs de statut (vert/rouge/jaune/bleu), typographie Helvetica/Arial, coins nets, densité ajustable.

**Améliorations v3.0 intégrées à la construction :** recherche par **ND**, **sélection multiple** de lignes, remontée de **toutes les formules** + **récurrent auto**, **service « Autre » nommé**, **commentaire obligatoire**, **paliers de subdélégation**, **statut de ligne** (Actif/Suspendu/Résilié), **automatisation de la restitution SI**.

---

## 6. Champs des formulaires par direction métier

### 6.0 Champs communs (tous circuits)
Date de demande (obligatoire), date de saisie (auto), agent + matricule, **univers FMI** (Fixe/Mobile/Internet), **facteur de dégrèvement** (interne/externe), motif (liste du circuit + « Autres »), contact client, libellé, **commentaire (obligatoire — v3.0)**, pièces justificatives (Facture, Mémo, Justificatif, Contrat, Fiche de calcul…).
**Bloc ligne (v3.0) :** recherche par **ND**, sélection simple/multiple des lignes du compte, choix de **formule** (courante/historique), **récurrent mensuel** auto-rempli, **statut de ligne** (badge Actif/Suspendu/Résilié).
**Montants :** HT, TSC, TVA, HT+TSC, TTC ; overrides `applyTsc`/`applyTva`.

### 6.1 DOBB — B2B (réf. PO2_B-17)
| Champ | Type / valeurs |
|-------|----------------|
| Référence client | texte (pré-remplissage registre / SI) |
| N° d'appel / **ND** | texte — recherche & sélection de ligne (v3.0) |
| Formule d'abonnement | liste — **toutes formules** de la ligne (v3.0) |
| Descriptif de la contestation | texte long |
| Localisation | National / International |
| Canal de remontée | CRM, DIMELO, E-mail, Courrier, Agence, Centre d'appel, Outlook |
| Période contestée | `{debut, fin, jours}` |
| Point de contact | texte |
| Récurrent mensuel | montant — **auto depuis la formule** (v3.0), modifiable |
| **Responsabilité par direction** | DOBB, DXC, MARKETING, MARKETING B2B, DRSI, SI, DIE, DT, DMS, DM/DRSI, LE CLIENT, CLIENT, TOP MANAGEMENT, INDÉTERMINÉE, AUTRE |
| **Responsabilité par service** | FACTURATION, ADV FIXE INTERNET, ADV MOBILE, ADV MOBILE MENTLEY, ADV (Ascom), ORANGE BUSINESS MAIL, COMMERCIAL, RECOUVREMENT, DÉRANGEMENT, CONFIGURATION DES OFFRES, PÔLE PROVISIONNING, ANOMALIE DIMELO, PROJET VIRAGE, ÉQUIPE TASKFORCE, INDÉTERMINÉ, **AUTRE → champ libre obligatoire (v3.0)** |
| Agents réclamation / responsable | texte |
| Dates réception BO & OCI | dates |
| Pièce afférente | pièce jointe |
| Motif | **27 motifs réels** DOBB (Contestation facture, Abattement, Geste commercial, … Autres) |

### 6.2 DXC — B2C (réf. PO5-G-07)
| Champ | Type / valeurs |
|-------|----------------|
| Client | texte (registre / SI) |
| Compte | texte — recherche compte / **ND** (v3.0) |
| Formule Internet | liste — **toutes formules** de la ligne (v3.0) |
| Motif | Réclamation client, Geste commercial, Erreur de facturation, Double facturation, Résiliation contestée, Abattement, Surconsommation |
| Libellé | texte |
| Récurrent mensuel | montant — **auto depuis la formule** (v3.0) |
| Statut de ligne | Actif / Suspendu / Résilié (v3.0) |
| Circuit de signature | affiché (aperçu chaîne) |

### 6.3 DF — Wholesale (format MÉMO / FRA)
| Champ | Type / valeurs |
|-------|----------------|
| Mémo — De / À | `memoDe`, `memoA` |
| Objet | `memoObjet` |
| Objectif | `memoObjectif` |
| Contexte | `memoContexte` |
| Observation | `memoObservation` |
| Opérateur | texte |
| **Montant en FCFA** | `montantXOF` (devise opérateur) |
| Signataires Wholesale | liste |
| Motif | Tarif erroné, Écart de volume, Double facturation, Non-respect SLA, Lien résilié facturé, Geste commercial opérateur |

### 6.4 Ajustement en masse (B2C — réf. PO5-G-07-ERQ1)
Dossier unique (`masse = true`) avec tableau de lignes :
| Colonne | Détail |
|---------|--------|
| Client / NCLI | identifiant client |
| N° Fibre / **ND** | ligne (v3.0) |
| N° CASE | référence réclamation |
| Formule | formule de la ligne (v3.0) |
| Période de non-connexion | `{debut, fin}` |
| Jours | entier |
| Récurrent HT | montant (auto depuis formule — v3.0) |
| Restitué HT | **calcul auto** `récurrent ÷ 30 × jours` |
TSC/TVA/TTC cumulés sur le lot ; routage sur le **TTC total**.

---

## 7. Parcours nominal (rappel de bout en bout)

`Connexion (AD + 2FA)` → `Nouvelle demande / masse (saisie + aperçu routage)` → `Soumission (instanciation des tâches)` → `Corbeilles (claim, revue, décision)` → `Escalade SLA si dépassement` → `Validation finale (restitution SI automatique — v3.0)` → `Contrôle a posteriori (N1/N2)` → `Publipostage / Export / Archivage`. Chaque étape est tracée dans le journal d'audit.

---

## 8. Statut de réalisation & suites

- **Réalisé (maquette) :** tous les écrans ci-dessus, RBAC, moteur de routage/SLA/escalade, calcul des montants, audit, KPI, designer de processus, ajustement en masse.
- **Simulé (bouchons) :** AD/2FA, CRM, GED, SMTP, SI de facturation, notifications.
- **À intégrer (v3.0) dans la maquette :** bloc ND / formules / récurrent auto / statut de ligne, service « Autre » nommé, commentaire obligatoire, paliers de subdélégation, automatisation SI — spécifiés dans la spec consolidée v3.0 (`SF-PGD-3xx`).
- **PROD :** persistance & API, intégrations réelles, ordonnanceur serveur, sécurité/conformité SOX, exploitation.

*Fin du Dossier de Réalisation — Maquette PGD v1.0.*
