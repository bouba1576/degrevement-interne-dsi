import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { PATH_METADATA } from "@nestjs/common/constants";
import { Observable, tap } from "rxjs";
import type { RequeteAuthentifiee } from "../guards/auth.guard";
import { SANS_JOURNAL_ACTIVITE_KEY } from "../decorators/sans-journal-activite.decorator";
import { ActiviteService } from "../../modules/activite/activite.service";

const VERBES_MUTATIFS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

// Journal d'activité administrateur (08/09/2026, CLAUDE.md « Journal
// d'activité administrateur ») — volet ACTION. Dictionnaire fermé, avec
// repli sur la clé brute "<MÉTHODE> <gabarit>" (même format que le fallback
// déjà établi par LoggingInterceptor) : une nouvelle route mutative
// n'échoue jamais, elle affiche juste un libellé moins soigné jusqu'à
// enrichissement de ce dictionnaire. Couvre précisément les 8 onglets
// admin (la lacune confirmée par l'investigation) + les routes
// demandes/taches jamais auditées ailleurs (creer, supprimer, definirLignes,
// recalculer, pieces, si/pousser, deleguer).
const LIBELLE_PAR_GABARIT: Record<string, string> = {
  // Admin — Processus (paliers)
  "POST /admin/paliers": "Création d'un palier",
  "PATCH /admin/paliers/:id": "Modification d'un palier",
  "DELETE /admin/paliers/:id": "Suppression d'un palier",
  // Admin — Rôles
  "POST /admin/roles": "Création d'un rôle",
  "PATCH /admin/roles/:code": "Modification d'un rôle",
  "DELETE /admin/roles/:code": "Suppression d'un rôle",
  // Admin — Motifs & libellés (motifs, libellés d'ajustement, sous-flux, opérateurs, points de contact)
  "POST /admin/motifs": "Création d'un motif",
  "PATCH /admin/motifs/:id": "Modification d'un motif",
  "DELETE /admin/motifs/:id": "Suppression d'un motif",
  "POST /admin/libelles-ajustement": "Création d'un libellé d'ajustement",
  "PATCH /admin/libelles-ajustement/:id": "Modification d'un libellé d'ajustement",
  "DELETE /admin/libelles-ajustement/:id": "Suppression d'un libellé d'ajustement",
  "POST /admin/sous-flux": "Création d'un sous-flux",
  "PATCH /admin/sous-flux/:id": "Modification d'un sous-flux",
  "DELETE /admin/sous-flux/:id": "Suppression d'un sous-flux",
  "POST /admin/operateurs": "Création d'un opérateur",
  "PATCH /admin/operateurs/:id": "Modification d'un opérateur",
  "DELETE /admin/operateurs/:id": "Suppression d'un opérateur",
  "POST /admin/points-contact": "Création d'un point de contact",
  "PATCH /admin/points-contact/:id": "Modification d'un point de contact",
  "DELETE /admin/points-contact/:id": "Suppression d'un point de contact",
  // Admin — Circuits
  "PATCH /admin/circuits/:code": "Modification d'un circuit",
  // Admin — Paramètres de calcul
  "PATCH /admin/parametres/:circuit": "Modification des paramètres de calcul",
  // Admin — Calendrier SLA
  "PATCH /admin/calendrier-sla/:id": "Modification du calendrier SLA",
  // Admin — Paramètres système (paramètres globaux, modules)
  "PATCH /admin/parametres-globaux/:cle": "Modification d'un paramètre système",
  "PATCH /admin/modules/:code": "Modification d'un module",
  // Admin — Utilisateurs
  "POST /admin/utilisateurs": "Pré-enregistrement d'un utilisateur",
  "PATCH /admin/utilisateurs/:id": "Modification d'un utilisateur",
  // Admin — hors onglets référentiels, jamais audité ailleurs
  "POST /admin/import-crm": "Import CRM",
  // Demandes — jamais couvert par JournalAudit (creation/suppression/pièces/SI)
  "POST /demandes": "Création d'un dossier",
  "DELETE /demandes/:id": "Suppression d'un brouillon",
  "PUT /demandes/:id/lignes": "Modification des lignes",
  "POST /demandes/:id/calcul": "Recalcul des taxes",
  "POST /demandes/:id/pieces": "Ajout d'une pièce jointe",
  "DELETE /demandes/:id/pieces/:pieceId": "Suppression d'une pièce jointe",
  "POST /demandes/:id/si/pousser": "Rejeu manuel SI",
  // Tâches — jamais couvert par JournalAudit
  "POST /taches/:id/deleguer": "Délégation d'une tâche"
};

function segmentDecorateur(cible: object): string {
  const brut = Reflect.getMetadata(PATH_METADATA, cible) as string | string[] | undefined;
  const chemin = Array.isArray(brut) ? (brut[0] ?? "") : typeof brut === "string" ? brut : "";
  // Un décorateur sans argument (@Post(), @Get()...) porte "/" comme valeur
  // par défaut de PATH_METADATA — jamais une chaîne vide. Trouvé en direct
  // (09/09/2026) : "/" est truthy et survivait au filter(Boolean) ci-dessous,
  // produisant un gabarit "/demandes//" qui ne correspondait jamais à une
  // entrée du dictionnaire (repli sur la chaîne brute, jamais une erreur).
  return chemin === "/" ? "" : chemin;
}

@Injectable()
export class JournalActiviteInterceptor implements NestInterceptor {
  constructor(private readonly activite: ActiviteService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const handler = context.getHandler();
    const classe = context.getClass();
    const methode = context.switchToHttp().getRequest<RequeteAuthentifiee>().method;

    // Périmètre confirmé : seules les requêtes mutatives comptent, jamais
    // une lecture.
    if (!VERBES_MUTATIFS.has(methode)) return next.handle();

    // Exclusion — route déjà auditée ailleurs (JournalAudit/JournalSecurite),
    // ou route de navigation elle-même (cf. ActiviteController). Vérifiée au
    // niveau méthode ET classe, même discipline que @Public()/@Roles().
    if (
      Reflect.getMetadata(SANS_JOURNAL_ACTIVITE_KEY, handler) === true ||
      Reflect.getMetadata(SANS_JOURNAL_ACTIVITE_KEY, classe) === true
    ) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<RequeteAuthentifiee>();
    const utilisateurId = request.utilisateur?.id;
    // Pas de session résolue (route @Public() mutative — login) : rien à
    // attribuer, jamais une entrée orpheline devinée.
    if (!utilisateurId) return next.handle();

    const gabarit = "/" + [segmentDecorateur(classe), segmentDecorateur(handler)].filter(Boolean).join("/");
    const cle = `${methode} ${gabarit}`;
    const libelle = LIBELLE_PAR_GABARIT[cle] ?? cle;
    const params = (request.params ?? {}) as Record<string, unknown>;

    // N'écrit que sur succès — un échec n'a rien modifié côté serveur,
    // cohérent avec le périmètre confirmé.
    return next.handle().pipe(
      tap({
        next: () => {
          this.activite.consignerAction(gabarit, methode, libelle, params, utilisateurId);
        }
      })
    );
  }
}
