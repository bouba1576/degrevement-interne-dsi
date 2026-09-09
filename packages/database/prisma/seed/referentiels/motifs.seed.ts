import type { EnumCircuit, PrismaClient } from "@prisma/client";

// Les 7 entrées « (placeholder) » d'origine (docs/03 §8 annonçait « ≈ 30
// DOBB, liste DXC, 9 DF » sans les énumérer) restent en l'état, PAS
// remplacées ni supprimées malgré leur nom : des dossiers de démo réels du
// socle de dev les référencent déjà par FK (Demande.motifId), vérifié avant
// d'agir — un `DELETE` aurait échoué sur la contrainte, et de toute façon
// hors de ce qui a été demandé (« ajoute au seed »). La liste réelle des
// motifs, transmise directement le 09/09/2026, est ajoutée à la suite de
// chaque circuit, jamais en remplacement.
//
// Motifs DXC/DOBB — même liste transmise pour les deux circuits (22 motifs),
// dupliquée une fois par circuit (Motif.circuit + libelle, unique par paire —
// pas de motif partagé entre circuits dans ce schéma).

interface DefinitionMotif {
  libelle: string;
  pieces: Array<{ libelle: string; obligatoire: boolean }>;
}

// Aucune pièce obligatoire précisée pour ces motifs réels — jamais devinée
// (R11) : `pieces: []` pour chacun, comme déjà fait pour « Geste commercial
// (placeholder) ».
const MOTIFS_DXC_DOBB: DefinitionMotif[] = [
  { libelle: "Erreur de saisie", pieces: [] },
  { libelle: "Problème Technique", pieces: [] },
  { libelle: "Anomalie SI (BSCS, GAIA, ZTE…)", pieces: [] },
  { libelle: "Suspension non effective", pieces: [] },
  { libelle: "Transfert non effectif", pieces: [] },
  { libelle: "Résiliation non effective", pieces: [] },
  { libelle: "Migration non effective", pieces: [] },
  { libelle: "Modification non effective", pieces: [] },
  { libelle: "Fraude Sim swap", pieces: [] },
  { libelle: "Data roaming", pieces: [] },
  { libelle: "Surconsommation fixe", pieces: [] },
  { libelle: "Intra facturé", pieces: [] },
  { libelle: "Service non livré facturé", pieces: [] },
  { libelle: "Abattement", pieces: [] },
  { libelle: "Geste commercial", pieces: [] },
  { libelle: "Migration de formule", pieces: [] },
  { libelle: "Annulation d'ajustement", pieces: [] },
  { libelle: "Facturation manuelle de frais", pieces: [] },
  { libelle: "Surconsommation", pieces: [] },
  { libelle: "Paiement", pieces: [] },
  { libelle: "Annulation de paiement", pieces: [] },
  { libelle: "Test sur ajustement", pieces: [] }
];

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
    },
    ...MOTIFS_DXC_DOBB
  ],
  DXC: [
    {
      libelle: "Erreur de facturation (placeholder)",
      pieces: [{ libelle: "Facture contestée", obligatoire: true }]
    },
    {
      libelle: "Geste commercial (placeholder)",
      pieces: []
    },
    ...MOTIFS_DXC_DOBB
  ],
  DF: [
    {
      libelle: "Écart interconnexion (placeholder)",
      pieces: [{ libelle: "Extraction ASP Interco", obligatoire: true }]
    },
    {
      libelle: "Différend contractuel (placeholder)",
      pieces: [{ libelle: "Contrat / bon de commande", obligatoire: true }]
    },
    { libelle: "Tarif incorrect", pieces: [] },
    { libelle: "Divergence de volume", pieces: [] },
    { libelle: "Double facturation", pieces: [] },
    { libelle: "Facturation continue après demande de résiliation", pieces: [] },
    { libelle: "Demande de résiliation intervenant après facture émise", pieces: [] },
    { libelle: "Indisponibilité de service", pieces: [] },
    { libelle: "Modifications de commande", pieces: [] },
    { libelle: "Erreur de saisie", pieces: [] }
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
