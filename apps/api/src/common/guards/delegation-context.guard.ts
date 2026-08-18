import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { DelegationService } from "../../modules/taches/services/delegation.service";
import type { RequeteAuthentifiee } from "./auth.guard";

export interface RequeteAvecDelegation extends RequeteAuthentifiee {
  delegantIdentifiantAd?: string;
  delegationId?: string;
}

// Résout la délégation active (délégataireId = utilisateur courant, role_code
// = tache.roleCorbeille, instant courant ∈ [debut, fin]) et l'attache à la
// requête AVANT SodGuard — SodGuard ne devine jamais la délégation lui-même
// (cf. son commentaire), c'est ce guard qui la lui fournit. Déclaré avant
// SodGuard dans @UseGuards() : NestJS exécute les guards dans l'ordre donné.
@Injectable()
export class DelegationContextGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly delegationService: DelegationService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequeteAvecDelegation>();
    const tacheId = typeof request.params?.id === "string" ? request.params.id : undefined;
    const utilisateur = request.utilisateur;
    if (!tacheId || !utilisateur) return true;

    const tache = await this.prisma.tache.findUnique({ where: { id: tacheId } });
    if (!tache) return true; // 404 est la responsabilité du contrôleur/service, pas de ce guard

    const delegation = await this.delegationService.delegationActivePour(utilisateur.id, tache.roleCorbeille);
    if (delegation) {
      request.delegantIdentifiantAd = delegation.delegantIdentifiantAd;
      request.delegationId = delegation.delegationId;
    }
    return true;
  }
}
