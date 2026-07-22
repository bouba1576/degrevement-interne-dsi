import type { CSSProperties } from "react";
import { ICONES, type NomIcone } from "../icons";

export interface IconProps {
  nom: NomIcone;
  taille?: number;
  couleur?: string;
  epaisseurTrait?: number;
  className?: string;
  style?: CSSProperties;
}

// Port de docs/design/ui.jsx (Icon) — glyphes en trait, aucune décision
// métier. `couleur` par défaut à `currentColor` : l'icône hérite la couleur
// de texte du contexte qui l'entoure (déjà résolue depuis la couche
// sémantique par ce contexte), jamais une teinte fixée ici.
export function Icon({ nom, taille = 18, couleur, epaisseurTrait = 2, className, style }: IconProps) {
  const trace = ICONES[nom];
  const segments = trace.split("M").filter(Boolean);
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke={couleur ?? "currentColor"}
      strokeWidth={epaisseurTrait}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      role="img"
      aria-hidden="true"
    >
      {segments.map((segment, index) => (
        <path key={index} d={"M" + segment} />
      ))}
    </svg>
  );
}
