import type { JournalAuditVue } from "@pgd/contracts";

// Extrait de CircuitTab.tsx (chantier design system, 20/08/2026) — la
// maquette affiche le palier appliqué à DEUX endroits (ApercuTab, carte
// Montants, chip "Tranche X" ; CircuitTab, carte "Règle appliquée") :
// même donnée, un seul calcul, jamais deux implémentations. Le palier N'EST
// PAS recalculé ici — recalculer via POST /api/demandes/{id}/apercu-routage
// sur un dossier déjà soumis interrogerait la configuration ACTUELLE des
// paliers, pas celle qui a réellement routé ce dossier : si un admin
// modifie un palier après coup, l'écran mentirait silencieusement sur ce
// qui s'est passé. Le palier réellement appliqué EST persisté, mais dans
// JournalAudit.detail.labelPalier, écrit à chaque "soumission" et
// "re-routage" (DemandeWorkflowService) — jamais recalculé, une lecture de
// ce qui s'est produit. On lit la DERNIÈRE de ces deux actions (le
// re-routage remplace entièrement la chaîne en attente), pas la plus
// récente entrée du journal tout court.
export function extraireLabelPalier(entrees: JournalAuditVue[]): string | null {
  const pertinentes = entrees.filter((e) => e.action === "soumission" || e.action === "re-routage");
  if (pertinentes.length === 0) return null;
  const derniere = pertinentes.reduce((a, b) => (new Date(b.horodatage) > new Date(a.horodatage) ? b : a));
  const detail = derniere.detail as { labelPalier?: string | null } | null;
  return detail?.labelPalier ?? null;
}
