import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { SiVue } from "@pgd/contracts";
import { publier, ROUTING_KEY_SI_PUSH, type ConnexionRabbitMQ } from "@pgd/messaging";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import { CONNEXION_RABBITMQ } from "../../../infra/rabbitmq/rabbitmq.constants";

// docs/06 — GET /api/demandes/{id}/si (état de restitution) et
// POST /api/demandes/{id}/si/pousser (PGD-062, rejeu manuel). Le rejeu ne
// re-valide jamais le dossier : il republie si.push, traité par le MÊME
// consumer (apps/worker/src/si-push) que le déclenchement automatique — un
// dossier CONFIRME est donc protégé par le même gate Postgres des deux côtés,
// pas seulement par ce contrôle 422 ici.
@Injectable()
export class SiService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONNEXION_RABBITMQ) private readonly connexion: ConnexionRabbitMQ
  ) {}

  async obtenirEtat(demandeId: string): Promise<SiVue> {
    const demande = await this.prisma.demande.findUnique({ where: { id: demandeId } });
    if (!demande) {
      throw new NotFoundException({ code: "DEMANDE_INTROUVABLE", message: "Demande introuvable." });
    }

    return {
      etat: demande.siEtat,
      refSi: demande.siRef,
      horodatage: demande.siHorodatage?.toISOString() ?? null,
      message: demande.siMessage,
      tentatives: demande.siTentatives,
      adaptateur: demande.siAdaptateur
    };
  }

  async rejouerManuel(demandeId: string): Promise<SiVue> {
    const demande = await this.prisma.demande.findUnique({ where: { id: demandeId } });
    if (!demande) {
      throw new NotFoundException({ code: "DEMANDE_INTROUVABLE", message: "Demande introuvable." });
    }

    if (demande.siEtat !== "ERREUR") {
      throw new ConflictException({
        code: "SI_ETAT_NON_REJOUABLE",
        message: "Le rejeu manuel n'est possible que pour un dossier en erreur SI."
      });
    }

    const parametre = await this.prisma.parametreGlobal.findUniqueOrThrow({ where: { cle: "si_max_tentatives" } });
    const maxTentatives = (parametre.valeur as { valeur: number }).valeur;
    if (demande.siTentatives >= maxTentatives) {
      throw new ConflictException({
        code: "SI_TENTATIVES_EPUISEES",
        message: `Nombre maximal de tentatives (${maxTentatives}) déjà atteint.`
      });
    }

    // Rejeu SANS re-valider le dossier (PGD-062) : on republie simplement
    // si.push, sans repasser par TacheWorkflowService ni RuleEngineService.
    await publier(this.connexion.canalActif, ROUTING_KEY_SI_PUSH, { demandeId });

    return this.obtenirEtat(demandeId);
  }
}
