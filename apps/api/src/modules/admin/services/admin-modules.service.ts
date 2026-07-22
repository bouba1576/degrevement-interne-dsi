import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import type { ModifierModuleRequete, ModuleVue } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";

// docs/06 §9 — activation de modules. Un module "coeur" (coeur=true) ne peut
// pas être désactivé : le champ existe précisément pour distinguer le socle
// obligatoire des modules optionnels.
@Injectable()
export class AdminModulesService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(): Promise<ModuleVue[]> {
    const modules = await this.prisma.module.findMany({ orderBy: { code: "asc" } });
    return modules.map((m) => this.versVue(m));
  }

  async trouver(code: string): Promise<ModuleVue> {
    const module_ = await this.prisma.module.findUnique({ where: { code } });
    if (!module_) {
      throw new NotFoundException({ code: "MODULE_INTROUVABLE", message: "Module introuvable." });
    }
    return this.versVue(module_);
  }

  async modifier(code: string, dto: ModifierModuleRequete): Promise<ModuleVue> {
    const existant = await this.trouver(code);
    if (existant.coeur && !dto.actif) {
      throw new UnprocessableEntityException({
        code: "MODULE_COEUR_INDESACTIVABLE",
        message: "Un module coeur ne peut pas être désactivé."
      });
    }
    const module_ = await this.prisma.module.update({ where: { code }, data: { actif: dto.actif } });
    return this.versVue(module_);
  }

  private versVue(module_: { code: string; libelle: string; coeur: boolean; actif: boolean }): ModuleVue {
    return { code: module_.code, libelle: module_.libelle, coeur: module_.coeur, actif: module_.actif };
  }
}
