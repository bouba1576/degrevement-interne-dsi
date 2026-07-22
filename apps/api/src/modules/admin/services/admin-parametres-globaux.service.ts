import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import type { ModifierParametreGlobalRequete, ParametreGlobalVue } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";

// docs/06 §9 — clé libre (déjà seedée, cf. parametres-globaux.seed.ts) : pas
// de création de nouvelle clé via l'API, seul le code qui la lit lui donne un
// sens (ex. "politique_ligne_resiliee" → R15).
@Injectable()
export class AdminParametresGlobauxService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(): Promise<ParametreGlobalVue[]> {
    const parametres = await this.prisma.parametreGlobal.findMany({ orderBy: { cle: "asc" } });
    return parametres.map((p) => this.versVue(p));
  }

  async trouver(cle: string): Promise<ParametreGlobalVue> {
    const parametre = await this.prisma.parametreGlobal.findUnique({ where: { cle } });
    if (!parametre) {
      throw new NotFoundException({ code: "PARAMETRE_GLOBAL_INTROUVABLE", message: "Paramètre introuvable." });
    }
    return this.versVue(parametre);
  }

  async modifier(cle: string, dto: ModifierParametreGlobalRequete): Promise<ParametreGlobalVue> {
    const existant = await this.trouver(cle);
    if (!existant.modifiableAdmin) {
      throw new UnprocessableEntityException({
        code: "PARAMETRE_GLOBAL_NON_MODIFIABLE",
        message: "Ce paramètre n'est pas modifiable par l'administration."
      });
    }
    const parametre = await this.prisma.parametreGlobal.update({
      where: { cle },
      data: { valeur: dto.valeur as never }
    });
    return this.versVue(parametre);
  }

  private versVue(parametre: {
    cle: string;
    valeur: unknown;
    libelle: string | null;
    modifiableAdmin: boolean;
    dateMaj: Date;
  }): ParametreGlobalVue {
    return {
      cle: parametre.cle,
      valeur: parametre.valeur,
      libelle: parametre.libelle,
      modifiableAdmin: parametre.modifiableAdmin,
      dateMaj: parametre.dateMaj.toISOString()
    };
  }
}
