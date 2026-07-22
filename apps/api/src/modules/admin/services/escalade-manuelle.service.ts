import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { TacheVue } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import { TacheService } from "../../taches/services/tache.service";

// docs/06 §9 — POST /api/admin/escalade-manuelle/{tacheId}. Volet MANUEL du
// couple avec SlaEscalationService (apps/worker/src/jobs/sla-escalation.service.ts) :
// même effet observable (niveau_escalade++, journalisation), mais sans
// condition d'échéance SLA dépassée — un administrateur peut escalader une
// tâche avant même que son SLA n'expire. Duplication de logique DÉLIBÉRÉE
// plutôt que partagée entre apps/api et apps/worker : l'opération tient en
// une transaction de quelques lignes, et les deux apps n'ont aujourd'hui
// aucun package de domaine partagé où la loger sans en créer un pour ce seul
// usage.
//
// PORTÉE PARTIELLE, pour la même raison que le volet automatique (cf.
// CLAUDE.md « Questions ouvertes ») : aucune source ne définit la « corbeille
// N+1 », donc aucune réaffectation de rôle ici — seulement le comptage
// d'escalade et sa trace.
@Injectable()
export class EscaladeManuelleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tacheService: TacheService
  ) {}

  async escalader(tacheId: string, acteurIdentifiantAd: string): Promise<TacheVue> {
    const tache = await this.prisma.tache.findUnique({ where: { id: tacheId } });
    if (!tache) {
      throw new NotFoundException({ code: "TACHE_INTROUVABLE", message: "Tâche introuvable." });
    }
    if (tache.etat !== "EN_CORBEILLE" && tache.etat !== "RECLAMEE") {
      throw new ConflictException({
        code: "TACHE_NON_ESCALADABLE",
        message: "Seule une tâche en corbeille ou réclamée peut être escaladée manuellement."
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tache.update({ where: { id: tacheId }, data: { niveauEscalade: { increment: 1 } } });
      await tx.journalAudit.create({
        data: {
          demandeId: tache.demandeId,
          tacheId,
          acteur: acteurIdentifiantAd,
          action: "escalade_manuelle",
          detail: { niveauEscaladeAvant: tache.niveauEscalade, niveauEscaladeApres: tache.niveauEscalade + 1 }
        }
      });
    });

    return this.tacheService.trouver(tacheId);
  }
}
