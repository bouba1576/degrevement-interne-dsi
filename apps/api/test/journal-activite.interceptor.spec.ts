import { of } from "rxjs";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { PATH_METADATA } from "@nestjs/common/constants";
import { JournalActiviteInterceptor } from "../src/common/interceptors/journal-activite.interceptor";
import { SANS_JOURNAL_ACTIVITE_KEY } from "../src/common/decorators/sans-journal-activite.decorator";
import type { ActiviteService } from "../src/modules/activite/activite.service";

// Trouvé en vérification live (09/09/2026, chantier « Journal d'activité
// administrateur », étape 3) : Reflect.getMetadata(PATH_METADATA, handler)
// vaut "/" — jamais une chaîne vide — pour tout décorateur sans argument
// (@Post(), @Get()...). "/" est truthy et survivait au filter(Boolean) de
// segmentDecorateur(), produisant un gabarit "/demandes//" (double slash) qui
// ne correspondait jamais à une entrée de LIBELLE_PAR_GABARIT — repli sur la
// chaîne brute, jamais une erreur, mais chaque route de CRÉATION déclarée en
// @Post() bare (motifs, opérateurs, paliers, points-contact, rôles, sous-flux,
// utilisateurs, libellés d'ajustement, demandes) affichait un libellé brut
// illisible au lieu du libellé soigné du dictionnaire. Confirmé directement en
// base (`journal_activite`, ligne réelle "/demandes//") avant ce correctif.
function callHandlerRenvoyant(valeur: unknown): CallHandler {
  return { handle: () => of(valeur) };
}

function contexteFactice(options: {
  methode: string;
  classePath?: string | string[];
  handlerPath?: string | string[];
  sansJournalHandler?: boolean;
  sansJournalClasse?: boolean;
  utilisateurId?: string;
  params?: Record<string, unknown>;
}): ExecutionContext {
  const classe = class {};
  const handler = function () {};
  if (options.classePath !== undefined) Reflect.defineMetadata(PATH_METADATA, options.classePath, classe);
  if (options.handlerPath !== undefined) Reflect.defineMetadata(PATH_METADATA, options.handlerPath, handler);
  if (options.sansJournalHandler) Reflect.defineMetadata(SANS_JOURNAL_ACTIVITE_KEY, true, handler);
  if (options.sansJournalClasse) Reflect.defineMetadata(SANS_JOURNAL_ACTIVITE_KEY, true, classe);

  const request = {
    method: options.methode,
    params: options.params ?? {},
    utilisateur: options.utilisateurId ? { id: options.utilisateurId } : undefined
  };

  return {
    getHandler: () => handler,
    getClass: () => classe,
    switchToHttp: () => ({ getRequest: () => request })
  } as unknown as ExecutionContext;
}

describe("JournalActiviteInterceptor — dérivation du gabarit de route", () => {
  function nouvelInterceptor() {
    const consignerAction = jest.fn();
    const activite = { consignerAction } as unknown as ActiviteService;
    return { interceptor: new JournalActiviteInterceptor(activite), consignerAction };
  }

  it("dérive /demandes (pas /demandes//) pour un @Post() bare sur un contrôleur @Controller('demandes')", (done) => {
    const { interceptor, consignerAction } = nouvelInterceptor();
    const contexte = contexteFactice({
      methode: "POST",
      classePath: "demandes",
      handlerPath: "/",
      utilisateurId: "u1"
    });
    interceptor.intercept(contexte, callHandlerRenvoyant({ id: "d1" })).subscribe(() => {
      expect(consignerAction).toHaveBeenCalledWith("/demandes", "POST", "Création d'un dossier", {}, "u1");
      done();
    });
  });

  it("dérive correctement un gabarit avec segment paramétré (:id)", (done) => {
    const { interceptor, consignerAction } = nouvelInterceptor();
    const contexte = contexteFactice({
      methode: "PATCH",
      classePath: "admin/paliers",
      handlerPath: ":id",
      utilisateurId: "u1",
      params: { id: "p1" }
    });
    interceptor.intercept(contexte, callHandlerRenvoyant({})).subscribe(() => {
      expect(consignerAction).toHaveBeenCalledWith("/admin/paliers/:id", "PATCH", "Modification d'un palier", { id: "p1" }, "u1");
      done();
    });
  });

  it("replie sur la chaîne brute pour un gabarit absent du dictionnaire, jamais une erreur", (done) => {
    const { interceptor, consignerAction } = nouvelInterceptor();
    const contexte = contexteFactice({
      methode: "POST",
      classePath: "un/nouveau/module",
      handlerPath: "/",
      utilisateurId: "u1"
    });
    interceptor.intercept(contexte, callHandlerRenvoyant({})).subscribe(() => {
      expect(consignerAction).toHaveBeenCalledWith("/un/nouveau/module", "POST", "POST /un/nouveau/module", {}, "u1");
      done();
    });
  });

  it("ignore une route de lecture (GET), jamais journalisée", (done) => {
    const { interceptor, consignerAction } = nouvelInterceptor();
    const contexte = contexteFactice({ methode: "GET", classePath: "demandes", handlerPath: "/", utilisateurId: "u1" });
    interceptor.intercept(contexte, callHandlerRenvoyant({})).subscribe(() => {
      expect(consignerAction).not.toHaveBeenCalled();
      done();
    });
  });

  it("ignore une route marquée @SansJournalActivite() au niveau handler", (done) => {
    const { interceptor, consignerAction } = nouvelInterceptor();
    const contexte = contexteFactice({
      methode: "POST",
      classePath: "taches",
      handlerPath: ":id/claim",
      sansJournalHandler: true,
      utilisateurId: "u1"
    });
    interceptor.intercept(contexte, callHandlerRenvoyant({})).subscribe(() => {
      expect(consignerAction).not.toHaveBeenCalled();
      done();
    });
  });

  it("ignore une route marquée @SansJournalActivite() au niveau classe (auto-exclusion du contrôleur de navigation)", (done) => {
    const { interceptor, consignerAction } = nouvelInterceptor();
    const contexte = contexteFactice({
      methode: "POST",
      classePath: "activite",
      handlerPath: "navigation",
      sansJournalClasse: true,
      utilisateurId: "u1"
    });
    interceptor.intercept(contexte, callHandlerRenvoyant({})).subscribe(() => {
      expect(consignerAction).not.toHaveBeenCalled();
      done();
    });
  });

  it("n'écrit jamais d'entrée orpheline sans utilisateurId résolu (route @Public() mutative)", (done) => {
    const { interceptor, consignerAction } = nouvelInterceptor();
    const contexte = contexteFactice({ methode: "POST", classePath: "auth", handlerPath: "login" });
    interceptor.intercept(contexte, callHandlerRenvoyant({})).subscribe(() => {
      expect(consignerAction).not.toHaveBeenCalled();
      done();
    });
  });
});
