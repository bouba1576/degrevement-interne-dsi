-- Ajoute Demande.motif_autre (07/09/2026, demande explicite) — "Autre (non
-- référencé)" sur le champ Motif, même mécanique que responsabilite_service_autre
-- (mutuellement exclusif avec motif_id, imposé côté serveur).

ALTER TABLE "demande" ADD COLUMN "motif_autre" TEXT;
