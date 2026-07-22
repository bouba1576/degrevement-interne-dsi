import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from "@nestjs/common";
import type { Response } from "express";
import { ZodError } from "zod";

// Enveloppe d'erreur normalisée — docs/06_Contrats_API.md §1.
// Codes HTTP normalisés : 400/401/403/404/409/422/429 (CLAUDE.md §Codes d'erreur).

interface CorpsErreurNormalise {
  code: string;
  message: string;
  details?: unknown;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const { status, corps } = this.normaliser(exception);

    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }

    response.status(status).json({ data: null, error: corps, meta: null });
  }

  private normaliser(exception: unknown): { status: number; corps: CorpsErreurNormalise } {
    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        corps: {
          code: "VALIDATION_ECHOUEE",
          message: "La requête ne respecte pas le schéma attendu.",
          details: exception.issues.map((issue) => ({ chemin: issue.path.join("."), message: issue.message }))
        }
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const reponse = exception.getResponse();

      if (typeof reponse === "object" && reponse !== null && "code" in reponse) {
        return { status, corps: reponse as CorpsErreurNormalise };
      }

      const message =
        typeof reponse === "string"
          ? reponse
          : ((reponse as { message?: string | string[] })?.message ?? exception.message);

      return {
        status,
        corps: {
          code: this.codeParDefaut(status),
          message: Array.isArray(message) ? message.join(", ") : message,
          details: typeof reponse === "object" ? reponse : undefined
        }
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      corps: { code: "ERREUR_INTERNE", message: "Une erreur interne est survenue." }
    };
  }

  private codeParDefaut(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return "VALIDATION_ECHOUEE";
      case HttpStatus.UNAUTHORIZED:
        return "NON_AUTHENTIFIE";
      case HttpStatus.FORBIDDEN:
        return "ACCES_REFUSE";
      case HttpStatus.NOT_FOUND:
        return "RESSOURCE_INTROUVABLE";
      case HttpStatus.CONFLICT:
        return "CONFLIT";
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return "REGLE_METIER_VIOLEE";
      case HttpStatus.TOO_MANY_REQUESTS:
        return "LIMITE_ATTEINTE";
      default:
        return "ERREUR";
    }
  }
}
