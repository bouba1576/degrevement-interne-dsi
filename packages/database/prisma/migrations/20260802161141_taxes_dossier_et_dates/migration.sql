-- CreateEnum
CREATE TYPE "enum_assiette_tva" AS ENUM ('HT', 'HT_TSC');

-- AlterTable
-- Défaut HT_TSC (pas HT) sur les deux colonnes ci-dessous : préserve le
-- comportement exact d'avant ce chantier (cascade HT+TSC, seule formule
-- jamais implémentée jusqu'ici) pour tout dossier existant et tout circuit
-- dont l'admin n'a pas encore basculé explicitement vers l'assiette HT seul.
ALTER TABLE "demande" ADD COLUMN     "assiette_tva" "enum_assiette_tva" NOT NULL DEFAULT 'HT_TSC',
ADD COLUMN     "cree_le" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "montant_tsc_manuel" DECIMAL(15,2),
ADD COLUMN     "montant_tva_manuel" DECIMAL(15,2),
ADD COLUMN     "tsc_manuelle" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tva_manuelle" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "parametre_calcul" ADD COLUMN     "assiette_tva_defaut" "enum_assiette_tva" NOT NULL DEFAULT 'HT_TSC';
