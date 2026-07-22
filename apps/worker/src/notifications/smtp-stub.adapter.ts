import { Injectable, Logger } from "@nestjs/common";
import type { EmailAEnvoyer, SmtpPort } from "./smtp.port";

@Injectable()
export class SmtpStubAdapter implements SmtpPort {
  private readonly logger = new Logger(SmtpStubAdapter.name);

  async envoyer(email: EmailAEnvoyer): Promise<void> {
    this.logger.log(`[bouchon] Email à ${email.destinataire} — ${email.sujet}`);
  }
}
