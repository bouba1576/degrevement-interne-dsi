# 03 — Modèle de Données v2.0 (MCD / MLD)

> **Projet :** PGD — Orange Côte d'Ivoire · **Version :** 2.0 · **Date :** 20 juillet 2026
> **Base :** MCD/MLD v1.1 + extensions lot « Nouvelle demande » (`SF-PGD-300` à `303`)
> **Cible :** PostgreSQL 16 via Prisma — projetable directement en `schema.prisma`

---

## 1. Nouveautés v2.0

| # | Apport | Exigence |
|---|---|---|
| 1 | Entités **`LIGNE`** et **`FORMULE`** — identification par ND, historique de formules | `SF-PGD-300`, `301` |
| 2 | Table de liaison **`DEMANDE_LIGNE`** — demande multi-ND avec formule et récurrent par ligne | `SF-PGD-302`, `311` |
| 3 | Bloc **restitution SI** sur `DEMANDE` (`si_etat`, `si_ref`, `si_horodatage`, `si_message`, `si_tentatives`) | `SF-PGD-302`, `360` |
| 4 | Champ **`responsabilite_service_autre`** sur `DEMANDE` | `SF-PGD-330` |
| 5 | **`commentaire` obligatoire** à la soumission (contrainte applicative `R14`) | `SF-PGD-331` |
| 6 | **`label_palier`** sur `CONFIGURATION_CIRCUIT` — sémantique subdélégation | `SF-PGD-340` |
| 7 | **`PARAMETRE_GLOBAL`** — politique ligne résiliée, mode connecteur SI, activation poussée auto | `SF-PGD-350`, `360` |
| 8 | Énumérations **`ENUM_STATUT_LIGNE`** et **`ENUM_ETAT_SI`** | `SF-PGD-300`, `360` |
| 9 | Extension **`MfaProvider`** : `mfa_methode` sur `UTILISATEUR`, `totp_secret` chiffré | ADR-08 |

Les entités v1.1 sont **conservées sans rupture**. Aucune suppression.

---

## 2. Sous-domaines

1. **Métier** — `DEMANDE`, `DEMANDE_LIGNE`, `PIECE_JOINTE`, `HISTORIQUE_MONTANT`, `TACHE`, `CONTROLE`, `NOTIFICATION`
2. **Registre client** *(nouveau)* — `COMPTE_CLIENT`, `LIGNE`, `FORMULE`
3. **Configuration** — `CIRCUIT`, `CONFIGURATION_CIRCUIT`, `ETAPE_REGLE`, `MOTIF`, `PIECE_AFFERENTE`, `SOUS_FLUX`, `PARAMETRE_CALCUL`, `PARAMETRE_GLOBAL`, `CALENDRIER_SLA`, `JOUR_FERIE`, `MODULE`, `SLA_PROFIL`
4. **Référentiels analytiques** — `UNIVERS_FMI`, `FACTEUR_DEGREVEMENT`, `DIRECTION_RESPONSABILITE`, `SERVICE_RESPONSABILITE`, `KPI_DEFINITION`
5. **Identité & sécurité** — `UTILISATEUR`, `ROLE`, `MEMBRE_ROLE`, `DELEGATION`, `JOURNAL_AUDIT`, `JOURNAL_SECURITE`

---

## 3. MCD — registre client et demande

```mermaid
erDiagram
  COMPTE_CLIENT ||--o{ LIGNE : "porte"
  LIGNE ||--o{ FORMULE : "historise"
  LIGNE ||--o{ DEMANDE_LIGNE : "concernee_par"
  FORMULE ||--o{ DEMANDE_LIGNE : "impute"
  DEMANDE ||--o{ DEMANDE_LIGNE : "retient"
  UTILISATEUR ||--o{ DEMANDE : "initie"
  DEMANDE ||--o{ PIECE_JOINTE : "contient"
  DEMANDE ||--o{ HISTORIQUE_MONTANT : "versionne"
  DEMANDE ||--o{ TACHE : "genere"
  DEMANDE ||--o{ CONTROLE : "fait_objet_de"
  DEMANDE ||--o{ JOURNAL_AUDIT : "trace"
  DEMANDE ||--o{ NOTIFICATION : "emet"
  MOTIF ||--o{ DEMANDE : "justifie"
  UNIVERS_FMI ||--o{ DEMANDE : "classe"
  FACTEUR_DEGREVEMENT ||--o{ DEMANDE : "qualifie"
  DIRECTION_RESPONSABILITE ||--o{ DEMANDE : "impute"
  SERVICE_RESPONSABILITE ||--o{ DEMANDE : "impute"
  ROLE ||--o{ TACHE : "alimente_corbeille"
  UTILISATEUR |o--o{ TACHE : "reclame"

  COMPTE_CLIENT {
    uuid id PK
    string numero_compte UK
    string nom_client
    string segment
    string crm_ref
  }
  LIGNE {
    uuid id PK
    uuid compte_id FK
    string nd UK_par_compte
    string libelle_ligne
    enum statut "ACTIF|SUSPENDU|RESILIE"
    uuid formule_courante_id FK
    string univers_fmi_code FK
    timestamp date_sync_crm
  }
  FORMULE {
    uuid id PK
    uuid ligne_id FK
    string libelle
    decimal recurrent_mensuel_ht
    date date_debut
    date date_fin "null = courante"
    bool courante
  }
  DEMANDE_LIGNE {
    uuid id PK
    uuid demande_id FK
    uuid ligne_id FK
    string nd
    uuid formule_id FK
    decimal recurrent
    enum statut_ligne
    decimal montant_ht_ligne
    date debut_periode_contestee
    date fin_periode_contestee
    int periode_contestee_jours
  }
```

---

## 4. MLD — nouvelles tables (lot 2)

```sql
COMPTE_CLIENT(
  id UUID PK,
  numero_compte VARCHAR(60) UNIQUE NOT NULL,
  nom_client VARCHAR(160) NOT NULL,
  segment VARCHAR(20),                      -- B2B | B2C | WHOLESALE
  crm_ref VARCHAR(60),
  date_sync_crm TIMESTAMPTZ,
  actif BOOLEAN NOT NULL DEFAULT TRUE
)
  INDEX idx_compte_numero (numero_compte),
  INDEX idx_compte_nom (nom_client)

LIGNE(                                       -- SF-PGD-300
  id UUID PK,
  compte_id UUID NOT NULL FK -> COMPTE_CLIENT(id) ON DELETE CASCADE,
  nd VARCHAR(40) NOT NULL,                   -- Numéro de Désignation
  libelle_ligne VARCHAR(160),
  statut ENUM_STATUT_LIGNE NOT NULL DEFAULT 'ACTIF',
  formule_courante_id UUID FK -> FORMULE(id),
  univers_fmi_code VARCHAR(10) FK -> UNIVERS_FMI(code),
  historique_partiel BOOLEAN NOT NULL DEFAULT FALSE,  -- mode dégradé SF-PGD-320
  date_sync_crm TIMESTAMPTZ,
  UNIQUE (compte_id, nd)
)
  INDEX idx_ligne_nd (nd),                   -- recherche par ND < 1 s (SF-PGD-310)
  INDEX idx_ligne_compte (compte_id),
  INDEX idx_ligne_statut (statut)

FORMULE(                                     -- SF-PGD-301
  id UUID PK,
  ligne_id UUID NOT NULL FK -> LIGNE(id) ON DELETE CASCADE,
  libelle VARCHAR(160) NOT NULL,
  recurrent_mensuel_ht NUMERIC(15,2) NOT NULL CHECK (recurrent_mensuel_ht >= 0),
  date_debut DATE NOT NULL,
  date_fin DATE,                             -- NULL = formule courante
  courante BOOLEAN NOT NULL DEFAULT FALSE,
  CHECK (date_fin IS NULL OR date_fin > date_debut)
)
  INDEX idx_formule_ligne (ligne_id, courante),
  -- une seule formule courante par ligne
  UNIQUE INDEX uq_formule_courante ON FORMULE(ligne_id) WHERE courante

DEMANDE_LIGNE(                               -- SF-PGD-302 / 311
  id UUID PK,
  demande_id UUID NOT NULL FK -> DEMANDE(id) ON DELETE CASCADE,
  ligne_id UUID NOT NULL FK -> LIGNE(id),
  nd VARCHAR(40) NOT NULL,                   -- dénormalisé (traçabilité historique)
  formule_id UUID NOT NULL FK -> FORMULE(id),  -- obligatoire (R17)
  recurrent NUMERIC(15,2) NOT NULL,          -- pré-rempli, modifiable (SF-PGD-321)
  recurrent_modifie BOOLEAN NOT NULL DEFAULT FALSE,
  statut_ligne ENUM_STATUT_LIGNE NOT NULL,   -- figé au moment de la sélection
  montant_ht_ligne NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (montant_ht_ligne >= 0),
  debut_periode_contestee DATE,
  fin_periode_contestee DATE,
  periode_contestee_jours INT,
  UNIQUE (demande_id, ligne_id)
)
  INDEX idx_demande_ligne_demande (demande_id),
  INDEX idx_demande_ligne_statut (statut_ligne)

PARAMETRE_GLOBAL(                            -- SF-PGD-350 / 360 / 201
  cle VARCHAR(60) PK,
  valeur JSONB NOT NULL,
  libelle VARCHAR(160),
  modifiable_admin BOOLEAN NOT NULL DEFAULT TRUE,
  date_maj TIMESTAMPTZ NOT NULL DEFAULT now()
)
-- Clés attendues au seed :
--   'politique_ligne_resiliee'  → {"mode":"BLOQUANT"}  | {"mode":"JUSTIFICATION_RENFORCEE"}
--   'si_poussee_automatique'    → {"actif":true}
--   'si_adaptateur_par_circuit' → {"DOBB":"BSCS","DXC":"BSCS","DF":"GAIA"}
--   'si_max_tentatives'         → {"valeur":5}
--   'mfa_methode_defaut'        → {"methode":"DUO"}
```

---

## 4bis. Entités v1.1 — points d'attention à la reprise

Les entités v1.1 sont conservées sans rupture et leur détail complet fait foi dans `04_MCD_MLD_PGD_PROD.md` (§5, MLD). Trois points ont donné lieu à des reconstructions erronées ou incertaines : ils sont explicités ici pour lever l'ambiguïté.

### 4bis.1 `DELEGATION` — trois acteurs, pas deux

La table porte **obligatoirement** le délégant. La modéliser avec le seul couple (rôle délégué, délégataire) est une erreur.

```sql
DELEGATION (
  id              UUID PK,
  delegant_id     UUID NOT NULL REFERENCES UTILISATEUR(id),   -- titulaire absent
  delegataire_id  UUID NOT NULL REFERENCES UTILISATEUR(id),   -- agent qui reçoit
  role_code       VARCHAR NOT NULL REFERENCES ROLE(code),     -- rôle délégué
  debut           TIMESTAMPTZ NOT NULL,
  fin             TIMESTAMPTZ NOT NULL,
  note_interim    TEXT NOT NULL,                              -- exigée par PO6-07
  active          BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT chk_delegation_bornes CHECK (fin > debut),
  CONSTRAINT chk_delegation_distincts CHECK (delegant_id <> delegataire_id)
)
```

Deux relations distinctes vers `UTILISATEUR` : « délègue » et « reçoit ». Côté Prisma, cela impose deux relations nommées vers le même modèle.

**`R22` garantie en base, pas seulement en service.** L'anti-recouvrement se pose en contrainte d'exclusion, comme pour les paliers de `CONFIGURATION_CIRCUIT` — l'extension `btree_gist` est déjà requise par le modèle :

```sql
ALTER TABLE delegation ADD CONSTRAINT excl_delegation_recouvrement
  EXCLUDE USING gist (
    delegant_id WITH =,
    role_code   WITH =,
    tstzrange(debut, fin) WITH &&
  ) WHERE (active);
```

Une vérification purement applicative est insuffisante pour un invariant qui conditionne le SoD : deux requêtes concurrentes de création de délégation passeraient toutes deux le contrôle avant que l'une n'ait commité.

**Pourquoi `delegant_id` est structurant :**
- **SoD.** `SodGuard` interdit à un agent d'approuver une étape dont il a traité l'étape N-1. Quand un délégataire agit *au nom d'un titulaire*, la vérification doit porter sur le **délégant** autant que sur le délégataire — sinon un titulaire ayant déjà agi en amont peut valider en aval via son intérimaire, et l'invariant est contourné sans trace.
- **Non-répudiation.** Le scénario de recette R12 exige une action « tracée avec mention de la délégation », c'est-à-dire *X a agi au nom de Y*. Sans délégant, l'audit ne peut pas restituer au nom de qui.
- **Intégrité.** Détection de deux délégations actives concurrentes du même titulaire sur le même rôle et sur des périodes qui se recouvrent.

**Conséquence sur l'audit :** toute action effectuée sous délégation porte dans `JOURNAL_AUDIT` la référence de la délégation, donc l'acteur réel **et** le titulaire représenté.

### 4bis.2 `ENUM_TYPE_ACTEUR` — codes conservés, libellés en seed

Les sources posent `V` / `A` / `C` sans jamais en donner l'expansion. `A` est ambigu (*Approbateur* ou *Avis* ?), `V` également (*Validateur* ou *Visa* ?).

**Règle retenue :** l'énumération stocke les **codes** tels quels. Le libellé lisible n'est pas figé dans le type : il est porté par le référentiel de seeds et exposé par l'API. Une correction de sémantique devient une mise à jour de donnée, pas une migration d'énumération.

Ne pas inférer l'expansion depuis le code applicatif ni depuis l'UI. Point inscrit au registre des questions ouvertes de la charte.

### 4bis.3 `localisation` — dimension DOBB, jamais de routage

`ENUM_LOCALISATION` (`national` | `international`) est **conservée en Phase 1**, sur `DEMANDE`, en **nullable**.

| Question | Réponse |
|---|---|
| Origine | Fiche **DOBB** (`PO2_B-17`) uniquement — champ de saisie B2B |
| Usage en routage | **Aucun.** Nulle règle pivot ne s'en sert. Ne pas l'introduire dans le moteur de règles |
| Usage réel | Dimension de saisie et d'analyse (KPI, restitution) |
| Nullabilité | `NULL` autorisé en base ; obligatoire **côté formulaire DOBB** seulement |
| DXC / DF | Non saisie, reste `NULL` |

La conserver ne coûte rien et évite une migration ultérieure ; la câbler dans le routage serait une invention non fondée.

---

### 4bis.4 `HISTORIQUE_MONTANT` — acteur et ligne (extension v2.0)

**Écart source constaté :** le MLD v1.1 décrit `HISTORIQUE_MONTANT` en pur instantané de montants (`ht`, `tsc`, `tva`, `ttc`, `taux_tsc`, `taux_tva`, `origine`, `horodatage`) — **sans acteur**. Or `SF-PGD-042` exige que tout recalcul ou correction manuelle soit empilé « avec **acteur**, origine et horodatage », et `SF-PGD-321` reprend l'exigence pour la correction du récurrent. La v2.0 comble ce manque.

```sql
ALTER TABLE HISTORIQUE_MONTANT ADD:
  acteur_id          UUID REFERENCES UTILISATEUR(id),      -- NULL = recalcul système
  demande_ligne_id   UUID REFERENCES DEMANDE_LIGNE(id)     -- NULL = correction au niveau dossier
```

`demande_id` reste **`NOT NULL`** : l'entrée reste rattachée au dossier même lorsque la correction porte sur une ligne précise.

| Colonne | Nullabilité | Raison |
|---|---|---|
| `acteur_id` | **Nullable** | Un recalcul automatique (changement de taux TSC/TVA, recalcul de prorata) n'a pas d'acteur humain. `origine` distingue `creation` / `modification` / `recalcul` ; `acteur_id IS NULL` est cohérent avec `origine = 'recalcul'` système |
| `demande_ligne_id` | **Nullable** | Une correction peut porter sur le dossier entier (montant global) ou sur une ligne précise (récurrent d'un ND parmi plusieurs) |

**Pourquoi ne pas se reposer sur `JOURNAL_AUDIT` :**
- Le rapprochement audit ↔ historique se ferait par proximité d'horodatage — jointure fragile, ambiguë dès que deux corrections tombent dans la même seconde ou qu'un recalcul suit immédiatement une saisie.
- Les **KPI agrègent directement** sur `DEMANDE` / `HISTORIQUE_MONTANT` (v1.1 §3.2). Un indicateur « corrections par agent » imposerait sinon un détour systématique par l'audit.
- `SF-PGD-042` nomme l'entité : « empilé dans `HISTORIQUE_MONTANT` avec acteur », et non « traçable par recoupement ».

**Contrainte d'intégrité — implication à sens unique.** La relation entre `acteur_id` et `origine` n'est **pas** une équivalence :

```sql
-- CORRECT : acteur nul implique recalcul système
ALTER TABLE historique_montant ADD CONSTRAINT chk_hm_acteur
  CHECK (acteur_id IS NOT NULL OR origine = 'RECALCUL');

-- FAUX : interdirait tout recalcul déclenché par un utilisateur
-- CHECK ((acteur_id IS NULL) = (origine = 'RECALCUL'))
```

La forme équivalente est un piège : un agent qui corrige le récurrent d'une ligne déclenche un recalcul **avec** acteur (`origine = 'RECALCUL'`, `acteur_id` renseigné). Une équivalence stricte rejetterait cette écriture, qui est le cas nominal de `SF-PGD-321`. Les trois combinaisons licites :

| `origine` | `acteur_id` | Cas |
|---|---|---|
| `CREATION` / `MODIFICATION` | **renseigné** | Saisie ou correction manuelle |
| `RECALCUL` | **renseigné** | Recalcul déclenché par une action utilisateur (changement de formule, correction de récurrent) |
| `RECALCUL` | `NULL` | Recalcul système (changement de taux TSC/TVA, traitement de masse) |

`JOURNAL_AUDIT` **reste** alimenté en parallèle : il porte la non-répudiation, `HISTORIQUE_MONTANT` porte la série des valeurs. Les deux ne se substituent pas l'un à l'autre.

**Lien multi-ND (D6) :** avec la sélection multi-lignes, le récurrent de `SF-PGD-321` est porté par `DEMANDE_LIGNE.recurrent`. Sans `demande_ligne_id`, une correction de récurrent sur une ligne parmi plusieurs serait impossible à rattacher.

---

## 5. MLD — tables modifiées

### 5.1 `DEMANDE` — colonnes ajoutées

```sql
ALTER TABLE DEMANDE ADD:
  commentaire                    TEXT,                    -- obligatoire à la soumission (R14)
  responsabilite_service_autre   VARCHAR(160),            -- SF-PGD-330
  -- bloc restitution SI (SF-PGD-360)
  si_etat                        ENUM_ETAT_SI NOT NULL DEFAULT 'EN_ATTENTE',
  si_ref                         VARCHAR(120),
  si_horodatage                  TIMESTAMPTZ,
  si_message                     TEXT,
  si_tentatives                  INT NOT NULL DEFAULT 0,
  si_adaptateur                  VARCHAR(20),             -- BSCS | GAIA
  si_idempotency_key             VARCHAR(120) UNIQUE      -- R16

  INDEX idx_demande_si (si_etat, si_horodatage)
```

> `compte_client` et `formule_abonnement` (v1.1) sont **conservés** en dénormalisation pour les demandes mono-ligne et l'historique antérieur. Pour les demandes multi-ND, la vérité est dans `DEMANDE_LIGNE`.
> `degrevement_saisi_si` (v1.1) reste et devient un **dérivé** : `si_etat = 'CONFIRME'`.

### 5.2 `CONFIGURATION_CIRCUIT` — palier de subdélégation

```sql
ALTER TABLE CONFIGURATION_CIRCUIT ADD:
  label_palier      VARCHAR(120),            -- SF-PGD-340
  source_fiche      VARCHAR(80),             -- réf. fiche de subdélégation
  date_effet        DATE
```

La contrainte `EXCLUDE USING gist` anti-chevauchement est **maintenue** — elle garantit `SF-PGD-103`.

### 5.3 `UTILISATEUR` — MFA à deux méthodes

```sql
ALTER TABLE UTILISATEUR ADD:
  mfa_methode       ENUM_METHODE_MFA NOT NULL DEFAULT 'DUO',   -- DUO | TOTP
  totp_secret       VARCHAR(255),            -- chiffré au repos, jamais exposé par l'API
  totp_active_le    TIMESTAMPTZ
-- duo_user_id (v1.1) conservé
```

---

## 6. Énumérations v2.0

| Type | Valeurs | Statut |
|---|---|---|
| `ENUM_CIRCUIT` | `DOBB`, `DXC`, `DF` | v1.1 |
| `ENUM_STATUT` | `brouillon`, `soumis`, `en_cours`, `valide`, `rejete`, `abandonne` | v1.1 |
| `ENUM_ETAT_TACHE` | `EN_ATTENTE`, `EN_CORBEILLE`, `RECLAMEE`, `APPROUVEE`, `REJETEE`, `POST_CLOTURE` | v1.1 |
| `ENUM_TYPE_ACTEUR` | `V`, `A`, `C` | v1.1 |
| `ENUM_AFFECTATION` | `pull` | v1.1 |
| `ENUM_ORIGINE` | `creation`, `modification`, `recalcul` | v1.1 |
| `ENUM_LOCALISATION` | `national`, `international` | v1.1 |
| `ENUM_NIVEAU_CTRL` | `FRA`, `N1`, `N2` | v1.1 |
| `ENUM_CONSTAT` | `conforme`, `anomalie` | v1.1 |
| `ENUM_TYPE_NOTIF` | `nouvelle_tache`, `avancement`, `rejet`, `validation`, `escalade`, `erreur_si` | **étendu v2.0** |
| `ENUM_UNITE_KPI` | `montant`, `volume`, `taux` | v1.1 |
| `ENUM_TYPE_ROLE` | `metier`, `pivot`, `systeme` | v1.1 |
| `ENUM_EVT_SEC` | `login`, `logout`, `mfa_challenge`, `rbac_refus`, `sod_refus` | **étendu v2.0** |
| `ENUM_FACTEUR` | `AD`, `DUO`, `TOTP`, `session` | **étendu v2.0** |
| **`ENUM_STATUT_LIGNE`** | `ACTIF`, `SUSPENDU`, `RESILIE` | **nouveau v2.0** |
| **`ENUM_ETAT_SI`** | `EN_ATTENTE`, `ENVOYE`, `CONFIRME`, `ERREUR` | **nouveau v2.0** |
| **`ENUM_METHODE_MFA`** | `DUO`, `TOTP` | **nouveau v2.0** |

---

## 7. Règles d'intégrité et invariants

**Conservés de la v1.1** — Double verrou de claim (Redis `SET NX` + compare-and-set PostgreSQL) · anti-chevauchement des paliers (`EXCLUDE gist`) · SoD par requête sur `JOURNAL_AUDIT` · journaux append-only · externalisation totale des règles · contrôle FRA conditionnel au-delà de 5 M FCFA · complétude des pièces obligatoires à la soumission · SLA en heures ouvrées.

**Nouveaux v2.0 :**

| Réf. | Invariant | Mise en œuvre |
|---|---|---|
| `R14` | Commentaire obligatoire à la soumission | Contrôle applicatif à la transition `brouillon → soumis` ; espaces seuls rejetés |
| `R15` | Ligne `RESILIE` : bloquée ou justification renforcée | Lecture de `PARAMETRE_GLOBAL['politique_ligne_resiliee']` à la soumission. Mode `BLOQUANT` → `422`. Mode `JUSTIFICATION_RENFORCEE` → commentaire + ≥ 1 pièce afférente requis |
| `R16` | Poussée SI idempotente | `si_idempotency_key` UNIQUE + verrou Redis. Un dossier `si_etat='CONFIRME'` n'est jamais repoussé |
| `R17` | Une formule par ligne retenue | `DEMANDE_LIGNE.formule_id NOT NULL` + contrôle à la soumission |
| `R18` | Le TTC de la demande agrège les lignes | `montant_ht = Σ DEMANDE_LIGNE.montant_ht_ligne` avant application TSC/TVA |
| `R19` | Une seule formule courante par ligne | Index unique partiel `WHERE courante` |
| `R20` | `statut_ligne` figé à la sélection | Copie dans `DEMANDE_LIGNE` — l'évolution ultérieure du statut de la ligne ne réécrit pas l'historique du dossier |
| `R21` | **SoD étendu à la délégation** | Quand une action est effectuée sous délégation, `SodGuard` vérifie l'absence d'action antérieure sur l'étape N-1 pour le **délégataire** *et* pour le **délégant** (`DELEGATION.delegant_id`). L'audit porte les deux identités |
| `R22` | Pas de délégation active concurrente | Deux `DELEGATION` actives sur le même `(delegant_id, role_code)` avec des périodes qui se recouvrent → rejet `422`. **Garanti en base** par contrainte d'exclusion GIST (§4bis.1), pas seulement applicativement |
| `R23` | Traçabilité des corrections de montant | Toute écriture dans `HISTORIQUE_MONTANT` porte `origine` + `horodatage`. `acteur_id` est renseigné **dès qu'un utilisateur est à l'origine du changement, quelle que soit l'`origine`** — y compris `RECALCUL`. `acteur_id IS NULL` est réservé aux recalculs déclenchés par le système. **Implication à sens unique**, voir §4bis.4 |

---

## 8. Seeds requis

| Référentiel | Contenu |
|---|---|
| `CIRCUIT` | DOBB (`PO2_B-17`), DXC (`PO5-G-07`), DF (`PO6-07`) |
| `ROLE` | 34 rôles dédupliqués, groupes AD `GG-DGR-*`, `requiert_mfa` sur les rôles sensibles |
| `SLA_PROFIL` | Initiateur (non bloquant) · Responsable/Manager/Manager Senior 8 h · DOBB/DF/DGA-DG 24 h · FRA 48 h · Contrôle 240 h |
| `CONFIGURATION_CIRCUIT` + `ETAPE_REGLE` | Paliers par défaut = tranches actuelles, `label_palier` = « palier de subdélégation (provisoire) ». DF : ≤ 5 M / 5 M–50 M / > 50 M |
| `MOTIF` | ≈ 30 DOBB, liste DXC, 9 DF |
| `PIECE_AFFERENTE` | Pièces attendues par motif, drapeau `obligatoire` |
| `UNIVERS_FMI` | `FIXE`, `MOBILE`, `INTERNET` |
| `FACTEUR_DEGREVEMENT` | `INTERNE` (structurel), `EXTERNE` (conjoncturel) |
| `DIRECTION_RESPONSABILITE` / `SERVICE_RESPONSABILITE` | **Normalisés** avant seed (les listes DOBB sont hétérogènes : casse, doublons, libellés composés type « COMMERCIAL/RECOUVREMENT ») — pas d'import brut |
| `KPI_DEFINITION` | ≈ 24 indicateurs sur 6 familles |
| `PARAMETRE_CALCUL` | TSC 3 %, TVA 18 %, devise XOF, par circuit |
| `PARAMETRE_GLOBAL` | Politique ligne résiliée = `BLOQUANT` · poussée SI auto = `true` · adaptateurs par circuit · max tentatives = 5 |
| `CALENDRIER_SLA` | Jours ouvrés 1–5, 08:00–18:00, fériés CI |
| `MODULE` | Modules cœur et optionnels |
| **Démo (`SF-PGD-303`)** | Comptes multi-lignes : ≥ 1 compte avec 3+ ND, chaque ligne avec formule courante + ≥ 1 formule historique, un ND en `SUSPENDU`, un ND en `RESILIE` |

---

## 9. Notes de déploiement

- Extension **`btree_gist`** requise (anti-chevauchement des paliers).
- **Index de recherche ND** (`idx_ligne_nd`) dimensionnant pour l'exigence < 1 s.
- **Vues matérialisées** recommandées pour les KPI lourds (par univers, motif, responsabilité), rafraîchies périodiquement, exposées via cache Redis.
- Index KPI couvrant `(univers_fmi_code, facteur_code, degrevement_saisi_si, date_cloture)` pour les agrégations M-1/M.
- **`totp_secret` chiffré au repos** (clé hors base, variable d'environnement / coffre) et jamais retourné par l'API.
- Migrations Prisma versionnées ; `db push` interdit hors développement local.
- Sauvegardes RPO ≤ 1 h · rétention 10 ans (SOX).

---

## 10. Traçabilité exigences → entités

| Exigence | Entités / colonnes |
|---|---|
| `SF-PGD-300` ND | `LIGNE.nd`, `idx_ligne_nd`, `UNIQUE(compte_id, nd)` |
| `SF-PGD-301` formules | `FORMULE`, `uq_formule_courante` |
| `SF-PGD-302` multi-ND | `DEMANDE_LIGNE` |
| `SF-PGD-310` recherche ND | `LIGNE.nd` + index |
| `SF-PGD-311` sélection multiple | `DEMANDE_LIGNE`, `R18` |
| `SF-PGD-320` toutes formules | `FORMULE.date_debut/date_fin/courante`, `LIGNE.historique_partiel` |
| `SF-PGD-321` récurrent auto | `FORMULE.recurrent_mensuel_ht` → `DEMANDE_LIGNE.recurrent`, `HISTORIQUE_MONTANT` |
| `SF-PGD-330` service autre | `DEMANDE.responsabilite_service_autre` |
| `SF-PGD-331` commentaire | `DEMANDE.commentaire`, `R14` |
| `SF-PGD-340` paliers | `CONFIGURATION_CIRCUIT.label_palier/source_fiche/date_effet`, `ETAPE_REGLE` |
| `SF-PGD-350` statut ligne | `LIGNE.statut`, `DEMANDE_LIGNE.statut_ligne`, `PARAMETRE_GLOBAL`, `R15`, `R20` |
| `SF-PGD-360` poussée SI | `DEMANDE.si_*`, `si_idempotency_key`, `R16` |
| ADR-08 MFA double | `UTILISATEUR.mfa_methode/totp_secret/duo_user_id`, `ENUM_FACTEUR` |
