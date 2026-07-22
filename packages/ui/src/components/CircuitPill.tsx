import type { EnumCircuit } from "@pgd/contracts";
import { circuit } from "../../tokens/semantic";

export interface CircuitPillProps {
  code: EnumCircuit;
}

// Port de docs/design/ui.jsx (CircuitPill). Couleur depuis tokens/semantic.ts
// (circuit), déjà posé en Phase 9, étape 3. PAS de réutilisation de
// stylePilule() ici, contrairement à Badge/StatusBadge : docs/design/
// styles.css montre .pill-circuit avec border-radius: var(--radius) (4px,
// rectangle arrondi), pas 999px comme .badge — une forme réellement
// différente, pas seulement une source de couleur différente. Vérifié dans
// la feuille de style avant de réutiliser l'usine à pilules par réflexe.
export function CircuitPill({ code }: CircuitPillProps) {
  const { texte, fond } = circuit[code];
  return (
    <span className="inline-flex items-center rounded px-2 py-1 text-11 font-extrabold tracking-[.02em]" style={{ color: texte, background: fond }}>
      {code}
    </span>
  );
}
