import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@pgd/database";
import { PrismaService } from "../../infra/prisma/prisma.service";

// Journal d'activité administrateur (08/09/2026, CLAUDE.md « Journal
// d'activité administrateur ») — volet NAVIGATION. `libelle` dérivé ICI,
// jamais transmis par le client (cf. contrats/activite.ts) : duplication
// délibérée avec apps/web/lib/routes.ts (TITRES_PAR_CHEMIN) — même précédent
// déjà établi dans ce dépôt (AuditSecuriteScreen.EVENEMENTS vs
// JournalSecuriteTable.LIBELLE_EVENEMENT, « pas de Record partagé entre les
// deux fichiers ») : deux formes différentes pour le même petit référentiel,
// ici parce qu'un journal d'oversight ne doit jamais afficher un texte que
// le client contrôle librement. Absence d'entrée pour "integrations" :
// délibérée, symétrique à titreDeChemin() côté client qui n'a pas non plus
// de libellé dédié pour cette route (coquille sans contrepartie serveur).
const LIBELLE_PAR_ROUTE: Record<string, string> = {
  home: "Tableau de bord",
  nouvelle: "Nouvelle fiche d'ajustement",
  mes: "Mes demandes",
  corbeilles: "Corbeilles partagées",
  controle: "Contrôle a posteriori",
  consultation: "Consultation des dossiers",
  reporting: "Reporting",
  admin: "Administration",
  audit: "Journal de sécurité",
  detail: "Dossier"
};

@Injectable()
export class ActiviteService {
  private readonly logger = new Logger(ActiviteService.name);

  constructor(private readonly prisma: PrismaService) {}

  async consignerNavigation(route: string, detail: Record<string, unknown> | undefined, utilisateurId: string): Promise<void> {
    await this.prisma.journalActivite.create({
      data: {
        utilisateurId,
        type: "NAVIGATION",
        route,
        libelle: LIBELLE_PAR_ROUTE[route] ?? route,
        detail: detail as Prisma.InputJsonValue | undefined
      }
    });
  }

  // Volet ACTION (JournalActiviteInterceptor, global) — appelée en
  // fire-and-forget depuis l'intercepteur (jamais attendue avant l'envoi de
  // la réponse déjà partie vers le client) : toute erreur est avalée ici,
  // journalisée en warning, jamais remontée — un échec de ce journal
  // d'oversight ne doit jamais faire échouer l'action qu'il observe.
  consignerAction(
    route: string,
    methodeHttp: string,
    libelle: string,
    detail: Record<string, unknown>,
    utilisateurId: string
  ): void {
    this.prisma.journalActivite
      .create({
        data: {
          utilisateurId,
          type: "ACTION",
          route,
          methodeHttp,
          libelle,
          detail: Object.keys(detail).length > 0 ? (detail as Prisma.InputJsonValue) : undefined
        }
      })
      .catch((erreur) => {
        this.logger.warn(`Échec de journalisation d'activité (${methodeHttp} ${route})`, erreur as Error);
      });
  }
}
