import type { ReactNode } from "react";
import { Icon } from "./Icon";
import type { NomIcone } from "../icons";

export interface EmptyProps {
  icone?: NomIcone;
  titre: string;
  children?: ReactNode;
}

// Port de docs/design/ui.jsx (Empty state). py-15/px-5 (60px/20px) et
// mb-3.5 (14px) : valeurs réutilisées au sens normal ici mais jamais
// ailleurs (recherche dédiée, 1 seule occurrence chacune dans styles.css)
// — vérifiées comme atteignables directement via l'échelle dynamique déjà
// épinglée (--spacing: 4px, Phase 9.1bis), sans palier nommé supplémentaire
// à ajouter : 15 et 5 sont des multiples entiers de 4px, 3.5 fait partie
// des clés fractionnaires standard de Tailwind.
export function Empty({ icone = "inbox", titre, children }: EmptyProps) {
  return (
    <div className="px-5 py-15 text-center text-gris500">
      <div className="mb-3.5 opacity-50">
        <Icon nom={icone} taille={44} />
      </div>
      <h4 className="mb-1 text-15 text-gris700">{titre}</h4>
      {children && <div>{children}</div>}
    </div>
  );
}
