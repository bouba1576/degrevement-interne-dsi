import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../infra/prisma/prisma.service";

// PGD-053 (SF-PGD-074) — libère les tâches RECLAMEE dont le verrou a expiré
// sans décision. Idempotent par construction : la condition
// (etat='RECLAMEE' AND verrou_expire_at < now()) ne matche plus rien une fois
// la tâche déjà remise à EN_CORBEILLE — un rejeu du message (at-least-once)
// ne produit donc aucun effet supplémentaire, sans avoir besoin d'une clé de
// déduplication explicite.
//
// C'est aussi le rattrapage exact du désalignement Redis/Postgres du claim à
// double verrou : la clé Redis (lock:tache:{id}) expire indépendamment de la
// ligne Postgres — si Redis a déjà expiré la clé mais que la ligne est restée
// RECLAMEE (crash du processus détenteur avant tout unclaim, par exemple),
// PostgreSQL reste ici la seule source de vérité consultée : ce sweep n'a
// besoin d'aucune lecture Redis pour détecter et corriger ce cas.
@Injectable()
export class LocksSweeperService {
  private readonly logger = new Logger(LocksSweeperService.name);

  constructor(private readonly prisma: PrismaService) {}

  async balayer(): Promise<number> {
    const maintenant = new Date();

    const taches = await this.prisma.tache.findMany({
      where: { etat: "RECLAMEE", verrouExpireAt: { lt: maintenant } },
      select: { id: true, demandeId: true, agentClaimId: true }
    });

    for (const tache of taches) {
      await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.tache.updateMany({
          where: { id: tache.id, etat: "RECLAMEE", verrouExpireAt: { lt: maintenant } },
          data: { etat: "EN_CORBEILLE", agentClaimId: null, dateClaim: null, verrouExpireAt: null }
        });
        if (count === 0) return; // déjà traitée par un rejeu précédent — rien à journaliser de plus

        await tx.journalAudit.create({
          data: {
            demandeId: tache.demandeId,
            tacheId: tache.id,
            acteur: "system:locks-sweeper",
            action: "verrou_expire",
            detail: { agentClaimPrecedent: tache.agentClaimId }
          }
        });
      });
    }

    if (taches.length > 0) {
      this.logger.log(`locks-sweeper : ${taches.length} tâche(s) libérée(s).`);
    }
    return taches.length;
  }
}
