import type { EnumCircuit, PrismaClient } from "@prisma/client";

// Paliers de subdélégation — CLAUDE.md "Questions ouvertes" indique explicitement
// que les seuils DOBB/DXC définitifs ne sont pas fournis (« défaut = tranches
// actuelles, paramétrable »). Seul DF a des bornes chiffrées dans les sources
// (04_MCD_MLD_PGD_PROD.md §3.3 : ≤5M / 5M–50M / >50M). DOBB et DXC sont donc
// seedés en un palier unique non borné, clairement « provisoire » — PAS une
// tranche réelle inventée. À corriger via /api/admin/paliers (PGD-042) dès que
// la fiche de subdélégation officielle est fournie.
//
// segment reprend CIRCUIT.segment (B2B/B2C/WHOLESALE), jamais un placeholder de
// tranche : DEMANDE.segment est copié depuis CIRCUIT.segment à la création
// (docs/design engine.jsx : segment dérive du circuit, jamais saisi), donc le
// moteur de routage (RuleEngineService, Phase 4/5) filtre configuration_circuit
// par égalité sur ce même segment. Les 3 paliers DF partagent donc un segment
// unique "WHOLESALE" et se différencient uniquement par borne_min/borne_max —
// c'est aussi ce qui fait que excl_configuration_circuit_chevauchement les
// protège réellement contre un chevauchement de bornes (une différence de
// segment aurait fait échapper les trois lignes à la contrainte).
//
// EnumTypeActeur (V/A/C) : sémantique non glosée dans les sources (cf. CLAUDE.md
// Questions ouvertes). Seedé à 'V' par défaut faute d'alternative — ce N'EST PAS
// une affirmation que V = "Validateur". Ne pas construire de logique applicative
// sur cette valeur avant clarification métier.

const BORNE_SANS_PLAFOND = "999999999999.99";

export async function seedPaliers(prisma: PrismaClient): Promise<void> {
  await seedPalierMetierUnique(prisma, "DOBB", [
    "RESPONSABLE_DOBB",
    "MANAGER_DOBB",
    "MANAGER_SENIOR_DOBB",
    "DOBB"
  ]);
  await seedPalierMetierUnique(prisma, "DXC", [
    "RESPONSABLE_DXC",
    "MANAGER_DXC",
    "MANAGER_SENIOR_DXC",
    "DXC"
  ]);
  await seedPaliersDf(prisma);
}

async function seedPalierMetierUnique(
  prisma: PrismaClient,
  circuit: EnumCircuit,
  roleCodesEtapes: string[]
): Promise<void> {
  const { segment } = await prisma.circuit.findUniqueOrThrow({ where: { code: circuit } });

  const existant = await prisma.configurationCircuit.findFirst({
    where: { circuit, segment }
  });
  const config =
    existant ??
    (await prisma.configurationCircuit.create({
      data: {
        circuit,
        segment,
        borneMin: 0,
        borneMax: BORNE_SANS_PLAFOND,
        labelPalier: "palier de subdélégation (provisoire)"
      }
    }));

  await creerEtapesSiAbsentes(
    prisma,
    config.id,
    roleCodesEtapes.map((roleCode) => ({ roleCode, typeActeur: "V" as const }))
  );
}

async function seedPaliersDf(prisma: PrismaClient): Promise<void> {
  const { segment } = await prisma.circuit.findUniqueOrThrow({ where: { code: "DF" } });

  // numrange(borne_min, borne_max, '[]') est inclusif des DEUX côtés : des
  // bornes strictement "jointives" (5000000 / 5000000) se chevauchent au point
  // exact 5 000 000 et sont rejetées par excl_configuration_circuit_chevauchement
  // (constaté à l'exécution — cf. docs/07 T7, cas limite explicitement signalé
  // « à vérifier, ne pas supposer »). montant_ttc est numeric(15,2) : la tranche
  // suivante démarre donc un centime au-dessus de la borne haute précédente,
  // ce qui traduit fidèlement « ≤ 5M / > 5M » en bornes réellement disjointes.
  // R12/PGD-041 : TTC > 5M exige un contrôle a posteriori. Les deux tranches
  // dépassant 5M portent donc une étape supplémentaire POST_CLOTURE
  // (roleCode=FIABILISATION, typeActeur=C, déjà seedé — cf. roles.seed.ts) ;
  // la tranche ≤5M n'en a pas besoin. Rôle de contrôle corrigé le
  // 27/08/2026 (docs/14, correction FRA/FIABILISATION — FRA n'a jamais
  // "valider"/effectuer de contrôle dans cette source, FIABILISATION porte
  // le vocabulaire de contrôle explicite) — était roleCode=FRA depuis la
  // Phase 5.
  //
  // FRA réinséré comme étape BLOQUANTE (typeActeur='V'), entre MANAGER_DF
  // et MANAGER_SENIOR_DF, sur LES TROIS tranches — position confirmée
  // explicitement par la personne pilotant le projet (27/08/2026), pas
  // déduite. Uniforme sur les trois tranches : rien dans docs/14 ne
  // conditionne l'étape FRA elle-même (par opposition au contrôle
  // FIABILISATION, lui bien conditionné par le seuil R12 à 5M) au montant —
  // seul le contrôle a posteriori (FIABILISATION) reste absent sous 5M.
  const tranches: Array<{ label: string; min: string; max: string; roles: string[]; controleR12: boolean }> = [
    {
      label: "JUSQU_5M",
      min: "0",
      max: "5000000",
      roles: ["RESPONSABLE_DF", "MANAGER_DF", "FRA", "MANAGER_SENIOR_DF"],
      controleR12: false
    },
    {
      label: "5M_A_50M",
      min: "5000000.01",
      max: "50000000",
      roles: ["RESPONSABLE_DF", "MANAGER_DF", "FRA", "MANAGER_SENIOR_DF", "DF"],
      controleR12: true
    },
    {
      label: "AU_DELA_50M",
      min: "50000000.01",
      max: BORNE_SANS_PLAFOND,
      // R2 : au-delà des seuils, la chaîne se termine par DF puis DGA/DG.
      roles: ["RESPONSABLE_DF", "MANAGER_DF", "FRA", "MANAGER_SENIOR_DF", "DF", "DGA_DG"],
      controleR12: true
    }
  ];

  for (const tranche of tranches) {
    const existant = await prisma.configurationCircuit.findFirst({
      where: { circuit: "DF", segment, borneMin: tranche.min, borneMax: tranche.max }
    });
    const config =
      existant ??
      (await prisma.configurationCircuit.create({
        data: {
          circuit: "DF",
          segment,
          borneMin: tranche.min,
          borneMax: tranche.max,
          labelPalier: `palier de subdélégation (provisoire) — PO6-07 — ${tranche.label}`
        }
      }));

    const etapes: Array<{ roleCode: string; typeActeur: "V" | "A" | "C" }> = tranche.roles.map((roleCode) => ({
      roleCode,
      typeActeur: "V"
    }));
    if (tranche.controleR12) {
      etapes.push({ roleCode: "FIABILISATION", typeActeur: "C" });
    }
    await creerEtapesSiAbsentes(prisma, config.id, etapes);
  }
}

async function creerEtapesSiAbsentes(
  prisma: PrismaClient,
  configId: string,
  etapes: Array<{ roleCode: string; typeActeur: "V" | "A" | "C" }>
): Promise<void> {
  const nbEtapes = await prisma.etapeRegle.count({ where: { configurationCircuitId: configId } });
  if (nbEtapes > 0) return;

  for (let i = 0; i < etapes.length; i++) {
    const { roleCode, typeActeur } = etapes[i]!;
    const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
    const slaProfil = await prisma.slaProfil.findUniqueOrThrow({ where: { roleCode } });

    await prisma.etapeRegle.create({
      data: {
        configurationCircuitId: configId,
        ordre: i + 1,
        roleCode: role.code,
        typeActeur,
        bloquant: slaProfil.minuteurBloquant,
        slaHeures: slaProfil.slaHeures
      }
    });
  }
}
