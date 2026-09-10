-- E2.5 (docs/15_Conformite_Exigences_Securite_OCIT.md) — pas de compte
-- multiple sur la même adresse e-mail. Vérifié avant écriture, pas supposé :
-- 32 lignes Utilisateur en base de dev au 10/09/2026, 1 seule porte un email
-- non nul, zéro doublon. NULL reste autorisé sans limite (comportement
-- standard d'un index unique Postgres — chaque NULL est distinct).
CREATE UNIQUE INDEX "utilisateur_email_key" ON "utilisateur"("email");
