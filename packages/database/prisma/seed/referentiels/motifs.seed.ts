import type { EnumCircuit, PrismaClient } from "@prisma/client";

// PLACEHOLDER — aucune source lue ne fournit la liste réelle des motifs
// (docs/03 §8 annonce « ≈ 30 DOBB, liste DXC, 9 DF » sans les énumérer). Seul un
// petit jeu générique est seedé ici, par circuit, pour que la structure
// MOTIF/PIECE_AFFERENTE soit démontrable. À remplacer intégralement par la
// liste réelle (probablement les fiches FORMULAIRE_DOBB.xlsx / FORMULAIRE_DXC.xlsx
// / FORMULAIRE_DF.doc citées en tête de 04_MCD_MLD_PGD_PROD.md) avant recette.

interface DefinitionMotif {
  libelle: string;
  pieces: Array<{ libelle: string; obligatoire: boolean }>;
}

const MOTIFS_PAR_CIRCUIT: Record<EnumCircuit, DefinitionMotif[]> = {
  DOBB: [
    {
      libelle: "Erreur de facturation (placeholder)",
      pieces: [{ libelle: "Facture contestée", obligatoire: true }]
    },
    {
      libelle: "Incident réseau (placeholder)",
      pieces: [{ libelle: "Preuve d'incident", obligatoire: true }]
    },
    {
      libelle: "Réclamation commerciale (placeholder)",
      pieces: [{ libelle: "Courrier de réclamation", obligatoire: false }]
    }
  ],
  DXC: [
    {
      libelle: "Erreur de facturation (placeholder)",
      pieces: [{ libelle: "Facture contestée", obligatoire: true }]
    },
    {
      libelle: "Geste commercial (placeholder)",
      pieces: []
    }
  ],
  DF: [
    {
      libelle: "Écart interconnexion (placeholder)",
      pieces: [{ libelle: "Extraction ASP Interco", obligatoire: true }]
    },
    {
      libelle: "Différend contractuel (placeholder)",
      pieces: [{ libelle: "Contrat / bon de commande", obligatoire: true }]
    }
  ]
};

export async function seedMotifs(prisma: PrismaClient): Promise<void> {
  for (const [circuit, motifs] of Object.entries(MOTIFS_PAR_CIRCUIT) as Array<
    [EnumCircuit, DefinitionMotif[]]
  >) {
    for (const definition of motifs) {
      const motif = await prisma.motif.upsert({
        where: { circuit_libelle: { circuit, libelle: definition.libelle } },
        update: {},
        create: { circuit, libelle: definition.libelle }
      });

      for (const piece of definition.pieces) {
        const existante = await prisma.pieceAfferente.findFirst({
          where: { motifId: motif.id, libelle: piece.libelle }
        });
        if (!existante) {
          await prisma.pieceAfferente.create({
            data: { motifId: motif.id, libelle: piece.libelle, obligatoire: piece.obligatoire }
          });
        }
      }
    }
  }
}
