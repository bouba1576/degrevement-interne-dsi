import type { PrismaClient } from "@prisma/client";

// Liste réelle (docs/10_Remarques_Metier_Maquette_240626.txt, remarques DOBB
// #11/#12) — remplace l'ancien placeholder. Reconstituée en appliquant le
// diff ajout/retrait de docs/10 à la liste baseline de
// docs/09_Specifications_Fonctionnelles_PROD_v3.md §8.1 : le résultat
// correspond exactement aux constantes RESP_DIRECTION (17)/RESP_SERVICE (14)
// de docs/design/data.jsx, confirmation croisée indépendante.
const DIRECTIONS_REELLES = [
  "DOBB", "DXC", "MARKETING", "DRSI", "DIE", "DT", "DMS", "DSI", "DAL", "DF", "DG", "DRDI", "DJR",
  "LE CLIENT", "CLIENT", "INDÉTERMINÉE", "AUTRE"
];

const SERVICES_REELS = [
  "FACTURATION", "ADV FIXE INTERNET", "ADV MOBILE MENTLEY", "ORANGE BUSINESS MAIL", "COMMERCIAL",
  "RECOUVREMENT", "DÉRANGEMENT", "CONFIGURATION DES OFFRES", "PÔLE PROVISIONNING", "ANOMALIE DIMELO",
  "PROJET VIRAGE", "ÉQUIPE TASKFORCE", "INDÉTERMINÉ", "AUTRES"
];

// Les 17 directions et 14 services sont des libellés métier réels (docs/10,
// 24/06/2026). Leur association ici (chaque service dupliqué sous chaque
// direction) est une hypothèse de structure plate reproduisant l'UX de la
// maquette — jamais une répartition différenciée confirmée par le métier. À
// corriger si une vraie cartographie direction→service existe.
export async function seedResponsabilites(prisma: PrismaClient): Promise<void> {
  const directions: Array<{ libelle: string; services: string[] }> = DIRECTIONS_REELLES.map((libelle) => ({
    libelle,
    services: SERVICES_REELS
  }));

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
