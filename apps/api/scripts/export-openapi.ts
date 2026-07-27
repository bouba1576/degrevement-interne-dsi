import "reflect-metadata";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "../src/app.module";

// Phase 10.5 (docs/05 §10.5) — exporte le MÊME document que celui servi en
// direct à /api/docs-json (même DocumentBuilder que main.ts) vers un fichier
// versionné, pour qu'« OpenAPI publiée » désigne un artefact partageable et
// diffable, pas seulement un endpoint qui exige un serveur démarré. Généré à
// chaque exécution depuis les décorateurs réels du code (@ApiZodBody/
// @ApiZodResponse dérivés de packages/contracts, cf.
// apps/api/src/common/swagger/zod-schema.ts) — jamais retouché à la main :
// un openapi.json qui diverge du comportement réel serait exactement le
// mode de défaillance que ce mécanisme existe pour éviter.
//
// Nécessite Postgres/Redis/RabbitMQ joignables (AppModule importe
// PrismaModule/RedisModule/RabbitMQModule, connectés à l'initialisation) —
// lancer avec la stack de dev ou les conteneurs CI déjà debout, jamais en
// isolation complète.
async function exporterOpenApi() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api");

  const config = new DocumentBuilder()
    .setTitle("PGD — API")
    .setDescription("Plateforme de Gestion des Dégrèvements — Orange Côte d'Ivoire")
    .setVersion("0.1.0")
    .build();
  const document = SwaggerModule.createDocument(app, config);

  const dossier = join(__dirname, "..", "..", "..", "docs");
  mkdirSync(dossier, { recursive: true });
  const chemin = join(dossier, "openapi.json");
  writeFileSync(chemin, JSON.stringify(document, null, 2) + "\n", "utf8");

  // eslint-disable-next-line no-console
  console.log(`OpenAPI exporté : ${chemin} (${Object.keys(document.paths).length} routes documentées)`);
  await app.close();
}

exporterOpenApi().catch((erreur) => {
  // eslint-disable-next-line no-console
  console.error("Échec de l'export OpenAPI :", erreur);
  process.exit(1);
});
