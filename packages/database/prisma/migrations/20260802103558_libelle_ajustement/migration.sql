-- CreateTable
CREATE TABLE "libelle_ajustement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "circuit" "enum_circuit" NOT NULL,
    "libelle" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "libelle_ajustement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "libelle_ajustement_circuit_libelle_key" ON "libelle_ajustement"("circuit", "libelle");

-- AddForeignKey
ALTER TABLE "libelle_ajustement" ADD CONSTRAINT "libelle_ajustement_circuit_fkey" FOREIGN KEY ("circuit") REFERENCES "circuit"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

