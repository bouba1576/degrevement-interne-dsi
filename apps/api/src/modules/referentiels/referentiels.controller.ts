import { Controller, ForbiddenException, Get, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  circuitVueSchema,
  directionResponsabiliteVueSchema,
  facteurDegrevementVueSchema,
  libelleAjustementVueSchema,
  listerMotifsQuerySchema,
  membreRoleVueSchema,
  motifVueSchema,
  parametresCalculPublicVueSchema,
  sousFluxVueSchema,
  universFmiVueSchema,
  type CircuitVue,
  type DirectionResponsabiliteVue,
  type FacteurDegrevementVue,
  type LibelleAjustementVue,
  type MembreRoleVue,
  type MotifVue,
  type ParametresCalculPublicVue,
  type SousFluxVue,
  type UniversFmiVue
} from "@pgd/contracts";
import { ApiZodQuery, ApiZodResponse } from "../../common/swagger/zod-schema";
import { Authenticated } from "../../common/decorators/authenticated.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { UtilisateurRequete } from "../../common/guards/auth.guard";
import { AdminMotifsService } from "../admin/services/admin-motifs.service";
import { AdminLibellesAjustementService } from "../admin/services/admin-libelles-ajustement.service";
import { AdminSousFluxService } from "../admin/services/admin-sous-flux.service";
import { AdminCircuitsService } from "../admin/services/admin-circuits.service";
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
    private readonly motifs: AdminMotifsService,
    private readonly libellesAjustement: AdminLibellesAjustementService,
    private readonly sousFlux: AdminSousFluxService,
    private readonly circuits: AdminCircuitsService
  ) {}

  // GET /api/referentiels/circuits — écarts DossierDetailScreen (Phase
  // 10.6quinquies, point 4) : ApercuTab résout Circuit.libelle pour tout
  // viewer authentifié d'un dossier, pas seulement ADMIN_PGD (admin/circuits
  // reste réservé au CRUD).
  @Authenticated()
  @Get("circuits")
  @ApiZodResponse(200, z.array(circuitVueSchema))
  async listerCircuits(): Promise<CircuitVue[]> {
    return this.circuits.lister();
  }

  // GET /api/referentiels/motifs?circuit= (circuit optionnel)
  @Authenticated()
  @Get("motifs")
  @ApiZodQuery(listerMotifsQuerySchema)
  @ApiZodResponse(200, z.array(motifVueSchema))
  async listerMotifs(@Query() query: unknown): Promise<MotifVue[]> {
    const { circuit } = listerMotifsQuerySchema.parse(query);
    return this.motifs.listerActifs(circuit);
  }

  // GET /api/referentiels/libelles-ajustement?circuit= (docs/10 remarques
  // DOBB #3 / DXC #16, Phase 10.6ter) — même query schema que motifs (forme
  // identique, {circuit?}), pas de duplication.
  @Authenticated()
  @Get("libelles-ajustement")
  @ApiZodQuery(listerMotifsQuerySchema)
  @ApiZodResponse(200, z.array(libelleAjustementVueSchema))
  async listerLibellesAjustement(@Query() query: unknown): Promise<LibelleAjustementVue[]> {
    const { circuit } = listerMotifsQuerySchema.parse(query);
    return this.libellesAjustement.listerActifs(circuit);
  }

  // GET /api/referentiels/sous-flux?circuit= (14/08/2026, champ sousFluxId
  // sur Utilisateur) — NouvelleDemandeScreen peuple son menu de
  // préremplissage depuis cette route, pas admin/sous-flux (ADMIN_PGD).
  @Authenticated()
  @Get("sous-flux")
  @ApiZodQuery(listerMotifsQuerySchema)
  @ApiZodResponse(200, z.array(sousFluxVueSchema))
  async listerSousFlux(@Query() query: unknown): Promise<SousFluxVue[]> {
    const { circuit } = listerMotifsQuerySchema.parse(query);
    return this.sousFlux.lister(circuit);
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

  // GET /api/referentiels/roles/:roleCode/membres (25/08/2026, bouton
  // Déléguer — cf. CLAUDE.md « Aucune route ne liste ou ne recherche les
  // utilisateurs »). Portée vérifiée ici, pas dans le service (même
  // discipline que profil=initiateur sur GET /api/demandes) : l'appelant ne
  // peut interroger que la composition d'un rôle qu'il détient lui-même —
  // jamais un annuaire général. `utilisateur.roles` vient du JWT (identique
  // à la garde déjà utilisée par TacheActionBanner côté client pour
  // déterminer l'étape actionnable), pas une requête MembreRole
  // supplémentaire.
  @Authenticated()
  @Get("roles/:roleCode/membres")
  @ApiZodResponse(200, z.array(membreRoleVueSchema))
  async listerMembresRole(
    @Param("roleCode") roleCode: string,
    @CurrentUser() utilisateur: UtilisateurRequete
  ): Promise<MembreRoleVue[]> {
    if (!utilisateur.roles.includes(roleCode)) {
      throw new ForbiddenException({
        code: "ACCES_REFUSE",
        message: "Vous ne pouvez consulter que la composition d'un rôle que vous détenez."
      });
    }
    return this.referentiels.listerMembresRole(roleCode);
  }
}
