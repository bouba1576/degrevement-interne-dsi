import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@pgd/database";
import type { CalendrierSlaVue, ModifierCalendrierSlaRequete } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";

type CalendrierAvecJoursFeries = Prisma.CalendrierSlaGetPayload<{ include: { joursFeries: true } }>;

@Injectable()
export class AdminCalendrierSlaService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(): Promise<CalendrierSlaVue[]> {
    const calendriers = await this.prisma.calendrierSla.findMany({
      include: { joursFeries: { orderBy: { jour: "asc" } } },
      orderBy: { libelle: "asc" }
    });
    return calendriers.map((c) => this.versVue(c));
  }

  async trouver(id: string): Promise<CalendrierSlaVue> {
    const calendrier = await this.prisma.calendrierSla.findUnique({
      where: { id },
      include: { joursFeries: { orderBy: { jour: "asc" } } }
    });
    if (!calendrier) {
      throw new NotFoundException({ code: "CALENDRIER_INTROUVABLE", message: "Calendrier SLA introuvable." });
    }
    return this.versVue(calendrier);
  }

  // joursFeries, si fourni, remplace intégralement la liste (même principe
  // que les étapes de palier / pièces de motif).
  async modifier(id: string, dto: ModifierCalendrierSlaRequete): Promise<CalendrierSlaVue> {
    await this.trouver(id);
    const calendrier = await this.prisma.$transaction(async (tx) => {
      await tx.calendrierSla.update({
        where: { id },
        data: {
          libelle: dto.libelle,
          joursOuvres: dto.joursOuvres as never,
          heureDebut: dto.heureDebut ? new Date(`1970-01-01T${dto.heureDebut}:00Z`) : undefined,
          heureFin: dto.heureFin ? new Date(`1970-01-01T${dto.heureFin}:00Z`) : undefined,
          actif: dto.actif
        }
      });
      if (dto.joursFeries) {
        await tx.jourFerie.deleteMany({ where: { calendrierId: id } });
        await tx.jourFerie.createMany({
          data: dto.joursFeries.map((j) => ({ calendrierId: id, jour: new Date(j.jour), libelle: j.libelle }))
        });
      }
      return tx.calendrierSla.findUniqueOrThrow({ where: { id }, include: { joursFeries: { orderBy: { jour: "asc" } } } });
    });
    return this.versVue(calendrier);
  }

  private versVue(calendrier: CalendrierAvecJoursFeries): CalendrierSlaVue {
    return {
      id: calendrier.id,
      libelle: calendrier.libelle,
      joursOuvres: calendrier.joursOuvres as number[],
      heureDebut: calendrier.heureDebut.toISOString().slice(11, 16),
      heureFin: calendrier.heureFin.toISOString().slice(11, 16),
      actif: calendrier.actif,
      joursFeries: calendrier.joursFeries.map((j) => ({
        id: j.id,
        jour: j.jour.toISOString().slice(0, 10),
        libelle: j.libelle
      }))
    };
  }
}
