-- Étape 5 du chantier « Journal d'activité administrateur » (CLAUDE.md) —
-- service de rétention. Pas de contrainte unique sur (utilisateur_id, jour,
-- type) : Postgres traite chaque NULL comme distinct dans un index unique,
-- ce qui l'aurait rendue inefficace pour les entrées sans utilisateur résolu
-- (compte supprimé) — l'atomicité vient de la transaction du job
-- (agrégation + purge ensemble), pas d'une contrainte de schéma.

-- CreateTable
CREATE TABLE "journal_activite_agregat" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "utilisateur_id" UUID,
    "jour" DATE NOT NULL,
    "type" "enum_type_activite" NOT NULL,
    "compte" INTEGER NOT NULL,

    CONSTRAINT "journal_activite_agregat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "journal_activite_agregat_jour_idx" ON "journal_activite_agregat"("jour");

-- AddForeignKey
ALTER TABLE "journal_activite_agregat" ADD CONSTRAINT "journal_activite_agregat_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
