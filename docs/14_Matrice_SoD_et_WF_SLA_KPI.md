# Matrice SoD et WF SLA/KPI — sources transcrites

> Sources : `PROJET_DEGREV_Matrice_SOD.xlsx` et
> `WF_de_validation_actes_de_gestion_et_KPI_S.xlsx`, fournis directement
> par la personne pilotant le projet. Transcrits intégralement pour
> devenir des sources permanentes, pas seulement des pièces jointes de
> conversation.

---

## Matrice SoD — profils système

Trois profils système, pas plus. `VALIDATEUR` regroupe sept niveaux sous
un seul et même jeu d'actes de gestion — même capacités, position
différente dans la chaîne.

| Profil | Sous-niveau | Actes de gestion |
|---|---|---|
| INITIATEUR | Chargé | Créer le dossier, renseigner la fiche, insérer/supprimer des pièces, affecter au niveau suivant, annuler (doublon), commentaire de clôture, publipostage, vue sur la corbeille globale, notification par mail à l'escalade, vue sur l'évolution des dossiers soumis, rappeler un dossier transmis, archiver, extraction Excel pour bilans |
| VALIDATEUR | RESPONSABLE / MANAGER / MANAGER SENIOR / DOBB-DXC-DF / FRA / DGA-DG / FIABILISATION | Recevoir le dossier, accéder aux pièces jointes, ajouter un commentaire, valider, faire suivre, rejeter, renvoyer à l'initiateur, extraction Excel pour bilans |
| ADMINISTRATEUR | ADMINISTRATEUR | Éditer les processus (paliers), CRUD motifs/libellés, CRUD catalogue de rôles, pré-enregistrement utilisateur, configurer paramètres de calcul, configurer calendrier SLA, configurer paramètres globaux |

---

## WF SLA — actes de gestion et délai par étape

Détail circuit DF, avec un différenciateur clé : la présence ou l'absence
de « valider le dossier » dans les actions listées.

| Étape | Actions | Valide ? | SLA |
|---|---|---|---|
| INITIATEUR | (cf. matrice SoD) | — | « VUE JADE » (anomalie de saisie probable, pas un délai) |
| RESPONSABLE | reçoit, accède, commente, **valide**, fait suivre, rejette, renvoie | Oui | 8 heures |
| MANAGER | idem | Oui | 8 heures |
| MANAGER SENIOR | idem | Oui | (vide dans la source) |
| DOBB | idem | Oui | 24 h |
| **FRA** | reçoit, accède, commente, **fait suivre le dossier au DF**, rejette, renvoie — **jamais « valide »** | **Non** | 48 heures |
| DF | reçoit, accède, commente, valide, fait suivre, **annule le dossier**, renvoie | Oui | 24 heures |
| DGA/DG | reçoit, accède, commente, valide, rejette, renvoie | Oui | 24 heures |
| **FIABILISATION** | reçoit, accède, commente, **valide le contrôle du dossier**, **invalide le dossier suite au contrôle**, renvoie | Vocabulaire de contrôle, pas de validation | **10 jours** |

**Lecture retenue, à vérifier avant de corriger le code :** `FRA` est une
étape bloquante de vérification/transmission (jamais de validation au
sens propre), à sa place dans la chaîne, probablement `typeActeur='V'`.
`FIABILISATION` est la vraie étape de contrôle a posteriori — vocabulaire
de contrôle explicite, SLA d'un ordre de grandeur incompatible avec une
étape bloquante. La convention interne actuelle
(`roleCode==='FRA' AND typeActeur==='C'` pour détecter le contrôle a
posteriori) semble reposer sur le mauvais rôle depuis la Phase 5.

---

## WF KPI — six familles, avec formule de calcul

| Famille | Indicateurs | Définition |
|---|---|---|
| Dossiers reçus | Montant total, volume total, taux d'évolution M/M-1, montant par univers, volume par univers, taux d'évolution par univers | Tous les dossiers enregistrés (HT et TTC) |
| Dossiers traités | Montant total, volume total, taux d'évolution, montant par univers, volume par univers, taux d'évolution par univers | **« dont le dégrèvement est saisi dans le SI »** — pas seulement validé, réellement restitué |
| Top motif | Top motif global, montant par motif, top motif par univers, taux du motif sur le global, taux du motif par univers | — |
| Facteurs de dégrèvement | Montant par facteur, taux par facteur | Interne/structurel vs externe/conjoncturel |
| Responsabilité par direction | Montant par direction, taux par direction | — |
| Responsabilité par service | Montant par service, taux par service | — |

**Point de vérification à ne pas manquer :** « traités » exige que le
dégrèvement soit réellement saisi dans le SI de facturation — un dossier
`VALIDE` mais dont la restitution GAIA/BSCS a échoué ou est encore en
attente ne devrait pas compter dans cette famille.
