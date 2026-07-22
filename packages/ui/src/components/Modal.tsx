import { useEffect, type MouseEvent, type ReactNode } from "react";
import { Icon } from "./Icon";
import type { NomIcone } from "../icons";

export interface ModalProps {
  titre: string;
  icone?: NomIcone;
  onFermer?: () => void;
  children: ReactNode;
  pied?: ReactNode;
  large?: boolean;
}

// Port de docs/design/ui.jsx (Modal). Structure entièrement en classes
// Tailwind réelles (padding/gap/rayon/couleurs neutres — cf.
// tailwind.config.ts, palette primitive `couleurs` exposée sous ses propres
// noms, PAS le nuancier gris/noir/blanc par défaut de Tailwind qui a des
// valeurs différentes). `max-w-[520px]`/`[720px]` restent arbitraires par
// choix assumé : dimensions de contenu ponctuelles, pas des valeurs
// d'espacement réutilisables (cf. échange Phase 9.1). `z-superposition`
// vient de la famille d'empilement nommée par rôle (jamais par rang).
export function Modal({ titre, icone, onFermer, children, pied, large }: ModalProps) {
  useEffect(() => {
    const surEchap = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFermer?.();
    };
    window.addEventListener("keydown", surEchap);
    return () => window.removeEventListener("keydown", surEchap);
  }, [onFermer]);

  function arreterPropagation(e: MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
  }

  return (
    <div className="fixed inset-0 z-superposition grid place-items-center bg-noir/45 p-6" onClick={onFermer} role="presentation">
      <div
        className={`flex w-full max-h-[90vh] flex-col rounded-md bg-blanc shadow-lg ${large ? "max-w-[720px]" : "max-w-[520px]"}`}
        onClick={arreterPropagation}
        role="dialog"
        aria-modal="true"
        aria-label={titre}
      >
        <div className="flex items-center gap-3 border-b border-gris100 px-6 py-5">
          {icone && <Icon nom={icone} taille={20} />}
          <h3 className="text-17 font-bold">{titre}</h3>
          <div className="flex-1" />
          <button
            type="button"
            className="grid h-34 w-34 place-items-center rounded border border-gris200 bg-blanc text-gris700 hover:border-gris400 hover:text-noir"
            onClick={onFermer}
            aria-label="Fermer"
          >
            <Icon nom="x" taille={16} />
          </button>
        </div>
        <div className="overflow-y-auto p-6">{children}</div>
        {pied && <div className="flex justify-end gap-2.5 border-t border-gris100 px-6 py-4">{pied}</div>}
      </div>
    </div>
  );
}
