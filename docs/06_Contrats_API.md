# 06 — Contrats d'API (BMAD)

> **Projet :** PGD — Orange Côte d'Ivoire · **Version :** 2.0 · **Date :** 20 juillet 2026
> **Convention :** REST · JSON · enveloppe `{ data, error, meta }` · OpenAPI généré par `@nestjs/swagger`

---

## 1. Conventions transverses

**Enveloppe de réponse**

```json
{ "data": { }, "error": null, "meta": { "page": 1, "limit": 20, "total": 137 } }
```

**Codes d'erreur normalisés** (`HttpExceptionFilter`)

| Code | Signification | Exemple |
|---|---|---|
| `400` | Validation de schéma échouée | Champ manquant, type invalide |
| `401` | Non authentifié | Session expirée ou absente |
| `403` | RBAC ou SoD | Rôle insuffisant, auto-validation successive |
| `404` | Ressource introuvable | Demande inexistante |
| `409` | Conflit de verrou | Tâche déjà réclamée |
| `422` | Règle métier violée | Commentaire vide, ligne résiliée, formule manquante |
| `429` | Rate limit | Trop de tentatives d'authentification |

**Corps d'erreur**

```json
{
  "data": null,
  "error": { "code": "R15_LIGNE_RESILIEE", "message": "…", "details": [ { "nd": "…", "statut": "RESILIE" } ] },
  "meta": null
}
```

**Autres** — Pagination `?page&limit` · filtres en query · authentification par cookie de session httpOnly (JWT) · données financières jamais en query string · tous les schémas de requête et de réponse définis en Zod dans `packages/contracts` et dérivés en types TypeScript.

---

## 2. Authentification

| Méthode | Route | Description | Rôles |
|---|---|---|---|
| `POST` | `/api/auth/login` | Étape 1 — AD (identifiant + mot de passe) | public |
| `POST` | `/api/auth/mfa/verify` | Étape 2 — MFA (DUO push/passcode ou TOTP) | authentifié étape 1 |
| `POST` | `/api/auth/mfa/enroll/totp` | Enrôlement TOTP (secret + QR) | authentifié |
| `POST` | `/api/auth/mfa/enroll/totp/confirm` | Confirmation par premier code | authentifié |
| `POST` | `/api/auth/refresh` | Renouvellement du JWT | authentifié |
| `POST` | `/api/auth/logout` | Révocation immédiate de session | authentifié |
| `GET` | `/api/auth/session` | Utilisateur courant, rôles, corbeilles accessibles | authentifié |

`POST /api/auth/login` → `{ requiresMfa: boolean, methode: "DUO" | "TOTP" | null, challengeId?: string }`

---

## 3. Registre client — lignes et formules *(lot 2)*

| Méthode | Route | Description | Exigence |
|---|---|---|---|
| `GET` | `/api/comptes?q=` | Recherche compte (numéro ou nom), insensible casse/espaces | `SF-PGD-052` |
| `GET` | `/api/comptes/{numero}/lignes` | Lignes du compte : ND, libellé, statut, formule courante | `SF-PGD-311` |
| `GET` | `/api/lignes?nd=` | **Recherche par ND** → compte, ligne, statut, formules. < 1 s | `SF-PGD-310` |
| `GET` | `/api/lignes/{id}` | Détail d'une ligne | `SF-PGD-300` |
| `GET` | `/api/lignes/{id}/formules` | Toutes les formules, courante et historiques | `SF-PGD-320` |
| `GET` | `/api/jade/cases?ref=` | Recherche par n° de Case JADE (bouchon) | `SF-PGD-053` |

**`GET /api/lignes?nd=0102030405`**

```json
{ "data": {
    "compte": { "id": "…", "numeroCompte": "…", "nomClient": "…", "segment": "B2B" },
    "ligne": { "id": "…", "nd": "0102030405", "libelleLigne": "…",
               "statut": "ACTIF", "universFmiCode": "MOBILE", "historiquePartiel": false },
    "formules": [
      { "id": "…", "libelle": "…", "recurrentMensuelHt": 25000.00,
        "dateDebut": "2025-01-01", "dateFin": null, "courante": true },
      { "id": "…", "libelle": "…", "recurrentMensuelHt": 18000.00,
        "dateDebut": "2023-06-01", "dateFin": "2024-12-31", "courante": false }
    ] },
  "error": null, "meta": null }
```

ND inconnu → `200` avec `data: null` et un message informatif — **jamais `404`**, la saisie manuelle doit rester possible (`SF-PGD-310`).

---

## 4. Demandes

| Méthode | Route | Description | Exigence |
|---|---|---|---|
| `GET` | `/api/demandes` | Liste filtrée `?circuit&statut&siEtat&q&page&limit` | — |
| `POST` | `/api/demandes` | Création en brouillon | `SF-PGD-040` |
| `GET` | `/api/demandes/{id}` | Détail complet (lignes, montants, pièces, circuit, audit, état SI) | — |
| `PATCH` | `/api/demandes/{id}` | Modification (re-routage si soumise) | `SF-PGD-087` |
| `PUT` | `/api/demandes/{id}/lignes` | Définit les lignes retenues (multi-ND) | `SF-PGD-311` |
| `POST` | `/api/demandes/{id}/calcul` | Recalcul TSC/TVA/TTC (aperçu) | `SF-PGD-041` |
| `POST` | `/api/demandes/{id}/apercu-routage` | Chaîne prévisionnelle + palier déclenché | `SF-PGD-033` |
| `POST` | `/api/demandes/{id}/soumettre` | Soumission transactionnelle | `SF-PGD-060` |
| `POST` | `/api/demandes/{id}/abandonner` | Abandon | `SF-PGD-061` |
| `POST` | `/api/demandes/{id}/rappeler` | Rappel | `SF-PGD-061` |
| `POST` | `/api/demandes/{id}/pieces` | Upload de pièce (`GedPort`) | `SF-PGD-050` |
| `DELETE` | `/api/demandes/{id}/pieces/{pieceId}` | Suppression de pièce | — |

**`PUT /api/demandes/{id}/lignes`**

```json
{ "lignes": [
    { "ligneId": "…", "formuleId": "…", "recurrent": 25000.00, "montantHtLigne": 50000.00,
      "debutPeriodeContestee": "2026-05-01", "finPeriodeContestee": "2026-05-31" }
  ] }
```

Le serveur fige `nd` et `statut_ligne` depuis la ligne au moment de l'appel (`R20`), et recalcule les montants agrégés (`R18`).

**`POST /api/demandes/{id}/soumettre`** — Erreurs `422` possibles, cumulables :

| Code | Règle |
|---|---|
| `R13_PIECES_MANQUANTES` | Pièces obligatoires du motif absentes |
| `R14_COMMENTAIRE_REQUIS` | Commentaire vide ou espaces seuls |
| `R15_LIGNE_RESILIEE` | Ligne résiliée, politique `BLOQUANT` |
| `R15_JUSTIFICATION_REQUISE` | Ligne résiliée, politique `JUSTIFICATION_RENFORCEE` non satisfaite |
| `R17_FORMULE_REQUISE` | Ligne retenue sans formule sélectionnée |
| `R12_CONTROLE_FRA` | Configuration FRA absente pour un montant > 5 M |

---

## 5. Corbeilles et tâches

| Méthode | Route | Description | Exigence |
|---|---|---|---|
| `GET` | `/api/taches` | Corbeille des rôles de l'utilisateur `?role&etat&page` | `SF-PGD-071` |
| `GET` | `/api/taches/{id}` | Détail d'une tâche | — |
| `POST` | `/api/taches/{id}/claim` | **Claim atomique** → `200` ou **`409`** | `SF-PGD-072` |
| `POST` | `/api/taches/{id}/unclaim` | Relâche | `SF-PGD-073` |
| `POST` | `/api/taches/{id}/approuver` | Approbation + revue champ par champ (`SodGuard`) | `SF-PGD-080` |
| `POST` | `/api/taches/{id}/rejeter` | Rejet, motif obligatoire | `SF-PGD-082` |
| `POST` | `/api/taches/{id}/deleguer` | Délégation avec note d'intérim | `SF-PGD-086` |

**`409` sur claim**

```json
{ "data": null,
  "error": { "code": "TACHE_DEJA_RECLAMEE",
             "message": "Cette tâche vient d'être réclamée par un autre agent.",
             "details": { "etat": "RECLAMEE" } },
  "meta": null }
```

**`403` sur SoD** → code `SOD_VIOLATION`, journalisé en `sod_refus`.

---

## 6. Contrôle et SLA

| Méthode | Route | Description | Exigence |
|---|---|---|---|
| `POST` | `/api/controle/{demandeId}` | Constat a posteriori (`FRA`/`N1`/`N2`) | `SF-PGD-100` |
| `GET` | `/api/controle/{demandeId}` | Historique des contrôles | — |
| `POST` | `/api/sla/simuler` | Durée → échéance en heures ouvrées | `SF-PGD-028` |

---

## 7. Restitution SI *(lot 2)*

| Méthode | Route | Description | Exigence |
|---|---|---|---|
| `GET` | `/api/demandes/{id}/si` | État de restitution : `etat`, `refSi`, `horodatage`, `message`, `tentatives`, `adaptateur` | `SF-PGD-360` |
| `POST` | `/api/demandes/{id}/si/pousser` | **Rejeu manuel** — uniquement si `etat = ERREUR` | `SF-PGD-360` |

Rejeu en état autre que `ERREUR` → `422` `SI_ETAT_NON_REJOUABLE`. Dépassement de `si_max_tentatives` → `422` `SI_TENTATIVES_EPUISEES`.

---

## 8. Audit

| Méthode | Route | Description | Exigence |
|---|---|---|---|
| `GET` | `/api/audit/{demandeId}` | Journal d'un dossier | `SF-PGD-140` |
| `GET` | `/api/audit/securite` | Journal de sécurité `?utilisateur&evenement&periode` | `SF-PGD-006` |
| `GET` | `/api/audit/{demandeId}/export?format=csv\|pdf` | Export | `SF-PGD-141` |

Aucun verbe d'écriture, de modification ou de suppression n'est exposé sur l'audit.

---

## 9. Administration

| Méthode | Route | Description |
|---|---|---|
| `GET` `POST` `PATCH` `DELETE` | `/api/admin/paliers` | **Paliers de subdélégation** — chevauchement → `422`, trous signalés |
| `GET` `POST` `PATCH` `DELETE` | `/api/admin/circuits` | Circuits et configurations |
| `GET` `POST` `PATCH` `DELETE` | `/api/admin/roles` | Catalogue de rôles, groupes AD, `requiert_mfa` |
| `GET` `POST` `PATCH` `DELETE` | `/api/admin/motifs` | Motifs et pièces afférentes |
| `GET` `PATCH` | `/api/admin/parametres` | Taux TSC/TVA, devise, par circuit |
| `GET` `PATCH` | `/api/admin/parametres-globaux` | Politique ligne résiliée, connecteurs SI, max tentatives |
| `GET` `PATCH` | `/api/admin/calendrier-sla` | Jours ouvrés, plage horaire, fériés |
| `GET` `PATCH` | `/api/admin/modules` | Activation de modules |
| `POST` | `/api/admin/escalade-manuelle/{tacheId}` | Escalade manuelle |
| `POST` | `/api/admin/import-crm` | Import du registre client (`CrmPort`) |

Toute écriture d'administration **invalide la clé de cache Redis** correspondante et est journalisée.

---

## 10. KPI

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/api/kpi?profil=&circuit=&periode=&univers=&statutLigne=&siEtat=` | Agrégations par profil (initiateur, valideur, pilotage), cachées en Redis |
| `GET` | `/api/kpi/definitions` | Catalogue `KPI_DEFINITION` |

---

## 11. Santé et exploitation

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/api/health` | Vivacité |
| `GET` | `/api/health/ready` | PostgreSQL, Redis, AD, MFA joignables |
| `GET` | `/api/docs` | OpenAPI / Swagger UI |
