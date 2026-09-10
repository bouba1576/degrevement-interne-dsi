import { Injectable } from "@nestjs/common";
import type { EnumEvenementSecurite, EnumFacteurAuth } from "@pgd/database";
import { PrismaService } from "../../../infra/prisma/prisma.service";

interface EvenementSecurite {
  utilisateurId?: string;
  evenement: EnumEvenementSecurite;
  facteur: EnumFacteurAuth;
  succes: boolean;
  // E7.2 (docs/15_Conformite_Exigences_Securite_OCIT.md), capturé le
  // 10/09/2026 — le champ existait en schéma depuis le début mais n'était
  // renseigné par aucun appelant (confirmé par audit, recherche exhaustive
  // des 12 sites d'appel de consigner()). Toujours `req.ip` (le pair TCP
  // direct), JAMAIS `X-Forwarded-For` : aucun reverse-proxy n'est déclaré
  // devant l'API dans ce dépôt (`docker-compose*.yml`, recherche négative de
  // nginx/traefik) et `main.ts` ne configure pas `trust proxy` — faire
  // confiance à un en-tête client-fourni sans proxy de confiance en amont
  // permettrait à quiconque de forger l'IP journalisée. Si un reverse-proxy
  // TLS est un jour placé devant l'API (cf. E9.1, audit du 10/09/2026), ce
  // choix devra être revu en même temps (`trust proxy` + lecture de l'en-tête
  // du proxy de confiance, jamais avant qu'il n'existe réellement).
  ip?: string;
  // Détail d'échec optionnel (19/08/2026, AdApiProvider/SF-PGD-001) —
  // générique à tout evenement, jamais renseigné sur succes=true. Un type
  // d'événement par étape distincte du parcours, jamais un nouveau type par
  // sous-cause d'échec de la même étape (cf. CLAUDE.md) : ce détail vit dans
  // ces deux colonnes, pas dans une variante de `evenement`.
  codeEchec?: string;
  messageEchec?: string;
  // E7.2 (docs/15_Conformite_Exigences_Securite_OCIT.md), capturé le
  // 10/09/2026 — sur un échec où l'identité n'a jamais pu être résolue
  // (mauvais mot de passe, identifiant inconnu), utilisateurId reste
  // toujours undefined et rien d'autre ne porte l'identifiant réellement
  // saisi. Chaîne brute, jamais peuplée sur succes=true, jamais peuplée
  // non plus quand utilisateurId est déjà connu (redondant).
  identifiantTente?: string;
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
        messageEchec: evt.messageEchec ?? null,
        identifiantTente: evt.identifiantTente ?? null
      }
    });
  }
}
