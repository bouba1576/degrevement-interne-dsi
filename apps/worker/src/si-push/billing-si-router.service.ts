import { Injectable } from "@nestjs/common";
import { PrismaService } from "../infra/prisma/prisma.service";
import { BscsStubAdapter } from "./bscs-stub.adapter";
import { GaiaStubAdapter } from "./gaia-stub.adapter";
import type { BillingSiPort } from "./billing-si.port";

// PGD-060 — routage de l'adaptateur par PARAMETRE_GLOBAL['si_adaptateur_par_circuit']
// (clé seedée : { DOBB: "BSCS", DXC: "BSCS", DF: "GAIA" }). Aucune règle
// métier codée en dur (règle non négociable 1) : le mapping circuit→adaptateur
// vient de la base, jamais d'un switch figé dans le code.
@Injectable()
export class BillingSiRouterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bscs: BscsStubAdapter,
    private readonly gaia: GaiaStubAdapter
  ) {}

  async resoudre(circuit: string): Promise<{ adaptateur: BillingSiPort; nom: string }> {
    const parametre = await this.prisma.parametreGlobal.findUniqueOrThrow({
      where: { cle: "si_adaptateur_par_circuit" }
    });
    const mapping = parametre.valeur as Record<string, string>;
    const nom = mapping[circuit];

    if (nom === "GAIA") return { adaptateur: this.gaia, nom };
    if (nom === "BSCS") return { adaptateur: this.bscs, nom };

    throw new Error(`Aucun adaptateur SI configuré pour le circuit ${circuit} (si_adaptateur_par_circuit).`);
  }
}
