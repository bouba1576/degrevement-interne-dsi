import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@pgd/database";
import type { Demande as DemandePrisma } from "@pgd/database";
import type {
  CreerDemandeRequete,
  Demande,
  DemandeDetail,
  ListerDemandesQuery,
  ModifierDemandeRequete
} from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import { ReferenceService } from "./reference.service";
import { MontantService } from "./montant.service";
import { HistoriqueMontantService } from "./historique-montant.service";
import { GedStubAdapter } from "../providers/ged-stub.adapter";

type DemandeAvecRelations = Prisma.DemandeGetPayload<{ include: { lignes: true; pieces: true } }>;

@Injectable()
export class DemandeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reference: ReferenceService,
    private readonly montant: MontantService,
    private readonly historique: HistoriqueMontantService,
    private readonly ged: GedStubAdapter
  ) {}

  // POST /api/demandes (SF-PGD-040) — brouillon, segment dérivé du circuit
  // (jamais saisi, cf. paliers.seed.ts), periode_contestee_jours calculé.
  async creer(dto: CreerDemandeRequete, initiateurId: string): Promise<DemandeDetail> {
    const circuitRef = await this.prisma.circuit.findUniqueOrThrow({ where: { code: dto.circuit } });
    const taux = await this.montant.tauxDuCircuit(dto.circuit);
    const { serviceRespId, responsabiliteServiceAutre } = this.normaliserServiceResponsable(
      dto.serviceRespId,
      dto.responsabiliteServiceAutre
    );

    const demande = await this.prisma.$transaction(async (tx) => {
      const cree = await this.creerAvecReferenceUnique(tx, {
        circuit: dto.circuit,
        segment: circuitRef.segment,
        sousFlux: dto.sousFlux,
        nomClient: dto.nomClient,
        compteClient: dto.compteClient,
        agentInitiateur: dto.agentInitiateur,
        matriculeInitiateur: dto.matriculeInitiateur,
        agentSaisie: dto.agentSaisie,
        localisation: dto.localisation,
        canalRemontee: dto.canalRemontee,
        dateReceptionBo: dto.dateReceptionBo ? new Date(dto.dateReceptionBo) : undefined,
        dateReceptionOci: dto.dateReceptionOci ? new Date(dto.dateReceptionOci) : undefined,
        formuleAbonnement: dto.formuleAbonnement,
        numeroAppel: dto.numeroAppel,
        debutPeriodeContestee: dto.debutPeriodeContestee ? new Date(dto.debutPeriodeContestee) : undefined,
        finPeriodeContestee: dto.finPeriodeContestee ? new Date(dto.finPeriodeContestee) : undefined,
        periodeContesteeJours: this.calculerJoursContestes(dto.debutPeriodeContestee, dto.finPeriodeContestee),
        recurrentMensuel: dto.recurrentMensuel ?? false,
        champsCircuit: (dto.champsCircuit ?? {}) as Prisma.InputJsonValue,
        tauxTsc: taux.tauxTsc,
        tauxTva: taux.tauxTva,
        tscActive: taux.tscActive,
        tvaActive: taux.tvaActive,
        libelle: dto.libelle,
        motifId: dto.motifId,
        universFmiCode: dto.universFmiCode,
        facteurCode: dto.facteurCode,
        directionRespId: dto.directionRespId,
        serviceRespId,
        agentResponsable: dto.agentResponsable,
        commentaire: dto.commentaire,
        responsabiliteServiceAutre,
        initiateurId
      });

      await this.historique.enregistrer(
        {
          demandeId: cree.id,
          montants: { montantHt: 0, montantTsc: 0, montantTva: 0, montantTtc: 0 },
          tauxTsc: taux.tauxTsc,
          tauxTva: taux.tauxTva,
          origine: "CREATION",
          acteurId: initiateurId
        },
        tx
      );

      return cree;
    });

    return { demande: this.versDemande(demande), lignes: [], pieces: [] };
  }

  // DELETE /api/demandes/{id} — suppression d'un BROUILLON par son
  // initiateur (InitiateurDemandeGuard, contrôleur). Restreinte au statut
  // BROUILLON : un dossier déjà soumis se clôt par abandon (statut
  // ABANDONNE, tracé), jamais par suppression — les deux opérations ont un
  // sens métier différent (cf. CLAUDE.md § Questions ouvertes, question
  // fermée en Phase 9.2). Suppression PHYSIQUE, en cascade (DemandeLigne,
  // HistoriqueMontant, PieceJointe — onDelete: Cascade, schema.prisma) :
  // aucune entrée JournalAudit n'existe jamais pour un brouillon (creer/
  // definirLignes n'écrivent que dans HISTORIQUE_MONTANT, jamais
  // JOURNAL_AUDIT — vérifié, rien à orpheliner ni à décider ici). Point qui
  // NE se règle PAS par la seule cascade SQL : les pièces jointes ont un
  // fichier réel sur disque (GedStubAdapter.stocker) — un DELETE cascadé au
  // niveau base ne l'efface jamais, contrairement à PieceService.supprimer
  // qui appelle explicitement `ged.supprimer()`. Sans cette boucle, chaque
  // pièce d'un brouillon supprimé laisserait un fichier orphelin permanent.
  async supprimer(demandeId: string): Promise<void> {
    const demande = await this.prisma.demande.findUnique({ where: { id: demandeId } });
    if (!demande) {
      throw new NotFoundException({ code: "DEMANDE_INTROUVABLE", message: "Demande introuvable." });
    }
    if (demande.statut !== "BROUILLON") {
      throw new UnprocessableEntityException({
        code: "DEMANDE_NON_SUPPRIMABLE",
        message: "Seul un brouillon peut être supprimé — un dossier déjà soumis se clôt par abandon."
      });
    }

    const pieces = await this.prisma.pieceJointe.findMany({ where: { demandeId } });
    for (const piece of pieces) {
      if (piece.gedRef) await this.ged.supprimer(piece.gedRef);
    }

    await this.prisma.demande.delete({ where: { id: demandeId } });
  }

  async obtenirDetail(id: string): Promise<DemandeDetail> {
    const demande = await this.prisma.demande.findUnique({
      where: { id },
      include: { lignes: true, pieces: true }
    });
    if (!demande) {
      throw new NotFoundException({ code: "DEMANDE_INTROUVABLE", message: "Demande introuvable." });
    }
    return this.versDetail(demande);
  }

  // POST /api/demandes/{id}/calcul (SF-PGD-041) — aperçu : recalcule TSC/TVA/
  // TTC depuis montant_ht déjà agrégé, sans toucher aux lignes (utile après un
  // changement de tsc_active/tva_active). origine=RECALCUL, acteur_id renseigné
  // car ce recalcul est déclenché par un utilisateur (R23 — ne pas l'omettre
  // sous prétexte que RECALCUL autorise un acteur NULL, qui ne vaut que pour un
  // recalcul système).
  async recalculer(id: string, acteurId: string): Promise<DemandeDetail> {
    const demande = await this.prisma.demande.findUnique({ where: { id } });
    if (!demande) {
      throw new NotFoundException({ code: "DEMANDE_INTROUVABLE", message: "Demande introuvable." });
    }

    const montants = this.montant.calculer(Number(demande.montantHt), {
      tauxTsc: Number(demande.tauxTsc),
      tauxTva: Number(demande.tauxTva),
      tscActive: demande.tscActive,
      tvaActive: demande.tvaActive
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.demande.update({
        where: { id },
        data: {
          montantHt: montants.montantHt,
          montantTsc: montants.montantTsc,
          montantTva: montants.montantTva,
          montantTtc: montants.montantTtc
        }
      });
      await this.historique.enregistrer(
        {
          demandeId: id,
          montants,
          tauxTsc: Number(demande.tauxTsc),
          tauxTva: Number(demande.tauxTva),
          origine: "RECALCUL",
          acteurId
        },
        tx
      );
    });

    return this.obtenirDetail(id);
  }

  async lister(query: ListerDemandesQuery): Promise<{ demandes: Demande[]; total: number }> {
    const where: Prisma.DemandeWhereInput = {
      circuit: query.circuit,
      statut: query.statut,
      siEtat: query.siEtat,
      ...(query.q
        ? { OR: [{ reference: { contains: query.q, mode: "insensitive" } }, { nomClient: { contains: query.q, mode: "insensitive" } }] }
        : {})
    };

    const [demandes, total] = await this.prisma.$transaction([
      this.prisma.demande.findMany({
        where,
        orderBy: { dateDemande: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit
      }),
      this.prisma.demande.count({ where })
    ]);

    return { demandes: demandes.map((d) => this.versDemande(d)), total };
  }

  // PATCH /api/demandes/{id} (SF-PGD-087) — circuit immuable. Le re-routage
  // d'une demande déjà soumise (R6) est traité par DemandeWorkflowService
  // (4.7), pas ici : ce service ne connaît que la modification des champs.
  async modifier(id: string, dto: ModifierDemandeRequete, acteurId: string): Promise<DemandeDetail> {
    const existante = await this.prisma.demande.findUnique({ where: { id } });
    if (!existante) {
      throw new NotFoundException({ code: "DEMANDE_INTROUVABLE", message: "Demande introuvable." });
    }

    const { serviceRespId, responsabiliteServiceAutre } = this.normaliserServiceResponsable(
      dto.serviceRespId ?? (existante.serviceRespId ?? undefined),
      dto.responsabiliteServiceAutre ?? (existante.responsabiliteServiceAutre ?? undefined)
    );

    const demande = await this.prisma.demande.update({
      where: { id },
      data: {
        sousFlux: dto.sousFlux,
        nomClient: dto.nomClient,
        compteClient: dto.compteClient,
        agentInitiateur: dto.agentInitiateur,
        matriculeInitiateur: dto.matriculeInitiateur,
        agentSaisie: dto.agentSaisie,
        localisation: dto.localisation,
        canalRemontee: dto.canalRemontee,
        dateReceptionBo: dto.dateReceptionBo ? new Date(dto.dateReceptionBo) : undefined,
        dateReceptionOci: dto.dateReceptionOci ? new Date(dto.dateReceptionOci) : undefined,
        formuleAbonnement: dto.formuleAbonnement,
        numeroAppel: dto.numeroAppel,
        debutPeriodeContestee: dto.debutPeriodeContestee ? new Date(dto.debutPeriodeContestee) : undefined,
        finPeriodeContestee: dto.finPeriodeContestee ? new Date(dto.finPeriodeContestee) : undefined,
        periodeContesteeJours:
          dto.debutPeriodeContestee || dto.finPeriodeContestee
            ? this.calculerJoursContestes(
                dto.debutPeriodeContestee ?? existante.debutPeriodeContestee?.toISOString(),
                dto.finPeriodeContestee ?? existante.finPeriodeContestee?.toISOString()
              )
            : undefined,
        recurrentMensuel: dto.recurrentMensuel,
        champsCircuit: dto.champsCircuit as Prisma.InputJsonValue | undefined,
        libelle: dto.libelle,
        motifId: dto.motifId,
        universFmiCode: dto.universFmiCode,
        facteurCode: dto.facteurCode,
        directionRespId: dto.directionRespId,
        serviceRespId,
        agentResponsable: dto.agentResponsable,
        commentaire: dto.commentaire,
        responsabiliteServiceAutre
      },
      include: { lignes: true, pieces: true }
    });

    void acteurId; // le re-routage (4.7) journalisera l'acteur ; simple modification de champs ici.
    return this.versDetail(demande);
  }

  // AUTRE (SF-PGD-330) : un serviceRespId réel efface toujours le texte libre
  // ("champ masqué et vidé") ; son absence conserve le texte libre saisi.
  private normaliserServiceResponsable(
    serviceRespId: string | undefined,
    responsabiliteServiceAutre: string | undefined
  ): { serviceRespId: string | undefined; responsabiliteServiceAutre: string | undefined } {
    if (serviceRespId) {
      return { serviceRespId, responsabiliteServiceAutre: undefined };
    }
    return { serviceRespId: undefined, responsabiliteServiceAutre };
  }

  private calculerJoursContestes(debut?: string, fin?: string): number | undefined {
    if (!debut || !fin) return undefined;
    const jours = Math.round((new Date(fin).getTime() - new Date(debut).getTime()) / 86_400_000) + 1;
    return jours > 0 ? jours : undefined;
  }

  private async creerAvecReferenceUnique(
    tx: Prisma.TransactionClient,
    data: Omit<Prisma.DemandeUncheckedCreateInput, "reference">
  ): Promise<DemandePrisma> {
    for (let tentative = 0; tentative < 5; tentative++) {
      try {
        return await tx.demande.create({ data: { ...data, reference: this.reference.generer(data.circuit) } });
      } catch (erreur) {
        const estConflitReference =
          erreur instanceof Prisma.PrismaClientKnownRequestError &&
          erreur.code === "P2002" &&
          (erreur.meta?.target as string[] | undefined)?.includes("reference");
        if (!estConflitReference) throw erreur;
      }
    }
    throw new Error("Impossible de générer une référence de demande unique après plusieurs tentatives.");
  }

  private versDetail(demande: DemandeAvecRelations): DemandeDetail {
    return {
      demande: this.versDemande(demande),
      lignes: demande.lignes.map((l) => ({
        id: l.id,
        ligneId: l.ligneId,
        nd: l.nd,
        formuleId: l.formuleId,
        recurrent: Number(l.recurrent),
        recurrentModifie: l.recurrentModifie,
        statutLigne: l.statutLigne,
        montantHtLigne: Number(l.montantHtLigne),
        debutPeriodeContestee: l.debutPeriodeContestee ? l.debutPeriodeContestee.toISOString().slice(0, 10) : null,
        finPeriodeContestee: l.finPeriodeContestee ? l.finPeriodeContestee.toISOString().slice(0, 10) : null,
        periodeContesteeJours: l.periodeContesteeJours
      })),
      pieces: demande.pieces.map((p) => ({
        id: p.id,
        pieceAfferenteId: p.pieceAfferenteId,
        nomFichier: p.nomFichier,
        typeMime: p.typeMime,
        tailleOctets: p.tailleOctets,
        gedRef: p.gedRef,
        dateAjout: p.dateAjout.toISOString()
      }))
    };
  }

  private versDemande(d: DemandePrisma): Demande {
    return {
      id: d.id,
      reference: d.reference,
      circuit: d.circuit,
      segment: d.segment,
      sousFlux: d.sousFlux,
      nomClient: d.nomClient,
      compteClient: d.compteClient,
      agentInitiateur: d.agentInitiateur,
      matriculeInitiateur: d.matriculeInitiateur,
      agentSaisie: d.agentSaisie,
      localisation: d.localisation,
      canalRemontee: d.canalRemontee,
      dateReceptionBo: d.dateReceptionBo ? d.dateReceptionBo.toISOString().slice(0, 10) : null,
      dateReceptionOci: d.dateReceptionOci ? d.dateReceptionOci.toISOString().slice(0, 10) : null,
      formuleAbonnement: d.formuleAbonnement,
      numeroAppel: d.numeroAppel,
      debutPeriodeContestee: d.debutPeriodeContestee ? d.debutPeriodeContestee.toISOString().slice(0, 10) : null,
      finPeriodeContestee: d.finPeriodeContestee ? d.finPeriodeContestee.toISOString().slice(0, 10) : null,
      periodeContesteeJours: d.periodeContesteeJours,
      recurrentMensuel: d.recurrentMensuel,
      champsCircuit: d.champsCircuit as Record<string, unknown>,
      montantHt: Number(d.montantHt),
      montantTsc: Number(d.montantTsc),
      montantTva: Number(d.montantTva),
      montantTtc: Number(d.montantTtc),
      tscActive: d.tscActive,
      tvaActive: d.tvaActive,
      tauxTsc: Number(d.tauxTsc),
      tauxTva: Number(d.tauxTva),
      libelle: d.libelle,
      motifId: d.motifId,
      universFmiCode: d.universFmiCode,
      facteurCode: d.facteurCode,
      directionRespId: d.directionRespId,
      serviceRespId: d.serviceRespId,
      agentResponsable: d.agentResponsable,
      statut: d.statut,
      etapeCourante: d.etapeCourante,
      initiateurId: d.initiateurId,
      dateDemande: d.dateDemande.toISOString(),
      dateSoumission: d.dateSoumission ? d.dateSoumission.toISOString() : null,
      dateCloture: d.dateCloture ? d.dateCloture.toISOString() : null,
      commentaire: d.commentaire,
      responsabiliteServiceAutre: d.responsabiliteServiceAutre,
      siEtat: d.siEtat,
      siRef: d.siRef,
      siHorodatage: d.siHorodatage ? d.siHorodatage.toISOString() : null,
      siMessage: d.siMessage,
      siTentatives: d.siTentatives,
      siAdaptateur: d.siAdaptateur
    };
  }
}
