import type { PrismaClient } from "@prisma/client";

// docs/00 §Projet + docs/01 §1 — trois circuits, codes process.
export async function seedCircuits(prisma: PrismaClient): Promise<void> {
  await prisma.circuit.upsert({
    where: { code: "DOBB" },
    update: {},
    create: { code: "DOBB", libelle: "DOBB — B2B", segment: "B2B", processCode: "PO2_B-17" }
  });
  await prisma.circuit.upsert({
    where: { code: "DXC" },
    update: {},
    create: { code: "DXC", libelle: "DXC — B2C", segment: "B2C", processCode: "PO5-G-07" }
  });
  await prisma.circuit.upsert({
    where: { code: "DF" },
    update: {},
    create: { code: "DF", libelle: "DF — Wholesale / Opérateurs", segment: "WHOLESALE", processCode: "PO6-07" }
  });

  await prisma.parametreCalcul.upsert({
    where: { circuit: "DOBB" },
    update: {},
    create: { circuit: "DOBB", tauxTsc: 0.03, tauxTva: 0.18, devise: "XOF" }
  });
  await prisma.parametreCalcul.upsert({
    where: { circuit: "DXC" },
    update: {},
    create: { circuit: "DXC", tauxTsc: 0.03, tauxTva: 0.18, devise: "XOF" }
  });
  await prisma.parametreCalcul.upsert({
    where: { circuit: "DF" },
    update: {},
    create: { circuit: "DF", tauxTsc: 0.03, tauxTva: 0.18, devise: "XOF" }
  });
}
