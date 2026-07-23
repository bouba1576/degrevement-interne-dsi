import { of } from "rxjs";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { ResponseEnvelopeInterceptor } from "../src/common/interceptors/response-envelope.interceptor";

// Trouvé en revue (Phase 9.2) : DemandesController.lister, AuditController.
// journalSecurite et NotificationsController.lister retournaient tous les
// trois { <clé>: [...], meta: { total } } (ex. { demandes, meta }) plutôt que
// { data: [...], meta }. estDejaEnveloppe() ne vérifie que la PRÉSENCE de la
// clé "meta" pour décider qu'un contrôleur a déjà enveloppé sa réponse — dans
// ce cas elle renvoyait { data: null, error: null, meta } : la liste réelle
// disparaissait silencieusement de la réponse HTTP, alors que meta.total
// restait correct. Invisible aux tests d'intégration existants (ils appellent
// les services directement, jamais les contrôleurs via HTTP) et invisible à
// tout appelant qui n'exploite que meta.total (ex. un futur compteur de
// brouillons). Corrigé dans les trois contrôleurs (retour { data, meta }) ;
// ce test fixe le contrat pour que la même forme fautive ne soit pas
// réintroduite par un futur contrôleur paginé.
function callHandlerRenvoyant(valeur: unknown): CallHandler {
  return { handle: () => of(valeur) };
}

describe("ResponseEnvelopeInterceptor — contrat des listes paginées", () => {
  const interceptor = new ResponseEnvelopeInterceptor();
  const contexteFactice = {} as ExecutionContext;

  it("préserve data et meta quand le contrôleur retourne bien { data, meta }", (done) => {
    const liste = [{ id: "1" }, { id: "2" }];
    interceptor.intercept(contexteFactice, callHandlerRenvoyant({ data: liste, meta: { total: 2 } })).subscribe((enveloppe) => {
      expect(enveloppe).toEqual({ data: liste, error: null, meta: { total: 2 } });
      done();
    });
  });

  it("ATTENTION — une clé autre que data à côté de meta perd silencieusement la liste (contrat piégeux, pas un bug de ce test)", (done) => {
    const liste = [{ id: "1" }, { id: "2" }];
    // Reproduit exactement la forme fautive trouvée en Phase 9.2 :
    // { demandes: [...], meta: { total } } au lieu de { data: [...], meta }.
    interceptor.intercept(contexteFactice, callHandlerRenvoyant({ demandes: liste, meta: { total: 2 } })).subscribe((enveloppe) => {
      expect(enveloppe).toEqual({ data: null, error: null, meta: { total: 2 } });
      done();
    });
  });

  it("enveloppe une réponse simple (sans data/error/meta) en la plaçant telle quelle sous data", (done) => {
    const valeur = { id: "1" };
    interceptor.intercept(contexteFactice, callHandlerRenvoyant(valeur)).subscribe((enveloppe) => {
      expect(enveloppe).toEqual({ data: valeur, error: null, meta: null });
      done();
    });
  });
});
