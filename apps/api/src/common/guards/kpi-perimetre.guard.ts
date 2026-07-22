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
// pour vérifier un droit de portée plus fin, donc restreint à ADMIN_PGD,
// exactement comme CorbeilleRoleGuard restreint l'accès à une tâche.
@Injectable()
export class KpiPerimetreGuard implements CanActivate {
  constructor(private readonly journal: JournalSecuriteService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequeteAuthentifiee>();
    const utilisateur = request.utilisateur;
    if (!utilisateur) return true;

    const profilBrut = request.query?.profil;
    const profil = typeof profilBrut === "string" ? profilBrut : "pilotage";

    if (profil === "pilotage" && !utilisateur.roles.includes(ROLE_ADMIN_KPI)) {
      await this.journal.consigner({ utilisateurId: utilisateur.id, evenement: "RBAC_REFUS", facteur: "SESSION", succes: false });
      throw new ForbiddenException({
        code: "PERIMETRE_KPI_REFUSE",
        message: "Le profil « pilotage » (agrégats inter-circuits) est réservé à l'administration.",
        details: { profil }
      });
    }

    return true;
  }
}
