import type { EnumCircuit, PrismaClient } from "@prisma/client";

// Liste réelle (docs/10_Remarques_Metier_Maquette_240626.txt, remarques
// DOBB #3 / DXC #16, 24/06/2026) — les deux seules valeurs citées par le
// métier, scopées DOBB/DXC : DF n'utilise pas ce champ (son formulaire
// mémo Wholesale porte "Objet", un texte libre distinct).
const LIBELLES: Record<Extract<EnumCircuit, "DOBB" | "DXC">, string[]> = {
  DOBB: ["Contestation facture", "Régularisation de compte"],
  DXC: ["Contestation facture", "Régularisation de compte"]
};

export async function seedLibellesAjustement(prisma: PrismaClient): Promise<void> {
  for (const [circuit, libelles] of Object.entries(LIBELLES) as Array<
    [EnumCircuit, string[]]
  >) {
    for (const libelle of libelles) {
      await prisma.libelleAjustement.upsert({
        where: { circuit_libelle: { circuit, libelle } },
        update: {},
        create: { circuit, libelle }
      });
    }
  }
}
