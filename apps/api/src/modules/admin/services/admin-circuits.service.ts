import { Injectable, NotFoundException } from "@nestjs/common";
import type { CircuitVue, ModifierCircuitRequete } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";

// docs/06 §9 — Circuit.code est un ENUM Postgres à 3 valeurs fixes (DOBB/DXC/DF) :
// ni création ni suppression n'ont de sens structurel, seuls GET/PATCH sont
// exposés (segment n'est pas modifiable : DEMANDE.segment en dépend
// structurellement, cf. paliers.seed.ts).
@Injectable()
export class AdminCircuitsService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(): Promise<CircuitVue[]> {
    const circuits = await this.prisma.circuit.findMany({ orderBy: { code: "asc" } });
    return circuits.map((c) => this.versVue(c));
  }

  async trouver(code: string): Promise<CircuitVue> {
    const circuit = await this.prisma.circuit.findUnique({ where: { code: code as never } });
    if (!circuit) {
      throw new NotFoundException({ code: "CIRCUIT_INTROUVABLE", message: "Circuit introuvable." });
    }
    return this.versVue(circuit);
  }

  async modifier(code: string, dto: ModifierCircuitRequete): Promise<CircuitVue> {
    await this.trouver(code);
    const circuit = await this.prisma.circuit.update({
      where: { code: code as never },
      data: { libelle: dto.libelle, processCode: dto.processCode }
    });
    return this.versVue(circuit);
  }

  private versVue(circuit: { code: string; libelle: string; segment: string; processCode: string | null }): CircuitVue {
    return { code: circuit.code as never, libelle: circuit.libelle, segment: circuit.segment, processCode: circuit.processCode };
  }
}
