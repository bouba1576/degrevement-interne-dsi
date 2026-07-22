import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import { ajouterHeuresOuvrees } from "./calendrier-sla.util";

// POST /api/sla/simuler (SF-PGD-028) + échéance de la première étape à la
// soumission (PGD-036). Un seul calendrier actif à la fois (CALENDRIER_SLA.actif) —
// pas de sélection par circuit/rôle dans le modèle de données.
@Injectable()
export class CalendrierSlaService {
  constructor(private readonly prisma: PrismaService) {}

  async calculerEcheance(depart: Date, heures: number): Promise<Date> {
    const calendrier = await this.prisma.calendrierSla.findFirstOrThrow({
      where: { actif: true },
      include: { joursFeries: true }
    });

    return ajouterHeuresOuvrees(depart, heures, {
      joursOuvres: calendrier.joursOuvres as number[],
      heureDebutMinutes: calendrier.heureDebut.getUTCHours() * 60 + calendrier.heureDebut.getUTCMinutes(),
      heureFinMinutes: calendrier.heureFin.getUTCHours() * 60 + calendrier.heureFin.getUTCMinutes(),
      joursFeries: new Set(calendrier.joursFeries.map((f) => f.jour.toISOString().slice(0, 10)))
    });
  }
}
