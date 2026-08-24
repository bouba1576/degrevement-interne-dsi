-- Ajoute Utilisateur.email (24/08/2026, préparation SmtpAdapter — cf.
-- CLAUDE.md « Envoi d'e-mail réel »). identifiantAd n'est pas garanti être
-- une adresse e-mail (comptes réels bruts, confirmé 19/08/2026), donc pas
-- fiable comme destinataire d'envoi réel. Nullable, pas de contrainte
-- unique : source de peuplement non tranchée à ce stade.

ALTER TABLE "utilisateur" ADD COLUMN "email" TEXT;
