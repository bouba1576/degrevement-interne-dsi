import type { EnumTypeRole, PrismaClient } from "@prisma/client";

// ATTENTION — catalogue PROVISOIRE, 25 rôles construits sur les 34 annoncés.
// docs/01_PRD_Consolide.md §2 : « Le catalogue consolidé comprend 34 rôles
// dédupliqués, mappés sur des groupes AD selon la convention GG-DGR-*. » —
// c'est la SEULE occurrence du chiffre 34 dans les huit livrables BMAD ; aucun
// des documents fournis (00 à 07, ni 04_MCD_MLD_PGD_PROD.md) n'énumère les 34
// codes. Le présent seed ne construit que ce qui se déduit d'une mention
// explicite : les 4 familles nommées (§2, tableau « Type de rôle »), les 9
// profils du tableau SLA (04_MCD_MLD_PGD_PROD.md §3.1), et les rôles cités par
// leur nom ailleurs dans le texte (DOBB, DXC comme rôles terminaux — pas
// seulement comme circuits).
//
// ÉCART NON RÉSOLU — remis à l'arbitrage métier avant la Phase 5 (le moteur de
// règles instancie des ETAPE_REGLE par role_code ; toute chaîne référençant un
// rôle absent de ce seed échouera au seed ou à l'exécution, FK oblige) :
//
//   - 9 codes de rôle manquants (34 − 25) : noms et rattachement (métier/pivot/
//     système) introuvables dans les sources fournies. Hypothèses non retenues
//     faute de fondement : variantes DOBB par circuit (Responsable/Manager
//     propres à DXC/DF au-delà de ce qui est déjà seedé ?), rôles de lecture
//     seule (consultation KPI, audit) mentionnés fonctionnellement (SF-PGD-140,
//     141, 120) sans jamais être nommés comme rôles RBAC distincts.
//   - `DXC` (rôle terminal circuit DXC) et `DFA` (pivot) : SLA à 24 h posé par
//     analogie avec DOBB — absents du tableau SLA (04_MCD_MLD_PGD_PROD.md §3.1,
//     9 lignes seulement : Initiateur, Responsable, Manager, Manager Senior,
//     DOBB, FRA, DF, DGA/DG, Fiabilisation/Contrôle — ni DXC ni DFA n'y figurent).
//
// Action attendue : fiche RH/AD réelle ou export du catalogue de rôles PGD
// (probablement la source des 34, non fournie dans ce lot de livrables).

interface DefinitionRole {
  code: string;
  libelle: string;
  groupeAd: string;
  niveau: number;
  type: EnumTypeRole;
  dansMatrice: boolean;
  requiertMfa: boolean;
  slaHeures: number;
  minuteurBloquant: boolean;
  commentaireSla?: string;
}

const CIRCUITS = ["DOBB", "DXC", "DF"] as const;

const METIER_PAR_CIRCUIT: Array<{
  suffixe: string;
  libelle: string;
  niveau: number;
  slaHeures: number;
  minuteurBloquant: boolean;
}> = [
  { suffixe: "INITIATEUR", libelle: "Initiateur", niveau: 1, slaHeures: 0, minuteurBloquant: false },
  { suffixe: "RESPONSABLE", libelle: "Responsable", niveau: 2, slaHeures: 8, minuteurBloquant: true },
  { suffixe: "MANAGER", libelle: "Manager", niveau: 3, slaHeures: 8, minuteurBloquant: true },
  {
    suffixe: "MANAGER_SENIOR",
    libelle: "Manager Senior",
    niveau: 4,
    slaHeures: 8,
    minuteurBloquant: true
  }
];

function rolesMetier(): DefinitionRole[] {
  const roles: DefinitionRole[] = [];
  for (const circuit of CIRCUITS) {
    for (const def of METIER_PAR_CIRCUIT) {
      roles.push({
        code: `${def.suffixe}_${circuit}`,
        libelle: `${def.libelle} ${circuit}`,
        groupeAd: `GG-DGR-${def.suffixe}-${circuit}`,
        niveau: def.niveau,
        type: "METIER",
        dansMatrice: true,
        requiertMfa: false,
        slaHeures: def.slaHeures,
        minuteurBloquant: def.minuteurBloquant
      });
    }
  }
  // Rôles terminaux nommément cités dans docs/01 §2 (« Initiateur, Responsable,
  // Manager, Manager Senior, DOBB, DXC »), au-delà des quatre génériques ci-dessus.
  roles.push({
    code: "DOBB",
    libelle: "Validateur DOBB",
    groupeAd: "GG-DGR-DOBB",
    niveau: 5,
    type: "METIER",
    dansMatrice: true,
    requiertMfa: true,
    slaHeures: 24,
    minuteurBloquant: true
  });
  roles.push({
    code: "DXC",
    libelle: "Validateur DXC",
    groupeAd: "GG-DGR-DXC",
    niveau: 5,
    type: "METIER",
    dansMatrice: true,
    requiertMfa: true,
    slaHeures: 24,
    minuteurBloquant: true,
    commentaireSla: "estimée par analogie avec DOBB — absente du tableau SLA source"
  });
  return roles;
}

const ROLES_PIVOT: DefinitionRole[] = [
  {
    code: "SM_MOA_FINANCE_FRA",
    libelle: "SM MOA Finance & FRA",
    groupeAd: "GG-DGR-SM-MOA-FINANCE-FRA",
    niveau: 6,
    type: "PIVOT",
    dansMatrice: true,
    requiertMfa: true,
    slaHeures: 48,
    minuteurBloquant: true
  },
  {
    code: "DFA",
    libelle: "DFA",
    groupeAd: "GG-DGR-DFA",
    niveau: 6,
    type: "PIVOT",
    dansMatrice: true,
    requiertMfa: true,
    slaHeures: 24,
    minuteurBloquant: true,
    commentaireSla: "estimée — absente du tableau SLA source"
  },
  {
    code: "DF",
    libelle: "DF",
    groupeAd: "GG-DGR-DF",
    niveau: 7,
    type: "PIVOT",
    dansMatrice: true,
    requiertMfa: true,
    slaHeures: 24,
    minuteurBloquant: true
  },
  {
    code: "DGA_DG",
    libelle: "DGA/DG",
    groupeAd: "GG-DGR-DGA-DG",
    niveau: 8,
    type: "PIVOT",
    dansMatrice: true,
    requiertMfa: true,
    slaHeures: 24,
    minuteurBloquant: true
  }
];

// ATTENTION — reclassées.
// docs/01_PRD_Consolide.md §2 décrit « Contrôle » comme une famille de rôles à
// part (narrative), mais ENUM_TYPE_ROLE ne porte que 3 codes techniques dans le
// MLD v1.1 ET dans docs/03 §6 (« metier, pivot, systeme », non étendu en v2.0) —
// confirmé contre les deux sources, pas une supposition. Ces 4 rôles ne sont pas
// « hors matrice » comme les rôles système (dansMatrice reste true), donc
// SYSTEME est exclu ; ils ne sont pas cantonnés à un circuit comme les rôles
// métier. Par élimination, typés PIVOT — inférence documentée, pas une valeur
// sourcée littéralement pour CE champ précis.
const ROLES_CONTROLE: DefinitionRole[] = [
  {
    code: "FRA",
    libelle: "FRA",
    groupeAd: "GG-DGR-FRA",
    niveau: 9,
    type: "PIVOT",
    dansMatrice: true,
    requiertMfa: true,
    slaHeures: 48,
    minuteurBloquant: true
  },
  {
    code: "CONTROLE_N1",
    libelle: "Contrôle N1",
    groupeAd: "GG-DGR-CONTROLE-N1",
    niveau: 10,
    type: "PIVOT",
    dansMatrice: true,
    requiertMfa: true,
    slaHeures: 240,
    minuteurBloquant: true
  },
  {
    code: "CONTROLE_N2",
    libelle: "Contrôle N2",
    groupeAd: "GG-DGR-CONTROLE-N2",
    niveau: 11,
    type: "PIVOT",
    dansMatrice: true,
    requiertMfa: true,
    slaHeures: 240,
    minuteurBloquant: true
  },
  {
    code: "FIABILISATION",
    libelle: "Fiabilisation",
    groupeAd: "GG-DGR-FIABILISATION",
    niveau: 10,
    type: "PIVOT",
    dansMatrice: true,
    requiertMfa: true,
    slaHeures: 240,
    minuteurBloquant: true
  }
];

const ROLES_SYSTEME: DefinitionRole[] = [
  {
    code: "ADMIN_PGD",
    libelle: "Administrateur PGD",
    groupeAd: "GG-DGR-ADMIN-PGD",
    niveau: 0,
    type: "SYSTEME",
    dansMatrice: false,
    requiertMfa: true,
    slaHeures: 0,
    minuteurBloquant: false
  },
  {
    code: "SUPERVISEUR",
    libelle: "Superviseur",
    groupeAd: "GG-DGR-SUPERVISEUR",
    niveau: 0,
    type: "SYSTEME",
    dansMatrice: false,
    requiertMfa: true,
    slaHeures: 0,
    minuteurBloquant: false
  },
  {
    code: "SERVICE_TECHNIQUE",
    libelle: "Service technique",
    groupeAd: "GG-DGR-SERVICE-TECHNIQUE",
    niveau: 0,
    type: "SYSTEME",
    dansMatrice: false,
    requiertMfa: true,
    slaHeures: 0,
    minuteurBloquant: false
  }
];

export async function seedRoles(prisma: PrismaClient): Promise<void> {
  const tous = [...rolesMetier(), ...ROLES_PIVOT, ...ROLES_CONTROLE, ...ROLES_SYSTEME];

  for (const role of tous) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: {},
      create: {
        code: role.code,
        libelle: role.libelle,
        groupeAd: role.groupeAd,
        niveau: role.niveau,
        type: role.type,
        dansMatrice: role.dansMatrice,
        requiertMfa: role.requiertMfa
      }
    });

    await prisma.slaProfil.upsert({
      where: { roleCode: role.code },
      update: {},
      create: {
        roleCode: role.code,
        slaHeures: role.slaHeures,
        minuteurBloquant: role.minuteurBloquant,
        commentaire: role.commentaireSla ?? null
      }
    });
  }
}
