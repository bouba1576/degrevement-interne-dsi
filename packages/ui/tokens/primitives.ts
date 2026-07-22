// Palette primitive — extraite de docs/design/styles.css (Phase 9.0, étape 3).
// Ne JAMAIS consommer ces valeurs directement dans un composant : elles
// n'ont aucun sens métier. Seule la couche sémantique (./semantic.ts) est
// consommée par packages/ui. Chaque valeur ci-dessous n'existe que parce
// qu'elle est réutilisée au moins deux fois dans la maquette — voir le
// compte-rendu d'extraction pour le détail des occurrences par valeur.
//
// Deux valeurs ont été CORRIGÉES pour l'accessibilité (WCAG AA) par rapport
// à la maquette d'origine — voir docs/design/DIVERGENCES.md pour le détail
// (valeur d'origine, valeur retenue, ratio mesuré) :
//   - orangeTexteSurClair : la maquette utilise `orange600` (2,93:1, échec)
//     pour le texte des badges `b-orange` ; `orangeTexteSurClair` (5,74:1)
//     est la valeur que la maquette elle-même utilise déjà ailleurs
//     (alerte orange, pastille circuit DOBB) pour EXACTEMENT le même usage —
//     correction par cohérence interne, pas une invention.
//   - vertTexteSurClair : la maquette utilise `vert700` (3,74:1, échec en
//     texte normal) ; valeur assombrie pour atteindre 4,5:1.
export const couleurs = {
  // Marque
  orange: "#FF7900", // 29 occurrences
  orange600: "#E96B00", // 10
  orange50: "#FFF3E8", // 14
  orange100: "#FFE3C7", // 2
  orangeTexteSurClair: "#9a4a00", // 3 occurrences dans la maquette (alert-orange, pill-circuit DOBB, lock-banner) — jamais promu en variable CSS par la maquette elle-même

  // Neutres
  noir: "#000000", // 5 var() + 7 littéraux `#000`
  blanc: "#ffffff", // jamais référencé via var() dans la maquette (0), mais valeur réutilisée 54+ fois en littéral `#fff` — extraction malgré l'absence de var(), la réutilisation massive l'exige
  encre: "#0a0a0a", // 8
  gris900: "#141414", // 6
  gris800: "#242424", // 4
  gris700: "#595959", // 9
  gris600: "#767676", // 25
  gris500: "#999999", // 13 — PRIMITIVE UNIQUEMENT, ne jamais l'utiliser pour du texte sur fond clair (échec WCAG, cf. semantic.ts)
  gris400: "#b3b3b3", // 9 — PRIMITIVE UNIQUEMENT, même réserve que gris500
  gris300: "#cccccc", // 15
  gris200: "#e0e0e0", // 33
  gris100: "#eeeeee", // 16
  gris75: "#f3f3f3", // 2
  gris50: "#f8f8f8", // 26

  // Fonctionnelles
  vert: "#32C832", // 12
  vertFond: "#E7F8E7", // 6
  vert700: "#23901f", // 6 — PRIMITIVE UNIQUEMENT, échec WCAG en texte (cf. vertTexteSurClair)
  vertTexteSurClair: "#148110", // corrigé (accessibilité) — voir en-tête de fichier
  rouge: "#CD3C14", // 11
  rougeFond: "#FCEBE6", // 5
  rouge700: "#a52f0f", // 5
  jaune: "#FFCC00", // 1 (définition + 1 usage réel — faible confiance, conservé car présent dans les états switch/toggle)
  jauneFond: "#FFF6D6", // 1 (idem)
  jaune700: "#8a6d00", // 1 (idem)
  bleu: "#4BB4E6", // 4
  bleuFond: "#E7F4FB", // 4
  bleu700: "#1a6f99", // 4
  violet: "#A885D8", // 2
  violetFond: "#F1ECF9", // 3
  violetTexte: "#6b3fa0" // 2 occurrences en littéral (pill-circuit DF, badge violet) — jamais promu en variable CSS par la maquette
} as const;

export const rayons = {
  r1: "4px", // --radius, 10 occurrences
  r2: "6px", // --radius-lg, 9 + 3 littéraux
  r3: "8px", // 6 occurrences littérales
  r4: "9px", // 2
  r5: "10px", // 6
  pilule: "999px" // 9
} as const;

export const ombres = {
  sm: "0 1px 2px rgba(0,0,0,.06)", // 1 occurrence
  base: "0 2px 8px rgba(0,0,0,.08)", // définie dans :root mais 0 usage via var() dans ce fichier — conservée : fait partie d'une échelle d'élévation à 3 paliers manifestement intentionnelle (sm/base/lg), pas une valeur orpheline à écarter
  lg: "0 12px 40px rgba(0,0,0,.18)" // 3
} as const;

// Échelle typographique — CONSOLIDÉE (validée explicitement, Phase 9, étape
// 3bis ; corrigée en Phase 9.1bis, voir NOTE plus bas). La maquette porte
// 12 paliers bruts entre 10px et 17px (accrétion organique, pas une échelle
// voulue) ; ramenée à 7 paliers, écart maximal 1px.
// Mapping (valeur d'origine → palier retenu, occurrences dans la maquette) :
//   10px→10px (2, Δ0) · 10.5px→11px (2, Δ+0.5) · 11px→11px (16, Δ0)
//   11.5px→12px (6, Δ+0.5) · 12px→12px (14, Δ0) · 12.5px→13px (9, Δ+0.5)
//   13px→13px (12, Δ0) · 13.5px→14px (9, Δ+0.5) · 14px→14px (3, Δ0)
//   15px→15px (4, Δ0) · 17px→17px (3, Δ0)
// Choix conscient, pas un effet de bord : les quatre arrondis de demi-pixel
// vont systématiquement vers le HAUT (10.5→11, 11.5→12, 12.5→13, 13.5→14),
// soit 26 occurrences au total très légèrement agrandies. Sans conséquence
// visuelle à 0,5px près ; l'alternative (arrondir vers le bas) aurait réduit
// la lisibilité, jamais l'inverse.
// NOTE (Phase 9.1bis) — cette ligne disait auparavant « 15px→14px (4, Δ−1) »
// et le paragraphe suivant déclarait l'écart 14→17 volontaire. Les deux
// affirmations étaient fausses : la conclusion « intentionnel » n'a pas été
// invalidée par relecture, mais en construisant Empty et en découvrant que
// .empty h4 (15px) n'avait nulle part où se ranger proprement — t15 comble
// exactement ce vide avec les 4 mêmes occurrences déjà comptées ici, elles
// n'ont simplement jamais été vérifiées en usage réel avant ce moment.
// Aucun composant déjà construit ne consommait le chemin 15px→14px (vérifié :
// seul WorkflowStepper utilise text-14, sourcé de 13.5px — .step-body .t —
// donc rien à corriger dans le code, seule cette note l'était).
// POINT DE VIGILANCE (à surveiller au rendu des écrans, pas une action ici) :
// t10/t11 sont les paliers où les corrections de contraste comptent le plus.
// Un gris secondaire à 4,5:1 passe l'exigence WCAG AA pour du texte courant,
// mais à 10-11px l'exigence pratique de lisibilité est plus stricte que la
// norme — vérifier à l'usage si `gris600`/`vertTexteSurClair`/etc. appliqués
// à ces tailles restent confortables, pas seulement conformes.
export const taillesTexte = {
  t10: "10px",
  t11: "11px",
  t12: "12px",
  t13: "13px",
  t14: "14px",
  // t15 trouvé manquant en construisant Empty (Phase 9.1bis, lot Avatar/
  // Money/Field/Empty/BarChart/Donut/CircuitPill/TypeActeurBadge) — comble
  // exactement le vide « 14 → 17 sans palier intermédiaire » déclaré
  // volontaire lors de la consolidation initiale (Phase 9, étape 3bis).
  // Ce n'était pas un vide réel : 15px apparaît 4 fois dans styles.css
  // (.btn-lg, .kpi .value small, .empty h4, .masse-restit b) — mon grep de
  // consolidation avait balayé les classes des 6 composants déjà construits,
  // jamais l'ensemble de la feuille de style. Quatrième gap méthodologique
  // de la même famille que empilement/tailleConteneur/t18, trouvé de la
  // même façon (en construisant le composant suivant), pas anticipé.
  t15: "15px",
  t17: "17px",
  // t18 trouvé manquant en construisant SlaTimer (Phase 9.1) — troisième
  // gap méthodologique de la même nature que empilement/tailleConteneur,
  // mais d'une origine différente : mon extraction ne balayait QUE
  // styles.css, jamais les styles en ligne (`style={{...}}`) écrits
  // directement dans les fichiers .jsx. `fontSize: 18` apparaît 2 fois en
  // ligne (SlaTimer, screens1.jsx — montant TTC mis en avant) — réutilisé
  // au sens normal, simplement invisible à un grep limité à la feuille CSS.
  t18: "18px"
} as const;

// Échelle d'espacement — CONSOLIDÉE (validée explicitement, Phase 9, étape
// 3bis). 18 paliers bruts ramenés à 8, écart maximal 2px, les deux valeurs
// les plus fréquentes de la maquette (10px, 21 occurrences ; 12px, 18
// occurrences) restent inchangées.
// Mapping (valeur d'origine → palier retenu, occurrences, écart) :
//   2px→4px (3, Δ+2) · 3px→4px (3, Δ+1) · 4px→4px (4, Δ0) · 5px→4px (7, Δ−1)
//   6px→6px (10, Δ0) · 7px→8px (2, Δ+1) · 8px→8px (14, Δ0) · 9px→10px (6, Δ+1)
//   10px→10px (21, Δ0) · 11px→12px (7, Δ+1) · 12px→12px (18, Δ0)
//   13px→12px (4, Δ−1) · 14px→16px (10, Δ+2) · 16px→16px (9, Δ0)
//   18px→20px (6, Δ+2) · 20px→20px (3, Δ0) · 22px→24px (2, Δ+2) · 24px→24px (2, Δ0)
export const espacements = {
  e4: "4px",
  e6: "6px",
  e8: "8px",
  e10: "10px",
  e12: "12px",
  e16: "16px",
  e20: "20px",
  e24: "24px",
  // e26 trouvé manquant en construisant la coquille applicative (Sidebar/
  // Topbar, Phase 9.2) — cinquième gap méthodologique de la même famille que
  // empilement/tailleConteneur/t18/t15 : mon extraction initiale (Phase 9,
  // étape 3bis) ne balayait que les classes des composants alors identifiés
  // dans ui.jsx, jamais .topbar/.content dans app.jsx/styles.css. 26px
  // apparaît 2 fois (`.topbar` padding horizontal, `.content` padding) —
  // réutilisé au sens normal de la règle du seuil, simplement hors du
  // périmètre balayé la première fois.
  e26: "26px"
} as const;

export const durees = {
  rapide: ".1s", // 2
  base: ".12s", // 18 — dominante
  moyenne: ".13s", // 3
  lente: ".15s" // 5
} as const;

export const pointsDeRupture = {
  compact: "1100px" // 2 occurrences réelles (deux media queries distinctes)
} as const;

// Conteneurs carrés (icônes, avatars) — trouvé manquant en construisant
// Modal (Phase 9.1) : mon extraction initiale ne balayait que padding/
// margin/gap, jamais width/height. Contrairement à l'empilement ci-dessous,
// ce N'EST PAS une exception à la règle du seuil — 34px et 38px sont
// réutilisés au sens normal (7 et 4 occurrences), la règle s'applique sans
// aménagement, j'ai simplement mal balayé la source la première fois.
export const tailleConteneur = {
  s34: "34px", // iconbtn (Modal), pd-proc pdp-ic, vstage-dot — 7 occurrences
  s38: "38px" // brand-mark, circuit-card cc-ic — 4 occurrences
} as const;

// Empilement (z-index) — trouvé manquant en construisant Modal (Phase 9.1),
// pas dans l'extraction initiale : la règle du seuil d'occurrence (rule 1)
// ne s'applique pas au z-index, qui n'a de sens que RELATIF aux autres
// paliers, jamais en répétition. Cinq paliers réels dans styles.css, chacun
// utilisé une seule fois par nature (topbar/sidebar/notif-dropdown/
// modal/toast ne se répètent jamais) — nommés par RÔLE, jamais par rang
// (`superposition`, pas `niveau4`) : insérer un palier intermédiaire ne doit
// jamais obliger à renuméroter les autres. N'ajouter un palier qu'à
// nécessité constatée en portant un composant, jamais par anticipation.
export const empilement = {
  entete: 20, // .topbar
  navigation: 30, // .sidebar
  notification: 50, // .notif-dropdown
  superposition: 100, // .overlay (Modal)
  alerteEphemere: 200 // .toast-wrap
} as const;

export const polices = {
  base: `"Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif`, // --font, 2 occurrences
  // Déclarée une seule fois dans styles.css, mais la classe utilitaire .mono
  // qu'elle alimente est appliquée dans de nombreux composants (Money,
  // références, montants tabulaires) — extraite malgré l'occurrence CSS
  // unique, l'usage réel étant bien supérieur à 1.
  mono: `"SF Mono", ui-monospace, "Roboto Mono", Menlo, monospace`
} as const;
