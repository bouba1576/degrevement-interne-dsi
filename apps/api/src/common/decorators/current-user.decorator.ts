import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { RequeteAuthentifiee } from "../guards/auth.guard";

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequeteAuthentifiee>();
  return request.utilisateur;
});
