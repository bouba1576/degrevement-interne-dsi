import { SetMetadata } from "@nestjs/common";

export const SANS_JOURNAL_ACTIVITE_KEY = "sansJournalActivite";

// Marque explicitement une route mutative comme déjà auditée par JournalAudit
// (approbation/rejet/soumission d'un dossier, claim/unclaim, escalade
// manuelle, relance corbeille...) — JournalActiviteInterceptor (global) ne
// capture jamais une route qui porte ce décorateur, pour ne jamais dupliquer
// ce que JournalAudit couvre déjà. Même moule que @Public()/@Authenticated()
// (SetMetadata), et même discipline : la liste des routes qui le portent est
// vérifiée par un test structurel (journal-activite-coverage.spec.ts) contre
// les appels réels à JournalAudit.create trouvés dans le code, pas devinée.
export const SansJournalActivite = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SANS_JOURNAL_ACTIVITE_KEY, true);
