import { couleurs } from "../../tokens/primitives";

export interface BarChartDonnee {
  label: string;
  value: number;
  color?: string;
}

export interface BarChartProps {
  donnees: BarChartDonnee[];
  formater?: (valeur: number) => string;
}

// Port de docs/design/ui.jsx (BarChart). Le calcul de hauteur relative
// (valeur / max) est un calcul d'ÉCHELLE VISUELLE, pas une agrégation
// métier : les valeurs arrivent déjà calculées (KpiEngineService côté
// serveur), ce composant ne fait que les mettre à l'échelle d'un
// conteneur pixel. Dimensions du conteneur/des colonnes (hauteur 150px,
// largeur max 46px, rayon 3px, transition .5s) : valeurs à usage unique
// dans la maquette (recherche dédiée sur .bars .col-fill, aucune autre
// occurrence) — arbitraires par choix assumé, comme max-w-[520px] sur
// Modal, pas des paliers à extraire.
export function BarChart({ donnees, formater }: BarChartProps) {
  const max = Math.max(...donnees.map((d) => d.value), 1);
  return (
    <div className="flex h-[150px] items-end gap-2.5">
      {donnees.map((d, i) => (
        <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
          <span className="text-11 font-bold">{formater ? formater(d.value) : d.value}</span>
          <div
            className="w-full min-h-[2px] max-w-[46px] rounded-t-[3px] transition-[height] duration-500"
            style={{ height: `${(d.value / max) * 100}%`, background: d.color ?? couleurs.orange }}
          />
          <span className="text-11 font-semibold text-gris600">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
