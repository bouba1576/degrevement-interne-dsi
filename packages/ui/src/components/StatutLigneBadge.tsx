import type { EnumStatutLigne } from "@pgd/contracts";
import { statutLigne } from "../../tokens/semantic";
import { stylePilule } from "./stylePilule";

// Affichage exigé par PGD-081/PGD-024 (R15, R20) — absent de toute la
// maquette (docs/design/DIVERGENCES.md, « Spécifié, absent de la maquette »).
// Construit d'après le modèle réel (`Ligne.statut`/`DemandeLigne.statutLigne`),
// pas d'après un exemple visuel. Couleur : cf. semantic.ts (`statutLigne`) —
// décision de design assumée, sans source, documentée séparément.
const LIBELLE: Record<EnumStatutLigne, string> = {
  ACTIF: "Actif",
  SUSPENDU: "Suspendu",
  RESILIE: "Résilié"
};

export interface StatutLigneBadgeProps {
  statut: EnumStatutLigne;
  compact?: boolean;
}

export function StatutLigneBadge({ statut, compact }: StatutLigneBadgeProps) {
  const cle = statut === "ACTIF" ? "actif" : statut === "SUSPENDU" ? "suspendu" : "resilie";
  const { className, style } = stylePilule(statutLigne[cle], compact ? "compacte" : "normale");
  return (
    <span className={className} style={style}>
      <span className="w-2 h-2 rounded-full" style={{ background: "currentColor" }} />
      {LIBELLE[statut]}
    </span>
  );
}
