# Divergences maquette ↔ PRD

Écarts entre `docs/design/` et `docs/01_PRD_Consolide.md`/`docs/04_MCD_MLD_PGD_PROD.md`, trouvés en Phase 9.0. Chaque écart tranché en faveur du PRD, sauf mention contraire explicite. La maquette ne fait jamais foi pour les règles métier, les autorisations ou les calculs — seulement pour la mise en page, la charte, les états de composants.

## Corrections d'accessibilité (Phase 9, étape 3 — extraction des tokens)

Trois contrastes de `docs/design/styles.css` ne passent pas WCAG AA (4.5:1 texte courant, 3:1 texte large/UI). Corrigés à l'extraction dans `packages/ui/tokens/`, jamais reproduits tels quels. Ratios mesurés par calcul de luminance relative (WCAG 2.x).

| Usage | Valeur d'origine | Ratio d'origine | Valeur retenue | Ratio retenu |
|---|---|---|---|---|
| Texte badge `.b-orange` (orange-600 sur orange-50) | `#E96B00` sur `#FFF3E8` | 2,93:1 — échec | `#9a4a00` (`orangeTexteSurClair`) | 5,74:1 |
| Texte badge/alerte vert (vert-700 sur vert-fond) | `#23901f` sur `#E7F8E7` | 3,74:1 — échec (texte courant, passe seulement en texte large) | `#148110` (`vertTexteSurClair`) | 4,54:1 |
| Texte secondaire gris (gris-500 sur blanc — `.kpi .value small`, `.empty`, `.input-addon .suffix`, etc.) | `#999999` sur `#ffffff` | 2,85:1 — échec | `#767676` (= `gris600` existant, pas une nouvelle valeur) | 4,54:1 |

La correction orange n'invente rien : `#9a4a00` est déjà utilisé par la maquette elle-même à trois autres endroits (`alert-orange`, `pill-circuit` DOBB, `lock-banner`) pour exactement le même besoin visuel — seul le badge `.b-orange` utilisait par erreur `orange-600`, qui échoue. La correction grise réutilise `gris600`, déjà présent dans la palette — pas de teinte inventée non plus.

`gris400` (`#b3b3b3`) reste une primitive à n'utiliser **jamais** pour du texte ou un élément d'interface porteur de sens sur fond clair (2,10:1, échec même du seuil UI à 3:1) — son seul usage réel dans la maquette est décoratif (poignée de glisser-déposer `.drag-grip`, dégradé de scrollbar), non porté tel quel s'il devait afficher du texte.

**Anneau de focus clavier (`--focus-anneau-couleur`)** — même famille de correction. La maquette n'utilise `orange` (`#FF7900`) que pour le focus des champs de saisie, jamais pour des boutons/nav/onglets. Réutiliser `orange` tel quel aurait échoué le contraste non-textuel WCAG 1.4.11 (≥3:1) : 2,63:1 sur blanc, 2,48:1 sur gris50 — un anneau de focus invisible sur la majorité des fonds clairs de l'application. `orange600` (`#E96B00`), déjà présent dans la palette (10 occurrences, teinte de survol des boutons primaires), passe partout : 3,20:1 sur blanc, 3,01:1 sur gris50, 6,57:1 sur noir (sidebar). Retenu à la place — même famille de couleur, teinte plus foncée par nécessité de contraste, pas une couleur inventée.

## Décisions de design assumées, sans source dans la maquette

### Statut de ligne (ACTIF/SUSPENDU/RESILIE, R15)
CLAUDE.md affirmait que la maquette « fait foi » pour les codes couleur de statut de ligne — **c'était une erreur de rédaction**, introduite sans vérification de source. `docs/design/` ne colore le statut de ligne nulle part : recherche dédiée dans `data.jsx`, `engine.jsx` et tous les fichiers `screens*.jsx`, négative (ni le champ `statutLigne`, ni les valeurs ACTIF/SUSPENDU/RESILIE n'apparaissent liées à une classe de couleur).

**Décision assumée** (`packages/ui/tokens/semantic.ts` — `statutLigne`) : vert/jaune/rouge, par cohérence avec les autres familles sémantiques de ce fichier (statut demande, urgence SLA), **pas extraits d'une source**.
- `actif` → vert (réutilise `vertTexteSurClair`, la correction d'accessibilité déjà appliquée ailleurs)
- `suspendu` → jaune (`jaune700`/`jauneFond`, **vérifié avant d'être retenu** : 4,55:1, passe WCAG AA sans correction malgré sa seule occurrence dans la maquette)
- `resilie` → rouge (`rouge700`/`rougeFond`, déjà utilisé ailleurs, 6,03:1)

À confirmer avec le métier si une convention visuelle différente existe déjà côté production (aucune source ne la documente à ce jour).

## Écarts tranchés (PRD l'emporte, rien à porter)

### SLA de correction sur dossier rejeté (`rejetSla()`, `CONFIG.rejets`)
La maquette implémente un délai configurable (48h fixe ou somme de la chaîne du circuit) avec seuil d'alerte pour corriger et resoumettre un dossier rejeté. `docs/04_MCD_MLD_PGD_PROD.md` indique explicitement que l'Initiateur a une « Vue JADE (**pas de minuteur bloquant**) » et que `minuteur_bloquant = FALSE` pour ce rôle. **Contradiction directe**, pas un trou de spécification.
**Tranché** : ne rien porter, ni logique ni coquille câblée. Le panneau `RejetsSlaPanel` (`screens3.jsx`) peut servir de référence de mise en page pure si un écran de paramétrage SLA existe par ailleurs, mais sans jamais y implémenter de délai sur les rejets.

### Rôles nécessitant le MFA (`MFA_ROLES` en dur)
La maquette code en dur `["SM_DF","DF","DGA_DG","ADMIN"]`. Le serveur porte déjà `Role.requiertMfa` par rôle, data-driven (Phase 2). Pas une divergence contradictoire — la maquette simplifie pour la démo — mais confirmation que rien de cette liste ne doit être recopié.

### Taux TSC/TVA et bases de calcul (`CONFIG.taxes`)
La maquette code en dur les taux (TSC 3 %, TVA 18 %) et le choix d'assiette (HT vs HT+TSC). Le serveur porte déjà ces valeurs dans `PARAMETRE_CALCUL`, admin-configurable par circuit (Phase 5). Le composant `CalcConfigView` (`screens3.jsx`) peut servir de référence visuelle pour l'écran d'administration correspondant, à condition de lire/écrire les valeurs réelles via l'API, jamais une constante.

## Questions requalifiées par la maquette (à trancher avec le métier, pas des divergences à corriger)

### Escalade SLA — cible du transfert
La maquette (`engine.jsx:319-337`, `escalader()`/`runAutoEngine()`) avance le dossier vers `dossier.taches[ordre+1]` — l'étape suivante déjà instanciée dans la même chaîne — jamais vers un rôle superviseur externe. Ce n'est pas une source d'autorité (une maquette n'est pas le PRD), mais un indice cohérent avec le modèle existant qui transforme une question ouverte en question fermée. **Question à trancher avec le métier** : « l'escalade transfère-t-elle la tâche à l'étape suivante de la chaîne du dossier, ou à un rôle superviseur externe ? » — voir CLAUDE.md « Questions ouvertes » pour la formulation complète et le suivi.

### Rattachement utilisateur → direction/service
`data.jsx` invente un rattachement `USERS[].direction`/`.service` (+ une table `DIRECTIONS` incluant des pseudo-directions « AUDIT »/« PILOTAGE ») qui n'existe nulle part dans le schéma réel. Ce n'est pas un oubli de modélisation RBAC — c'est la preuve que la maquette comble par une fiction un rattachement jamais spécifié. **Question à trancher avec le métier** : faut-il ajouter ce rattachement au modèle pour un scoping KPI plus fin que `pilotage` vs le reste ? Voir CLAUDE.md « Questions ouvertes ».

## Piste à valider, pas un correctif (catalogue de rôles)

### 34 rôles dans la maquette vs 25 seedés côté serveur
`data.jsx` (`ROLES`) définit exactement 34 rôles, avec les chaînes de validation détaillées par palier pour DOBB et DF (`RRB2B`, `MRB2B`, `RREC`, `MREC`, `RADV`, `MSOC`, `MSRC`, `DAOB`, `FRADEL`, `SMMOA`, `DFA`, `SM_BO_CM`, `SM_VWR`, `DIRMKT`). Le référentiel serveur (`packages/database/prisma/seed/referentiels/roles.seed.ts`) n'en porte que 25.
**La maquette n'est pas une source d'autorité sur le référentiel de rôles.** Cette liste de 9 rôles manquants est consignée ici comme **piste à valider face au catalogue officiel avant tout seed** — pas comme un correctif à appliquer directement. Ne pas compléter `roles.seed.ts` à partir de cette seule source.

## Mécanismes de contournement du workflow — ni logique ni coquille portées

### Réaffectation manuelle (`ReaffecterModal`, `reaffecter()`)
Déplace une tâche vers un rôle arbitraire, hors chaîne de validation instanciée — distinct de la délégation (qui ne change pas le rôle propriétaire) et de l'escalade (qui suit l'ordre déjà défini). Aucune story, aucun SF-PGD ne couvre ce mécanisme (recherche dédiée dans docs/01 et docs/04, négative). Après une phase entière consacrée à combler des contrôles d'accès manquants, **ni la logique ni la coquille visuelle ne sont portées** : un bouton présent mais non câblé finit toujours par être câblé par quelqu'un qui suppose la spécification existante ailleurs.

### Déverrouillage manuel forcé (`debloquer()`)
Lève un verrou de claim en dehors du mécanisme automatique (`LocksSweeperService`). Même constat que ci-dessus : aucune story, **ni logique ni coquille portées**.

## Actions sans effet sur le workflow — coquille visuelle acceptée

`relancer()` (relance de notification), `publipostage()` (courrier de réponse client), `archiver()` (archivage) — mentionnés une fois dans `docs/04_MCD_MLD_PGD_PROD.md` comme actions Initiateur, sans story ni SF-PGD dédiés, mais **sans effet sur l'état du workflow ou un contrôle d'accès** (contrairement à réaffectation/déblocage). La coquille visuelle peut être portée ; le câblage attend une spécification.

## Numérotation morte (`screens4.jsx`)

Les commentaires internes de `screens4.jsx` (`MasseScreen`, `IntegrationsScreen`, `ModulesScreen`) citent des codes « PGD-27 », « PGD-25 », « PGD-26 » absents de la numérotation `PGD-0NN` de `docs/04_UserStories_Realisation.md`. Fichier entier exclu du portage (voir `README.md`, section « Exclusions »).

## Point d'attention transverse — masquage de bouton par rôle

La maquette peut masquer ou désactiver des boutons selon le rôle courant (ex. `defaultRouteFor`, conditions d'affichage dans les écrans de corbeille/admin). **Si portée, cette logique est un confort d'affichage, jamais un contrôle d'accès** : le serveur reste seul juge de ce qu'un appel peut effectivement faire, exactement comme rappelé règle non négociable 2 de CLAUDE.md (« un contrôle côté client est un confort, jamais une garantie »). Un bouton visible dont l'action est refusée côté serveur est un comportement normal, pas un bug à corriger en assouplissant l'API.
