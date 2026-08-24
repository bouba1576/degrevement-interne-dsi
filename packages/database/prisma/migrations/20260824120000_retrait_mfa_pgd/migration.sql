-- Retrait du mécanisme MFA côté PGD (24/08/2026, cf. CLAUDE.md
-- « Architecture Keycloak — source unique ») — MfaService/TotpProvider/
-- DuoProvider retirés : Keycloak résout identité ET second facteur (DUO
-- déjà lié au royaume) en un seul échange, plus aucun état MFA à porter
-- côté PGD. duo_user_id n'a jamais été lu ni écrit par aucun code (vérifié
-- par recherche exhaustive avant ce chantier) — mort depuis toujours,
-- retiré dans le même geste.
--
-- Ne touche PAS enum_facteur_auth (DUO/TOTP) ni enum_evenement_securite
-- (MFA_CHALLENGE/TOTP_ENROLEMENT_ADMIN) : JOURNAL_SECURITE est append-only
-- (règle non négociable 3), des lignes réelles portent déjà ces valeurs —
-- les retirer casserait la lecture de l'historique. Ces deux colonnes ci-
-- dessous, elles, ne sont PAS un journal d'audit : un état de configuration
-- vivant, plus jamais lu par aucun code une fois ce chantier terminé.

ALTER TABLE "utilisateur" DROP COLUMN "mfa_methode";
ALTER TABLE "utilisateur" DROP COLUMN "totp_secret";
ALTER TABLE "utilisateur" DROP COLUMN "totp_active_le";
ALTER TABLE "utilisateur" DROP COLUMN "duo_user_id";

DROP TYPE "enum_methode_mfa";
