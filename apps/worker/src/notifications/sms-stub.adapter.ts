import { Injectable, Logger } from "@nestjs/common";
import type { SmsAEnvoyer, SmsPort } from "./sms.port";

@Injectable()
export class SmsStubAdapter implements SmsPort {
  private readonly logger = new Logger(SmsStubAdapter.name);

  async envoyer(sms: SmsAEnvoyer): Promise<void> {
    this.logger.log(`[bouchon] SMS à ${sms.destinataire}`);
  }
}
