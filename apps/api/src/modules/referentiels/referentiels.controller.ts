import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  directionResponsabiliteVueSchema,
  facteurDegrevementVueSchema,
  listerMotifsQuerySchema,
  motifVueSchema,
  parametresCalculPublicVueSchema,
  universFmiVueSchema,
  type DirectionResponsabiliteVue,
  type FacteurDegrevementVue,
  type MotifVue,
  type ParametresCalculPublicVue,
  type UniversFmiVue
} from "@pgd/contracts";
import { ApiZodQuery, ApiZodResponse } from "../../common/swagger/zod-schema";
import { Authenticated } from "../../common/decorators/authenticated.decorator";
import { AdminMotifsService } from "../admin/services/admin-motifs.service";
import { ReferentielsService } from "./services/referentiels.service";

// Phase 10.6 (décomposition NouvelleDemandeScreen) — lectures ouvertes à tout
// authentifié, jamais @Roles() : ces référentiels alimentent un formulaire de
// saisie accessible à tout initiateur, quel que soit son rôle ou son circuit
// — même justification que LignesController. Distinct des contrôleurs
// admin/* (CRUD complet, ADMIN_PGD-only, tout statut) : chaque route ici ne
// renvoie que les lignes actives, jamais désactivées, jamais d'écriture.
@ApiTags("referentiels")
@Controller("referentiels")
export class ReferentielsController {
  constructor(
    private readonly referentiels: ReferentielsService,
    private readonly motifs: AdminMotifsService
  ) {}

  // GET /api/referentiels/motifs?circuit= (circuit optionnel)
  @Authenticated()
  @Get("motifs")
  @ApiZodQuery(listerMotifsQuerySchema)
  @ApiZodResponse(200, z.array(motifVueSchema))
  async listerMotifs(@Query() query: unknown): Promise<MotifVue[]> {
    const { circuit } = listerMotifsQuerySchema.parse(query);
    return this.motifs.listerActifs(circuit);
  }

  @Authenticated()
  @Get("univers-fmi")
  @ApiZodResponse(200, z.array(universFmiVueSchema))
  async listerUniversFmi(): Promise<UniversFmiVue[]> {
    return this.referentiels.listerUniversFmi();
  }

  @Authenticated()
  @Get("facteurs")
  @ApiZodResponse(200, z.array(facteurDegrevementVueSchema))
  async listerFacteurs(): Promise<FacteurDegrevementVue[]> {
    return this.referentiels.listerFacteurs();
  }

  @Authenticated()
  @Get("directions")
  @ApiZodResponse(200, z.array(directionResponsabiliteVueSchema))
  async listerDirections(): Promise<DirectionResponsabiliteVue[]> {
    return this.referentiels.listerDirections();
  }

  // GET /api/referentiels/parametres-calcul/:circuit — projection à 4 champs
  // (ParametresCalculPublicVue), jamais ParametreCalculVue au complet (6
  // champs, dont `devise` qu'on ne veut pas exposer ici) : cf. commentaire de
  // ReferentielsService.parametresCalcul().
  @Authenticated()
  @Get("parametres-calcul/:circuit")
  @ApiZodResponse(200, parametresCalculPublicVueSchema)
  async parametresCalcul(@Param("circuit") circuit: string): Promise<ParametresCalculPublicVue> {
    return this.referentiels.parametresCalcul(circuit);
  }
}
