import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { BillingSiPort, ReponsePousseeSi, RequetePousseeSi } from "./billing-si.port";

// Bouchon BSCS (docs/01 SF-PGD-361 : « contrat provisoire, à confirmer avec
// l'équipe SI ») — circuits DOBB/DXC par défaut (PARAMETRE_GLOBAL).
@Injectable()
export class BscsStubAdapter implements BillingSiPort {
  private readonly logger = new Logger(BscsStubAdapter.name);

  async pousser(requete: RequetePousseeSi): Promise<ReponsePousseeSi> {
    const refSi = `BSCS-${randomUUID()}`;
    this.logger.log(`[bouchon] Poussée BSCS ${requete.reference} → ${refSi}`);
    return { refSi };
  }
}
