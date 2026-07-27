import { applyDecorators } from "@nestjs/common";
import { ApiBody, ApiQuery, ApiResponse } from "@nestjs/swagger";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodTypeAny } from "zod";

// Phase 10.5 (docs/05 §10.5) — l'OpenAPI publiée doit être GÉNÉRÉE depuis
// packages/contracts (source unique des types, règle non négociable 9),
// jamais un doublon de schéma entretenu à la main en parallèle : un DTO
// Swagger écrit séparément diverge du comportement réel dès le premier
// changement de contrat non répercuté — exactement le mode de défaillance
// que route-order.spec.ts/envelope-contract.spec.ts existent pour traquer
// côté routes, appliqué ici côté documentation. `zodToJsonSchema` convertit
// le MÊME objet Zod que celui utilisé par `schema.parse(body)` dans le
// contrôleur — pas une resaisie, une dérivation.
//
// $refStrategy: "none" — auto-suffisant par décorateur (schéma inline dans
// chaque opération) plutôt qu'un registre de components.schemas partagé :
// plus simple pour 78 routes sur 18 contrôleurs, quitte à répéter des formes
// communes ; un registre partagé serait la prochaine étape si la taille du
// document devient un problème réel, pas avant.
// zod-to-json-schema est générique sur des conditionnels Zod trop profonds
// pour l'inférence TS dès qu'on l'appelle depuis un point unique avec des
// schémas variés (TS2589, "Type instantiation is excessively deep") ; le
// schéma d'entrée reste typé ZodTypeAny à l'appel (versSchemaOpenApi), seule
// cette frontière interne sacrifie l'inférence de bibliothèque, jamais la
// nôtre.
function versSchemaOpenApi(schema: ZodTypeAny): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cf. commentaire ci-dessus
  const resultat: unknown = zodToJsonSchema(schema as any, { $refStrategy: "none", target: "openApi3" });
  return resultat as Record<string, unknown>;
}

/** Corps de requête JSON documenté depuis un schéma Zod déjà utilisé par le contrôleur (`schema.parse(body)`). */
export function ApiZodBody(schema: ZodTypeAny, description?: string) {
  return applyDecorators(ApiBody({ schema: versSchemaOpenApi(schema), description }));
}

/** Réponse JSON documentée depuis un schéma/type Zod déjà exporté par packages/contracts. */
export function ApiZodResponse(status: number, schema: ZodTypeAny, description?: string) {
  return applyDecorators(ApiResponse({ status, schema: versSchemaOpenApi(schema), description }));
}

/** Paramètres de query documentés depuis un schéma Zod objet (listerXxxQuerySchema) — un ApiQuery par clé. */
export function ApiZodQuery(schema: ZodTypeAny) {
  const jsonSchema = versSchemaOpenApi(schema) as { properties?: Record<string, { type?: string; description?: string }>; required?: string[] };
  const proprietes = jsonSchema.properties ?? {};
  const requises = new Set(jsonSchema.required ?? []);
  const decorateurs = Object.entries(proprietes).map(([nom, def]) =>
    ApiQuery({ name: nom, required: requises.has(nom), schema: def as Record<string, unknown>, description: def.description })
  );
  return applyDecorators(...decorateurs);
}
