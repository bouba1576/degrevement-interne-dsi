-- E7.2 (docs/15_Conformite_Exigences_Securite_OCIT.md) — capture de
-- l'identifiant tenté sur un échec de connexion où l'identité n'a jamais
-- été résolue. Chaîne brute, jamais une FK.
ALTER TABLE "journal_securite" ADD COLUMN "identifiant_tente" TEXT;
