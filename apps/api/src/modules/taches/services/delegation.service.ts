import { Injectable, UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@pgd/database";
import type { CreerDelegationRequete, DelegationVue } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";

const NOM_CONTRAINTE_CONCURRENTE = "excl_delegation_concurrente";
const NOM_CONTRAINTE_BORNES = "chk_delegation_bornes";
const NOM_CONTRAINTE_DISTINCTS = "chk_delegation_distincts";

export interface DelegationActive {
  delegationId: string;
  delegantId: string;
  delegantIdentifiantAd: string;
}

// PGD-058 (R21, R22) — le chevauchement n'est jamais revérifié en amont : la
// contrainte excl_delegation_concurrente (Phase 1) garantit déjà l'exclusivité
// en base ; ce service laisse Postgres refuser et traduit la violation en 422
// lisible, même principe que R19 (formule courante) et PALIER_CHEVAUCHEMENT.
@Injectable()
export class DelegationService {
  constructor(private readonly prisma: PrismaService) {}

  async creer(delegantId: string, dto: CreerDelegationRequete): Promise<DelegationVue> {
    try {
      const delegation = await this.prisma.delegation.create({
        data: {
          delegantId,
          delegataireId: dto.delegataireId,
          roleCode: dto.roleCode,
          debut: new Date(dto.debut),
          fin: new Date(dto.fin),
          noteInterim: dto.noteInterim
        }
      });
      return this.versVue(delegation);
    } catch (erreur) {
      const message = this.messageErreurPostgres(erreur);
      if (message?.includes(NOM_CONTRAINTE_CONCURRENTE)) {
        throw new UnprocessableEntityException({
          code: "R22_DELEGATION_CONCURRENTE",
          message: "Une délégation active existe déjà sur ce rôle pour ce délégant, sur une période recouvrante."
        });
      }
      if (message?.includes(NOM_CONTRAINTE_BORNES)) {
        throw new UnprocessableEntityException({
          code: "DELEGATION_BORNES_INVALIDES",
          message: "La date de fin doit être strictement postérieure à la date de début."
        });
      }
      if (message?.includes(NOM_CONTRAINTE_DISTINCTS)) {
        throw new UnprocessableEntityException({
          code: "DELEGATION_ACTEURS_IDENTIQUES",
          message: "Le délégant et le délégataire doivent être des utilisateurs distincts."
        });
      }
      throw erreur;
    }
  }

  // Résout la délégation active du délégataire pour ce rôle, à l'instant
  // donné — utilisée à la fois pour la visibilité de corbeille (le
  // délégataire voit le rôle délégué pendant la période uniquement) et pour
  // fournir le contexte R21 à SodGuard (DelegationContextGuard).
  async delegationActivePour(delegataireId: string, roleCode: string, instant: Date = new Date()): Promise<DelegationActive | null> {
    const delegation = await this.prisma.delegation.findFirst({
      where: { delegataireId, roleCode, active: true, debut: { lte: instant }, fin: { gte: instant } },
      include: { delegant: true }
    });
    if (!delegation) return null;
    return {
      delegationId: delegation.id,
      delegantId: delegation.delegantId,
      delegantIdentifiantAd: delegation.delegant.identifiantAd
    };
  }

  // Rôles délégués actifs (toutes délégations confondues) pour un délégataire
  // à l'instant donné — utilisé pour élargir la visibilité de corbeille au-
  // delà des rôles portés par la session JWT (statiques depuis le login).
  async rolesDeleguesActifsPour(delegataireId: string, instant: Date = new Date()): Promise<string[]> {
    const delegations = await this.prisma.delegation.findMany({
      where: { delegataireId, active: true, debut: { lte: instant }, fin: { gte: instant } },
      select: { roleCode: true }
    });
    return delegations.map((d) => d.roleCode);
  }

  private messageErreurPostgres(erreur: unknown): string | null {
    if (erreur instanceof Prisma.PrismaClientUnknownRequestError || erreur instanceof Prisma.PrismaClientKnownRequestError) {
      return erreur.message;
    }
    return null;
  }

  private versVue(delegation: {
    id: string;
    delegantId: string;
    delegataireId: string;
    roleCode: string;
    debut: Date;
    fin: Date;
    noteInterim: string;
    active: boolean;
  }): DelegationVue {
    return {
      id: delegation.id,
      delegantId: delegation.delegantId,
      delegataireId: delegation.delegataireId,
      roleCode: delegation.roleCode,
      debut: delegation.debut.toISOString(),
      fin: delegation.fin.toISOString(),
      noteInterim: delegation.noteInterim,
      active: delegation.active
    };
  }
}
