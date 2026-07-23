import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import {
  creerDemandeRequeteSchema,
  definirLignesRequeteSchema,
  listerDemandesQuerySchema,
  modifierDemandeRequeteSchema,
  type ApercuRoutageReponse,
  type Demande,
  type DemandeDetail,
  type PieceJointeVue,
  type SiVue,
  type SoumissionReponse
} from "@pgd/contracts";
import { Authenticated } from "../../common/decorators/authenticated.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import type { UtilisateurRequete } from "../../common/guards/auth.guard";
import { InitiateurDemandeGuard } from "../../common/guards/initiateur-demande.guard";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { DemandeService } from "./services/demande.service";
import { DemandeLigneService } from "./services/demande-ligne.service";
import { DemandeWorkflowService } from "./services/demande-workflow.service";
import { PieceService } from "./services/piece.service";
import { RuleEngineService } from "./services/rule-engine.service";
import { SiService } from "./services/si.service";

// Aucune source ne restreint ces routes à un sous-ensemble de rôles (docs/06
// §4) : la création/consultation d'une demande est ouverte à tout utilisateur
// authentifié, quel que soit son rôle métier ou son circuit — comme pour les
// lectures de lignes/comptes en Phase 3.
@ApiTags("demandes")
@Controller("demandes")
export class DemandesController {
  constructor(
    private readonly demandeService: DemandeService,
    private readonly demandeLigneService: DemandeLigneService,
    private readonly workflow: DemandeWorkflowService,
    private readonly pieceService: PieceService,
    private readonly ruleEngine: RuleEngineService,
    private readonly prisma: PrismaService,
    private readonly siService: SiService
  ) {}

  // Pas de InitiateurDemandeGuard ici — volontaire, pas un oubli (confirmé
  // guard-coverage.spec.ts, TABLE_DEMANDES.creer: []). Ce guard vérifie une
  // PROPRIÉTÉ SUR UNE RESSOURCE EXISTANTE (demande.initiateurId ===
  // appelant.id) ; à la création, la ressource n'existe pas encore, la
  // question n'a pas de sens. Le scope est garanti autrement, par
  // construction : `initiateurId` vient de `utilisateur.id` (le JWT), jamais
  // du corps de la requête — `creerDemandeRequeteSchema` ne porte même pas
  // ce champ. Un appelant ne peut pas créer une demande au nom de quelqu'un
  // d'autre, structurellement, pas par un contrôle qu'on pourrait oublier.
  @Authenticated()
  @Post()
  async creer(@Body() body: unknown, @CurrentUser() utilisateur: UtilisateurRequete): Promise<DemandeDetail> {
    const dto = creerDemandeRequeteSchema.parse(body);
    return this.demandeService.creer(dto, utilisateur.id);
  }

  @Authenticated()
  @Get()
  async lister(@Query() query: unknown): Promise<{ demandes: Demande[]; meta: { total: number } }> {
    const dto = listerDemandesQuerySchema.parse(query);
    const { demandes, total } = await this.demandeService.lister(dto);
    return { demandes, meta: { total } };
  }

  @Authenticated()
  @Get(":id")
  async obtenirDetail(@Param("id") id: string): Promise<DemandeDetail> {
    return this.demandeService.obtenirDetail(id);
  }

  // PATCH /api/demandes/{id} (SF-PGD-087, R6) — re-routage si déjà soumise,
  // simple modification de champs sinon (DemandeWorkflowService tranche).
  // InitiateurDemandeGuard ne remplace pas le contrôle d'état déjà présent
  // dans modifierAvecReRoutage (BROUILLON -> modification libre ; sinon ->
  // re-routage tant qu'aucune décision n'est prise, R6) : propriété et état
  // sont deux gardes distincts, pas un substitut l'un de l'autre.
  @Authenticated()
  @UseGuards(InitiateurDemandeGuard)
  @Patch(":id")
  async modifier(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() utilisateur: UtilisateurRequete
  ): Promise<DemandeDetail> {
    const dto = modifierDemandeRequeteSchema.parse(body);
    return this.workflow.modifierAvecReRoutage(id, dto, { id: utilisateur.id, identifiantAd: utilisateur.identifiantAd });
  }

  @Authenticated()
  @UseGuards(InitiateurDemandeGuard)
  @Put(":id/lignes")
  async definirLignes(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() utilisateur: UtilisateurRequete
  ): Promise<DemandeDetail> {
    const dto = definirLignesRequeteSchema.parse(body);
    return this.demandeLigneService.definirLignes(id, dto, utilisateur.id);
  }

  @Authenticated()
  @UseGuards(InitiateurDemandeGuard)
  @Post(":id/calcul")
  @HttpCode(200)
  async recalculer(@Param("id") id: string, @CurrentUser() utilisateur: UtilisateurRequete): Promise<DemandeDetail> {
    return this.demandeService.recalculer(id, utilisateur.id);
  }

  // SF-PGD-033 : chaîne prévisionnelle + palier déclenché, sans instancier
  // aucune tâche — même sélection que la soumission (RuleEngineService),
  // en lecture seule. Gardé quand même par InitiateurDemandeGuard : même en
  // lecture, expose la chaîne de validation et les seuils financiers d'un
  // dossier tiers.
  @Authenticated()
  @UseGuards(InitiateurDemandeGuard)
  @Post(":id/apercu-routage")
  @HttpCode(200)
  async apercuRoutage(@Param("id") id: string): Promise<ApercuRoutageReponse> {
    const demande = await this.prisma.demande.findUnique({ where: { id } });
    if (!demande) {
      throw new NotFoundException({ code: "DEMANDE_INTROUVABLE", message: "Demande introuvable." });
    }

    const configuration = await this.ruleEngine.selectionnerConfiguration({
      circuit: demande.circuit,
      segment: demande.segment,
      sousFlux: demande.sousFlux,
      montantTtc: Number(demande.montantTtc)
    });

    return {
      labelPalier: configuration.labelPalier,
      etapes: configuration.etapesRegle.map((e) => ({
        ordre: e.ordre,
        roleCode: e.roleCode,
        typeActeur: e.typeActeur,
        bloquant: e.bloquant,
        slaHeures: e.slaHeures
      }))
    };
  }

  @Authenticated()
  @UseGuards(InitiateurDemandeGuard)
  @Post(":id/soumettre")
  @HttpCode(200)
  async soumettre(@Param("id") id: string, @CurrentUser() utilisateur: UtilisateurRequete): Promise<SoumissionReponse> {
    return this.workflow.soumettre(id, { id: utilisateur.id, identifiantAd: utilisateur.identifiantAd });
  }

  @Authenticated()
  @UseGuards(InitiateurDemandeGuard)
  @Post(":id/abandonner")
  @HttpCode(200)
  async abandonner(
    @Param("id") id: string,
    @CurrentUser() utilisateur: UtilisateurRequete
  ): Promise<{ abandonne: true }> {
    await this.workflow.abandonner(id, { id: utilisateur.id, identifiantAd: utilisateur.identifiantAd });
    return { abandonne: true };
  }

  @Authenticated()
  @UseGuards(InitiateurDemandeGuard)
  @Post(":id/rappeler")
  @HttpCode(200)
  async rappeler(@Param("id") id: string, @CurrentUser() utilisateur: UtilisateurRequete): Promise<{ rappele: true }> {
    await this.workflow.rappeler(id, { id: utilisateur.id, identifiantAd: utilisateur.identifiantAd });
    return { rappele: true };
  }

  @Authenticated()
  @UseGuards(InitiateurDemandeGuard)
  @Post(":id/pieces")
  @HttpCode(201)
  @UseInterceptors(FileInterceptor("fichier"))
  async ajouterPiece(
    @Param("id") id: string,
    @UploadedFile() fichier: Express.Multer.File,
    @Body("pieceAfferenteId") pieceAfferenteId?: string
  ): Promise<PieceJointeVue> {
    return this.pieceService.ajouter(id, fichier, pieceAfferenteId);
  }

  @Authenticated()
  @UseGuards(InitiateurDemandeGuard)
  @Delete(":id/pieces/:pieceId")
  @HttpCode(200)
  async supprimerPiece(@Param("id") id: string, @Param("pieceId") pieceId: string): Promise<{ supprime: true }> {
    await this.pieceService.supprimer(id, pieceId);
    return { supprime: true };
  }

  // PGD-060/061 — état de restitution SI, lecture ouverte à tout utilisateur
  // authentifié comme le reste de la fiche (docs/06 §4, même raisonnement que
  // obtenirDetail ci-dessus).
  @Authenticated()
  @Get(":id/si")
  async obtenirEtatSi(@Param("id") id: string): Promise<SiVue> {
    return this.siService.obtenirEtat(id);
  }

  // PGD-062 — rejeu manuel. « Rôle habilité » non nommé dans les sources ;
  // ADMIN_PGD par défaut provisoire (CLAUDE.md « Questions ouvertes ») — le
  // précédent escalade-manuelle/import-crm ne transfère qu'à moitié : ces
  // actions sont réversibles et sans effet externe, alors que pousser au SI
  // de facturation a une conséquence financière réelle. Un rôle SI-ops dédié
  // serait plus cohérent — à trancher avec le métier, pas une décision
  // unilatérale de ce code.
  @Roles("ADMIN_PGD")
  @Post(":id/si/pousser")
  @HttpCode(200)
  async rejouerSi(@Param("id") id: string): Promise<SiVue> {
    return this.siService.rejouerManuel(id);
  }
}
