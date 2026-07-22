import type { PrismaClient } from "@prisma/client";

// SF-PGD-303 — jeu de démonstration multi-ND (docs/01 §4.1, docs/07 §5) :
// compte B2B à 3+ ND (ACTIF/SUSPENDU/RESILIE), compte B2C mono-ND avec
// historique, compte Wholesale DF, une ligne en historique_partiel.
export async function seedDemo(prisma: PrismaClient): Promise<void> {
  await seedCompteDobbMultiLignes(prisma);
  await seedCompteDxcMonoLigne(prisma);
  await seedCompteDfWholesale(prisma);
}

async function seedCompteDobbMultiLignes(prisma: PrismaClient): Promise<void> {
  const compte = await prisma.compteClient.upsert({
    where: { numeroCompte: "CPT-DOBB-0001" },
    update: {},
    create: {
      numeroCompte: "CPT-DOBB-0001",
      nomClient: "Société ABC Côte d'Ivoire",
      segment: "B2B",
      crmRef: "CRM-DEMO-0001"
    }
  });

  // Ligne ACTIF — formule courante + 1 historique
  await creerLigneAvecFormules(prisma, {
    compteId: compte.id,
    nd: "0102030401",
    libelleLigne: "Ligne data entreprise — siège",
    statut: "ACTIF",
    formules: [
      { libelle: "Formule Entreprise Fibre 100M", recurrentMensuelHt: 250000, dateDebut: "2023-01-01", dateFin: "2025-12-31", courante: false },
      { libelle: "Formule Entreprise Fibre 200M", recurrentMensuelHt: 380000, dateDebut: "2026-01-01", dateFin: null, courante: true }
    ]
  });

  // Ligne SUSPENDU — formule courante + 1 historique
  await creerLigneAvecFormules(prisma, {
    compteId: compte.id,
    nd: "0102030402",
    libelleLigne: "Ligne data entreprise — agence Yopougon",
    statut: "SUSPENDU",
    formules: [
      { libelle: "Formule Entreprise Fibre 50M", recurrentMensuelHt: 120000, dateDebut: "2024-03-01", dateFin: "2025-06-30", courante: false },
      { libelle: "Formule Entreprise Fibre 100M", recurrentMensuelHt: 250000, dateDebut: "2025-07-01", dateFin: null, courante: true }
    ]
  });

  // Ligne RESILIE (R15) — historique_partiel = true (mode dégradé SF-PGD-320)
  await creerLigneAvecFormules(prisma, {
    compteId: compte.id,
    nd: "0102030403",
    libelleLigne: "Ligne data entreprise — agence Cocody (résiliée)",
    statut: "RESILIE",
    historiquePartiel: true,
    formules: [{ libelle: "Formule Entreprise Fibre 50M", recurrentMensuelHt: 120000, dateDebut: "2022-01-01", dateFin: null, courante: true }]
  });
}

async function seedCompteDxcMonoLigne(prisma: PrismaClient): Promise<void> {
  const compte = await prisma.compteClient.upsert({
    where: { numeroCompte: "CPT-DXC-0001" },
    update: {},
    create: {
      numeroCompte: "CPT-DXC-0001",
      nomClient: "Kouassi Jean-Baptiste",
      segment: "B2C",
      crmRef: "CRM-DEMO-0002"
    }
  });

  await creerLigneAvecFormules(prisma, {
    compteId: compte.id,
    nd: "0209998877",
    libelleLigne: "Ligne Internet résidentiel",
    statut: "ACTIF",
    universFmiCode: "INTERNET",
    formules: [
      { libelle: "Formule Internet 10M", recurrentMensuelHt: 15000, dateDebut: "2024-01-01", dateFin: "2025-12-31", courante: false },
      { libelle: "Formule Internet 20M", recurrentMensuelHt: 25000, dateDebut: "2026-01-01", dateFin: null, courante: true }
    ]
  });
}

async function seedCompteDfWholesale(prisma: PrismaClient): Promise<void> {
  const compte = await prisma.compteClient.upsert({
    where: { numeroCompte: "CPT-DF-0001" },
    update: {},
    create: {
      numeroCompte: "CPT-DF-0001",
      nomClient: "Opérateur Wholesale Partenaire",
      segment: "WHOLESALE",
      crmRef: "CRM-DEMO-0003"
    }
  });

  await creerLigneAvecFormules(prisma, {
    compteId: compte.id,
    nd: "0300001100",
    libelleLigne: "Interconnexion — capacité principale",
    statut: "ACTIF",
    formules: [
      { libelle: "Formule Interconnexion Standard", recurrentMensuelHt: 4500000, dateDebut: "2023-01-01", dateFin: null, courante: true }
    ]
  });
}

interface DefinitionFormule {
  libelle: string;
  recurrentMensuelHt: number;
  dateDebut: string;
  dateFin: string | null;
  courante: boolean;
}

async function creerLigneAvecFormules(
  prisma: PrismaClient,
  params: {
    compteId: string;
    nd: string;
    libelleLigne: string;
    statut: "ACTIF" | "SUSPENDU" | "RESILIE";
    formules: DefinitionFormule[];
    universFmiCode?: string;
    historiquePartiel?: boolean;
  }
): Promise<void> {
  const existante = await prisma.ligne.findUnique({
    where: { compteId_nd: { compteId: params.compteId, nd: params.nd } }
  });
  if (existante) return;

  const ligne = await prisma.ligne.create({
    data: {
      compteId: params.compteId,
      nd: params.nd,
      libelleLigne: params.libelleLigne,
      statut: params.statut,
      universFmiCode: params.universFmiCode ?? null,
      historiquePartiel: params.historiquePartiel ?? false
    }
  });

  let formuleCouranteId: string | null = null;
  for (const f of params.formules) {
    const formule = await prisma.formule.create({
      data: {
        ligneId: ligne.id,
        libelle: f.libelle,
        recurrentMensuelHt: f.recurrentMensuelHt,
        dateDebut: new Date(f.dateDebut),
        dateFin: f.dateFin ? new Date(f.dateFin) : null,
        courante: f.courante
      }
    });
    if (f.courante) formuleCouranteId = formule.id;
  }

  if (formuleCouranteId) {
    await prisma.ligne.update({ where: { id: ligne.id }, data: { formuleCouranteId } });
  }
}
