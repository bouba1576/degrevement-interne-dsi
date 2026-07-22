import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { loadEnv } from "@pgd/config";
import type { ListerTachesQuery, TacheVue, TachesListeReponse } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import { CacheService } from "../../../infra/redis/cache.service";
import { DelegationService } from "./delegation.service";

interface TacheAvecDemande {
  id: string;
  demandeId: string;
  roleCorbeille: string;
  ordre: number;
  typeActeur: string;
  bloquant: boolean;
  slaHeures: number;
  modeAffectation: string;
  etat: string;
  agentClaimId: string | null;
  dateClaim: Date | null;
  verrouExpireAt: Date | null;
  echeanceSla: Date | null;
  niveauEscalade: number;
  dateDecision: Date | null;
  demande: { reference: string; nomClient: string; montantTtc: unknown };
}

// PGD-050/051/052 — corbeille par rôle, claim à double verrou (SF-PGD-072, R7).
//
// Verrou : Redis SET NX absorbe la contention (aucune requête Postgres si un
// autre agent détient déjà le verrou) ; PostgreSQL reste la source de vérité
// via un compare-and-set transactionnel (UPDATE ... WHERE etat='EN_CORBEILLE').
// Toute divergence entre les deux (verrou Redis acquis mais ligne Postgres
// déjà changée d'état par ailleurs) libère le verrou et renvoie 409 — jamais
// de succès partiel.
@Injectable()
export class TacheService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly delegationService: DelegationService
  ) {}

  private cleVerrou(tacheId: string): string {
    return `lock:tache:${tacheId}`;
  }

  // agentId : rôles délégués actifs élargissent la visibilité au-delà des
  // rôles portés par la session JWT (statiques depuis le login) — "le
  // délégataire voit la corbeille du rôle délégué pendant la période
  // uniquement" (PGD-058).
  async lister(rolesUtilisateur: string[], agentId: string, query: ListerTachesQuery): Promise<TachesListeReponse> {
    const rolesDelegues = await this.delegationService.rolesDeleguesActifsPour(agentId);
    const rolesVisibles = [...new Set([...rolesUtilisateur, ...rolesDelegues])];

    // Le filtre role= restreint l'ensemble déjà autorisé, il ne l'élargit
    // jamais au-delà des rôles réels + délégués de l'utilisateur (R4).
    const rolesAutorises = query.role ? rolesVisibles.filter((r) => r === query.role) : rolesVisibles;
    if (rolesAutorises.length === 0) {
      return { taches: [], total: 0 };
    }

    const where = {
      roleCorbeille: { in: rolesAutorises },
      ...(query.etat ? { etat: query.etat as never } : {})
    };

    const [taches, total] = await this.prisma.$transaction([
      this.prisma.tache.findMany({
        where,
        include: { demande: { select: { reference: true, nomClient: true, montantTtc: true } } },
        orderBy: [{ echeanceSla: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit
      }),
      this.prisma.tache.count({ where })
    ]);

    return { taches: taches.map((t) => this.versVue(t)), total };
  }

  async trouver(id: string): Promise<TacheVue> {
    const tache = await this.prisma.tache.findUnique({
      where: { id },
      include: { demande: { select: { reference: true, nomClient: true, montantTtc: true } } }
    });
    if (!tache) {
      throw new NotFoundException({ code: "TACHE_INTROUVABLE", message: "Tâche introuvable." });
    }
    return this.versVue(tache);
  }

  // POST /api/taches/{id}/claim (SF-PGD-072) — 200 ou 409, jamais autre chose :
  // aucun état intermédiaire visible pour l'appelant.
  async claim(tacheId: string, agentId: string): Promise<TacheVue> {
    const env = loadEnv();
    const cle = this.cleVerrou(tacheId);

    const verrouAcquis = await this.cache.acquerirVerrou(cle, agentId, env.TACHE_VERROU_TTL_SECONDES);
    if (!verrouAcquis) {
      throw new ConflictException({
        code: "TACHE_DEJA_RECLAMEE",
        message: "Cette tâche vient d'être réclamée par un autre agent.",
        details: { etat: "RECLAMEE" }
      });
    }

    try {
      const maintenant = new Date();
      const expiration = new Date(maintenant.getTime() + env.TACHE_VERROU_TTL_SECONDES * 1000);

      const { affectees } = await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.tache.updateMany({
          where: { id: tacheId, etat: "EN_CORBEILLE" },
          data: { etat: "RECLAMEE", agentClaimId: agentId, dateClaim: maintenant, verrouExpireAt: expiration }
        });
        if (count === 1) {
          await tx.journalAudit.create({
            data: {
              tacheId,
              acteur: agentId,
              action: "claim",
              detail: { agentClaimId: agentId }
            }
          });
        }
        return { affectees: count };
      });

      if (affectees === 0) {
        // Le verrou Redis a été acquis mais Postgres ne trouve plus la tâche
        // en EN_CORBEILLE (déjà réclamée par ailleurs, ou état différent) —
        // jamais de succès partiel : on libère et on renvoie 409.
        throw new ConflictException({
          code: "TACHE_DEJA_RECLAMEE",
          message: "Cette tâche vient d'être réclamée par un autre agent.",
          details: { etat: "RECLAMEE" }
        });
      }

      return this.trouver(tacheId);
    } catch (erreur) {
      await this.cache.libererVerrou(cle);
      throw erreur;
    }
  }

  // POST /api/taches/{id}/unclaim (SF-PGD-073) — retour en EN_CORBEILLE,
  // verrou libéré, action journalisée. Restreint à l'agent qui détient
  // effectivement le claim (pas de "vol" de tâche via unclaim).
  async unclaim(tacheId: string, agentId: string): Promise<TacheVue> {
    const tache = await this.prisma.tache.findUnique({ where: { id: tacheId } });
    if (!tache) {
      throw new NotFoundException({ code: "TACHE_INTROUVABLE", message: "Tâche introuvable." });
    }
    if (tache.etat !== "RECLAMEE" || tache.agentClaimId !== agentId) {
      throw new ConflictException({
        code: "TACHE_NON_RECLAMEE_PAR_VOUS",
        message: "Cette tâche n'est pas réclamée par vous."
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tache.update({
        where: { id: tacheId },
        data: { etat: "EN_CORBEILLE", agentClaimId: null, dateClaim: null, verrouExpireAt: null }
      });
      await tx.journalAudit.create({
        data: { tacheId, acteur: agentId, action: "unclaim" }
      });
    });

    await this.cache.libererVerrou(this.cleVerrou(tacheId));
    return this.trouver(tacheId);
  }

  private versVue(tache: TacheAvecDemande): TacheVue {
    return {
      id: tache.id,
      demandeId: tache.demandeId,
      reference: tache.demande.reference,
      nomClient: tache.demande.nomClient,
      montantTtc: Number(tache.demande.montantTtc),
      roleCorbeille: tache.roleCorbeille,
      ordre: tache.ordre,
      typeActeur: tache.typeActeur as never,
      bloquant: tache.bloquant,
      slaHeures: tache.slaHeures,
      modeAffectation: tache.modeAffectation as never,
      etat: tache.etat as never,
      agentClaimId: tache.agentClaimId,
      dateClaim: tache.dateClaim ? tache.dateClaim.toISOString() : null,
      verrouExpireAt: tache.verrouExpireAt ? tache.verrouExpireAt.toISOString() : null,
      echeanceSla: tache.echeanceSla ? tache.echeanceSla.toISOString() : null,
      niveauEscalade: tache.niveauEscalade,
      dateDecision: tache.dateDecision ? tache.dateDecision.toISOString() : null
    };
  }
}
