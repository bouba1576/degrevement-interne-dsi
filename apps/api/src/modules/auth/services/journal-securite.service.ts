import { Injectable } from "@nestjs/common";
import type { EnumEvenementSecurite, EnumFacteurAuth } from "@pgd/database";
import { PrismaService } from "../../../infra/prisma/prisma.service";

interface EvenementSecurite {
  utilisateurId?: string;
  evenement: EnumEvenementSecurite;
  facteur: EnumFacteurAuth;
  succes: boolean;
  ip?: string;
  // Détail d'échec optionnel (19/08/2026, AdApiProvider/SF-PGD-001) —
  // générique à tout evenement, jamais renseigné sur succes=true. Un type
  // d'événement par étape distincte du parcours, jamais un nouveau type par
  // sous-cause d'échec de la même étape (cf. CLAUDE.md) : ce détail vit dans
  // ces deux colonnes, pas dans une variante de `evenement`.
  codeEchec?: string;
  messageEchec?: string;
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
        ip: evt.ip ?? null,
        codeEchec: evt.codeEchec ?? null,
        messageEchec: evt.messageEchec ?? null
      }
    });
  }
}
