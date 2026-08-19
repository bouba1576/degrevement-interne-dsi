# Circuits de validation — transcription depuis la source originale

> Source : `PS_AUTOMATISATION_PROCESSUS_DEGREVEMENT.pptx`, présentation
> d'Aroun KONÉ (architecte SI), OCI/DSI/AIP, mars 2026. Document primaire —
> antérieur à `docs/09` et probablement plus fidèle sur les circuits que
> ce résumé consolidé plus tardif. Transcrit intégralement depuis les
> diapositives 20 (DOBB, tableau texte), 21 (DXC, image) et 22 (DF, tableau
> texte), plus les diagrammes de flux des diapositives 7 et 9.

---

## Circuit DOBB — diapositive 20

Six paliers. La chaîne diffère selon le **service** (sous-flux) jusqu'à un
certain seuil, puis converge vers les mêmes validateurs supérieurs.

Colonnes communes à tous les seuils : Initiation (variable par service) →
Responsable → Manager → [Manager Sénior à partir de 1 000 001] → [DAOB à
partir de 5 000 000] → [FRA + SM MOA Finance à partir de 5 000 001] →
[DFA + DF à partir de 30 000 001] → [DOBB + DGA/DG au-delà de 50 000 000]

| Seuil (F CFA TTC) | Service | Chaîne complète |
|---|---|---|
| ≤ 1 000 000 | Réclamation B2B | Chargé Réclamation B2B → Responsable Réclamation B2B → Manager Réclamation B2B |
| ≤ 1 000 000 | Recouvrement | Chargé de Recouvrement → Responsable Recouvrement → Manager Recouvrement |
| ≤ 1 000 000 | ADV | Chargé Administration des Ventes → Responsable Administration des Ventes → Manager Service Opérations Client |
| ≤ 1 000 000 | Facturation | Responsable Facturation → Manager Service Opérations Client |[^facturation-msoc]
| 1 000 001 – 4 999 999 | Réclamation B2B | + Manager Sénior Relation Client B2B |
| 1 000 001 – 4 999 999 | Recouvrement | + Manager Sénior Relation Client B2B |
| 1 000 001 – 4 999 999 | ADV | + Manager Sénior Relation Client B2B |
| 1 000 001 – 4 999 999 | Facturation | + Manager Sénior Relation Client B2B |
| = 5 000 000 | (les 4 services) | + Directeur Adjoint des Opérations Business (DAOB) |
| 5 000 001 – 30 000 000 | (les 4 services) | + Chargé/Responsable Delivery (FRA) → SM MOA Finance et Fraude Assurance |
| 30 000 001 – 50 000 000 | (les 4 services) | + DFA → DF |
| > 50 000 000 | (les 4 services) | + DOBB → Chargé/Responsable Delivery (FRA) → SM MOA Finance et Fraude Assurance → DFA → DF → DGA/DG |

**Note sur la dernière ligne (>50M) : l'ordre exact tel que transcrit du
tableau source** place DOBB avant FRA/SM MOA/DFA/DF, ce qui diffère de
l'ordre naturel attendu (DOBB semblerait plus logique en position
terminale, comme dans les autres paliers). À vérifier contre le diagramme
de flux (cohérent avec un ordre Chargé→Responsable→Manager→Manager
Sénior→DAOB→DOBB→FRA→SM MOA→DFA→DF→DGA/DG, 11 étapes) — le diagramme fait
foi en cas de doute, le tableau peut contenir une erreur de mise en page.

[^facturation-msoc]: **Divergence trouvée le 14/08/2026, en vérifiant l'ambiguïté du rôle
« Manager Service Opérations Client » (MSOC) avant de concevoir la dérivation
automatique du sous-flux.** `docs/design/data.jsx` (maquette, jamais une
source de vérité — cf. CLAUDE.md « Maquette de référence ») construit la
chaîne Facturation avec `_dobbHead["Facturation"] = ["MSOC"]` (un seul
rôle, position 0 — donc traité comme rôle de tête/initiateur dans
`_dobbEtapes`), **sans jamais lister « Responsable Facturation »**. Ce
tableau, source primaire, est net : deux rôles, « Responsable Facturation »
en tête, « Manager Service Opérations Client » en second. **La ligne
ci-dessus fait foi** — MSOC n'est jamais un rôle de tête dans aucune des
quatre chaînes DOBB, y compris Facturation. Cette divergence reste à
trancher explicitement (pas silencieusement absorbée dans un sens ou
l'autre) au moment de construire réellement la chaîne Facturation.

---

## Circuit DXC — diapositive 21 (image, transcrite manuellement)

Titre exact : « Circuits de vérification, validation et contrôle des
ajustements B2C ». Structure à trois niveaux explicites : Vérificateurs,
Validateurs, Contrôleurs — pas une chaîne linéaire unique comme DOBB/DF.

Note (a) : la fiche est renseignée par le gestionnaire en charge, vérifiée
et validée selon les montants.
Note (b) : « en cas d'indisponibilité d'un acteur validateur, la ressource
assurant l'intérim procède à la validation en conservant la note
d'intérim » — correspond exactement à `Delegation.noteInterim` déjà
construit.

Initiation, constante à tous les seuils : **Gestionnaire réclamation B2C**

| Seuil (F CFA) | Vérificateurs | Validateurs | Contrôleurs |
|---|---|---|---|
| 1 – 500 000 | Chargé de réclamation B2C → Responsable réclamation B2C | Directeur expérience client | — |
| 500 000 – 5 000 000 | + Manager réclamation et facturation B2C → Manager Sénior réclamation et facturation B2C | Directeur expérience client | — |
| 5 000 001 – 30 000 000 | + Chargé/Responsable FRA | Manager Sénior MOA Finance & FRA → Directeur expérience client → Directeur Financier adjoint | **1.** Chargé de sécurisation des opérations (DXC) — contrôle à froid niveau 1. **2.** Chargé/Responsable FRA (DF) — contrôle mensuel niveau 2 |
| 30 000 001 – 50 000 000 | + Chargé/Responsable FRA | + Directeur Financier | mêmes 2 contrôles |
| > 50 000 000 | + Chargé/Responsable FRA | + Directeur Général Adjoint ou Directeur Général | mêmes 2 contrôles |

**Trouvaille structurelle : le contrôle de niveau 2 sur DXC est effectué
par un rôle de la direction DF (Chargé/Responsable FRA), pas par DXC
elle-même.** Contrôle inter-circuit, jamais anticipé dans l'architecture
actuelle (`ControleService`/`EtapeRegle` supposent un contrôle interne au
circuit du dossier).

---

## Circuit DF — diapositive 22 (tableau) + diapositive 9 (flux)

Confirmé identique à `docs/09` §6.2 et à la simulation `engine.jsx` de la
maquette — troisième source concordante. Reproduit ici pour mémoire :

| Montant (F CFA TTC) | Chaîne |
|---|---|
| ≤ 5 000 000 | Back Office Opérateur (init.) → SM Back Office Opérateurs et Credit Management → SM Vente Wholesale et Roaming |
| 5 000 001 – 50 000 000 | + SM MOA Finance & FRA → Directeur Marketing → DFA → DF |
| > 50 000 000 | Back Office Opérateur (init.) → Directeur Marketing → DFA → DF → DGA/DG |

---

## Formulaire papier d'origine — diapositive 19 (image)

La fiche d'ajustement papier historique, à l'origine de la digitalisation.
Champs, dans l'ordre : Service (pôle), Réf. Saisie, Date demande, Date
saisie, Agent initiateur, Agent de saisie, Nom du client, Compte client,
Numéro d'appel, Formule d'abonnement, Montant à ajuster HT, Montant TSC 3%,
Total HT+TSC, Montant TVA, Total TTC, Libellé, Motif, Commentaire,
Responsabilité, Contact client. Signatures en bas : Le Responsable / Le
Manager / Le Manager Sénior / Direction Orange Business — Directrice
Expérience Client — Direction Financière — Directrice Générale Adjointe.

Cohérent avec les champs déjà identifiés dans la maquette numérique.
Aucun champ nouveau non déjà connu.
