import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { DemandesController } from "../src/modules/demandes/demandes.controller";
import { TachesController } from "../src/modules/taches/taches.controller";
import { KpiController } from "../src/modules/kpi/kpi.controller";
import { InitiateurDemandeGuard } from "../src/common/guards/initiateur-demande.guard";
import { CorbeilleRoleGuard } from "../src/common/guards/corbeille-role.guard";
import { DelegantMembreRoleGuard } from "../src/common/guards/delegant-membre-role.guard";
import { DelegationContextGuard } from "../src/common/guards/delegation-context.guard";
import { SodGuard } from "../src/common/guards/sod.guard";
import { KpiPerimetreGuard } from "../src/common/guards/kpi-perimetre.guard";

// Contremesure durable aux huit occurrences de la même faille en Phase 8
// (contrôle de rôle présent au niveau route, absent au niveau objet/portée —
// deleguer, six routes DemandesController, profil de GET /api/kpi). Chaque
// correctif a été vérifié individuellement au moment où il a été écrit ;
// aucune suite ne les rejoue ENSEMBLE. guard-order.spec.ts verrouille l'ordre
// sur trois routes, mais rien ne verrouillait la PRÉSENCE des guards sur les
// autres — un refactor de contrôleur pouvait en retirer un sans qu'un seul
// test n'échoue. Ce fichier lit les métadonnées de guards directement
// (comme guard-order.spec.ts), avec une table explicite route → guards
// attendus, et échoue dans les DEUX sens :
//   1. un guard attendu disparaît d'une route déjà répertoriée ;
//   2. une nouvelle route d'écriture apparaît sans entrée dans la table —
//      ce second point compte autant que le premier : sans lui, une route
//      ajoutée en Phase 9/10 sans garde de portée passerait silencieusement.

type ControleurAvecPrototype = { prototype: object };

function prototypeIndexable(controleur: ControleurAvecPrototype): Record<string, (...args: unknown[]) => unknown> {
  return controleur.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
}

function guardsDe(controleur: ControleurAvecPrototype, nomMethode: string): unknown[] {
  const handler = prototypeIndexable(controleur)[nomMethode];
  if (!handler) return [];
  return (Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[]) ?? [];
}

function listerRoutes(controleur: ControleurAvecPrototype): string[] {
  const proto = prototypeIndexable(controleur);
  return Object.getOwnPropertyNames(proto).filter((nom) => {
    if (nom === "constructor") return false;
    const handler = proto[nom];
    return typeof handler === "function" && Reflect.hasMetadata(PATH_METADATA, handler);
  });
}

function listerRoutesEcriture(controleur: ControleurAvecPrototype): string[] {
  const proto = prototypeIndexable(controleur);
  return listerRoutes(controleur).filter((nom) => {
    const handler = proto[nom];
    if (typeof handler !== "function") return false;
    const methode = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
    return methode !== undefined && methode !== RequestMethod.GET;
  });
}

describe("Couverture structurelle des guards de portée — récidive des huit failles Phase 8", () => {
  // Route → guards attendus. Une entrée à liste vide est une décision
  // documentée (pas un oubli) : `creer` n'a pas de dossier préexistant
  // (l'initiateur est l'appelant par construction) ; `rejouerSi` est
  // `@Roles("ADMIN_PGD")` seul, un admin global n'a pas besoin d'un contrôle
  // par-dossier (même raisonnement que l'export d'audit).
  const TABLE_DEMANDES: Record<string, unknown[]> = {
    creer: [],
    modifier: [InitiateurDemandeGuard],
    definirLignes: [InitiateurDemandeGuard],
    recalculer: [InitiateurDemandeGuard],
    apercuRoutage: [InitiateurDemandeGuard],
    soumettre: [InitiateurDemandeGuard],
    abandonner: [InitiateurDemandeGuard],
    rappeler: [InitiateurDemandeGuard],
    ajouterPiece: [InitiateurDemandeGuard],
    supprimerPiece: [InitiateurDemandeGuard],
    rejouerSi: []
  };

  const TABLE_TACHES: Record<string, unknown[]> = {
    claim: [CorbeilleRoleGuard],
    unclaim: [CorbeilleRoleGuard],
    approuver: [DelegationContextGuard, CorbeilleRoleGuard, SodGuard],
    rejeter: [DelegationContextGuard, CorbeilleRoleGuard, SodGuard],
    soumettreControle: [DelegationContextGuard, CorbeilleRoleGuard, SodGuard],
    deleguer: [DelegantMembreRoleGuard]
  };

  // KpiController n'a que des routes GET — la faille était sur une lecture
  // agrégée, pas une écriture, donc on énumère TOUTES ses routes ici, pas
  // seulement celles d'écriture (listerRoutes, pas listerRoutesEcriture).
  const TABLE_KPI: Record<string, unknown[]> = {
    calculer: [KpiPerimetreGuard],
    // `definitions` est le catalogue KPI_DEFINITION (référentiel, pas de
    // donnée financière/nominative) — @Authenticated() seul est documenté
    // comme suffisant, ce n'est pas un oubli.
    definitions: []
  };

  function verifierControleur(nom: string, controleur: ControleurAvecPrototype, table: Record<string, unknown[]>, routes: string[]) {
    describe(nom, () => {
      it("toute route répertoriée dans la table porte réellement chacun de ses guards attendus", () => {
        for (const [nomMethode, guardsAttendus] of Object.entries(table)) {
          const guardsReels = guardsDe(controleur, nomMethode);
          for (const guardAttendu of guardsAttendus) {
            expect(guardsReels).toContain(guardAttendu);
          }
        }
      });

      it("aucune route n'apparaît sans entrée dans la table — sinon une nouvelle route silencieuse", () => {
        const nomsTable = Object.keys(table);
        const nonRepertoriees = routes.filter((r) => !nomsTable.includes(r));
        expect(nonRepertoriees).toEqual([]);
      });

      it("aucune entrée de la table ne pointe vers une route qui n'existe plus", () => {
        const perimees = Object.keys(table).filter((n) => !routes.includes(n));
        expect(perimees).toEqual([]);
      });
    });
  }

  verifierControleur("DemandesController — InitiateurDemandeGuard sur les routes d'écriture", DemandesController, TABLE_DEMANDES, listerRoutesEcriture(DemandesController));
  verifierControleur("TachesController — CorbeilleRoleGuard/DelegantMembreRoleGuard sur les routes d'écriture", TachesController, TABLE_TACHES, listerRoutesEcriture(TachesController));
  verifierControleur("KpiController — KpiPerimetreGuard sur la lecture agrégée", KpiController, TABLE_KPI, listerRoutes(KpiController));
});
