-- Journal d'activité administrateur (08/09/2026, conception validée
-- CLAUDE.md « Journal d'activité administrateur »). Table séparée de
-- journal_audit/journal_securite : rétention différente (6 mois, purgée
-- après agrégation), jamais append-only au sens SOX des deux autres.

-- CreateEnum
CREATE TYPE "enum_type_activite" AS ENUM ('NAVIGATION', 'ACTION');

-- CreateTable
CREATE TABLE "journal_activite" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "utilisateur_id" UUID,
    "type" "enum_type_activite" NOT NULL,
    "route" TEXT NOT NULL,
    "methode_http" TEXT,
    "libelle" TEXT NOT NULL,
    "detail" JSONB,
    "horodatage" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_activite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "journal_activite_utilisateur_id_horodatage_idx" ON "journal_activite"("utilisateur_id", "horodatage");

-- CreateIndex
CREATE INDEX "journal_activite_type_horodatage_idx" ON "journal_activite"("type", "horodatage");

-- AddForeignKey
ALTER TABLE "journal_activite" ADD CONSTRAINT "journal_activite_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
