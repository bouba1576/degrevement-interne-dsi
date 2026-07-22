import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { RequeteAvecDelegation } from "../guards/delegation-context.guard";
import type { ContexteDelegation } from "../../modules/taches/services/tache-workflow.service";

// Lit le contexte posé par DelegationContextGuard (doit s'exécuter en amont) —
// undefined si l'action n'est pas menée sous délégation.
export const ContexteDelegationActuelle = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ContexteDelegation | undefined => {
    const request = ctx.switchToHttp().getRequest<RequeteAvecDelegation>();
    if (!request.delegationId || !request.delegantIdentifiantAd) return undefined;
    return { delegationId: request.delegationId, delegantIdentifiantAd: request.delegantIdentifiantAd };
  }
);
