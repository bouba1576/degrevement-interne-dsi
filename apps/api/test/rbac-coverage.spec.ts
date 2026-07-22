import { PATH_METADATA } from "@nestjs/common/constants";
import { MetadataScanner, ModulesContainer } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { PUBLIC_KEY } from "../src/common/decorators/public.decorator";
import { ROLES_KEY } from "../src/common/decorators/roles.decorator";
import { AUTHENTICATED_KEY } from "../src/common/decorators/authenticated.decorator";

// PGD-014 : « Test : aucune route mutative sans décorateur de rôle. »
// Élargi à toute route (mutative ou de lecture sensible, SF-PGD-203) : chaque
// handler HTTP doit porter soit @Public() (explicitement ouvert), soit
// @Roles() (RBAC appliqué) — sur la méthode ou sur la classe. Un handler sans
// aucun des deux échoue le test plutôt que de se retrouver protégé par défaut
// « par oubli », ce qui serait invisible en revue de code.
describe("Couverture RBAC — zéro route sans décorateur (SF-PGD-203)", () => {
  it("chaque route HTTP porte @Public() ou @Roles()", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const modulesContainer = moduleRef.get(ModulesContainer);
    const scanner = new MetadataScanner();

    const routesSansDecorateur: string[] = [];
    let routesInspectees = 0;

    for (const module of modulesContainer.values()) {
      for (const wrapper of module.controllers.values()) {
        const instance = wrapper.instance as object | undefined;
        const metatype = wrapper.metatype as (new (...args: unknown[]) => unknown) | undefined;
        if (!instance || !metatype) continue;

        const prototype = Object.getPrototypeOf(instance);
        const classePublique = Reflect.getMetadata(PUBLIC_KEY, metatype) === true;
        const classeRoles = Reflect.getMetadata(ROLES_KEY, metatype) !== undefined;
        const classeAuthentifiee = Reflect.getMetadata(AUTHENTICATED_KEY, metatype) === true;

        for (const nomMethode of scanner.getAllMethodNames(prototype)) {
          const handler = (prototype as Record<string, unknown>)[nomMethode];
          const estUneRoute = Reflect.getMetadata(PATH_METADATA, handler as object) !== undefined;
          if (!estUneRoute) continue;

          routesInspectees++;
          const methodePublique = Reflect.getMetadata(PUBLIC_KEY, handler as object) === true;
          const methodeRoles = Reflect.getMetadata(ROLES_KEY, handler as object) !== undefined;
          const methodeAuthentifiee = Reflect.getMetadata(AUTHENTICATED_KEY, handler as object) === true;

          const couvert =
            classePublique ||
            classeRoles ||
            classeAuthentifiee ||
            methodePublique ||
            methodeRoles ||
            methodeAuthentifiee;
          if (!couvert) {
            routesSansDecorateur.push(`${metatype.name}.${nomMethode}`);
          }
        }
      }
    }

    expect(routesInspectees).toBeGreaterThan(0);
    expect(routesSansDecorateur).toEqual([]);

    await moduleRef.close();
  });
});
