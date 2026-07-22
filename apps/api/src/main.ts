import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import { loadEnv } from "@pgd/config";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { ResponseEnvelopeInterceptor } from "./common/interceptors/response-envelope.interceptor";

async function bootstrap() {
  const env = loadEnv();

  const app = await NestFactory.create(AppModule, {
    cors: { origin: env.CORS_ORIGIN, credentials: true }
  });

  app.use(cookieParser());
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new ResponseEnvelopeInterceptor());

  const swaggerConfig = new DocumentBuilder()
    .setTitle("PGD — API")
    .setDescription("Plateforme de Gestion des Dégrèvements — Orange Côte d'Ivoire")
    .setVersion("0.1.0")
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  await app.listen(env.API_PORT);
  // eslint-disable-next-line no-console
  console.log(`[api] démarré sur http://localhost:${env.API_PORT} (docs: /api/docs)`);
}

bootstrap();
