export interface MoneyProps {
  valeur: number | null | undefined;
  fort?: boolean;
  className?: string;
}

// Port de docs/design/ui.jsx (Money) + engine.jsx (fmtMoney). Formatage
// d'AFFICHAGE uniquement (Intl.NumberFormat, arrondi visuel) — jamais un
// recalcul de montant : `valeur` arrive déjà agrégée côté serveur
// (MontantService, R17/R18, numeric(15,2)). Arrondir ici ne change que ce
// qui s'affiche, jamais ce qui est stocké ou envoyé.
function formaterMontant(valeur: number | null | undefined): string {
  if (valeur == null || Number.isNaN(valeur)) return "—";
  return `${new Intl.NumberFormat("fr-FR").format(Math.round(valeur))} FCFA`;
}

export function Money({ valeur, fort, className }: MoneyProps) {
  return (
    <span className={`font-mono ${fort ? "font-bold" : ""} ${className ?? ""}`}>{formaterMontant(valeur)}</span>
  );
}
