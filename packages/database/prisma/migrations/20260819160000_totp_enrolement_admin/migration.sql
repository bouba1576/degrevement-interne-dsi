-- Génération/régénération d'un secret TOTP par un admin pour un compte
-- tiers (Priorité 1, 19/08/2026) — nouvelle valeur d'événement de sécurité,
-- distincte de MFA_CHALLENGE (usage du code par la personne elle-même).
ALTER TYPE "enum_evenement_securite" ADD VALUE 'TOTP_ENROLEMENT_ADMIN';
