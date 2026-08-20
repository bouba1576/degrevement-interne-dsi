import type { ReactNode } from "react";
import { Icon } from "./Icon";
import type { NomIcone } from "../icons";

export interface CardProps {
  children: ReactNode;
  className?: string;
}

// Port de docs/design/styles.css:171-180 (.card/.card-head) — jamais
// construit comme composant partagé jusqu'ici : le motif « rounded-6 border
// border-gris200 bg-blanc » était recopié à la main dans 20 fichiers
// distincts d'apps/web, avec deux dérives trouvées en comparant précisément
// à la maquette : la bordure du bandeau d'en-tête utilisait `border-gris200`
// au lieu de `border-gris100` (.card-head, séparateur plus clair que le
// contour de la carte), et le padding du contenu utilisait `p-4` (16px) au
// lieu de `p-5` (20px, .card-pad — 15px d'origine consolidé à 16px pour
// l'en-tête, mais .card-pad est bien 20px, une valeur distincte).
// `.card` elle-même n'a aucun padding propre — Card reste un conteneur nu,
// le contenu (CardHeader ou un enfant quelconque) porte le sien.
export function Card({ children, className }: CardProps) {
  return <div className={"rounded-6 border border-gris200 bg-blanc" + (className ? " " + className : "")}>{children}</div>;
}

export interface CardHeaderProps {
  icone?: NomIcone;
  titre: string;
  action?: ReactNode;
}

// .card-head h3 { font-size: 14.5px } — consolidé à t14 (déjà l'usage réel
// dominant dans apps/web, cf. ApercuTab/CircuitTab/PiecesTab/AuditTab)
// plutôt que t15 (l'autre voisin à Δ0.5 égal) : aligner sur l'usage déjà
// massivement en place limite le risque de migration sans écart visuel
// perceptible à 0,5px.
export function CardHeader({ icone, titre, action }: CardHeaderProps) {
  return (
    <div className="flex items-center gap-3 border-b border-gris100 px-5 py-4">
      {icone && <Icon nom={icone} taille={17} className="shrink-0 text-gris700" />}
      <h3 className="flex-1 text-14 font-bold">{titre}</h3>
      {action}
    </div>
  );
}
