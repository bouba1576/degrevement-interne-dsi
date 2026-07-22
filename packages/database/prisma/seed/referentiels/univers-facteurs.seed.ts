import type { PrismaClient } from "@prisma/client";

// docs/03 §8 + 04_MCD_MLD_PGD_PROD.md §5.3 — valeurs exactes de la source.
export async function seedUniversEtFacteurs(prisma: PrismaClient): Promise<void> {
  const universFmi = [
    { code: "FIXE", libelle: "Fixe" },
    { code: "MOBILE", libelle: "Mobile" },
    { code: "INTERNET", libelle: "Internet" }
  ];
  for (const u of universFmi) {
    await prisma.universFmi.upsert({ where: { code: u.code }, update: {}, create: u });
  }

  const facteurs = [
    { code: "INTERNE", libelle: "Interne (structurel)" },
    { code: "EXTERNE", libelle: "Externe (conjoncturel)" }
  ];
  for (const f of facteurs) {
    await prisma.facteurDegrevement.upsert({ where: { code: f.code }, update: {}, create: f });
  }
}
