-- Pré-enregistrement des utilisateurs AD, Temps 2 (12/08/2026) — nouvelle
-- valeur d'événement de sécurité pour un LDAP valide mais sans MembreRole
-- actif (refus distinct d'un échec d'authentification).
ALTER TYPE "enum_evenement_securite" ADD VALUE 'ACCES_NON_PROVISIONNE';
