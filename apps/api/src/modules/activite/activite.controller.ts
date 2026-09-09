import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { activiteNavigationRequeteSchema } from "@pgd/contracts";
import { ApiZodBody } from "../../common/swagger/zod-schema";
import { Authenticated } from "../../common/decorators/authenticated.decorator";
import { SansJournalActivite } from "../../common/decorators/sans-journal-activite.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { UtilisateurRequete } from "../../common/guards/auth.guard";
import { ActiviteService } from "./activite.service";

// POST /api/activite/navigation (08/09/2026, CLAUDE.md « Journal d'activité
// administrateur ») — appelée par le client de façon non bloquante (fire-
// and-forget, cf. app/(app)/layout.tsx) à chaque changement de route réel.
// @Authenticated() seul, aucun rôle : n'importe quel utilisateur connecté
// génère de la navigation, jamais réservé à un profil.
@ApiTags("activite")
@Controller("activite")
export class ActiviteController {
  constructor(private readonly activite: ActiviteService) {}

  // @SansJournalActivite() — cette route EST elle-même l'autre moitié de ce
  // journal (volet NAVIGATION) ; sans ce décorateur, JournalActiviteInterceptor
  // la capturerait en plus comme une ACTION, dupliquant chaque navigation.
  @Authenticated()
  @SansJournalActivite()
  @Post("navigation")
  @HttpCode(200)
  @ApiZodBody(activiteNavigationRequeteSchema)
  async navigation(
    @Body() body: unknown,
    @CurrentUser() utilisateur: UtilisateurRequete
  ): Promise<{ enregistre: true }> {
    const dto = activiteNavigationRequeteSchema.parse(body);
    await this.activite.consignerNavigation(dto.route, dto.detail, utilisateur.id);
    return { enregistre: true };
  }
}
