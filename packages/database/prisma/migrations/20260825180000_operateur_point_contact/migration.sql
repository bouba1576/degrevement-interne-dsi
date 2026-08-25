-- CreateTable
CREATE TABLE "operateur" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "libelle" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "operateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_contact" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "libelle" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "point_contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operateur_libelle_key" ON "operateur"("libelle");

-- CreateIndex
CREATE UNIQUE INDEX "point_contact_libelle_key" ON "point_contact"("libelle");
