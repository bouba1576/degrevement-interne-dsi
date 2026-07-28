import { Injectable } from "@nestjs/common";
import type {
  DirectionResponsabiliteVue,
  FacteurDegrevementVue,
  ParametresCalculPublicVue,
  UniversFmiVue
} from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import { AdminParametresCalculService } from "../../admin/services/admin-parametres-calcul.service";

// Lecture seule — aucun de ces trois référentiels n'a de contrôleur admin
// aujourd'hui (vérifié par recherche, aucune occurrence), donc rien à
// dupliquer ni à contourner ici : ce service est la première exposition de
// UniversFmi/FacteurDegrevement/DirectionResponsabilite+ServiceResponsabilite
// via l'API.
@Injectable()
export class ReferentielsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminParametresCalcul: AdminParametresCalculService
  ) {}

  async listerUniversFmi(): Promise<UniversFmiVue[]> {
    const rows = await this.prisma.universFmi.findMany({ orderBy: { libelle: "asc" } });
    return rows.map((r) => ({ code: r.code, libelle: r.libelle }));
  }

  async listerFacteurs(): Promise<FacteurDegrevementVue[]> {
    const rows = await this.prisma.facteurDegrevement.findMany({ orderBy: { libelle: "asc" } });
    return rows.map((r) => ({ code: r.code, libelle: r.libelle }));
  }

  // Directions ET services filtrés actif=true — une direction inactive
  // n'apparaît pas, un service inactif sous une direction active non plus.
  async listerDirections(): Promise<DirectionResponsabiliteVue[]> {
    const directions = await this.prisma.directionResponsabilite.findMany({
      where: { actif: true },
      include: { services: { where: { actif: true }, orderBy: { libelle: "asc" } } },
      orderBy: { libelle: "asc" }
    });
    return directions.map((d) => ({
      id: d.id,
      libelle: d.libelle,
      services: d.services.map((s) => ({ id: s.id, libelle: s.libelle }))
    }));
  }

  // Projection délibérément étroite (4 des 6 champs de ParametreCalculVue) —
  // jamais un spread de la vue admin. `circuit` est redondant avec le
  // paramètre d'URL, `devise` n'a aucun usage ici : les ajouter par
  // "simplicité" exposerait par ricochet un champ jamais examiné pour cette
  // route (cf. DIVERGENCES.md, Phase 10.6).
  async parametresCalcul(circuit: string): Promise<ParametresCalculPublicVue> {
    const p = await this.adminParametresCalcul.trouver(circuit);
    return {
      tauxTsc: p.tauxTsc,
      tauxTva: p.tauxTva,
      tscActiveDefaut: p.tscActiveDefaut,
      tvaActiveDefaut: p.tvaActiveDefaut
    };
  }
}
