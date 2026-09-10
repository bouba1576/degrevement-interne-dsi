import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { JournalSecuriteService } from "../../modules/auth/services/journal-securite.service";
import { SodService } from "./sod.service";
import type { RequeteAuthentifiee } from "./auth.guard";

// Non câblé à un contrôleur : aucune route d'approbation n'existe avant la
// Phase 6 (workflow). Construit maintenant (directive explicite) pour que R21
// soit natif au guard dès sa première utilisation plutôt que greffé après coup.
//
// Contrat attendu par le futur contrôleur d'approbation (PGD-055/057) :
// - route sur une TACHE identifiée par :id (params.id)
// - la tâche porte demande_id et ordre (étape courante)
// - si l'approbation est exercée sous délégation, le contrôleur doit résoudre
//   la DELEGATION active (delegataireId = utilisateur courant) et fournir son
//   delegant.identifiantAd — ce guard ne devine jamais la délégation lui-même.
@Injectable()
export class SodGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sodService: SodService,
    private readonly journal: JournalSecuriteService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequeteAuthentifiee>();
    const tacheId = typeof request.params?.id === "string" ? request.params.id : undefined;
    const utilisateur = request.utilisateur;
    if (!tacheId || !utilisateur) return true; // rien à vérifier hors contexte de tâche authentifiée

    const tache = await this.prisma.tache.findUnique({ where: { id: tacheId } });
    if (!tache) return true; // 404 sera levé par le contrôleur, pas la responsabilité de ce guard

    const agitPourCompteDe = (request as unknown as { delegantIdentifiantAd?: string }).delegantIdentifiantAd;

    const resultat = await this.sodService.verifier({
      demandeId: tache.demandeId,
      etapeOrdreActuelle: tache.ordre,
      agentIdentifiantAd: utilisateur.identifiantAd,
      agitPourCompteDe
    });

    if (resultat.conflit) {
      await this.journal.consigner({
        utilisateurId: utilisateur.id,
        evenement: "SOD_REFUS",
        facteur: "SESSION",
        succes: false,
        ip: request.ip
      });
      throw new ForbiddenException({
        code: "SOD_VIOLATION",
        message: "Vous êtes déjà intervenu à l'étape précédente de ce dossier.",
        details: { acteurEtapePrecedente: resultat.acteurEtapePrecedente }
      });
    }
    return true;
  }
}
