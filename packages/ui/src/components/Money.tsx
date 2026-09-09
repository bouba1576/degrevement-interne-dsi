export interface MoneyProps {
  valeur: number | null | undefined;
  fort?: boolean;
  className?: string;
}

// Port de docs/design/ui.jsx (Money) + engine.jsx (fmtMoney). Formatage
// d'AFFICHAGE uniquement (Intl.NumberFormat) — jamais un recalcul de
// montant : `valeur` arrive déjà agrégée côté serveur (MontantService,
// R17/R18, numeric(15,2)). Deux décimales fixes (07/09/2026, demande
// explicite) — cohérent avec la précision réelle de stockage/calcul
// (numeric(15,2), MontantService.arrondir déjà à 2 décimales) : avant ce
// changement, `Math.round()` masquait à l'affichage une précision qui
// existait déjà partout ailleurs (saisie, base, calcul), une incohérence
// pire que l'absence de décimales elle-même une fois les champs de saisie
// (Money.tsx n'en est pas un) alignés sur 2 décimales.
export function formaterMontant(valeur: number | null | undefined): string {
  if (valeur == null || Number.isNaN(valeur)) return "—";
  return `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valeur)} FCFA`;
}

export function Money({ valeur, fort, className }: MoneyProps) {
  return (
    <span className={`font-mono ${fort ? "font-bold" : ""} ${className ?? ""}`}>{formaterMontant(valeur)}</span>
  );
}
