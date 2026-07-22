import { Injectable, Logger } from "@nestjs/common";
import type { Utilisateur } from "@pgd/database";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { UtilisateurAd } from "../ports/ldap.port";

// SF-PGD-007 : résolution des groupes AD → rôles PGD à CHAQUE ouverture de
// session. Provisionnement JIT de UTILISATEUR (pas de flux d'inscription
// séparé dans les sources) et synchronisation de MEMBRE_ROLE sur l'état AD du
// moment — un rôle dont le groupe AD n'est plus porté par l'utilisateur est
// retiré, pas seulement complété. Interprétation raisonnable de « résolution à
// chaque ouverture de session », non littéralement détaillée dans les sources
// au-delà de cette phrase.
@Injectable()
export class RbacResolutionService {
  private readonly logger = new Logger(RbacResolutionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resoudre(utilisateurAd: UtilisateurAd): Promise<{ utilisateur: Utilisateur; roles: string[] }> {
    const utilisateur = await this.prisma.utilisateur.upsert({
      where: { identifiantAd: utilisateurAd.identifiantAd },
      update: { nom: utilisateurAd.nom },
      create: { identifiantAd: utilisateurAd.identifiantAd, nom: utilisateurAd.nom }
    });

    const rolesCorrespondants = await this.prisma.role.findMany({
      where: { groupeAd: { in: utilisateurAd.groupes } },
      select: { code: true }
    });
    const codesRoles = rolesCorrespondants.map((r) => r.code);

    if (utilisateurAd.groupes.length > 0 && codesRoles.length === 0) {
      this.logger.warn(
        `${utilisateurAd.identifiantAd} porte des groupes AD (${utilisateurAd.groupes.join(", ")}) ` +
          `ne correspondant à aucun ROLE.groupe_ad connu — catalogue de rôles incomplet (cf. roles.seed.ts)`
      );
    }

    await this.prisma.$transaction([
      this.prisma.membreRole.deleteMany({
        where: { utilisateurId: utilisateur.id, roleCode: { notIn: codesRoles } }
      }),
      ...codesRoles.map((roleCode) =>
        this.prisma.membreRole.upsert({
          where: { utilisateurId_roleCode: { utilisateurId: utilisateur.id, roleCode } },
          update: {},
          create: { utilisateurId: utilisateur.id, roleCode }
        })
      )
    ]);

    return { utilisateur, roles: codesRoles };
  }
}
