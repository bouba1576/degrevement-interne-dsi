import { z } from "zod";
import {
  erreurSchema,
  kpiValeurSchema,
  sessionUtilisateurSchema,
  tachesListeReponseSchema,
  type KpiValeur,
  type SessionUtilisateur,
  type TachesListeReponse
} from "@pgd/contracts";

// Session par cookie httpOnly (SessionService, apps/api) : `credentials:
// "include"` sur chaque appel, jamais un jeton porté manuellement côté
// client. CORS_ORIGIN (apps/api) doit correspondre à l'origine réelle de
// apps/web pour que le navigateur accepte le cookie cross-origin.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

// TOUTE réponse (succès ou erreur) passe par l'enveloppe {data,error,meta} —
// `ResponseEnvelopeInterceptor` (apps/api/src/common/interceptors/) l'ajoute
// globalement à chaque contrôleur, y compris quand la méthode retourne un
// DTO « à plat » (KpiValeur[], TachesListeReponse, SessionUtilisateur — leur
// signature TypeScript décrit ce que le CONTRÔLEUR retourne, pas la forme du
// corps HTTP réel après l'intercepteur). Vérifié en réel (Phase 9.2) :
// GET /api/auth/session renvoie bien {"data":{...},"error":null,"meta":null},
// jamais le SessionUtilisateur nu — une hypothèse fausse tenue pour acquise
// à l'écriture initiale de ce fichier, corrigée seulement en testant contre
// un vrai login (jean.kouassi), pas en relisant le contrôleur.
async function requete<T>(chemin: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const reponse = await fetch(`${API_URL}${chemin}`, { credentials: "include", ...init });
  const corps: unknown = await reponse.json().catch(() => null);
  const enveloppe = corps as { data?: unknown; error?: unknown } | null;

  if (!reponse.ok) {
    const erreur = enveloppe?.error
      ? erreurSchema.parse(enveloppe.error)
      : { code: "ERREUR", message: "Erreur inattendue du serveur.", details: undefined };
    throw new ApiError(erreur.code, erreur.message, reponse.status);
  }

  return schema.parse(enveloppe?.data);
}

export type ProfilKpi = "initiateur" | "valideur" | "pilotage";

export function fetchKpi(profil: ProfilKpi): Promise<KpiValeur[]> {
  return requete(`/api/kpi?profil=${profil}`, z.array(kpiValeurSchema));
}

// `limit=1` : seul `total` (un vrai count() Postgres, TacheService.lister)
// nous intéresse ici, pas la page de résultats.
export function fetchTachesTotal(etat: string): Promise<TachesListeReponse> {
  return requete(`/api/taches?etat=${etat}&limit=1`, tachesListeReponseSchema);
}

export function fetchSession(): Promise<SessionUtilisateur> {
  return requete("/api/auth/session", sessionUtilisateurSchema);
}

export function deconnecter(): Promise<{ deconnecte: true }> {
  return requete("/api/auth/logout", z.object({ deconnecte: z.literal(true) }), { method: "POST" });
}
