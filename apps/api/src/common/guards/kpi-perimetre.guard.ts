import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { JournalSecuriteService } from "../../modules/auth/services/journal-securite.service";
import type { RequeteAuthentifiee } from "./auth.guard";

const ROLE_ADMIN_KPI = "ADMIN_PGD";

// PGD-074 — trouvé en revue avant 8.5 : `profil` (initiateur|valideur|
// pilotage) sur GET /api/kpi était un filtre purement déclaratif, jamais
// vérifié côté serveur. `initiateur`/`valideur` sont scopés par
// KpiEngineService.construireWhere contre des données réelles
// (initiateurId, roleCorbeille détenu) — ce ne sont pas des décisions
// d'accès binaires, donc pas des guards. `pilotage` (ou profil absent,
// le cas par défaut le plus large) EST une décision binaire — aucun
// rattachement utilisateur → direction/service n'existe dans le modèle
// pour vérifier un droit de portée plus fin.
//
// Élargi le 01/09/2026 (demande explicite) : la vue Pilotage (agrégats
// inter-circuits) du Dashboard doit être visible par TOUS les validateurs,
// pas seulement ADMIN_PGD — reconverti sur `profils` (Chantier 2,
// Role.profilSysteme) plutôt qu'ajouté comme un rôle de plus dans une liste
// figée, cohérent avec ProfilGuard/@ProfilRequis déjà en place ailleurs.
// ADMIN_PGD reste vérifié explicitement par CODE (pas seulement via son
// profil ADMINISTRATEUR) pour ne jamais dépendre d'un classement qui
// pourrait un jour inclure SUPERVISEUR/SERVICE_TECHNIQUE sans capacité
// réelle derrière (cf. HomeScreen.tsx, même réserve).
@Injectable()
export class KpiPerimetreGuard implements CanActivate {
  constructor(private readonly journal: JournalSecuriteService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequeteAuthentifiee>();
    const utilisateur = request.utilisateur;
    if (!utilisateur) return true;

    const profilBrut = request.query?.profil;
    const profil = typeof profilBrut === "string" ? profilBrut : "pilotage";

    const autorisePilotage = utilisateur.roles.includes(ROLE_ADMIN_KPI) || utilisateur.profils.includes("VALIDATEUR");

    if (profil === "pilotage" && !autorisePilotage) {
      await this.journal.consigner({ utilisateurId: utilisateur.id, evenement: "RBAC_REFUS", facteur: "SESSION", succes: false });
      throw new ForbiddenException({
        code: "PERIMETRE_KPI_REFUSE",
        message: "Le profil « pilotage » (agrégats inter-circuits) est réservé aux validateurs et à l'administration.",
        details: { profil }
      });
    }

    return true;
  }
}
