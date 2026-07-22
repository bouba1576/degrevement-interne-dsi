import type { EnumUniteKpi, PrismaClient } from "@prisma/client";

// Dérivé littéralement du tableau de 04_MCD_MLD_PGD_PROD.md §3.2 (6 familles,
// « ~24 indicateurs ») — chaque code correspond à une expression du tableau
// source, pas à une invention.

interface DefinitionKpi {
  code: string;
  libelle: string;
  famille: string;
  unite: EnumUniteKpi;
  dimensions: string[];
  surDossiersTraites: boolean;
}

const KPI_DEFINITIONS: DefinitionKpi[] = [
  // Dossiers reçus
  { code: "RECUS_MONTANT_HT", libelle: "Montant total reçu (HT)", famille: "recus", unite: "MONTANT", dimensions: [], surDossiersTraites: false },
  { code: "RECUS_MONTANT_TTC", libelle: "Montant total reçu (TTC)", famille: "recus", unite: "MONTANT", dimensions: [], surDossiersTraites: false },
  { code: "RECUS_VOLUME", libelle: "Volume de dossiers reçus", famille: "recus", unite: "VOLUME", dimensions: [], surDossiersTraites: false },
  { code: "RECUS_EVOLUTION", libelle: "Évolution M-1 → M des dossiers reçus", famille: "recus", unite: "TAUX", dimensions: ["evolution_m"], surDossiersTraites: false },
  { code: "RECUS_MONTANT_PAR_UNIVERS", libelle: "Montant reçu par univers FMI", famille: "recus", unite: "MONTANT", dimensions: ["univers"], surDossiersTraites: false },
  { code: "RECUS_VOLUME_PAR_UNIVERS", libelle: "Volume reçu par univers FMI", famille: "recus", unite: "VOLUME", dimensions: ["univers"], surDossiersTraites: false },
  { code: "RECUS_EVOLUTION_PAR_UNIVERS", libelle: "Évolution M-1 → M par univers FMI", famille: "recus", unite: "TAUX", dimensions: ["univers", "evolution_m"], surDossiersTraites: false },

  // Dossiers traités (dégrèvement saisi dans le SI)
  { code: "TRAITES_MONTANT_HT", libelle: "Montant total traité (HT)", famille: "traites", unite: "MONTANT", dimensions: [], surDossiersTraites: true },
  { code: "TRAITES_MONTANT_TTC", libelle: "Montant total traité (TTC)", famille: "traites", unite: "MONTANT", dimensions: [], surDossiersTraites: true },
  { code: "TRAITES_VOLUME", libelle: "Volume de dossiers traités", famille: "traites", unite: "VOLUME", dimensions: [], surDossiersTraites: true },
  { code: "TRAITES_EVOLUTION", libelle: "Évolution M-1 → M des dossiers traités", famille: "traites", unite: "TAUX", dimensions: ["evolution_m"], surDossiersTraites: true },
  { code: "TRAITES_MONTANT_PAR_UNIVERS", libelle: "Montant traité par univers FMI", famille: "traites", unite: "MONTANT", dimensions: ["univers"], surDossiersTraites: true },
  { code: "TRAITES_VOLUME_PAR_UNIVERS", libelle: "Volume traité par univers FMI", famille: "traites", unite: "VOLUME", dimensions: ["univers"], surDossiersTraites: true },
  { code: "TRAITES_EVOLUTION_PAR_UNIVERS", libelle: "Évolution M-1 → M traités par univers FMI", famille: "traites", unite: "TAUX", dimensions: ["univers", "evolution_m"], surDossiersTraites: true },

  // Top motif
  { code: "TOP_MOTIF_GLOBAL", libelle: "Top motif global", famille: "top_motif", unite: "VOLUME", dimensions: ["motif"], surDossiersTraites: false },
  { code: "TOP_MOTIF_MONTANT_HT", libelle: "Montant HT par motif", famille: "top_motif", unite: "MONTANT", dimensions: ["motif"], surDossiersTraites: false },
  { code: "TOP_MOTIF_MONTANT_TTC", libelle: "Montant TTC par motif", famille: "top_motif", unite: "MONTANT", dimensions: ["motif"], surDossiersTraites: false },
  { code: "TOP_MOTIF_PAR_UNIVERS", libelle: "Top motif par univers FMI", famille: "top_motif", unite: "VOLUME", dimensions: ["motif", "univers"], surDossiersTraites: false },
  { code: "TAUX_MOTIF_GLOBAL", libelle: "Taux motif / global", famille: "top_motif", unite: "TAUX", dimensions: ["motif"], surDossiersTraites: false },
  { code: "TAUX_MOTIF_UNIVERS", libelle: "Taux motif / univers", famille: "top_motif", unite: "TAUX", dimensions: ["motif", "univers"], surDossiersTraites: false },

  // Facteurs de dégrèvement
  { code: "FACTEUR_MONTANT", libelle: "Montant par facteur (interne/externe)", famille: "facteurs", unite: "MONTANT", dimensions: ["facteur"], surDossiersTraites: false },
  { code: "FACTEUR_TAUX", libelle: "Taux par facteur (interne/externe)", famille: "facteurs", unite: "TAUX", dimensions: ["facteur"], surDossiersTraites: false },

  // Top responsabilité Direction
  { code: "DIRECTION_MONTANT", libelle: "Montant par direction", famille: "resp_direction", unite: "MONTANT", dimensions: ["direction"], surDossiersTraites: false },
  { code: "DIRECTION_TAUX", libelle: "Taux par direction", famille: "resp_direction", unite: "TAUX", dimensions: ["direction"], surDossiersTraites: false },

  // Top responsabilité Service
  { code: "SERVICE_MONTANT", libelle: "Montant par service", famille: "resp_service", unite: "MONTANT", dimensions: ["service"], surDossiersTraites: false },
  { code: "SERVICE_TAUX", libelle: "Taux par service", famille: "resp_service", unite: "TAUX", dimensions: ["service"], surDossiersTraites: false }
];

export async function seedKpiDefinitions(prisma: PrismaClient): Promise<void> {
  for (const kpi of KPI_DEFINITIONS) {
    await prisma.kpiDefinition.upsert({
      where: { code: kpi.code },
      update: {},
      create: {
        code: kpi.code,
        libelle: kpi.libelle,
        famille: kpi.famille,
        unite: kpi.unite,
        dimensions: kpi.dimensions,
        surDossiersTraites: kpi.surDossiersTraites
      }
    });
  }
}
