import { Injectable, Logger } from "@nestjs/common";
import { Client } from "@duosecurity/duo_universal";
import { loadEnv } from "@pgd/config";
import type { DuoPort } from "../ports/mfa.port";

// Implémentation réelle (Duo Universal Prompt, flux OIDC) — SF-PGD-002, ADR-08.
// Aucun tenant Duo réel n'est disponible dans cet environnement de développement
// (voir .env.example) : le code appelle le SDK officiel sans simulation, mais
// n'a pu être vérifié qu'unitairement (createAuthUrl est purement local) — pas
// en bout en bout contre un vrai tenant. echangerCode et estDisponible font un
// appel réseau réel vers DUO_API_HOST et échoueront tant que des identifiants
// Duo réels ne sont pas fournis.
@Injectable()
export class DuoProvider implements DuoPort {
  private readonly logger = new Logger(DuoProvider.name);

  private client(): Client {
    const env = loadEnv();
    return new Client({
      clientId: env.DUO_CLIENT_ID,
      clientSecret: env.DUO_CLIENT_SECRET,
      apiHost: env.DUO_API_HOST,
      redirectUrl: env.DUO_REDIRECT_URI
    });
  }

  async creerUrlAutorisation(identifiantAd: string, state: string): Promise<string> {
    return this.client().createAuthUrl(identifiantAd, state);
  }

  async echangerCode(duoCode: string, identifiantAd: string): Promise<boolean> {
    try {
      await this.client().exchangeAuthorizationCodeFor2FAResult(duoCode, identifiantAd);
      return true;
    } catch (erreur) {
      this.logger.warn(`Échec de l'échange DUO pour ${identifiantAd} : ${(erreur as Error).message}`);
      return false;
    }
  }

  async estDisponible(): Promise<boolean> {
    try {
      await this.client().healthCheck();
      return true;
    } catch {
      return false;
    }
  }
}
