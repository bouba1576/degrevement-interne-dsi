import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "node:crypto";
import { loadEnv } from "@pgd/config";
import { CacheService } from "../../../infra/redis/cache.service";

// sousFluxId (14/08/2026, CLAUDE.md « Sous-flux — référentiel SF-PGD-109 ») —
// porté en session exactement comme `roles` : figé à la connexion, jamais
// résolu à la lecture de GET /api/auth/session ni à `rafraichir()` (qui
// réémet depuis `SessionEnregistree`, pas depuis une relecture de
// Utilisateur). Décision explicite : cohérence plutôt que fraîcheur — le
// même écran d'administration modifie rôle/direction/service/sous-flux, s'ils
// n'obéissaient pas tous à la même règle de « prend effet quand », un
// administrateur changeant plusieurs champs à la fois observerait un
// comportement incohérent d'un champ à l'autre sur le même écran.
export interface SessionEnregistree {
  utilisateurId: string;
  identifiantAd: string;
  roles: string[];
  sousFluxId: string | null;
  mfaSatisfaite: boolean;
  creeLe: string;
}

export interface PaireJetons {
  accessToken: string;
  refreshToken: string;
}

interface AccessPayload {
  sub: string;
  identifiantAd: string;
  roles: string[];
  sousFluxId: string | null;
  jti: string;
}

interface RefreshPayload {
  sub: string;
  jti: string;
}

// SF-PGD-003 : JWT court + refresh + store Redis → révocation immédiate.
// La révocation est vérifiée à CHAQUE requête (AuthGuard interroge Redis, pas
// seulement au refresh) — un coût d'un aller-retour Redis par requête, choisi
// délibérément pour que « immédiate » soit vrai y compris pour un access token
// encore valide selon sa seule signature.
//
// SF-PGD-004 (re-challenge MFA à la bascule vers un rôle sensible) : le champ
// mfaSatisfaite et marquerMfaSatisfaite() sont le mécanisme, mais rien ne
// l'invoque encore — aucune action de « bascule vers un rôle sensible »
// n'existe avant la délégation (Phase 6) ou l'admin des rôles. Câblage à faire
// au moment où cette action existera, pas anticipé ici.
@Injectable()
export class SessionService {
  constructor(
    private readonly jwt: JwtService,
    private readonly cache: CacheService
  ) {}

  async creerSession(utilisateur: {
    id: string;
    identifiantAd: string;
    roles: string[];
    sousFluxId?: string | null;
  }): Promise<PaireJetons> {
    const env = loadEnv();
    const jti = randomUUID();

    const session: SessionEnregistree = {
      utilisateurId: utilisateur.id,
      identifiantAd: utilisateur.identifiantAd,
      roles: utilisateur.roles,
      sousFluxId: utilisateur.sousFluxId ?? null,
      mfaSatisfaite: false,
      creeLe: new Date().toISOString()
    };
    await this.cache.set(this.cleSession(jti), session, this.dureeEnSecondes(env.REFRESH_TOKEN_EXPIRES_IN));

    return this.emettreJetons({ ...utilisateur, sousFluxId: session.sousFluxId }, jti);
  }

  async marquerMfaSatisfaite(jti: string): Promise<void> {
    const session = await this.cache.get<SessionEnregistree>(this.cleSession(jti));
    if (!session) return;
    const env = loadEnv();
    await this.cache.set(
      this.cleSession(jti),
      { ...session, mfaSatisfaite: true },
      this.dureeEnSecondes(env.REFRESH_TOKEN_EXPIRES_IN)
    );
  }

  async verifierAccessToken(token: string): Promise<(AccessPayload & { session: SessionEnregistree }) | null> {
    try {
      const payload = this.jwt.verify<AccessPayload>(token, { secret: loadEnv().JWT_SECRET });
      const session = await this.cache.get<SessionEnregistree>(this.cleSession(payload.jti));
      if (!session) return null; // révoquée ou expirée côté Redis
      return { ...payload, session };
    } catch {
      return null;
    }
  }

  async rafraichir(refreshToken: string): Promise<PaireJetons | null> {
    const env = loadEnv();
    let payload: RefreshPayload;
    try {
      payload = this.jwt.verify<RefreshPayload>(refreshToken, { secret: env.REFRESH_TOKEN_SECRET });
    } catch {
      return null;
    }

    const session = await this.cache.get<SessionEnregistree>(this.cleSession(payload.jti));
    if (!session) return null;

    return this.emettreJetons(
      {
        id: session.utilisateurId,
        identifiantAd: session.identifiantAd,
        roles: session.roles,
        sousFluxId: session.sousFluxId
      },
      payload.jti
    );
  }

  async revoquer(jti: string): Promise<void> {
    await this.cache.invalidate(this.cleSession(jti));
  }

  private async emettreJetons(
    utilisateur: { id: string; identifiantAd: string; roles: string[]; sousFluxId?: string | null },
    jti: string
  ): Promise<PaireJetons> {
    const env = loadEnv();
    const accessToken = this.jwt.sign(
      {
        sub: utilisateur.id,
        identifiantAd: utilisateur.identifiantAd,
        roles: utilisateur.roles,
        sousFluxId: utilisateur.sousFluxId ?? null,
        jti
      } satisfies AccessPayload,
      { secret: env.JWT_SECRET, expiresIn: env.JWT_EXPIRES_IN }
    );
    const refreshToken = this.jwt.sign({ sub: utilisateur.id, jti } satisfies RefreshPayload, {
      secret: env.REFRESH_TOKEN_SECRET,
      expiresIn: env.REFRESH_TOKEN_EXPIRES_IN
    });
    return { accessToken, refreshToken };
  }

  private cleSession(jti: string): string {
    return `session:${jti}`;
  }

  private dureeEnSecondes(duree: string): number {
    const correspondance = duree.match(/^(\d+)([smhd])$/);
    const valeur = correspondance?.[1];
    const unite = correspondance?.[2];
    if (!valeur || !unite) return 604800; // 7 jours par défaut si format inattendu
    const multiplicateurs: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return Number(valeur) * (multiplicateurs[unite] ?? 1);
  }
}
