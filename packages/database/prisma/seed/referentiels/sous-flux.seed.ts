import type { EnumCircuit, PrismaClient } from "@prisma/client";

// SF-PGD-109 (docs/09 §13.3) — référentiel des sous-flux par circuit.
// Valeurs cibles, pas une invention : DOBB vient de docs/11 (source
// primaire, mars 2026), qui nomme littéralement les 4 services en tête de
// tableau (« Réclamation B2B », « Recouvrement », « ADV », « Facturation »)
// — préférée au libellé abrégé de la maquette (« Réclamation », sans
// suffixe), la source primaire l'emporte en cas de divergence de
// formulation (CLAUDE.md « Maquette de référence »).
//
// DXC et DF n'ont PAS de sous-flux nommés dans docs/11 (son tableau DXC n'a
// aucune colonne sous-flux, son tableau DF non plus) — seule
// `docs/design/data.jsx:129-146` (CIRCUITS.DXC.sousFlux/CIRCUITS.DF.sousFlux)
// en donne une valeur concrète. Utilisée ici faute d'alternative, jamais en
// contradiction avec une source plus autoritaire (catégorie « spécifié
// ailleurs, silence de la source primaire », pas un cas où la maquette
// primerait sur docs/11).
const SOUS_FLUX: Record<EnumCircuit, string[]> = {
  DOBB: ["Réclamation B2B", "Recouvrement", "ADV", "Facturation"],
  DXC: ["Réclamation", "Geste commercial"],
  DF: ["Réclamation opérateur"]
};

export async function seedSousFlux(prisma: PrismaClient): Promise<void> {
  for (const [circuit, libelles] of Object.entries(SOUS_FLUX) as Array<[EnumCircuit, string[]]>) {
    for (const libelle of libelles) {
      await prisma.sousFlux.upsert({
        where: { circuit_libelle: { circuit, libelle } },
        update: {},
        create: { circuit, libelle }
      });
    }
  }
}
