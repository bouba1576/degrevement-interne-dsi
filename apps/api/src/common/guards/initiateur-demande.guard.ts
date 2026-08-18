import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { JournalSecuriteService } from "../../modules/auth/services/journal-securite.service";
import type { RequeteAuthentifiee } from "./auth.guard";

// Trouvé en auditant les routes d'écriture de DemandesController (Phase 8,
// suite à la faille CorbeilleRoleGuard) : modifier, definirLignes,
// recalculer, soumettre, abandonner, rappeler, pieces (ajout/suppression)
// ne vérifiaient JAMAIS que l'appelant est l'initiateur du dossier —
// acteurId était reçu, parfois journalisé, jamais comparé. SF-PGD-061 dit
// explicitement « par l'initiateur » pour abandon/rappel ; la même
// restriction s'impose logiquement aux autres écritures sur un dossier qui
// n'appartient à personne d'autre tant qu'aucun rôle de validation n'est
// impliqué.
//
// Un garde UNIQUE plutôt que six vérifications dispersées dans autant de
// services — le même risque de divergence qui a justifié CorbeilleRoleGuard
// comme point de passage obligé plutôt qu'une vérification par service.
//
// Ne remplace PAS un contrôle d'état : une demande SOUMISE reste modifiable
// par re-routage (R6, DemandeWorkflowService.modifierAvecReRoutage) tant
// qu'aucune décision n'est prise — ce guard ne vérifie que la propriété, la
// logique d'état reste dans les services concernés.
@Injectable()
export class InitiateurDemandeGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: JournalSecuriteService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequeteAuthentifiee>();
    const demandeId = typeof request.params?.id === "string" ? request.params.id : undefined;
    const utilisateur = request.utilisateur;
    if (!demandeId || !utilisateur) return true;

    const demande = await this.prisma.demande.findUnique({ where: { id: demandeId } });
    if (!demande) return true; // 404 est la responsabilité du contrôleur/service

    if (demande.initiateurId === utilisateur.id) return true;

    await this.journal.consigner({
      utilisateurId: utilisateur.id,
      evenement: "RBAC_REFUS",
      facteur: "SESSION",
      succes: false
    });

    throw new ForbiddenException({
      code: "PAS_INITIATEUR",
      message: "Seul l'initiateur de ce dossier peut effectuer cette action.",
      details: { demandeId }
    });
  }
}
