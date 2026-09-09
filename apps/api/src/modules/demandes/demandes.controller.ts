import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { ApiTags } from "@nestjs/swagger";
import {
  apercuRoutageReponseSchema,
  creerDemandeRequeteSchema,
  definirLignesRequeteSchema,
  demandeDetailSchema,
  dossiersAttentionReponseSchema,
  echeanceCorrectionReponseSchema,
  listerDemandesQuerySchema,
  modifierDemandeRequeteSchema,
  modifierTaxesRequeteSchema,
  pieceJointeSchema,
  siVueSchema,
  soumissionReponseSchema,
  type ApercuRoutageReponse,
  type Demande,
  type DemandeDetail,
  type DossierAttentionVue,
  type EcheanceCorrectionReponse,
  type EtapeDossier,
  type PieceJointeVue,
  type SiVue,
  type SoumissionReponse
} from "@pgd/contracts";
import { ApiZodBody, ApiZodQuery, ApiZodResponse } from "../../common/swagger/zod-schema";
import { Authenticated } from "../../common/decorators/authenticated.decorator";
import { SansJournalActivite } from "../../common/decorators/sans-journal-activite.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { ProfilRequis } from "../../common/decorators/profil-requis.decorator";
import type { UtilisateurRequete } from "../../common/guards/auth.guard";
import { InitiateurDemandeGuard } from "../../common/guards/initiateur-demande.guard";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { DemandeService } from "./services/demande.service";
import { DemandeLigneService } from "./services/demande-ligne.service";
import { DemandeWorkflowService } from "./services/demande-workflow.service";
import { PieceService } from "./services/piece.service";
import { RuleEngineService } from "./services/rule-engine.service";
import { CalendrierSlaService } from "./services/calendrier-sla.service";
import { SiService } from "./services/si.service";

// La CONSULTATION (lecture) de ces routes reste ouverte à tout utilisateur
// authentifié, quel que soit son rôle métier ou son circuit (docs/06 §4,
// comme pour les lectures de lignes/comptes en Phase 3) — inchangé.
//
// La CRÉATION (`creer`, ci-dessous) est restreinte depuis le 25/08/2026
// (demande explicite) : seul un porteur d'un rôle INITIATEUR_<CIRCUIT> ou
// ADMIN_PGD peut créer une demande. Avant ce chantier, n'importe quel
// utilisateur authentifié — y compris un simple validateur/contrôleur sans
// aucun rôle d'initiation — pouvait créer un dossier et en devenir
// l'initiateur, ce que la maquette n'a jamais montré (le menu « Nouvelle
// demande » suppose implicitement un profil initiateur) et qu'aucune source
// ne justifiait explicitement une fois la question posée.
//
// RECONVERTI en @ProfilRequis (Chantier 2, 28/08/2026, docs/14) : l'ancienne
// liste `@Roles("INITIATEUR_DOBB", "INITIATEUR_DXC", "INITIATEUR_DF",
// "ADMIN_PGD")` était un exemple canonique de « Famille B » — un contrôle par
// ÉNUMÉRATION OUVERTE de codes de rôle, qui casse silencieusement à l'ajout
// d'un nouveau circuit/rôle d'initiation (rien n'aurait rappelé de mettre à
// jour cette liste). `@ProfilRequis("INITIATEUR", "ADMINISTRATEUR")` porte la
// même autorisation via `Role.profilSysteme` (donnée, jamais code) — ajouter
// un futur circuit/rôle d'initiation n'exige plus qu'un `profilSysteme:
// "INITIATEUR"` sur la nouvelle ligne `Role`, aucun changement de code ici.
// `ProfilGuard` (global) applique cette restriction — un contrôle client
// (masquer le lien dans `Sidebar`) reste un confort de navigation, jamais la
// garantie (règle non négociable 2).
@ApiTags("demandes")
@Controller("demandes")
export class DemandesController {
  constructor(
    private readonly demandeService: DemandeService,
    private readonly demandeLigneService: DemandeLigneService,
    private readonly workflow: DemandeWorkflowService,
    private readonly pieceService: PieceService,
    private readonly ruleEngine: RuleEngineService,
    private readonly calendrierSla: CalendrierSlaService,
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
  @ProfilRequis("INITIATEUR", "ADMINISTRATEUR")
  @Post()
  @ApiZodBody(creerDemandeRequeteSchema)
  @ApiZodResponse(201, demandeDetailSchema)
  async creer(@Body() body: unknown, @CurrentUser() utilisateur: UtilisateurRequete): Promise<DemandeDetail> {
    const dto = creerDemandeRequeteSchema.parse(body);
    return this.demandeService.creer(dto, utilisateur.id);
  }

  // `@CurrentUser()` désormais injecté (absent jusqu'ici, cf. CLAUDE.md §
  // Questions ouvertes, question fermée en Phase 9.2) — nécessaire pour que
  // `profil=initiateur` puisse forcer `initiateurId` depuis la session
  // réelle. Sans `profil`, le comportement non scopé reste inchangé (docs/06
  // §4, lecture ouverte à tout authentifié).
  @Authenticated()
  @Get()
  @ApiZodQuery(listerDemandesQuerySchema)
  async lister(
    @Query() query: unknown,
    @CurrentUser() utilisateur: UtilisateurRequete
  ): Promise<{ data: Demande[]; meta: { total: number } }> {
    const dto = listerDemandesQuerySchema.parse(query);
    const { demandes, total } = await this.demandeService.lister(dto, utilisateur.id);
    return { data: demandes, meta: { total } };
  }

  // GET /api/demandes/attention (09/09/2026, tableau de bord Initiateur —
  // demande explicite) — route LITTÉRALE déclarée AVANT `:id` ci-dessous,
  // même discipline que le bug d'ordre de routes déjà trouvé sur
  // AuditController (Phase 8, cf. CLAUDE.md) : sans ça, `GET
  // /api/demandes/attention` serait intercepté par `obtenirDetail("attention")`
  // et planterait en tentant de parser "attention" comme un UUID.
  // `initiateurId` JAMAIS un paramètre client — forcé à l'appelant, même
  // discipline que `profil=initiateur` sur `lister()` ci-dessus.
  @Authenticated()
  @Get("attention")
  @ApiZodResponse(200, dossiersAttentionReponseSchema)
  async attention(@CurrentUser() utilisateur: UtilisateurRequete): Promise<DossierAttentionVue[]> {
    const rejetes = await this.dossiersRejetesEnAttente(utilisateur.id);
    const anciens = await this.dossiersAnciensSansDecision(utilisateur.id);
    return [...rejetes, ...anciens];
  }

  // Critère 1 — dossiers renvoyés pour correction (même détection que
  // l'onglet Rejetées, MesDemandesScreen : action JournalAudit
  // "renvoi-correction"), triés par échéance croissante (le plus urgent en
  // premier). Réutilise exactement le calcul d'echeanceCorrection ci-dessous
  // — jamais un second calcul divergent.
  private async dossiersRejetesEnAttente(initiateurId: string): Promise<DossierAttentionVue[]> {
    const dossiers = await this.prisma.demande.findMany({
      where: {
        initiateurId,
        statut: "BROUILLON",
        dateSoumission: { not: null },
        journalAudit: { some: { action: "renvoi-correction" } }
      }
    });

    const avecEcheance = await Promise.all(
      dossiers.map(async (d) => {
        const echeance = await this.calculerEcheanceCorrection(d);
        return {
          id: d.id,
          reference: d.reference,
          nomClient: d.nomClient,
          circuit: d.circuit,
          montantTtc: Number(d.montantTtc),
          type: "rejete" as const,
          echeance,
          depuis: (d.dateSoumission as Date).toISOString()
        };
      })
    );
    return avecEcheance.sort((a, b) => (a.echeance ?? "").localeCompare(b.echeance ?? ""));
  }

  // Critère 2 — dossiers soumis depuis plus que le seuil configuré, sans
  // aucune décision (statut toujours SOUMIS) — jamais un seuil codé en dur
  // (R11), lu depuis ParametreGlobal comme ttlVerrouSecondes (TacheService).
  private async dossiersAnciensSansDecision(initiateurId: string): Promise<DossierAttentionVue[]> {
    const parametre = await this.prisma.parametreGlobal.findUnique({
      where: { cle: "seuil_alerte_dossier_ancien_jours" }
    });
    const jours = (parametre?.valeur as { jours?: unknown } | null)?.jours;
    if (typeof jours !== "number" || !Number.isInteger(jours) || jours <= 0) {
      throw new InternalServerErrorException({
        code: "PARAMETRE_GLOBAL_INVALIDE",
        message: "seuil_alerte_dossier_ancien_jours est absent ou invalide en base."
      });
    }
    const seuil = new Date(Date.now() - jours * 24 * 60 * 60 * 1000);

    const dossiers = await this.prisma.demande.findMany({
      where: { initiateurId, statut: "SOUMIS", dateSoumission: { lt: seuil } }
    });
    return dossiers
      .map((d) => ({
        id: d.id,
        reference: d.reference,
        nomClient: d.nomClient,
        circuit: d.circuit,
        montantTtc: Number(d.montantTtc),
        type: "ancien" as const,
        echeance: null,
        depuis: (d.dateSoumission as Date).toISOString()
      }))
      .sort((a, b) => a.depuis.localeCompare(b.depuis));
  }

  // Factorisation du calcul déjà écrit dans echeanceCorrection ci-dessous —
  // extrait ici pour être réutilisable par dossiersRejetesEnAttente
  // ci-dessus, comportement strictement identique, jamais dupliqué.
  private async calculerEcheanceCorrection(demande: { id: string; circuit: string; segment: string; sousFlux: string | null; montantTtc: unknown }): Promise<string | null> {
    const dernierRejet = await this.prisma.journalAudit.findFirst({
      where: { demandeId: demande.id, action: "rejet" },
      orderBy: { horodatage: "desc" }
    });
    if (!dernierRejet) return null;

    let configuration;
    try {
      configuration = await this.ruleEngine.selectionnerConfiguration({
        circuit: demande.circuit as never,
        segment: demande.segment,
        sousFlux: demande.sousFlux,
        montantTtc: Number(demande.montantTtc)
      });
    } catch {
      return null;
    }

    const sommeSlaHeures = configuration.etapesRegle.filter((e) => e.bloquant).reduce((total, e) => total + e.slaHeures, 0);
    if (sommeSlaHeures === 0) return null;

    const echeance = await this.calendrierSla.calculerEcheance(dernierRejet.horodatage, sommeSlaHeures);
    return echeance.toISOString();
  }

  @Authenticated()
  @Get(":id")
  @ApiZodResponse(200, demandeDetailSchema)
  async obtenirDetail(@Param("id") id: string): Promise<DemandeDetail> {
    return this.demandeService.obtenirDetail(id);
  }

  // GET /api/demandes/{id}/taches (Phase 9.2) — chaîne réelle du dossier,
  // pour l'onglet « Circuit de validation ». Même ouverture qu'obtenirDetail
  // ci-dessus (docs/06 §4) : pas de guard supplémentaire, la 404 sur demande
  // absente est portée par le service.
  @Authenticated()
  @Get(":id/taches")
  async listerTaches(@Param("id") id: string): Promise<EtapeDossier[]> {
    return this.demandeService.listerTaches(id);
  }

  // DELETE /api/demandes/{id} — suppression d'un BROUILLON par son
  // initiateur (Phase 9.2, question ouverte fermée : « abandon » exige un
  // dossier déjà engagé dans une chaîne de validation, un brouillon ne l'est
  // jamais — deux opérations distinctes, pas un raccourci). Le contrôle
  // d'état (statut === BROUILLON) reste dans le service, comme pour
  // definirLignes/modifier — InitiateurDemandeGuard ne vérifie QUE la
  // propriété.
  @Authenticated()
  @UseGuards(InitiateurDemandeGuard)
  @Delete(":id")
  @HttpCode(200)
  async supprimer(@Param("id") id: string): Promise<{ supprime: true }> {
    await this.demandeService.supprimer(id);
    return { supprime: true };
  }

  // PATCH /api/demandes/{id} (SF-PGD-087, R6) — re-routage si déjà soumise,
  // simple modification de champs sinon (DemandeWorkflowService tranche).
  // InitiateurDemandeGuard ne remplace pas le contrôle d'état déjà présent
  // dans modifierAvecReRoutage (BROUILLON -> modification libre ; sinon ->
  // re-routage tant qu'aucune décision n'est prise, R6) : propriété et état
  // sont deux gardes distincts, pas un substitut l'un de l'autre.
  // @SansJournalActivite() — écrit déjà JournalAudit quand applicable
  // (action "re-routage" via reRouterSiEngage, ou "creation-correction"/
  // "bascule-nouveau-dossier" via dupliquerVersNouveauDossier — les deux
  // conditionnels, jamais systématiques, mais toujours cette même route).
  @Authenticated()
  @UseGuards(InitiateurDemandeGuard)
  @SansJournalActivite()
  @Patch(":id")
  @ApiZodBody(modifierDemandeRequeteSchema)
  @ApiZodResponse(200, demandeDetailSchema)
  async modifier(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() utilisateur: UtilisateurRequete
  ): Promise<DemandeDetail> {
    const dto = modifierDemandeRequeteSchema.parse(body);
    return this.workflow.modifierAvecReRoutage(id, dto, { id: utilisateur.id, identifiantAd: utilisateur.identifiantAd });
  }

  // PATCH /api/demandes/{id}/taxes (Phase 10.6septies, confirmation métier
  // docs/10 DOBB #1/#2/#6) — route dédiée, jamais mélangée à modifier() :
  // DemandeWorkflowService.modifierTaxes trace R25 (HISTORIQUE_MONTANT) et
  // redéclenche le re-routage R6 si le dossier est déjà engagé.
  // @SansJournalActivite() — écrit déjà JournalAudit quand le dossier est
  // engagé (action "re-routage" via reRouterSiEngage, conditionnel).
  @Authenticated()
  @UseGuards(InitiateurDemandeGuard)
  @SansJournalActivite()
  @Patch(":id/taxes")
  @ApiZodBody(modifierTaxesRequeteSchema)
  @ApiZodResponse(200, demandeDetailSchema)
  async modifierTaxes(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() utilisateur: UtilisateurRequete
  ): Promise<DemandeDetail> {
    const dto = modifierTaxesRequeteSchema.parse(body);
    return this.workflow.modifierTaxes(id, dto, { id: utilisateur.id, identifiantAd: utilisateur.identifiantAd });
  }

  @Authenticated()
  @UseGuards(InitiateurDemandeGuard)
  @Put(":id/lignes")
  @ApiZodBody(definirLignesRequeteSchema)
  @ApiZodResponse(200, demandeDetailSchema)
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
  @ApiZodResponse(200, demandeDetailSchema)
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
  @ApiZodResponse(200, apercuRoutageReponseSchema)
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
        roleLibelle: e.roleLibelle,
        // ConfigurationCache.typeActeur reste déclaré `string` (RuleEngineService)
        // — même cast déjà utilisé ailleurs dans ce service pour la même raison
        // (instancierChaine), pas une divergence introduite ici.
        typeActeur: e.typeActeur as never,
        bloquant: e.bloquant,
        slaHeures: e.slaHeures
      }))
    };
  }

  // GET /api/demandes/{id}/echeance-correction (25/08/2026, corbeille
  // Rejetées de l'initiateur — confirmation métier explicite, cf.
  // packages/contracts/src/demande.ts) — même garde qu'apercuRoutage, même
  // raison : expose la chaîne SLA d'un dossier tiers. Route GET,
  // structurellement hors périmètre de guard-coverage.spec.ts
  // (listerRoutesEcriture ne retient que les méthodes d'écriture), même
  // précédent que parametres-calcul/:circuit. `null` (jamais une erreur)
  // pour tout dossier hors de l'état « renvoyé, correction possible » — un
  // badge simplement absent côté écran.
  @Authenticated()
  @UseGuards(InitiateurDemandeGuard)
  @Get(":id/echeance-correction")
  @ApiZodResponse(200, echeanceCorrectionReponseSchema)
  async echeanceCorrection(@Param("id") id: string): Promise<EcheanceCorrectionReponse> {
    const demande = await this.prisma.demande.findUnique({ where: { id } });
    if (!demande) {
      throw new NotFoundException({ code: "DEMANDE_INTROUVABLE", message: "Demande introuvable." });
    }
    if (demande.statut !== "BROUILLON" || demande.dateSoumission === null) {
      return { echeance: null };
    }
    return { echeance: await this.calculerEcheanceCorrection(demande) };
  }

  // @SansJournalActivite() — écrit déjà JournalAudit (action "soumission",
  // DemandeWorkflowService.soumettre).
  @Authenticated()
  @UseGuards(InitiateurDemandeGuard)
  @SansJournalActivite()
  @Post(":id/soumettre")
  @HttpCode(200)
  @ApiZodResponse(200, soumissionReponseSchema)
  async soumettre(@Param("id") id: string, @CurrentUser() utilisateur: UtilisateurRequete): Promise<SoumissionReponse> {
    return this.workflow.soumettre(id, { id: utilisateur.id, identifiantAd: utilisateur.identifiantAd });
  }

  // @SansJournalActivite() — écrit déjà JournalAudit via
  // terminerSiAucuneDecision (action variable selon l'appelant, cf.
  // DemandeWorkflowService — même méthode privée que rappeler ci-dessous).
  @Authenticated()
  @UseGuards(InitiateurDemandeGuard)
  @SansJournalActivite()
  @Post(":id/abandonner")
  @HttpCode(200)
  async abandonner(
    @Param("id") id: string,
    @CurrentUser() utilisateur: UtilisateurRequete
  ): Promise<{ abandonne: true }> {
    await this.workflow.abandonner(id, { id: utilisateur.id, identifiantAd: utilisateur.identifiantAd });
    return { abandonne: true };
  }

  // @SansJournalActivite() — écrit déjà JournalAudit via
  // terminerSiAucuneDecision, même mécanisme qu'abandonner ci-dessus.
  @Authenticated()
  @UseGuards(InitiateurDemandeGuard)
  @SansJournalActivite()
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
  @ApiZodResponse(201, pieceJointeSchema)
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

  // GET .../pieces/{pieceId}/telecharger (08/09/2026, demande explicite) —
  // ferme le trou déjà documenté (CLAUDE.md « Aucune route ne sert le
  // fichier réel d'une pièce jointe »). @Authenticated() seul, jamais
  // InitiateurDemandeGuard : le téléchargement doit être possible pour tout
  // viewer du dossier (docs/06 §4, même ouverture que obtenirDetail), pas
  // seulement l'initiateur — contrairement à ajouterPiece/supprimerPiece
  // ci-dessus. Réponse binaire brute, contourne délibérément
  // ResponseEnvelopeInterceptor (même patron que AuditController.exporter()).
  @Authenticated()
  @Get(":id/pieces/:pieceId/telecharger")
  async telechargerPiece(
    @Param("id") id: string,
    @Param("pieceId") pieceId: string,
    @Res() res: Response
  ): Promise<void> {
    const fichier = await this.pieceService.lireFichier(id, pieceId);
    res.setHeader("Content-Type", fichier.typeMime);
    res.setHeader("Content-Disposition", `attachment; filename="${fichier.nomFichier}"`);
    res.send(fichier.contenu);
  }

  // PGD-060/061 — état de restitution SI, lecture ouverte à tout utilisateur
  // authentifié comme le reste de la fiche (docs/06 §4, même raisonnement que
  // obtenirDetail ci-dessus).
  @Authenticated()
  @Get(":id/si")
  @ApiZodResponse(200, siVueSchema)
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
  @ApiZodResponse(200, siVueSchema)
  async rejouerSi(@Param("id") id: string): Promise<SiVue> {
    return this.siService.rejouerManuel(id);
  }
}
