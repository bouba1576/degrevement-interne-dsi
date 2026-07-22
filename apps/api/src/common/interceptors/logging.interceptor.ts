import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor
} from "@nestjs/common";
import { Observable, tap } from "rxjs";

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const { method, originalUrl } = request;
    const debut = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(`${method} ${originalUrl} — ${Date.now() - debut}ms`);
        },
        error: (erreur) => {
          this.logger.warn(`${method} ${originalUrl} — échec après ${Date.now() - debut}ms`, erreur);
        }
      })
    );
  }
}
