import type { ButtonHTMLAttributes } from "react";
import { Icon } from "./Icon";
import type { NomIcone } from "../icons";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "type"> {
  icone: NomIcone;
  taille?: number;
  ariaLabel: string;
}

// Port de docs/design/styles.css:213-217 (.iconbtn) — jamais construit
// comme composant partagé. `Modal.tsx` (bouton Fermer) réimplémentait déjà
// ce motif à la main, avec une dérive trouvée en comparant précisément à la
// maquette : `hover:text-noir` au lieu de `hover:text-encre` — `.iconbtn:
// hover { color: var(--ink) }`, et `--ink` correspond à la primitive
// `encre` (#0a0a0a), jamais `noir` (#000000, une primitive distincte,
// jamais utilisée pour du texte dans la maquette). Migré ici avec le
// correctif.
export function IconButton({ icone, taille = 15, ariaLabel, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className="grid h-34 w-34 place-items-center rounded border border-gris200 bg-blanc text-gris700 transition-colors hover:enabled:border-gris400 hover:enabled:text-encre disabled:cursor-not-allowed disabled:opacity-45"
      {...props}
    >
      <Icon nom={icone} taille={taille} />
    </button>
  );
}
