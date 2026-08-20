import type { ReactNode } from "react";

export interface ChipProps {
  actif?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

// Port de docs/design/styles.css:235-242 (.chip/.chip.active/.chip.clickable)
// — jamais construit comme composant partagé, contrairement à `Badge`
// (forme pilule voisine mais sémantique différente : Chip est un sélecteur/
// filtre cliquable, Badge un simple indicateur). `CorbeillesScreen` avait
// déjà reproduit `.chip.active` correctement à la main (noir, pas orange —
// vérifié en direct, DIVERGENCES.md) ; extrait ici pour que ce comportement
// devienne la référence partagée plutôt qu'une exactitude isolée à un seul
// écran.
export function Chip({ actif, onClick, children }: ChipProps) {
  const classes =
    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-12 font-semibold " +
    (actif ? "border-noir bg-noir text-blanc" : "border-gris200 bg-blanc text-gris700");

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes + " cursor-pointer hover:enabled:border-gris500"}>
        {children}
      </button>
    );
  }
  return <span className={classes}>{children}</span>;
}
