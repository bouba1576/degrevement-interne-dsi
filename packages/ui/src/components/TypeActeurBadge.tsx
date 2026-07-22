import type { TypeActeurTache } from "./WorkflowStepper";
import { typeActeur } from "../../tokens/semantic";
import { stylePilule } from "./stylePilule";

export interface TypeActeurBadgeProps {
  type: TypeActeurTache;
}

// Port de docs/design/ui.jsx (TypeActeurBadge). Même forme que Badge/
// StatusBadge (.badge, rounded-full, cf. styles.css) — stylePilule()
// s'applique ici sans réserve, contrairement à CircuitPill. Extrait de
// WorkflowStepper.tsx, qui construisait cette même pilule en ligne (seconde
// consommation, donc extraction — même principe que stylePilule() en 9.1).
export function TypeActeurBadge({ type }: TypeActeurBadgeProps) {
  const pilule = stylePilule(typeActeur[type]);
  return (
    <span className={pilule.className} style={pilule.style}>
      {typeActeur[type].libelle}
    </span>
  );
}
