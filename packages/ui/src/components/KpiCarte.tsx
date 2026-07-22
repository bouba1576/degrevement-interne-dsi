import type { ReactNode } from "react";
import { Icon } from "./Icon";
import type { NomIcone } from "../icons";

export interface KpiCarteProps {
  libelle: string;
  valeur: ReactNode;
  icone: NomIcone;
  couleur: string;
}

// Port de docs/design/screens1.jsx (KpiMini). `valeur` arrive déjà formatée
// par l'appelant (Money pour MONTANT, nombre brut pour VOLUME — aucun
// scalaire TAUX ne traverse ce composant, cf. KpiSection) : KpiCarte ne fait
// aucun calcul, il affiche ce qu'on lui donne.
export function KpiCarte({ libelle, valeur, icone, couleur }: KpiCarteProps) {
  return (
    <div className="relative overflow-hidden rounded-6 border border-gris200 bg-blanc p-5">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: couleur }} />
      <div className="flex items-center justify-between">
        <span className="text-12 font-semibold text-gris600">{libelle}</span>
        <Icon nom={icone} taille={16} couleur={couleur} />
      </div>
      <div className="mt-1.5 text-[30px] font-extrabold leading-none tracking-[-.02em]">{valeur}</div>
    </div>
  );
}
