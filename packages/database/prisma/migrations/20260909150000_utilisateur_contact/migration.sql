-- Ajoute Utilisateur.contact (09/09/2026, formulaire de pré-enregistrement des
-- utilisateurs — matricule/email/contact). Nullable, pas de contrainte unique,
-- même convention que matricule/email.

ALTER TABLE "utilisateur" ADD COLUMN "contact" TEXT;
