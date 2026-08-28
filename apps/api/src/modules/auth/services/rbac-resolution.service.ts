import { Injectable } from "@nestjs/common";
import type { EnumProfilSysteme, Utilisateur } from "@pgd/database";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { UtilisateurAd } from "../ports/keycloak.port";

export type ResolutionRbac =
  | { statut: "AUTORISE"; utilisateur: Utilisateur; roles: string[]; profils: EnumProfilSysteme[] }
  | { statut: "NON_PROVISIONNE"; utilisateurId: string | null };

// Pré-enregistrement des utilisateurs AD, Temps 2 (12/08/2026, CLAUDE.md) —
// remplace l'ancien provisionnement JIT (upsert Utilisateur + resynchronisation
// continue de MembreRole depuis les groupes AD à chaque connexion). resoudre()
// devient une simple LECTURE : l'authentification AD est déjà passée (appelant
// unique, AuthController.login(), après KeycloakPort.authentifier() réussi) — ce
// service ne décide plus « quels rôles cette personne a-t-elle selon l'AD »,
// il vérifie « cette personne a-t-elle été pré-enregistrée par un admin ».
//
// Aucune écriture sur Utilisateur ni MembreRole ici, jamais — l'un et l'autre
// sont désormais possédés exclusivement par AdminUtilisateursService (écran
// « Utilisateurs », CLAUDE.md Temps 1) : le nom affiché, notamment, reste celui
// choisi à l'écran d'administration, jamais réécrasé silencieusement par une
// valeur AD à la connexion suivante. utilisateurAd.groupes n'est plus lu du
// tout : Role.groupeAd redevient purement informatif (affiché à l'écran de
// recherche annuaire), jamais déclencheur automatique — décision actée lors de
// la conception (option a), vérifiée avant ce changement : resoudre() n'a
// qu'un seul appelant dans tout le dépôt (AuthController.login()).
@Injectable()
export class RbacResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  async resoudre(utilisateurAd: UtilisateurAd): Promise<ResolutionRbac> {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { identifiantAd: utilisateurAd.identifiantAd }
    });

    if (!utilisateur) {
      return { statut: "NON_PROVISIONNE", utilisateurId: null };
    }

    const membresRole = await this.prisma.membreRole.findMany({
      where: { utilisateurId: utilisateur.id },
      select: { roleCode: true, role: { select: { profilSysteme: true } } }
    });

    if (membresRole.length === 0) {
      return { statut: "NON_PROVISIONNE", utilisateurId: utilisateur.id };
    }

    // Cumul par rôle, jamais par utilisateur (Chantier 2, docs/14) — un
    // utilisateur cumule les profils de tous les rôles qu'il détient, figé à
    // la connexion comme `roles`/`sousFluxId` (cohérence plutôt que fraîcheur).
    const profils = [...new Set(membresRole.map((m) => m.role.profilSysteme))];

    return { statut: "AUTORISE", utilisateur, roles: membresRole.map((m) => m.roleCode), profils };
  }
}
