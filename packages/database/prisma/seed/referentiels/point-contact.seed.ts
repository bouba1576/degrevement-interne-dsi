import type { PrismaClient } from "@prisma/client";

// Liste réelle (25/08/2026, promotion en référentiel admin-configurable —
// demande explicite) — transcrite depuis la constante locale POINTS_CONTACT
// (apps/web/components/screens/nouvelle-demande/NouvelleDemandeScreen.tsx),
// elle-même transcrite depuis docs/design/data.jsx:211-219 (Priorité 1.3,
// 20/08/2026) : mêmes 23 valeurs, aucune inventée à cette occasion.
const POINTS_CONTACT = [
  "Service client B2B",
  "Service client B2C",
  "Gestionnaire de compte",
  "Back-office facturation",
  "Centre d'appel",
  "Agence commerciale",
  "Responsable recouvrement",
  "Service technique / dérangement",
  "Chargé de clientèle grands comptes",
  "Recouvrement B2B",
  "ASCOM",
  "FACTURATION",
  "ADV FIXE INTERNET",
  "AGENCE",
  "RECOUVREMENT B2C",
  "ROBOT FORMULAIRE GUIDE",
  "TELE OPERATEUR MOBILE",
  "TELE OPERATEUR FI",
  "ORANGE BUSINESS MAIL",
  "SAV B2B TECHNIQUE",
  "COMMERCIAUX",
  "ASSISTANTE DE DIRECTION",
  "Autre"
];

export async function seedPointsContact(prisma: PrismaClient): Promise<void> {
  for (const libelle of POINTS_CONTACT) {
    await prisma.pointContact.upsert({
      where: { libelle },
      update: {},
      create: { libelle }
    });
  }
}
