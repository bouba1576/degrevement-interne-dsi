-- Confirmation métier explicite reçue le 2026-08-11 (cf. CLAUDE.md, section
-- « Défaut assietteTva/assietteTvaDefaut ») : le défaut applicable à tout
-- nouveau dossier bascule de HT_TSC (ancienne règle, TVA sur HT+TSC) vers HT
-- (nouvelle règle, TVA sur HT seul), sur les trois circuits.
--
-- Cette migration ne change QUE le défaut de colonne (nouvelles installations
-- / seed) — elle ne réécrit PAS les 3 lignes ParametreCalcul déjà existantes
-- en base : ce changement de valeur passe par le vrai endpoint admin
-- (PATCH /api/admin/parametres-calcul/{circuit}) pour que le mécanisme déjà
-- construit (AdminParametresCalculService.recalculerBrouillons) recalcule les
-- brouillons existants et trace HISTORIQUE_MONTANT (origine=RECALCUL) —
-- un UPDATE SQL direct sur parametre_calcul contournerait cette traçabilité.

-- AlterTable
ALTER TABLE "parametre_calcul" ALTER COLUMN "assiette_tva_defaut" SET DEFAULT 'HT';

-- AlterTable
ALTER TABLE "demande" ALTER COLUMN "assiette_tva" SET DEFAULT 'HT';
