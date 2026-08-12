-- Pré-enregistrement des utilisateurs AD (analyse du 12/08/2026, CLAUDE.md)
-- — rattachement direction/service de l'AGENT lui-même, distinct de
-- Demande.direction_resp_id/service_resp_id (qui porte la responsabilité
-- d'un dossier, pas l'appartenance de l'initiateur). Même référentiel
-- (direction_responsabilite/service_responsabilite), nullable : un
-- utilisateur peut être pré-enregistré (rôle posé) sans direction/service.

-- AlterTable
ALTER TABLE "utilisateur" ADD COLUMN "direction_id" UUID,
ADD COLUMN "service_id" UUID;

-- CreateIndex
CREATE INDEX "utilisateur_direction_id_service_id_idx" ON "utilisateur"("direction_id", "service_id");

-- AddForeignKey
ALTER TABLE "utilisateur" ADD CONSTRAINT "utilisateur_direction_id_fkey" FOREIGN KEY ("direction_id") REFERENCES "direction_responsabilite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilisateur" ADD CONSTRAINT "utilisateur_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service_responsabilite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
