import type { CSSProperties } from "react";

export interface PairesTexteFond {
  texte: string;
  fond: string;
}

export interface StylePilule {
  className: string;
  style: CSSProperties;
}

export type TaillePilule = "normale" | "compacte";

// Chrome visuel partagé par tous les badges en forme de pilule (Badge,
// StatusBadge, et plus tard TypeActeurBadge/CircuitPill — même forme dans la
// maquette, .badge/.pill-circuit). Structure (espacement/rayon/taille de
// texte) en classes Tailwind réelles, jamais une valeur arbitraire : tout
// vient de l'échelle consolidée (Phase 9, étape 3bis) ou, pour ce qui
// coïncide déjà avec l'échelle par défaut de Tailwind (gap-1.5, px-2.5,
// py-1, rounded-full), des utilitaires standard. Couleur = seule propriété
// dynamique par instance, reste en style inline (le JIT Tailwind ne peut pas
// voir un nom de classe interpolé à l'exécution).
//
// `.badge` (styles.css) a un font-size source de 11.5px, PAS 11px — mappé au
// palier 12px par la consolidation déjà validée (11.5→12, Δ+0.5) : c'est la
// taille « normale » ci-dessous. La variante « compacte » (StatusBadge en
// mode `sm`) code en dur dans la maquette `fontSize:11, padding:"2px 7px"`,
// déjà littéralement sur la grille consolidée (11px exact, 2→4px, 7→8px) —
// une taille RÉELLEMENT différente, pas la même mal recopiée deux fois.
const CLASSES_PAR_TAILLE: Record<TaillePilule, string> = {
  normale: "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-12 font-bold whitespace-nowrap",
  compacte: "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-11 font-bold whitespace-nowrap"
};

export function stylePilule({ texte, fond }: PairesTexteFond, taille: TaillePilule = "normale"): StylePilule {
  return {
    className: CLASSES_PAR_TAILLE[taille],
    style: { color: texte, background: fond }
  };
}
