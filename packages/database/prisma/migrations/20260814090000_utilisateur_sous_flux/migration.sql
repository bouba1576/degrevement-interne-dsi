-- Sous-flux — référentiel SF-PGD-109 (14/08/2026, CLAUDE.md) — colonne
-- générique sur Utilisateur (n'importe quel circuit), source de dérivation
-- du sous-flux à la création d'un dossier (préremplissage, jamais figé).
-- Mécanisme vérifié dans docs/design/screens3.jsx:981 (champ dédié sur
-- l'utilisateur, pas un rôle granulaire par sous-flux).

-- AlterTable
ALTER TABLE "utilisateur" ADD COLUMN "sous_flux_id" UUID;

-- CreateIndex
CREATE INDEX "utilisateur_sous_flux_id_idx" ON "utilisateur"("sous_flux_id");

-- AddForeignKey
ALTER TABLE "utilisateur" ADD CONSTRAINT "utilisateur_sous_flux_id_fkey" FOREIGN KEY ("sous_flux_id") REFERENCES "sous_flux"("id") ON DELETE SET NULL ON UPDATE CASCADE;
