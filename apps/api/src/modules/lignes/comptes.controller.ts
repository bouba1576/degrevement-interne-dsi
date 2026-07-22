import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { rechercheCompteQuerySchema, type CompteAvecLignes, type CompteClient } from "@pgd/contracts";
import { Authenticated } from "../../common/decorators/authenticated.decorator";
import { CompteService } from "./services/compte.service";

@ApiTags("comptes")
@Controller("comptes")
export class ComptesController {
  constructor(private readonly compteService: CompteService) {}

  // GET /api/comptes?q= (SF-PGD-052)
  @Authenticated()
  @Get()
  async rechercher(@Query() query: unknown): Promise<CompteClient[]> {
    const { q } = rechercheCompteQuerySchema.parse(query);
    return this.compteService.rechercher(q);
  }

  // GET /api/comptes/{numero}/lignes (SF-PGD-311)
  @Authenticated()
  @Get(":numero/lignes")
  async lignesDuCompte(@Param("numero") numero: string): Promise<CompteAvecLignes> {
    return this.compteService.lignesDuCompte(numero);
  }
}
