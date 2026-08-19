-- Détail d'échec optionnel pour JOURNAL_SECURITE (19/08/2026,
-- AdApiProvider/SF-PGD-001) — un type d'événement par étape distincte du
-- parcours (LOGIN, MFA_CHALLENGE, ACCES_NON_PROVISIONNE...), jamais un
-- nouveau type par sous-cause d'échec de la même étape (cf. CLAUDE.md,
-- décision explicite après revue du précédent ACCES_NON_PROVISIONNE).
-- Colonnes génériques sur JournalSecurite (pas propres à LOGIN) : n'importe
-- quel événement futur peut s'en servir sans nouvelle migration. Jamais
-- peuplées sur succes=true. LdapProvider (annuaire dev, bind LDAP) ne les
-- peuple jamais non plus — pas de code/message structuré comparable.

-- AlterTable
ALTER TABLE "journal_securite" ADD COLUMN "code_echec" TEXT,
ADD COLUMN "message_echec" TEXT;
