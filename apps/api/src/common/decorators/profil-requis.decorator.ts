import { SetMetadata } from "@nestjs/common";
import type { EnumProfilSysteme } from "@pgd/database";

export const PROFIL_REQUIS_KEY = "profilRequis";

// Chantier 2 (28/08/2026, docs/14_Matrice_SoD_et_WF_SLA_KPI.md) — pendant de
// @Roles() pour l'axe CAPACITÉ (Role.profilSysteme) plutôt que l'axe PORTÉE
// (un code de rôle précis). Réservé aux points d'accès dont l'autorisation
// dépend d'une CATÉGORIE ouverte de rôles (ex. "tout initiateur, quel que
// soit le circuit") — jamais un remplacement de @Roles() pour un code de
// rôle unique et stable (ADMIN_PGD, etc.), qui reste @Roles() tel quel :
// cette dernière famille ne casse jamais à l'ajout d'un rôle/circuit/
// sous-flux, elle n'a donc aucun besoin de ce mécanisme.
export const ProfilRequis = (...profils: EnumProfilSysteme[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PROFIL_REQUIS_KEY, profils);
