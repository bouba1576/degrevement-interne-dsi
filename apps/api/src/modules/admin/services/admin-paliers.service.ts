import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@pgd/database";
import type {
  CreerPalierRequete,
  ModifierPalierRequete,
  PaliersListeReponse,
  PalierVue,
  TrouPalier
} from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import { RuleEngineService } from "../../demandes/services/rule-engine.service";

const NOM_CONTRAINTE_CHEVAUCHEMENT = "excl_configuration_circuit_chevauchement";
const NOM_CONTRAINTE_BORNES = "chk_configuration_circuit_bornes";
const PLUS_PETIT_INCREMENT = 0.01; // numeric(15,2) — plus petite unité représentable.

// PGD-042 — CRUD des paliers de subdélégation. Le chevauchement des bornes
// n'est jamais revérifié en amont (excl_configuration_circuit_chevauchement,
// Phase 1, garantit déjà l'exclusivité) : ce service laisse Postgres refuser
// et traduit la violation en 422 lisible — même principe que R19 (formule
// courante), pas de pré-contrôle applicatif qui masquerait un vrai conflit.
@Injectable()
export class AdminPaliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ruleEngine: RuleEngineService
  ) {}

  async lister(circuit?: string, segment?: string): Promise<PaliersListeReponse> {
    const configurations = await this.prisma.configurationCircuit.findMany({
      where: { ...(circuit ? { circuit: circuit as never } : {}), ...(segment ? { segment } : {}) },
      include: { etapesRegle: { orderBy: { ordre: "asc" } } },
      orderBy: [{ circuit: "asc" }, { segment: "asc" }, { borneMin: "asc" }]
    });

    return {
      paliers: configurations.map((c) => this.versVue(c)),
      trous: this.detecterTrous(configurations)
    };
  }

  async trouver(id: string): Promise<PalierVue> {
    const configuration = await this.prisma.configurationCircuit.findUnique({
      where: { id },
      include: { etapesRegle: { orderBy: { ordre: "asc" } } }
    });
    if (!configuration) {
      throw new NotFoundException({ code: "PALIER_INTROUVABLE", message: "Palier introuvable." });
    }
    return this.versVue(configuration);
  }

  async creer(dto: CreerPalierRequete): Promise<PalierVue> {
    const configuration = await this.executerEnTraduisantLesContraintes(() =>
      this.prisma.$transaction(async (tx) => {
        const config = await tx.configurationCircuit.create({
          data: {
            circuit: dto.circuit,
            segment: dto.segment,
            sousFlux: dto.sousFlux,
            borneMin: dto.borneMin,
            borneMax: dto.borneMax,
            labelPalier: dto.labelPalier,
            sourceFiche: dto.sourceFiche,
            dateEffet: dto.dateEffet ? new Date(dto.dateEffet) : undefined
          }
        });
        await tx.etapeRegle.createMany({
          data: dto.etapes.map((e) => ({ ...e, configurationCircuitId: config.id }))
        });
        return tx.configurationCircuit.findUniqueOrThrow({
          where: { id: config.id },
          include: { etapesRegle: { orderBy: { ordre: "asc" } } }
        });
      })
    );

    await this.ruleEngine.invaliderCache(dto.circuit, dto.segment);
    return this.versVue(configuration);
  }

  async modifier(id: string, dto: ModifierPalierRequete): Promise<PalierVue> {
    const avant = await this.prisma.configurationCircuit.findUnique({ where: { id } });
    if (!avant) {
      throw new NotFoundException({ code: "PALIER_INTROUVABLE", message: "Palier introuvable." });
    }

    const configuration = await this.executerEnTraduisantLesContraintes(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.configurationCircuit.update({
          where: { id },
          data: {
            circuit: dto.circuit,
            segment: dto.segment,
            sousFlux: dto.sousFlux,
            borneMin: dto.borneMin,
            borneMax: dto.borneMax,
            labelPalier: dto.labelPalier,
            sourceFiche: dto.sourceFiche,
            dateEffet: dto.dateEffet ? new Date(dto.dateEffet) : undefined,
            actif: dto.actif
          }
        });

        // Remplacement complet de la chaîne si fournie — pas de fusion
        // partielle, pour éviter un ordre d'étapes incohérent (§ contrats).
        if (dto.etapes) {
          await tx.etapeRegle.deleteMany({ where: { configurationCircuitId: id } });
          await tx.etapeRegle.createMany({
            data: dto.etapes.map((e) => ({ ...e, configurationCircuitId: id }))
          });
        }

        return tx.configurationCircuit.findUniqueOrThrow({
          where: { id },
          include: { etapesRegle: { orderBy: { ordre: "asc" } } }
        });
      })
    );

    // Invalide l'ancienne ET la nouvelle clé — circuit/segment ont pu changer.
    await this.ruleEngine.invaliderCache(avant.circuit, avant.segment);
    await this.ruleEngine.invaliderCache(configuration.circuit, configuration.segment);

    return this.versVue(configuration);
  }

  async supprimer(id: string): Promise<void> {
    const configuration = await this.prisma.configurationCircuit.findUnique({ where: { id } });
    if (!configuration) {
      throw new NotFoundException({ code: "PALIER_INTROUVABLE", message: "Palier introuvable." });
    }

    await this.prisma.configurationCircuit.delete({ where: { id } });
    await this.ruleEngine.invaliderCache(configuration.circuit, configuration.segment);
  }

  private async executerEnTraduisantLesContraintes<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (erreur) {
      const message = this.messageErreurPostgres(erreur);

      if (message?.includes(NOM_CONTRAINTE_CHEVAUCHEMENT)) {
        throw new UnprocessableEntityException({
          code: "PALIER_CHEVAUCHEMENT",
          message: "Ce palier chevauche un palier actif existant pour ce circuit/segment/sous-flux."
        });
      }
      if (message?.includes(NOM_CONTRAINTE_BORNES)) {
        throw new UnprocessableEntityException({
          code: "PALIER_BORNES_INVALIDES",
          message: "La borne minimale doit être strictement inférieure à la borne maximale."
        });
      }
      throw erreur;
    }
  }

  // Les violations de excl_configuration_circuit_chevauchement et de la
  // CHECK sur les bornes remontent en PrismaClientUnknownRequestError (pas
  // PrismaClientKnownRequestError/P2002), constaté à l'exécution — le nom de
  // la contrainte n'apparaît que dans le message de l'erreur Postgres sous-
  // jacente, pas dans un champ structuré.
  private messageErreurPostgres(erreur: unknown): string | null {
    if (erreur instanceof Prisma.PrismaClientUnknownRequestError || erreur instanceof Prisma.PrismaClientKnownRequestError) {
      return erreur.message;
    }
    return null;
  }

  private detecterTrous(
    configurations: Array<{ circuit: string; segment: string; sousFlux: string | null; borneMin: Prisma.Decimal; borneMax: Prisma.Decimal; actif: boolean }>
  ): TrouPalier[] {
    const groupes = new Map<string, typeof configurations>();
    for (const config of configurations) {
      if (!config.actif) continue;
      const cle = `${config.circuit}::${config.segment}::${config.sousFlux ?? ""}`;
      const groupe = groupes.get(cle) ?? [];
      groupe.push(config);
      groupes.set(cle, groupe);
    }

    const trous: TrouPalier[] = [];
    for (const groupe of groupes.values()) {
      const tries = [...groupe].sort((a, b) => Number(a.borneMin) - Number(b.borneMin));
      for (let i = 0; i < tries.length - 1; i++) {
        const courant = tries[i]!;
        const suivant = tries[i + 1]!;
        const finCourant = Number(courant.borneMax);
        const debutSuivant = Number(suivant.borneMin);
        if (debutSuivant > finCourant + PLUS_PETIT_INCREMENT) {
          trous.push({
            circuit: courant.circuit as never,
            segment: courant.segment,
            sousFlux: courant.sousFlux,
            borneMin: Number((finCourant + PLUS_PETIT_INCREMENT).toFixed(2)),
            borneMax: Number((debutSuivant - PLUS_PETIT_INCREMENT).toFixed(2))
          });
        }
      }
    }
    return trous;
  }

  private versVue(configuration: Prisma.ConfigurationCircuitGetPayload<{ include: { etapesRegle: true } }>): PalierVue {
    return {
      id: configuration.id,
      circuit: configuration.circuit as never,
      segment: configuration.segment,
      sousFlux: configuration.sousFlux,
      borneMin: Number(configuration.borneMin),
      borneMax: Number(configuration.borneMax),
      actif: configuration.actif,
      labelPalier: configuration.labelPalier,
      sourceFiche: configuration.sourceFiche,
      dateEffet: configuration.dateEffet ? configuration.dateEffet.toISOString().slice(0, 10) : null,
      datePublication: configuration.datePublication.toISOString(),
      etapesRegle: configuration.etapesRegle
        .sort((a, b) => a.ordre - b.ordre)
        .map((e) => ({
          id: e.id,
          ordre: e.ordre,
          roleCode: e.roleCode,
          typeActeur: e.typeActeur as never,
          bloquant: e.bloquant,
          slaHeures: e.slaHeures,
          modeAffectation: e.modeAffectation as never
        }))
    };
  }
}
