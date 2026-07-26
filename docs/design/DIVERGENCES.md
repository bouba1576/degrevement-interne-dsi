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

### Avatar — couleur par hachage déterministe (Phase 9.1bis)
La maquette (`ui.jsx`, `Avatar`) lit `user.couleur` et `user.initiales` depuis sa propre couche de données fictive (`DATA`) — aucun des deux champs n'existe sur `Utilisateur` (`packages/contracts/src/auth.ts`, vérifié : seuls `identifiantAd` et `nom` sont présents). Une invention, pas une extraction, au même titre que le statut de ligne ci-dessus.

**Décision assumée** (`packages/ui/src/components/Avatar.tsx`) : couleur dérivée par hachage déterministe de `nom` vers une palette fixe de 6 teintes déjà présentes dans `primitives.ts` (`orangeTexteSurClair`, `vertTexteSurClair`, `rouge700`, `bleu700`, `violetTexte`, `gris700`) — jamais une couleur inventée pour l'occasion. Chaque teinte **vérifiée** ≥ 4,5:1 de contraste avec du texte blanc avant d'être retenue (la maquette fixe `color:#fff` sans condition) :

| Teinte | Contraste vs blanc |
|---|---|
| `orangeTexteSurClair` | 6,26:1 |
| `vertTexteSurClair` | 5,03:1 |
| `rouge700` | 6,97:1 |
| `bleu700` | 5,56:1 |
| `violetTexte` | 7,38:1 |
| `gris700` | 7,00:1 |

Écartées de cette palette (échec du contraste blanc, calculé) : `orange` (2,63:1), `orange600` (3,20:1), `vert` (2,22:1), `vert700` (4,13:1), `jaune` (1,51:1), `jaune700` (4,92:1, passe de justesse mais écarté pour rester dans un ensemble de teintes clairement distinctes), `bleu` (2,34:1), `violet` (3,00:1).

**Limite fonctionnelle connue, pas un bug** : le hachage n'est pas une garantie d'unicité — deux agents d'une même corbeille peuvent obtenir la même teinte, auquel cas l'avatar seul ne les distingue plus visuellement. Les initiales, elles, restent distinctes (sauf homonymie complète), donc l'identification reste possible. Ce n'est pas une régression à corriger : consigné ici pour qu'un signalement futur retrouve l'arbitrage plutôt que de découvrir un « bug » déjà connu.

## Spécifié, absent de la maquette (comblé d'après les sources réelles)

Catégorie distincte des « écarts tranchés » ci-dessous : ici la maquette ne contredit rien, elle est simplement **muette** sur une fonctionnalité que le PRD, le modèle de données, les contrats d'API ou les user stories exigent bel et bien. Le silence de la maquette n'a aucune autorité sur le périmètre — seulement sur la mise en page (règle posée en Phase 9.2, CLAUDE.md § Maquette de référence). Combler veut dire s'appuyer sur une source réelle identifiée, jamais décider librement : si aucune source ne répond non plus, l'entrée reste une question ouverte (CLAUDE.md), pas une invention consignée ici.

### Statut de ligne (ACTIF/SUSPENDU/RESILIE) — affichage exigé par PGD-081, absent de toute la maquette
`docs/design/` ne colore ni n'affiche le statut de ligne nulle part (recherche dédiée, négative — cf. section suivante pour la couleur elle-même, qui reste une décision de design assumée). PGD-081 (`docs/04_UserStories_Realisation.md`) exige que le statut soit visible à l'écran. Comblé par le composant `StatusBadge`/le mapping `statutLigne` (`packages/ui/tokens/semantic.ts`), construit d'après R15 et le modèle de données (`Ligne.statut`), pas d'après la maquette.

### RechercheNd / SelecteurLignes / SelecteurFormule — les trois sous-composants nommés par PGD-081 n'existent pas dans le rendu réel de la maquette (Phase 9.2, `NouvelleDemandeScreen`)
PGD-081 nomme explicitement ces trois sous-composants (`docs/04_UserStories_Realisation.md`), avec leurs stories dédiées : `PGD-020`/`SF-PGD-310` (recherche par ND), `PGD-021`/`SF-PGD-311` (lignes d'un compte, sélection multiple, badge de statut), `PGD-022`/`SF-PGD-320` (formules courante/historique, badges), `PGD-023`/`SF-PGD-321` (récurrent pré-rempli depuis la formule). **Aucun des quatre n'est représenté dans `docs/design/screens1.jsx`** (recherche dédiée, négative) : le formulaire de la maquette porte un unique champ `Montant à ajuster HT` (nombre libre) et un champ `formule` en **texte libre** (`<input className="input" value={f.formule} onChange={...} />`, lignes 335/366/438), sans lien avec un `ligneId`/`formuleId` réel, sans recherche de ND, sans liste de lignes à cocher, sans distinction courante/historique. Ce n'est pas un écart mineur de mise en page : c'est l'absence complète, dans le prototype, du sous-système que PGD-081 place au centre de l'écran. Construit entièrement d'après les stories + les contrats réels (`GET /api/lignes?nd=`, `GET /api/lignes/:id/formules`, `PUT /api/demandes/:id/lignes`) — la maquette n'a servi à rien pour cette partie de l'écran au-delà du style général des cartes/champs (`Field`, `.card`, `.card-pad`).

### Champ conditionnel « service Autre » (DOBB) — absent du select de la maquette
PGD-032/SF-PGD-330 exige qu'un choix `AUTRE` sur la responsabilité par service (DOBB) fasse apparaître un champ texte obligatoire, masqué et vidé pour toute autre valeur — déjà implémenté côté serveur (Phase 4). La maquette applique ce motif `__autre` aux champs `motif`/`libelle` (lignes 340, 343, 372, 375, 443, 446) mais **pas** au `<select>` `responsabiliteService` (lignes 349, 391, 421) : aucune option `__autre`, aucun champ conditionnel. Comblé d'après PGD-032 directement, pas d'après un motif observé dans la maquette pour ce champ précis (le motif existe ailleurs dans la même maquette, mais pas ici — une aide de lecture, pas une source pour ce champ).

### État SI à quatre valeurs — la maquette le réduit à un booléen
Le modèle réel porte `EnumEtatSi` à quatre valeurs (`EN_ATTENTE`/`ENVOYE`/`CONFIRME`/`ERREUR`, `packages/contracts/src/enums.ts`). `docs/design/` ne représente qu'un booléen « reçu vs traité » (convention documentée dans CLAUDE.md § KPI). Aucune palette à 4 états n'est extraite de la maquette — à construire depuis le modèle réel le jour où un écran affiche cet état, jamais en collapsant vers le booléen de la maquette.

### Anneau de focus clavier — la maquette ne le pose que sur les champs de saisie
`docs/design/` n'a jamais défini de `:focus-visible` pour boutons/nav/onglets — seulement pour les champs de formulaire. Une application traitée au clavier toute la journée ne peut pas laisser ce manque ouvert. Comblé dans `packages/ui/tokens/tokens.css` (`:focus-visible` global, `focusVisible` dans `semantic.ts`) — teinte choisie par nécessité de contraste (cf. section « Corrections d'accessibilité » ci-dessus), pas par la maquette.

### Scoping KPI par `profil` réel — pas le rattachement direction/service inventé par la maquette
`data.jsx` invente un rattachement `USERS[].direction`/`.service` pour faire fonctionner sa démo. Aucune source ne le spécifie côté serveur. Plutôt que de le reproduire, le scoping réel (`profil=initiateur`/`valideur`, `KpiEngineService.construireWhere`) s'appuie sur des données qui existent vraiment (`Demande.initiateurId`, `Tache.roleCorbeille`) — un comblement partiel : ce que les sources permettent de construire est construit, ce qu'aucune source ne documente (un rattachement direction/service plus fin) reste une question ouverte (CLAUDE.md), jamais deviné.

## Écarts tranchés (PRD l'emporte, rien à porter)

### Commentaire marqué « optionnel » dans la maquette — R14/PGD-033 exigent l'inverse
`docs/design/screens1.jsx:471` labelle le champ `<Field label="Commentaire (optionnel)">`, sans `req` ni message d'aide sur son caractère obligatoire. `R14`/`PGD-033`/`SF-PGD-331` sont explicites : soumission bloquée si commentaire vide ou espaces seuls, message d'aide explicite sous le champ, contrôle serveur (`DemandeWorkflowService.soumettre`, erreur `R14_COMMENTAIRE_REQUIS`). **Contradiction directe** (la maquette ne se contente pas de rester muette, elle affirme le contraire), pas une absence de spécification — traité comme les autres écarts tranchés de cette section : le PRD l'emporte, le libellé « optionnel » et l'absence de `req` ne sont pas reproduits.

### SLA de correction sur dossier rejeté (`rejetSla()`, `CONFIG.rejets`)
La maquette implémente un délai configurable (48h fixe ou somme de la chaîne du circuit) avec seuil d'alerte pour corriger et resoumettre un dossier rejeté. `docs/04_MCD_MLD_PGD_PROD.md` indique explicitement que l'Initiateur a une « Vue JADE (**pas de minuteur bloquant**) » et que `minuteur_bloquant = FALSE` pour ce rôle. **Contradiction directe**, pas un trou de spécification.
**Tranché** : ne rien porter, ni logique ni coquille câblée. Le panneau `RejetsSlaPanel` (`screens3.jsx`) peut servir de référence de mise en page pure si un écran de paramétrage SLA existe par ailleurs, mais sans jamais y implémenter de délai sur les rejets.

### Rôles nécessitant le MFA (`MFA_ROLES` en dur)
La maquette code en dur `["SM_DF","DF","DGA_DG","ADMIN"]`. Le serveur porte déjà `Role.requiertMfa` par rôle, data-driven (Phase 2). Pas une divergence contradictoire — la maquette simplifie pour la démo — mais confirmation que rien de cette liste ne doit être recopié.

### Taux TSC/TVA et bases de calcul (`CONFIG.taxes`)
La maquette code en dur les taux (TSC 3 %, TVA 18 %) et le choix d'assiette (HT vs HT+TSC). Le serveur porte déjà ces valeurs dans `PARAMETRE_CALCUL`, admin-configurable par circuit (Phase 5). Le composant `CalcConfigView` (`screens3.jsx`) peut servir de référence visuelle pour l'écran d'administration correspondant, à condition de lire/écrire les valeurs réelles via l'API, jamais une constante.

### Libellé de l'étape 2 du fil d'authentification — « 2FA » (maquette) vs « MFA » (réel)
`docs/design/screens_auth.jsx:159` libelle la seconde étape du fil `StepPip` « 2FA ». `LoginScreen.tsx` affiche « MFA ». **Gardé volontairement tel quel** : le mécanisme réel couvre DUO **et** TOTP (`MfaPort`, D3), « MFA » (authentification multifacteur) est le terme exact et déjà utilisé partout ailleurs dans le code et la documentation (`requiresMfa`, `MFA_INDISPONIBLE`, `requiertMfa`) ; « 2FA » est un raccourci de la maquette qui n'introduirait aucune précision supplémentaire. Différence de libellé assumée, pas une question ouverte.

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

## Fonctionnalité spécifiée ET maquettée, non construite à l'écran

Catégorie distincte des autres sections de ce fichier : celles-ci comparent la maquette au PRD. Ici les deux sont **alignés** — c'est l'écran réellement construit (`apps/web`) qui diverge des deux à la fois. Consigné quand même dans ce fichier (pas seulement dans un compte-rendu de session, CLAUDE.md) parce que l'écart porte sur un **contrat d'interaction**, pas un détail de style : il se perdrait silencieusement s'il ne survivait que dans l'historique de conversation.

### Approbation — bouton simple, pas la revue champ par champ (Phase 9.2, `DossierDetailScreen`)

`PGD-055`/`SF-PGD-080`/`SF-PGD-081` (`docs/01_PRD_Consolide.md` lignes 90-91, `docs/04_UserStories_Realisation.md` ligne 212) exigent explicitement une **revue champ par champ** pour le valideur à l'approbation : chaque champ de la demande peut être marqué vu/corrigé, avec un commentaire complétable en aval. Ce n'est pas une lecture de la maquette — c'est écrit dans le PRD, `M · 8 pts`, story dédiée.

La maquette (`docs/design/screens2.jsx:600-691`, `ApproveModal`) implémente ce pattern intégralement : une liste des champs de la demande (`buildFieldRows`), chaque champ signalable en anomalie (bouton « Signaler », défaut = conforme), un commentaire obligatoire par anomalie signalée, un récapitulatif auto-généré, et une décision dérivée (`hasInvalid ? "rejete" : "approuve"`) envoyée en un seul payload `{ decision, commentaire, revue: [{champ, valeur, verdict, commentaire}] }`.

**Le backend réel supporte déjà ce pattern** — ce n'est pas un gap serveur. `approuverRequeteSchema` (`packages/contracts/src/tache.ts`) porte `revue?: RevueChamp[]`, et `RevueChamp = {champ, vu: boolean, correction?: string}` (forme réelle, à ne pas confondre avec `{champ, valeur, verdict, commentaire}` de la maquette — vocabulaire différent, `vu`/`correction` plutôt que `verdict`/`commentaire`, à respecter si cette UI est construite un jour). L'écran construit (`TacheActionBanner.tsx`) appelle `approuverTache(tache.id, {})` — `revue` toujours omis, jamais peuplé. Purement un manque côté `apps/web`, pas une limite d'API.

**Différence structurelle supplémentaire, pas seulement l'absence de la revue** : la maquette fusionne approbation et rejet en une seule modale dont la décision est dérivée des champs signalés. Le contrat réel garde deux routes séparées (`POST /api/taches/{id}/approuver`, `POST /api/taches/{id}/rejeter`, motif obligatoire pour ce dernier) — l'écran construit respecte déjà cette séparation (deux actions distinctes dans `TacheActionBanner`). Construire cette UI un jour ne veut donc pas dire porter `ApproveModal` tel quel : la revue champ par champ doit alimenter l'action Approuver existante, pas fusionner les deux décisions.

## Audit de fidélité visuelle systématique (Phase 9.3)

Contrairement aux sections précédentes (maquette vs PRD, ou écran construit vs les deux), cette section documente un audit **capture d'écran contre capture d'écran**, bloc par bloc, entre `docs/design/` rendu tel quel (harnais statique, aucun bundler) et `apps/web` réellement en exécution — une vérification par `getComputedStyle` seule ne peut pas détecter l'**absence** d'un élément (elle ne peut interroger que des éléments déjà sélectionnés), d'où la nécessité d'une comparaison visuelle directe pour ce type de défaut. Portée par le principe désormais contraignant : les choix visuels de la maquette (mise en page, iconographie, couleurs) valident au même titre que les règles métier, sauf exception listée en tête de ce fichier.

### LoginScreen — écarts corrigés

| Élément | Maquette | Réalisation (avant) | Catégorie | Action |
|---|---|---|---|---|
| Illustration du panneau sombre (`PlatformIllustration`) | Présente (SVG carte + badges de statut) | Absente | Défaut d'implémentation | Corrigé — SVG porté fidèlement depuis `screens_auth.jsx` |
| Liste de 3 fonctionnalités (saisie/routage, corbeilles, traçabilité) | Présente | Absente | Défaut d'implémentation | Corrigé — bloc ajouté avec icônes `edit`/`inbox`/`shield` |
| Couleur du bouton « Continuer » | Orange (`bg-orange`), texte noir | Noir (`bg-encre`), texte blanc | Défaut d'implémentation | Corrigé — alignée sur la convention CTA déjà en vigueur ailleurs dans l'app |
| Couleur de l'étape active du fil d'authentification (`StepPip`) | Orange, texte noir | Noir/encre, texte blanc | Défaut d'implémentation, trouvé en comparaison écran-à-écran (absent du calibrage initial) | Corrigé — `bg-orange text-noir` |
| Icônes décoratives dans les champs (personne dans Identifiant AD, cadenas dans Mot de passe et Code TOTP) + suffixe fixe `@orange.ci` | Présentes | Absentes (champs texte nus) | Défaut d'implémentation, trouvé en comparaison écran-à-écran | Corrigé — icônes positionnées en absolu, suffixe visuel ; l'état interne reste un identifiant complet (`identifiantAd: string`), la concaténation `${local}@orange.ci` n'a lieu qu'au moment de l'appel API, aucune structure de données modifiée |
| Icône avant « Connexion » (`IconBadge`, icône `user`) | Présente | **Présente à l'identique** — le calibrage initial la signalait absente, corrigé après capture d'écran directe | Non-défaut (désaccord assumé avec le calibrage initial) | Aucune action |
| « Comptes de démonstration » | Présent | Absent | Catégorie 2 (aucune contrepartie serveur — pas de résolution de compte de démo côté API) | Aucune action, décision déjà actée |
| Texte du pied de page (« MVP — authentification AD/LDAP & 2FA simulées ») | Présent | Remplacé par un texte factuel (« Authentification Active Directory + MFA (DUO / TOTP) ») | Catégorie 4 (la maquette décrit son propre état de prototype, faux une fois porté) | Aucune action, décision déjà actée |
| Style de la bannière d'erreur | Fond rosé, bordure rouge, icône alerte | Identique | Non-défaut | Aucune action — message différent car contexte différent (échec LDAP réel vs identifiant de démo inconnu), pas un défaut de style |

Vérifié en direct après correction (Playwright, capture réelle de `http://localhost:3001/login` servi par le conteneur `web`) : illustration, liste de fonctionnalités, bouton orange (état activé) et icônes de champ rendent tous à l'identique de la maquette ; une tentative de connexion réelle avec un identifiant saisi sans domaine (`jean.kouassi` → concaténé en `jean.kouassi@orange.ci`) atteint bien le serveur et reçoit un vrai `401`/« Identifiants invalides. », confirmant que la concaténation ne casse pas le flux réel.

**Incident rencontré pendant la vérification, pas spécifique à cet écran** : le conteneur `web` (dev, `next dev` avec bind-mount `.:/repo`) n'a pas détecté certains changements de fichier via son file-watcher malgré un bind-mount à jour (mtime et contenu confirmés identiques hôte/conteneur) — plusieurs éditions consécutives n'ont déclenché qu'une recompilation partielle. `docker compose restart web` a suffi à forcer une recompilation propre à chaque fois. Symptôme distinct des incidents `EACCES`/symlink déjà documentés plus haut dans CLAUDE.md (aucune erreur, juste une non-détection de changement) — à surveiller si ça se reproduit sur les écrans suivants de cet audit.

## Point d'attention transverse — masquage de bouton par rôle

La maquette peut masquer ou désactiver des boutons selon le rôle courant (ex. `defaultRouteFor`, conditions d'affichage dans les écrans de corbeille/admin). **Si portée, cette logique est un confort d'affichage, jamais un contrôle d'accès** : le serveur reste seul juge de ce qu'un appel peut effectivement faire, exactement comme rappelé règle non négociable 2 de CLAUDE.md (« un contrôle côté client est un confort, jamais une garantie »). Un bouton visible dont l'action est refusée côté serveur est un comportement normal, pas un bug à corriger en assouplissant l'API.
