import type { PrismaClient } from "@prisma/client";

// Liste réelle des opérateurs Wholesale/DF (09/09/2026) — transmise
// directement par la personne pilotant le projet, jamais devinée (R11) :
// `Operateur` (promu en référentiel admin-configurable le 25/08/2026, cf.
// CLAUDE.md « Opérateur (DF) / Point de contact (DOBB) ») démarrait vide,
// faute de toute liste réelle trouvée dans la maquette ou ailleurs dans ce
// dépôt à cette date — comblé ici par la première liste réelle disponible.
// 72 valeurs, aucune inventée ni reformulée par rapport à la liste transmise.
const OPERATEURS_DF = [
  "AFR-IX TELECOM",
  "BELGACOM",
  "BHARTI AIRTEL",
  "BTI / BANKAI",
  "BUSINESS TELECOM SERVICES",
  "CAMTEL",
  "CHINGUITEL",
  "CMC NETWORK",
  "CONSOLE CONNECT",
  "CSQUARED",
  "CONNECTED NETWORK",
  "ETI GUINEE",
  "FIRSTNET",
  "GATEWAY",
  "GHANA NCBC (VODAFONE)",
  "GHANA TIGO",
  "ISOCEL BENIN",
  "ISOCEL VENTURES",
  "KEYZONE / RELARIO",
  "KWADO",
  "LIBON",
  "LIQUID TELECOM",
  "MAROC TEL (IAM)",
  "MOOV AFRICA BF",
  "MOOV AFRICA GABON",
  "MOOV AFRICA MALITEL",
  "MOOV AFRICA NIGER",
  "MTN GLOBAL CONNECT",
  "ORANGE BURKINA",
  "ORANGE CAMEROUN",
  "ORANGE ESPAGNE",
  "ORANGE GUINEE",
  "ORANGE LIBERIA",
  "ORANGE MALI",
  "ORANGE RDC",
  "ORANGE WHOLESALE INTER",
  "PCCW GLOBAL",
  "SBIN Ex BENIN TELECOM",
  "SINCH",
  "SMTD",
  "SONATEL",
  "TELECEL BURKINA FASO",
  "TELEGLOBE (TATA)",
  "TOGO TEL",
  "ULTRANET",
  "VTS",
  "YAS SENEGAL",
  "ALINK CÔTE D'IVOIRE",
  "BBC",
  "CNRCT (Chambre des rois)",
  "COM ONE MEDIA",
  "DELTA TECHNOLOGIES",
  "ENI IVORY COAST LIMITED",
  "EQUANT COTE D'IVOIRE",
  "GOS",
  "IHS",
  "INQ",
  "INTEL AFRIQUE",
  "MAGAL TELECOM",
  "MAINONE COTE D'IVOIRE",
  "MOOV AFRICA COTE D'IVOIRE",
  "MTN CÔTE D'IVOIRE",
  "OST CI",
  "PIXAGILITY AFRIQUE",
  "POWERLINE",
  "SANCFIS Ex-ALINK WEST AFRICA",
  "SEMLEX",
  "SMART TECH / SMART SOLUTION",
  "TRINET",
  "VIPNET",
  "VITIB SA",
  "WASSI TECHNOLOGIES"
];

export async function seedOperateurs(prisma: PrismaClient): Promise<void> {
  for (const libelle of OPERATEURS_DF) {
    await prisma.operateur.upsert({
      where: { libelle },
      update: {},
      create: { libelle }
    });
  }
}
