import type { ReactNode } from "react";
import { tonBadge } from "../../tokens/semantic";
import { stylePilule } from "./stylePilule";

export type TonBadge = keyof typeof tonBadge;

export interface BadgeProps {
  children: ReactNode;
  ton?: TonBadge;
  pastille?: boolean;
}

// Port de docs/design/ui.jsx (Badge) — composant générique librement choisi
// par l'appelant (cf. tokens/semantic.ts, commentaire de `tonBadge`).
// Structure en classes Tailwind réelles (cf. stylePilule.ts) ; couleur
// exclusivement via la couche sémantique, en style inline (seule propriété
// dynamique par instance) — aucune teinte brute, aucun hex, dans ce fichier.
export function Badge({ children, ton = "neutre", pastille }: BadgeProps) {
  const { className, style } = stylePilule(tonBadge[ton]);
  return (
    <span className={className} style={style}>
      {pastille && <span className="w-2 h-2 rounded-full" style={{ background: "currentColor" }} />}
      {children}
    </span>
  );
}
