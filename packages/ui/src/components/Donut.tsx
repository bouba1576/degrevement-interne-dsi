import { couleurs } from "../../tokens/primitives";

export interface DonutSegment {
  value: number;
  color: string;
}

export interface DonutProps {
  segments: DonutSegment[];
  taille?: number;
  total?: number;
  libelleTotal?: string;
}

// Port de docs/design/ui.jsx (Donut, SVG pur). La géométrie (rayon,
// circonférence, longueur d'arc par segment) est un calcul de RENDU, pas
// une agrégation métier : `segments`/`total` arrivent déjà calculés côté
// serveur (KpiEngineService), ce composant ne fait que les dessiner.
// `total` distinct de la somme des segments par choix explicite du port
// (comme la maquette) : un total peut légitimement différer de la somme
// affichée (segments partiels d'un ensemble plus large).
export function Donut({ segments, taille = 130, total, libelleTotal = "dossiers" }: DonutProps) {
  const somme = total ?? segments.reduce((acc, s) => acc + s.value, 0) ?? 1;
  const rayon = taille / 2 - 14;
  const centre = taille / 2;
  const circonference = 2 * Math.PI * rayon;
  let decalage = 0;

  return (
    <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`}>
      <circle cx={centre} cy={centre} r={rayon} fill="none" stroke={couleurs.gris100} strokeWidth={16} />
      {segments.map((s, i) => {
        const fraction = s.value / (somme || 1);
        const longueur = fraction * circonference;
        const cercle = (
          <circle
            key={i}
            cx={centre}
            cy={centre}
            r={rayon}
            fill="none"
            stroke={s.color}
            strokeWidth={16}
            strokeDasharray={`${longueur} ${circonference - longueur}`}
            strokeDashoffset={-decalage}
            transform={`rotate(-90 ${centre} ${centre})`}
            strokeLinecap="butt"
          />
        );
        decalage += longueur;
        return cercle;
      })}
      <text x={centre} y={centre - 2} textAnchor="middle" fontSize={22} fontWeight={800} fill={couleurs.encre}>
        {somme}
      </text>
      <text x={centre} y={centre + 15} textAnchor="middle" fontSize={10} fill={couleurs.gris600}>
        {libelleTotal}
      </text>
    </svg>
  );
}
