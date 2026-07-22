import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { BillingSiPort, ReponsePousseeSi, RequetePousseeSi } from "./billing-si.port";

// Bouchon GAIA (docs/01 SF-PGD-361 : « contrat provisoire, à confirmer avec
// l'équipe SI ») — circuit DF par défaut (PARAMETRE_GLOBAL).
@Injectable()
export class GaiaStubAdapter implements BillingSiPort {
  private readonly logger = new Logger(GaiaStubAdapter.name);

  async pousser(requete: RequetePousseeSi): Promise<ReponsePousseeSi> {
    const refSi = `GAIA-${randomUUID()}`;
    this.logger.log(`[bouchon] Poussée GAIA ${requete.reference} → ${refSi}`);
    return { refSi };
  }
}
