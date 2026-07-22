import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../infra/prisma/prisma.service";
import { SMTP_PORT, type SmtpPort } from "./smtp.port";

// PGD-073 (SF-PGD-110) — canal in-app (table Notification) + SmtpPort
// (bouchon). Deux des six types (ESCALADE, ERREUR_SI) ont un destinataire
// non déterminé par les sources (CLAUDE.md « Questions ouvertes ») : le rôle
// se lit dans PARAMETRE_GLOBAL, jamais deviné dans le code. Si le paramètre
// n'est pas configuré, la notification n'est simplement PAS émise — un log
// l'indique, ce n'est pas une erreur de traitement (pas de nack/retry pour
// une configuration manquante).
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMTP_PORT) private readonly smtp: SmtpPort
  ) {}

  async traiterNouvelleTache(tacheId: string): Promise<void> {
    const tache = await this.prisma.tache.findUnique({ where: { id: tacheId } });
    if (!tache) return;

    const membres = await this.prisma.membreRole.findMany({ where: { roleCode: tache.roleCorbeille } });
    for (const membre of membres) {
      await this.creerEtEnvoyer(membre.utilisateurId, "NOUVELLE_TACHE", tache.demandeId, "Nouvelle tâche disponible dans votre corbeille.");
    }
  }

  async traiterAvancement(demandeId: string): Promise<void> {
    await this.notifierInitiateur(demandeId, "AVANCEMENT", "Votre dossier a avancé d'une étape.");
  }

  async traiterRejet(demandeId: string): Promise<void> {
    await this.notifierInitiateur(demandeId, "REJET", "Votre dossier a été rejeté.");
  }

  async traiterValidation(demandeId: string): Promise<void> {
    await this.notifierInitiateur(demandeId, "VALIDATION", "Votre dossier a été validé.");
  }

  async traiterEscalade(tacheId: string): Promise<void> {
    const tache = await this.prisma.tache.findUnique({ where: { id: tacheId } });
    if (!tache) return;
    await this.notifierParRoleConfigurable(
      "destinataire_notification_escalade_sla",
      tache.demandeId,
      "ESCALADE",
      "Une tâche a dépassé son SLA."
    );
  }

  async traiterErreurSi(demandeId: string): Promise<void> {
    await this.notifierParRoleConfigurable(
      "destinataire_notification_erreur_si",
      demandeId,
      "ERREUR_SI",
      "Échec de la restitution SI sur un dossier."
    );
  }

  private async notifierInitiateur(
    demandeId: string,
    type: "AVANCEMENT" | "REJET" | "VALIDATION",
    sujet: string
  ): Promise<void> {
    const demande = await this.prisma.demande.findUnique({ where: { id: demandeId } });
    if (!demande) return;
    await this.creerEtEnvoyer(demande.initiateurId, type, demandeId, sujet);
  }

  private async notifierParRoleConfigurable(
    cleParametre: string,
    demandeId: string,
    type: "ESCALADE" | "ERREUR_SI",
    sujet: string
  ): Promise<void> {
    const parametre = await this.prisma.parametreGlobal.findUnique({ where: { cle: cleParametre } });
    const roleCode = (parametre?.valeur as { roleCode?: string | null } | undefined)?.roleCode;
    if (!roleCode) {
      this.logger.warn(
        `Notification ${type} non émise : '${cleParametre}' non configuré (PARAMETRE_GLOBAL.roleCode est null) — destinataire non déterminé par les sources, à trancher avec le métier.`
      );
      return;
    }

    const membres = await this.prisma.membreRole.findMany({ where: { roleCode } });
    if (membres.length === 0) {
      this.logger.warn(`Notification ${type} : rôle '${roleCode}' configuré mais aucun membre réel (MembreRole) — rien à notifier.`);
      return;
    }
    for (const membre of membres) {
      await this.creerEtEnvoyer(membre.utilisateurId, type, demandeId, sujet);
    }
  }

  private async creerEtEnvoyer(
    destinataireId: string,
    type: "NOUVELLE_TACHE" | "AVANCEMENT" | "REJET" | "VALIDATION" | "ESCALADE" | "ERREUR_SI",
    demandeId: string,
    sujet: string
  ): Promise<void> {
    await this.prisma.notification.create({
      data: { demandeId, destinataireId, type, canal: "in_app" }
    });

    const destinataire = await this.prisma.utilisateur.findUnique({ where: { id: destinataireId } });
    if (destinataire) {
      await this.smtp.envoyer({ destinataire: destinataire.identifiantAd, sujet: `PGD — ${sujet}`, corps: sujet });
    }
  }
}
