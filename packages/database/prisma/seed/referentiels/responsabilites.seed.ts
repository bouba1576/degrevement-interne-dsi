import type { PrismaClient } from "@prisma/client";

// PLACEHOLDER — docs/00 §7 signale explicitement que les listes de responsabilité
// des fiches DOBB sont hétérogènes (casse, doublons, libellés composés) et
// demande une normalisation AVANT seed, sans en fournir la liste consolidée.
// Jeu minimal ici pour rendre la structure DIRECTION/SERVICE_RESPONSABILITE
// démontrable ; à remplacer par la liste normalisée réelle avant recette.
export async function seedResponsabilites(prisma: PrismaClient): Promise<void> {
  const directions: Array<{ libelle: string; services: string[] }> = [
    { libelle: "Direction Commerciale (placeholder)", services: ["Commercial", "Recouvrement"] },
    { libelle: "Direction Technique (placeholder)", services: ["Support technique", "Réseau"] },
    { libelle: "Direction Financière (placeholder)", services: ["Facturation", "Contrôle de gestion"] }
  ];

  for (const d of directions) {
    const direction = await prisma.directionResponsabilite.upsert({
      where: { libelle: d.libelle },
      update: {},
      create: { libelle: d.libelle }
    });

    for (const service of d.services) {
      await prisma.serviceResponsabilite.upsert({
        where: { directionId_libelle: { directionId: direction.id, libelle: service } },
        update: {},
        create: { directionId: direction.id, libelle: service }
      });
    }
  }
}
