-- Ajoute Demande.demande_origine_id (07/09/2026, point 11 — référencer un
-- dossier renvoyé pour correction quand un champ sensible change, cf.
-- CLAUDE.md). Auto-référence nullable : l'ancien dossier reste BROUILLON,
-- jamais touché automatiquement — SET NULL pour qu'une future suppression
-- manuelle de l'ancien dossier ne casse jamais le nouveau ni ne le supprime
-- en cascade.

ALTER TABLE "demande" ADD COLUMN "demande_origine_id" UUID;

ALTER TABLE "demande"
  ADD CONSTRAINT "demande_demande_origine_id_fkey"
  FOREIGN KEY ("demande_origine_id") REFERENCES "demande"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "demande_demande_origine_id_idx" ON "demande"("demande_origine_id");
