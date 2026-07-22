// Couche sémantique — seule couche consommée par les composants de
// packages/ui (règle posée en Phase 9, étape 3). Chaque groupe référence la
// palette primitive (./primitives.ts), jamais une teinte brute directement.
//
// Portée : ce que la maquette (docs/design/) colore RÉELLEMENT, SAUF
// `statutLigne` ci-dessous — voir son commentaire dédié. L'état SI
// (EN_ATTENTE/ENVOYE/CONFIRME/ERREUR) reste un manque non comblé : la
// maquette le collapse à un simple booléen, aucune palette à 4 états à en
// extraire ni à inventer ici.
import { couleurs } from "./primitives";

// Statut de la demande (dossier) — engine.jsx STATUTS + classes .b-*.
// `abandonne` partage la teinte de `brouillon` dans la maquette (les deux
// utilisent b-grey) : reproduit tel quel, pas une simplification de ma part.
export const statutDemande = {
  brouillon: { texte: couleurs.gris700, fond: couleurs.gris100 },
  soumis: { texte: couleurs.bleu700, fond: couleurs.bleuFond },
  enCours: { texte: couleurs.orangeTexteSurClair, fond: couleurs.orange50 }, // corrigé (accessibilité), cf. primitives.ts
  valide: { texte: couleurs.vertTexteSurClair, fond: couleurs.vertFond }, // corrigé (accessibilité)
  rejete: { texte: couleurs.rouge700, fond: couleurs.rougeFond },
  abandonne: { texte: couleurs.gris700, fond: couleurs.gris100 }
} as const;

// État d'une tâche dans la chaîne de validation (WorkflowStepper, ui.jsx).
// « termine » couvre APPROUVEE, VERIFIEE et ESCALADEE — la maquette ne les
// distingue PAS visuellement (même classe .step-dot.done pour les trois) :
// reproduit à l'identique, ne pas inventer une distinction que la source n'a
// pas.
export const etatTache = {
  attente: { texte: couleurs.gris600, fond: couleurs.blanc, bordure: couleurs.gris300 },
  enCours: { texte: couleurs.noir, fond: couleurs.orange, bordure: couleurs.orange },
  termine: { texte: couleurs.blanc, fond: couleurs.vert, bordure: couleurs.vert },
  rejete: { texte: couleurs.blanc, fond: couleurs.rouge, bordure: couleurs.rouge }
} as const;

// Urgence SLA (SlaTimer, ui.jsx) — trois paliers : normal / alerte (< 4h
// restantes) / dépassé. `normal` réutilise la correction d'accessibilité du
// vert (cf. primitives.ts), la maquette utilisant `vert700` (échec WCAG) au
// même endroit.
export const urgenceSla = {
  normal: { texte: couleurs.vertTexteSurClair, fond: couleurs.vertFond },
  alerte: { texte: couleurs.jaune700, fond: couleurs.jauneFond },
  depasse: { texte: couleurs.rouge700, fond: couleurs.rougeFond }
} as const;

// Type d'acteur sur une étape (V/A/C) — TypeActeurBadge, ui.jsx.
export const typeActeur = {
  V: { texte: couleurs.bleu700, fond: couleurs.bleuFond, libelle: "Vérification" },
  A: { texte: couleurs.orangeTexteSurClair, fond: couleurs.orange50, libelle: "Validation" }, // corrigé (accessibilité)
  C: { texte: couleurs.violetTexte, fond: couleurs.violetFond, libelle: "Contrôle" }
} as const;

// Tons de badge génériques (Badge, ui.jsx — classes .b-grey/.b-green/.b-red/
// .b-yellow/.b-blue/.b-orange/.b-purple/.b-black). Distinct des familles
// ci-dessus : celles-ci ont un sens métier FIXE (un statut de demande est
// toujours affiché de la même façon), alors que `Badge` est un composant
// générique librement choisi par l'appelant pour des usages ad hoc (« SLA
// dépassé », « 3 validé(s) »...) qui ne correspondent pas toujours à une
// des familles métier ci-dessus. Port 1:1 des 8 classes .b-*, à travers des
// noms de ton plutôt que des noms de couleur brute.
export const tonBadge = {
  neutre: { texte: couleurs.gris700, fond: couleurs.gris100 }, // b-grey
  succes: { texte: couleurs.vertTexteSurClair, fond: couleurs.vertFond }, // b-green, corrigé (accessibilité)
  erreur: { texte: couleurs.rouge700, fond: couleurs.rougeFond }, // b-red
  alerte: { texte: couleurs.jaune700, fond: couleurs.jauneFond }, // b-yellow
  info: { texte: couleurs.bleu700, fond: couleurs.bleuFond }, // b-blue
  accent: { texte: couleurs.orangeTexteSurClair, fond: couleurs.orange50 }, // b-orange, corrigé (accessibilité)
  special: { texte: couleurs.violetTexte, fond: couleurs.violetFond }, // b-purple
  fort: { texte: couleurs.blanc, fond: couleurs.gris900 } // b-black
} as const;

// Pastille de circuit (CircuitPill, ui.jsx).
export const circuit = {
  DOBB: { texte: couleurs.orangeTexteSurClair, fond: couleurs.orange100 },
  DXC: { texte: couleurs.bleu700, fond: couleurs.bleuFond },
  DF: { texte: couleurs.violetTexte, fond: couleurs.violetFond }
} as const;

// Statut de ligne (ACTIF/SUSPENDU/RESILIE, R15) — DÉCISION DE DESIGN ASSUMÉE,
// SANS SOURCE DANS LA MAQUETTE. docs/design/ ne colore le statut de ligne
// nulle part (recherche dédiée, négative) : la mention « fait foi » dans
// CLAUDE.md était une erreur de rédaction, corrigée. Vert/jaune/rouge choisis
// par cohérence avec les autres familles sémantiques de ce fichier, pas
// extraits — voir docs/design/DIVERGENCES.md.
// `suspendu` réutilise jaune700/jauneFond déjà présents (4,55:1, passe WCAG
// AA sans correction — vérifié avant de le retenir, cf. compte-rendu).
export const statutLigne = {
  actif: { texte: couleurs.vertTexteSurClair, fond: couleurs.vertFond },
  suspendu: { texte: couleurs.jaune700, fond: couleurs.jauneFond },
  resilie: { texte: couleurs.rouge700, fond: couleurs.rougeFond }
} as const;

// Anneau de focus clavier — distinct du survol souris (:focus-visible, pas
// :hover ni :focus). Comble un manque réel : la maquette ne définit un focus
// visible que sur les champs de saisie, rien sur boutons/nav/onglets — sur
// une application traitée au clavier toute la journée, ce n'est pas
// acceptable de laisser ouvert (contrairement au statut de ligne ci-dessus,
// ce n'est pas une décision de design contestable).
// Couleur volontairement DIFFÉRENTE de `couleurs.orange` (la base de la
// maquette) : `orange` échoue le contraste non-textuel WCAG 1.4.11 (≥3:1)
// sur fond clair (2,63:1 sur blanc, 2,48:1 sur gris50) — un anneau invisible
// n'est pas un anneau. `orange600`, déjà dans la palette (10 occurrences,
// c'est la teinte de survol des boutons primaires), passe partout : 3,20:1
// sur blanc, 3,01:1 sur gris50, 6,57:1 sur noir (sidebar). Même famille de
// couleur que demandé, teinte plus foncée par nécessité de contraste — pas
// une couleur inventée.
export const focusVisible = {
  couleur: couleurs.orange600,
  epaisseur: "2px",
  decalage: "2px"
} as const;
