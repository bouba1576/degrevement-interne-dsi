import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, map } from "rxjs";
import type { Enveloppe } from "@pgd/contracts";

function estDejaEnveloppe(valeur: unknown): valeur is Partial<Enveloppe<unknown>> {
  return (
    typeof valeur === "object" &&
    valeur !== null &&
    ("data" in valeur || "error" in valeur || "meta" in valeur)
  );
}

// Enveloppe toute réponse de contrôleur en { data, error, meta } — docs/06 §1.
// Un contrôleur peut déjà retourner { data, meta } (listes paginées) : dans ce cas
// seul `error: null` est ajouté s'il manque.
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<T, Enveloppe<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<Enveloppe<T>> {
    return next.handle().pipe(
      map((valeur) => {
        if (estDejaEnveloppe(valeur)) {
          return {
            data: valeur.data ?? null,
            error: valeur.error ?? null,
            meta: valeur.meta ?? null
          } as Enveloppe<T>;
        }
        return { data: valeur, error: null, meta: null };
      })
    );
  }
}
