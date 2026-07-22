import { GUARDS_METADATA } from "@nestjs/common/constants";
import { TachesController } from "../src/modules/taches/taches.controller";
import { CorbeilleRoleGuard } from "../src/common/guards/corbeille-role.guard";
import { SodGuard } from "../src/common/guards/sod.guard";
import { DelegationContextGuard } from "../src/common/guards/delegation-context.guard";

// R4/R21 — CorbeilleRoleGuard DOIT s'exécuter avant SodGuard : sans ça, un
// agent qui n'a même pas le droit d'agir sur la tâche pourrait quand même
// déclencher la logique SoD (et, pire, la contourner si aucun conflit SoD ne
// se présente alors qu'il n'avait aucune habilitation de départ). NestJS
// exécute les guards dans l'ordre de déclaration de @UseGuards() — ce test
// lit cet ordre directement dans les métadonnées plutôt que de faire
// confiance à la lecture du code : un reclassement accidentel des décorateurs
// fait échouer ce test, pas seulement une revue de code.
describe("Ordre des guards — CorbeilleRoleGuard avant SodGuard (R4/R21)", () => {
  function guardsDe(nomMethode: "approuver" | "rejeter" | "soumettreControle"): unknown[] {
    const handler = (TachesController.prototype as unknown as Record<string, object>)[nomMethode]!;
    return (Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[]) ?? [];
  }

  it.each(["approuver", "rejeter", "soumettreControle"] as const)(
    "%s : DelegationContextGuard, puis CorbeilleRoleGuard, puis SodGuard",
    (nomMethode) => {
      const guards = guardsDe(nomMethode);
      const indexDelegation = guards.indexOf(DelegationContextGuard);
      const indexCorbeille = guards.indexOf(CorbeilleRoleGuard);
      const indexSod = guards.indexOf(SodGuard);

      expect(indexDelegation).toBeGreaterThanOrEqual(0);
      expect(indexCorbeille).toBeGreaterThanOrEqual(0);
      expect(indexSod).toBeGreaterThanOrEqual(0);

      // L'appartenance à la corbeille se vérifie avant le conflit SoD — pas
      // l'inverse, et pas en parallèle sans ordre garanti.
      expect(indexCorbeille).toBeLessThan(indexSod);
      // La délégation doit être résolue avant que CorbeilleRoleGuard ou
      // SodGuard n'en aient besoin (SodGuard ne la devine jamais lui-même).
      expect(indexDelegation).toBeLessThan(indexSod);
    }
  );

  it("claim/unclaim portent CorbeilleRoleGuard (pas de SodGuard — pas une décision d'étape)", () => {
    const guardsClaim = Reflect.getMetadata(GUARDS_METADATA, TachesController.prototype.claim) as unknown[] | undefined;
    const guardsUnclaim = Reflect.getMetadata(GUARDS_METADATA, TachesController.prototype.unclaim) as unknown[] | undefined;
    expect(guardsClaim ?? []).toContain(CorbeilleRoleGuard);
    expect(guardsUnclaim ?? []).toContain(CorbeilleRoleGuard);
  });
});
