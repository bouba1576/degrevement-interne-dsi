import { Injectable } from "@nestjs/common";
import type { EnumEvenementSecurite, EnumFacteurAuth } from "@pgd/database";
import { PrismaService } from "../../../infra/prisma/prisma.service";

interface EvenementSecurite {
  utilisateurId?: string;
  evenement: EnumEvenementSecurite;
  facteur: EnumFacteurAuth;
  succes: boolean;
  ip?: string;
}

// SF-PGD-006 : toute tentative (AD, MFA, ouverture/fermeture de session) avec
// le facteur concerné, dans JOURNAL_SECURITE — append-only (CLAUDE.md règle 3,
// aucune méthode de modification/suppression n'est exposée par ce service).
@Injectable()
export class JournalSecuriteService {
  constructor(private readonly prisma: PrismaService) {}

  async consigner(evt: EvenementSecurite): Promise<void> {
    await this.prisma.journalSecurite.create({
      data: {
        utilisateurId: evt.utilisateurId ?? null,
        evenement: evt.evenement,
        facteur: evt.facteur,
        succes: evt.succes,
        ip: evt.ip ?? null
      }
    });
  }
}
