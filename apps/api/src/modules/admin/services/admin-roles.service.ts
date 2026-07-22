import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@pgd/database";
import type { CreerRoleRequete, ModifierRoleRequete, RoleVue } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";

@Injectable()
export class AdminRolesService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(): Promise<RoleVue[]> {
    const roles = await this.prisma.role.findMany({ orderBy: { code: "asc" } });
    return roles.map((r) => this.versVue(r));
  }

  async trouver(code: string): Promise<RoleVue> {
    const role = await this.prisma.role.findUnique({ where: { code } });
    if (!role) {
      throw new NotFoundException({ code: "ROLE_INTROUVABLE", message: "Rôle introuvable." });
    }
    return this.versVue(role);
  }

  async creer(dto: CreerRoleRequete): Promise<RoleVue> {
    const role = await this.prisma.role.create({
      data: {
        code: dto.code,
        libelle: dto.libelle,
        groupeAd: dto.groupeAd,
        niveau: dto.niveau,
        type: dto.type,
        dansMatrice: dto.dansMatrice ?? false,
        requiertMfa: dto.requiertMfa ?? false
      }
    });
    return this.versVue(role);
  }

  async modifier(code: string, dto: ModifierRoleRequete): Promise<RoleVue> {
    await this.trouver(code);
    const role = await this.prisma.role.update({
      where: { code },
      data: {
        libelle: dto.libelle,
        groupeAd: dto.groupeAd,
        niveau: dto.niveau,
        type: dto.type,
        dansMatrice: dto.dansMatrice,
        requiertMfa: dto.requiertMfa
      }
    });
    return this.versVue(role);
  }

  // Un rôle référencé par une étape de palier, une affectation ou une
  // délégation ne peut pas être supprimé (P2003) — traduit en 422 lisible
  // plutôt que de laisser remonter l'erreur Postgres brute.
  async supprimer(code: string): Promise<void> {
    await this.trouver(code);
    try {
      await this.prisma.role.delete({ where: { code } });
    } catch (erreur) {
      if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2003") {
        throw new UnprocessableEntityException({
          code: "ROLE_EN_USAGE",
          message: "Ce rôle est référencé (palier, affectation ou délégation) et ne peut pas être supprimé."
        });
      }
      throw erreur;
    }
  }

  private versVue(role: {
    code: string;
    libelle: string;
    groupeAd: string;
    niveau: number;
    type: string;
    dansMatrice: boolean;
    requiertMfa: boolean;
  }): RoleVue {
    return {
      code: role.code,
      libelle: role.libelle,
      groupeAd: role.groupeAd,
      niveau: role.niveau,
      type: role.type as never,
      dansMatrice: role.dansMatrice,
      requiertMfa: role.requiertMfa
    };
  }
}
