import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { rechercheNdQuerySchema, type FormulesDeLigne, type Ligne, type LigneAvecContexte } from "@pgd/contracts";
import { Authenticated } from "../../common/decorators/authenticated.decorator";
import { LigneService } from "./services/ligne.service";

// Aucune restriction de rôle documentée pour ces lectures (docs/06 §3) : la
// recherche de ligne est utilisée par toutes les corbeilles de saisie et de
// validation, quel que soit le circuit ou le rôle — @Authenticated() plutôt
// qu'une liste de @Roles() qu'aucune source ne fournit.
@ApiTags("lignes")
@Controller("lignes")
export class LignesController {
  constructor(private readonly ligneService: LigneService) {}

  // GET /api/lignes?nd= (SF-PGD-310)
  @Authenticated()
  @Get()
  async rechercherParNd(@Query() query: unknown): Promise<LigneAvecContexte | null> {
    const { nd } = rechercheNdQuerySchema.parse(query);
    return this.ligneService.rechercherParNd(nd);
  }

  // GET /api/lignes/{id} (SF-PGD-300)
  @Authenticated()
  @Get(":id")
  async trouverParId(@Param("id") id: string): Promise<Ligne> {
    return this.ligneService.trouverParId(id);
  }

  // GET /api/lignes/{id}/formules (SF-PGD-320)
  @Authenticated()
  @Get(":id/formules")
  async formulesDeLigne(@Param("id") id: string): Promise<FormulesDeLigne> {
    return this.ligneService.formulesDeLigne(id);
  }
}
