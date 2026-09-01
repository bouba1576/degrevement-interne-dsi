import { Injectable } from "@nestjs/common";
import type { KpiDefinition, Prisma } from "@pgd/database";
import { enumCircuit, type KpiDefinitionVue, type KpiQuery, type KpiRepartition, type KpiValeur, type SyntheseQuery, type SyntheseReponse } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import { CacheService } from "../../../infra/redis/cache.service";
import type { UtilisateurRequete } from "../../../common/guards/auth.guard";

type DemandeWhere = Prisma.DemandeWhereInput;
type TacheWhere = Prisma.TacheWhereInput;
type ChampGroupBy = "universFmiCode" | "motifId" | "facteurCode" | "directionRespId" | "serviceRespId";

interface DimensionMeta {
  champ: ChampGroupBy;
  libelles(prisma: PrismaService): Promise<Map<string, string>>;
}

const DIMENSIONS: Record<string, DimensionMeta> = {
  univers: {
    champ: "universFmiCode",
    libelles: async (p) => new Map((await p.universFmi.findMany()).map((u) => [u.code, u.libelle]))
  },
  motif: {
    champ: "motifId",
    libelles: async (p) => new Map((await p.motif.findMany()).map((m) => [m.id, m.libelle]))
  },
  facteur: {
    champ: "facteurCode",
    libelles: async (p) => new Map((await p.facteurDegrevement.findMany()).map((f) => [f.code, f.libelle]))
  },
  direction: {
    champ: "directionRespId",
    libelles: async (p) => new Map((await p.directionResponsabilite.findMany()).map((d) => [d.id, d.libelle]))
  },
  service: {
    champ: "serviceRespId",
    libelles: async (p) => new Map((await p.serviceResponsabilite.findMany()).map((s) => [s.id, s.libelle]))
  }
};

function dimensionMeta(nom: string): DimensionMeta {
  const meta = DIMENSIONS[nom];
  if (!meta) {
    throw new Error(`Dimension KPI inconnue : '${nom}'.`);
  }
  return meta;
}

const TTL_CACHE_SECONDES = 60;

function debutMois(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function ajouterMois(date: Date, n: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1));
}

function bornesMois(periode?: string): { debutCourant: Date; debutSuivant: Date; debutPrecedent: Date } {
  const reference = periode ? new Date(Date.UTC(Number(periode.slice(0, 4)), Number(periode.slice(5, 7)) - 1, 1)) : new Date();
  const debutCourant = debutMois(reference);
  return { debutCourant, debutSuivant: ajouterMois(debutCourant, 1), debutPrecedent: ajouterMois(debutCourant, -1) };
}

function tauxEvolution(courant: number, precedent: number): number {
  if (precedent === 0) {
    return courant > 0 ? 1 : 0;
  }
  return (courant - precedent) / precedent;
}

// PGD-074 (SF-PGD-120/121/122) — moteur générique piloté par KPI_DEFINITION
// (packages/database/prisma/seed/referentiels/kpi.seed.ts), pas de seuil ni
// de liste de KPI en dur ici : ajouter/retirer un indicateur se fait dans le
// référentiel, jamais dans ce service (CLAUDE.md règle 1).
//
// Convention « reçu vs traité » (docs/04 §3.2, §1008) : le schéma ne porte
// pas de colonne booléenne `degrevement_saisi_si` — la distinction est
// portée par `KpiDefinition.surDossiersTraites`, qui force `si_etat =
// CONFIRME` (le SI a effectivement enregistré le dégrèvement). Un dossier
// VALIDE mais encore EN_ATTENTE/ERREUR compte dans les KPI « reçus », jamais
// dans les KPI « traités ». Même fragilité assumée que la convention FRA de
// R12 (cf. CLAUDE.md) : si `surDossiersTraites` est mal positionné en base,
// aucune erreur ne se déclenche, un KPI « traités » compterait des dossiers
// non confirmés.
//
// Pas de cache de résultats à invalidation-à-l'écriture : trop de chemins
// d'écriture touchent DEMANDE (soumission, approbation, rejet, si-push,
// contrôle, correction de montant) pour qu'une invalidation ciblée reste
// fiable. À la place, TTL court (docs/04 §3.2 « cache Redis TTL court ») —
// le rafraîchissement est le TTL lui-même, jamais un événement applicatif.
//
// Périmètre de `profil` — même classe de faille que l'audit RBAC d'avant
// Phase 8.2 (contrôle de rôle présent au niveau route, absent au niveau
// objet/portée), mais sur une lecture agrégée : sans ceci, `profil=pilotage`
// exposait les montants/taux inter-circuits, directions, services et agents à
// n'importe quel utilisateur authentifié. Le périmètre est vérifié contre des
// données réelles quand elles existent (initiateur/valideur, ci-dessous), et
// contre ADMIN_PGD à défaut (pilotage) — jamais laissé grand ouvert :
//   - `initiateur` : aucune ambiguïté possible, `Demande.initiateurId` existe
//     déjà — forcé à l'identité de l'appelant, quoi que le client demande.
//   - `valideur` : `Tache.roleCorbeille` existe déjà — forcé aux rôles
//     réellement détenus par l'appelant (JWT `utilisateur.roles`, même
//     source que RbacGuard, pas une requête MembreRole supplémentaire).
//   - `pilotage` (ou profil absent) : décision d'accès binaire, pas un
//     filtre de données — portée par KpiPerimetreGuard (au niveau route,
//     comme CorbeilleRoleGuard), pas ici. Ce service SUPPOSE l'autorisation
//     déjà acquise pour ce profil et ne la revérifie pas (même principe que
//     TacheWorkflowService vis-à-vis de SodGuard).
@Injectable()
export class KpiEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService
  ) {}

  async definitions(): Promise<KpiDefinitionVue[]> {
    const lignes = await this.prisma.kpiDefinition.findMany({ orderBy: [{ famille: "asc" }, { code: "asc" }] });
    return lignes.map((l) => ({
      code: l.code,
      famille: l.famille,
      libelle: l.libelle,
      unite: l.unite,
      dimensions: l.dimensions as string[],
      surDossiersTraites: l.surDossiersTraites
    }));
  }

  // Borne de concurrence pour calculer() — 01/09/2026, diagnostic P2037
  // ("too many clients already", cf. incident Pilotage). Avant ce correctif,
  // Promise.all(definitions.map(...)) lançait les 26 KPI_DEFINITION en même
  // temps, plusieurs faisant 2 à 4 requêtes chacune (répartition+libellés,
  // évolution courant/précédent, deux dimensions croisées) — ~55 requêtes
  // Postgres concurrentes pour UN seul appel, comptées précisément sur le
  // référentiel réel avant ce correctif. Fixe et INDÉPENDANT du nombre de
  // définitions : un 27e KPI ajouté demain (règle non négociable 1, ajout
  // par la donnée) n'aggrave jamais ce chiffre — contrairement à
  // Promise.all, qui aurait simplement lancé une requête de plus en
  // parallèle. 5 travailleurs × ~4 sous-requêtes max (calculerDeuxDimensions
  // en TAUX, le pire cas) ≈ 20 requêtes concurrentes au plus par appel,
  // cohérent avec le connection_limit=20 désormais explicite côté
  // apps/api (docker-compose.yml/docker-compose.prod.yml) : ce dernier
  // protège contre PLUSIEURS utilisateurs chargeant Pilotage en même temps
  // (file d'attente Prisma, jamais un P2037), ce bornage-ci réduit ce
  // qu'UN seul appel consomme en premier lieu — les deux sont complémentaires,
  // ni l'un ni l'autre ne suffit seul.
  private static readonly CONCURRENCE_MAX_KPI = 5;

  private async executerAvecConcurrenceBornee<T, R>(
    items: T[],
    concurrenceMax: number,
    tache: (item: T) => Promise<R>
  ): Promise<R[]> {
    const resultats: R[] = new Array(items.length);
    let curseur = 0;
    const travailleur = async (): Promise<void> => {
      while (curseur < items.length) {
        const i = curseur++;
        resultats[i] = await tache(items[i] as T);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrenceMax, items.length) }, travailleur));
    return resultats;
  }

  async calculer(query: KpiQuery, utilisateur: UtilisateurRequete): Promise<KpiValeur[]> {
    const cle = `kpi:resultats:${JSON.stringify(query)}:${this.cleScope(query, utilisateur)}`;
    const enCache = await this.cache.get<KpiValeur[]>(cle);
    if (enCache) {
      return enCache;
    }

    const definitions = await this.prisma.kpiDefinition.findMany();
    const resultats = await this.executerAvecConcurrenceBornee(definitions, KpiEngineService.CONCURRENCE_MAX_KPI, (def) =>
      this.calculerUn(def, query, utilisateur)
    );

    await this.cache.set(cle, resultats, TTL_CACHE_SECONDES);
    return resultats;
  }

  // GET /api/kpi/synthese (26/08/2026, refonte Dashboard) — entonnoir de
  // statuts + SLA (Initiateur/Valideur) ou 4 tuiles d'en-tête (Pilotage),
  // docs/design/screens3.jsx:174-206 (`initStats`/`valStats`/en-tête
  // Pilotage). Aucune de ces métriques n'est un KPI_DEFINITION générique
  // (dimension/agrégation) — requêtes Prisma directes, même discipline que
  // ReportingService (delta avant/après en test, jamais un état ambiant
  // supposé propre). Pas de cache : volume de requêtes bien plus faible que
  // calculer() (une poignée de count()/aggregate(), pas 26 définitions),
  // et cette route est appelée une fois par changement de filtre, pas en
  // boucle.
  async synthese(query: SyntheseQuery, utilisateur: UtilisateurRequete): Promise<SyntheseReponse> {
    if (query.profil === "initiateur") return this.syntheseInitiateur(query, utilisateur);
    if (query.profil === "valideur") return this.syntheseValideur(query, utilisateur);
    return this.synthesePilotage(query);
  }

  private bornesPeriode(query: SyntheseQuery): { gte?: Date; lt?: Date } {
    return {
      ...(query.debut ? { gte: new Date(`${query.debut}T00:00:00.000Z`) } : {}),
      ...(query.fin ? { lt: new Date(new Date(`${query.fin}T00:00:00.000Z`).getTime() + 86400000) } : {})
    };
  }

  private async slaOk(where: TacheWhere): Promise<number> {
    const taches = await this.prisma.tache.findMany({ where, select: { echeanceSla: true } });
    if (taches.length === 0) return 100;
    const maintenant = Date.now();
    const enRetard = taches.filter((t) => t.echeanceSla !== null && t.echeanceSla.getTime() <= maintenant).length;
    return Math.round(((taches.length - enRetard) / taches.length) * 100);
  }

  private async syntheseInitiateur(query: SyntheseQuery, utilisateur: UtilisateurRequete): Promise<SyntheseReponse> {
    const periode = this.bornesPeriode(query);
    const baseWhere: DemandeWhere = {
      initiateurId: utilisateur.id,
      ...(query.circuit ? { circuit: query.circuit } : {}),
      ...(query.debut || query.fin ? { dateSoumission: periode } : {})
    };

    const [initiees, enCours, validees, rejetees, slaOk] = await Promise.all([
      this.prisma.demande.count({ where: baseWhere }),
      this.prisma.demande.count({ where: { ...baseWhere, statut: "SOUMIS" } }),
      this.prisma.demande.count({ where: { ...baseWhere, statut: "VALIDE" } }),
      this.prisma.demande.count({ where: { ...baseWhere, statut: "REJETE" } }),
      // SLA — instantané sur mes tâches actives en ce moment, jamais borné
      // par la période (un backlog n'est pas un événement daté, même
      // principe déjà retenu pour « en cours » dans ReportingService).
      this.slaOk({
        etat: { in: ["EN_CORBEILLE", "RECLAMEE"] },
        demande: { initiateurId: utilisateur.id, ...(query.circuit ? { circuit: query.circuit } : {}) }
      })
    ]);

    return { profil: "initiateur", initiees, enCours, validees, rejetees, slaOk };
  }

  private async syntheseValideur(query: SyntheseQuery, utilisateur: UtilisateurRequete): Promise<SyntheseReponse> {
    const periode = this.bornesPeriode(query);
    const circuitFiltre: DemandeWhere = query.circuit ? { circuit: query.circuit } : {};
    const rolesWhere: TacheWhere = { roleCorbeille: { in: utilisateur.roles }, demande: circuitFiltre };

    const [enAttente, enCoursTraitement, valideesParMoi, rejeteesParMoi, slaOk] = await Promise.all([
      this.prisma.tache.count({ where: { ...rolesWhere, etat: "EN_CORBEILLE" } }),
      this.prisma.tache.count({ where: { ...rolesWhere, etat: "RECLAMEE" } }),
      this.prisma.tache.count({
        where: {
          agentClaimId: utilisateur.id,
          etat: "APPROUVEE",
          demande: circuitFiltre,
          ...((query.debut || query.fin) ? { dateDecision: periode } : {})
        }
      }),
      this.prisma.tache.count({
        where: {
          agentClaimId: utilisateur.id,
          etat: "REJETEE",
          demande: circuitFiltre,
          ...((query.debut || query.fin) ? { dateDecision: periode } : {})
        }
      }),
      this.slaOk({ ...rolesWhere, etat: { in: ["EN_CORBEILLE", "RECLAMEE"] } })
    ]);

    return { profil: "valideur", enAttente, enCoursTraitement, valideesParMoi, rejeteesParMoi, slaOk };
  }

  private async synthesePilotage(query: SyntheseQuery): Promise<SyntheseReponse> {
    const periode = this.bornesPeriode(query);
    const circuitFiltre: DemandeWhere = query.circuit ? { circuit: query.circuit } : {};
    const clotureWhere = (query.debut || query.fin) ? { dateCloture: periode } : {};

    const [valides, rejetes, montantValideCumule, dossiersEnCircuit, dureesValides, groupesParCircuit] = await Promise.all([
      this.prisma.demande.count({ where: { ...circuitFiltre, ...clotureWhere, statut: "VALIDE" } }),
      this.prisma.demande.count({ where: { ...circuitFiltre, ...clotureWhere, statut: "REJETE" } }),
      this.prisma.demande.aggregate({
        where: { ...circuitFiltre, ...clotureWhere, statut: "VALIDE" },
        _sum: { montantTtc: true }
      }),
      // Instantané, jamais borné par la période — même choix que l'« en
      // cours » de ReportingService (un backlog n'est pas un événement daté).
      this.prisma.demande.count({ where: { ...circuitFiltre, statut: "SOUMIS" } }),
      this.prisma.demande.findMany({
        where: { ...circuitFiltre, ...clotureWhere, statut: "VALIDE", dateSoumission: { not: null } },
        select: { dateSoumission: true, dateCloture: true }
      }),
      // volumesParCircuit (01/09/2026) — un seul groupBy, jamais filtré par
      // `circuitFiltre` (comparatif entre circuits, cf. commentaire du
      // contrat) ni par période (RECUS_VOLUME n'était déjà borné par aucune
      // des deux côté appelant avant ce correctif — comportement préservé).
      this.prisma.demande.groupBy({ by: ["circuit"], _count: { _all: true } })
    ]);

    const denominateur = valides + rejetes;
    const heures = dureesValides
      .filter((d): d is { dateSoumission: Date; dateCloture: Date } => d.dateSoumission !== null && d.dateCloture !== null)
      .map((d) => (d.dateCloture.getTime() - d.dateSoumission.getTime()) / 3600000);
    const delaiMoyenHeures = heures.length > 0 ? heures.reduce((a, b) => a + b, 0) / heures.length : null;

    // groupBy omet un circuit sans aucune demande — les trois circuits
    // doivent toujours apparaître (0 explicite), comme le faisait déjà
    // chaque appel individuel de RECUS_VOLUME (calculerScalaire → count(),
    // jamais absent) avant ce correctif.
    const totalParCircuit = new Map(groupesParCircuit.map((g) => [g.circuit, g._count._all]));
    const volumesParCircuit = enumCircuit.options.map((circuit) => ({
      circuit,
      total: totalParCircuit.get(circuit) ?? 0
    }));

    return {
      profil: "pilotage",
      delaiMoyenHeures: delaiMoyenHeures !== null ? Math.round(delaiMoyenHeures * 10) / 10 : null,
      tauxApprobation: denominateur > 0 ? valides / denominateur : null,
      dossiersEnCircuit,
      montantValideCumule: Number(montantValideCumule._sum.montantTtc ?? 0),
      volumesParCircuit
    };
  }

  // Cache partagé entre tous les appelants d'une même forme de requête — sans
  // ceci, deux initiateurs différents demandant tous deux `profil=initiateur`
  // partageraient la même clé de cache et l'un verrait les résultats de
  // l'autre pendant le TTL. La clé doit varier avec tout ce qui varie le
  // périmètre réellement appliqué, pas seulement avec les filtres explicites.
  private cleScope(query: KpiQuery, utilisateur: UtilisateurRequete): string {
    if (query.profil === "initiateur") return `init:${utilisateur.id}`;
    if (query.profil === "valideur") return `val:${[...utilisateur.roles].sort().join(",")}`;
    return "global";
  }

  private construireWhere(query: KpiQuery, def: KpiDefinition, utilisateur: UtilisateurRequete): DemandeWhere {
    const where: DemandeWhere = {};
    if (query.circuit) where.circuit = query.circuit;
    if (query.univers) where.universFmiCode = query.univers;
    if (query.siEtat) where.siEtat = query.siEtat;
    if (query.statutLigne) where.lignes = { some: { statutLigne: query.statutLigne } };
    // Filtre de période (26/08/2026, refonte Dashboard) — borne le dossier
    // par sa date de soumission, jamais l'évolution M-1→M (fenêtre mensuelle
    // indépendante, cf. commentaire de kpiQuerySchema). Additif : absent
    // pour tout appelant qui ne le passe pas, comportement inchangé.
    if (query.debut || query.fin) {
      where.dateSoumission = {
        ...(query.debut ? { gte: new Date(`${query.debut}T00:00:00.000Z`) } : {}),
        ...(query.fin ? { lt: new Date(new Date(`${query.fin}T00:00:00.000Z`).getTime() + 86400000) } : {})
      };
    }
    // Convention « reçu vs traité » ci-dessus — prioritaire sur un siEtat
    // demandé explicitement par l'appelant s'il entre en contradiction.
    if (def.surDossiersTraites) where.siEtat = "CONFIRME";

    // Périmètre réel, pas déclaratif (cf. commentaire de classe) — appliqué
    // APRÈS les filtres client, jamais contournable par eux.
    if (query.profil === "initiateur") {
      where.initiateurId = utilisateur.id;
    } else if (query.profil === "valideur") {
      where.taches = { some: { roleCorbeille: { in: utilisateur.roles } } };
    }

    return where;
  }

  private champMontant(code: string): "montantHt" | "montantTtc" {
    // R1 — le TTC est le montant de référence : tout code sans suffixe
    // explicite _HT retombe sur montantTtc, jamais un choix arbitraire.
    return code.endsWith("_HT") ? "montantHt" : "montantTtc";
  }

  private async calculerUn(def: KpiDefinition, query: KpiQuery, utilisateur: UtilisateurRequete): Promise<KpiValeur> {
    const where = this.construireWhere(query, def, utilisateur);
    const dims = (def.dimensions as string[]) ?? [];
    const dimsBreakdown = dims.filter((d) => d in DIMENSIONS);

    if (dims.includes("evolution_m")) {
      const [premiere] = dimsBreakdown;
      if (!premiere) {
        return this.calculerEvolutionGlobale(def, where, query.periode);
      }
      return this.calculerEvolutionParDimension(def, where, query.periode, premiere);
    }

    if (dimsBreakdown.length === 2) {
      const [dimA, dimB] = dimsBreakdown;
      if (dimA && dimB) {
        return this.calculerDeuxDimensions(def, where, [dimA, dimB]);
      }
    }

    const [seuleDimension] = dimsBreakdown;
    if (dimsBreakdown.length === 1 && seuleDimension) {
      return def.unite === "TAUX" ? this.calculerTauxRepartition(def, where, seuleDimension) : this.calculerRepartition(def, where, seuleDimension);
    }

    const valeur = await this.calculerScalaire(def, where);
    return { code: def.code, libelle: def.libelle, famille: def.famille, unite: def.unite, valeur };
  }

  private async calculerScalaire(def: KpiDefinition, where: DemandeWhere): Promise<number> {
    if (def.unite === "VOLUME") {
      return this.prisma.demande.count({ where });
    }
    const champ = this.champMontant(def.code);
    const resultat = await this.prisma.demande.aggregate({ where, _sum: { [champ]: true } });
    return Number(resultat._sum[champ] ?? 0);
  }

  private async calculerRepartition(def: KpiDefinition, where: DemandeWhere, dimension: string): Promise<KpiValeur> {
    const meta = dimensionMeta(dimension);
    const champ = this.champMontant(def.code);
    const groupes = await this.prisma.demande.groupBy({
      by: [meta.champ],
      where,
      // Ne jamais passer `_sum`/`_count: undefined` explicitement — Prisma
      // (v5.22, groupBy) traite la clé PRÉSENTE-mais-undefined comme un
      // select vide et rejette la requête ("needs at least one truthy
      // value"), même si la valeur JS est undefined. Il faut omettre la clé.
      ...(def.unite === "MONTANT" ? { _sum: { [champ]: true } } : {}),
      ...(def.unite === "VOLUME" ? { _count: { _all: true } } : {})
    });
    const libelles = await meta.libelles(this.prisma);

    const repartition: KpiRepartition[] = groupes
      .filter((g) => g[meta.champ] !== null)
      .map((g) => {
        const cle = String(g[meta.champ]);
        const valeur = def.unite === "MONTANT" ? Number((g._sum as Record<string, unknown>)?.[champ] ?? 0) : ((g._count as { _all: number })?._all ?? 0);
        return { cle, libelle: libelles.get(cle) ?? null, valeur };
      })
      .sort((a, b) => b.valeur - a.valeur);

    return { code: def.code, libelle: def.libelle, famille: def.famille, unite: def.unite, valeur: null, repartition };
  }

  private async calculerTauxRepartition(def: KpiDefinition, where: DemandeWhere, dimension: string): Promise<KpiValeur> {
    const meta = dimensionMeta(dimension);
    const [groupes, total] = await Promise.all([
      this.prisma.demande.groupBy({ by: [meta.champ], where, _count: { _all: true } }),
      this.prisma.demande.count({ where })
    ]);
    const libelles = await meta.libelles(this.prisma);

    const repartition: KpiRepartition[] = groupes
      .filter((g) => g[meta.champ] !== null)
      .map((g) => {
        const cle = String(g[meta.champ]);
        return { cle, libelle: libelles.get(cle) ?? null, valeur: total > 0 ? g._count._all / total : 0 };
      })
      .sort((a, b) => b.valeur - a.valeur);

    return { code: def.code, libelle: def.libelle, famille: def.famille, unite: def.unite, valeur: null, repartition };
  }

  private async calculerEvolutionGlobale(def: KpiDefinition, where: DemandeWhere, periode?: string): Promise<KpiValeur> {
    const champDate = def.surDossiersTraites ? "siHorodatage" : "dateDemande";
    const { debutCourant, debutSuivant, debutPrecedent } = bornesMois(periode);

    const [courant, precedent] = await Promise.all([
      this.prisma.demande.count({ where: { ...where, [champDate]: { gte: debutCourant, lt: debutSuivant } } }),
      this.prisma.demande.count({ where: { ...where, [champDate]: { gte: debutPrecedent, lt: debutCourant } } })
    ]);

    return { code: def.code, libelle: def.libelle, famille: def.famille, unite: def.unite, valeur: tauxEvolution(courant, precedent) };
  }

  private async calculerEvolutionParDimension(def: KpiDefinition, where: DemandeWhere, periode: string | undefined, dimension: string): Promise<KpiValeur> {
    const meta = dimensionMeta(dimension);
    const champDate = def.surDossiersTraites ? "siHorodatage" : "dateDemande";
    const { debutCourant, debutSuivant, debutPrecedent } = bornesMois(periode);

    const [groupesCourant, groupesPrecedent, libelles] = await Promise.all([
      this.prisma.demande.groupBy({ by: [meta.champ], where: { ...where, [champDate]: { gte: debutCourant, lt: debutSuivant } }, _count: { _all: true } }),
      this.prisma.demande.groupBy({ by: [meta.champ], where: { ...where, [champDate]: { gte: debutPrecedent, lt: debutCourant } }, _count: { _all: true } }),
      meta.libelles(this.prisma)
    ]);

    const precedentParCle = new Map(groupesPrecedent.filter((g) => g[meta.champ] !== null).map((g) => [String(g[meta.champ]), g._count._all]));
    const cles = new Set([...groupesCourant, ...groupesPrecedent].filter((g) => g[meta.champ] !== null).map((g) => String(g[meta.champ])));

    const repartition: KpiRepartition[] = [...cles]
      .map((cle) => {
        const courant = groupesCourant.find((g) => String(g[meta.champ]) === cle)?._count._all ?? 0;
        const precedent = precedentParCle.get(cle) ?? 0;
        return { cle, libelle: libelles.get(cle) ?? null, valeur: tauxEvolution(courant, precedent) };
      })
      .sort((a, b) => b.valeur - a.valeur);

    return { code: def.code, libelle: def.libelle, famille: def.famille, unite: def.unite, valeur: null, repartition };
  }

  // Cas composite motif+univers (TOP_MOTIF_PAR_UNIVERS en VOLUME,
  // TAUX_MOTIF_UNIVERS en TAUX) — seuls codes du référentiel à croiser deux
  // dimensions ; traité explicitement plutôt que généralisé à N dimensions,
  // qu'aucun autre indicateur du catalogue n'exige aujourd'hui.
  private async calculerDeuxDimensions(def: KpiDefinition, where: DemandeWhere, [dimA, dimB]: [string, string]): Promise<KpiValeur> {
    const metaA = dimensionMeta(dimA);
    const metaB = dimensionMeta(dimB);

    const [groupes, libellesA, libellesB] = await Promise.all([
      this.prisma.demande.groupBy({ by: [metaA.champ, metaB.champ], where, _count: { _all: true } }),
      metaA.libelles(this.prisma),
      metaB.libelles(this.prisma)
    ]);

    if (def.unite === "TAUX") {
      const totauxParB = await this.prisma.demande.groupBy({ by: [metaB.champ], where, _count: { _all: true } });
      const totalParCleB = new Map(totauxParB.filter((g) => g[metaB.champ] !== null).map((g) => [String(g[metaB.champ]), g._count._all]));

      const repartition: KpiRepartition[] = groupes
        .filter((g) => g[metaA.champ] !== null && g[metaB.champ] !== null)
        .map((g) => {
          const cleA = String(g[metaA.champ]);
          const cleB = String(g[metaB.champ]);
          const total = totalParCleB.get(cleB) ?? 0;
          return {
            cle: `${cleA}|${cleB}`,
            libelle: `${libellesA.get(cleA) ?? cleA} / ${libellesB.get(cleB) ?? cleB}`,
            valeur: total > 0 ? g._count._all / total : 0
          };
        })
        .sort((a, b) => b.valeur - a.valeur);

      return { code: def.code, libelle: def.libelle, famille: def.famille, unite: def.unite, valeur: null, repartition };
    }

    const repartition: KpiRepartition[] = groupes
      .filter((g) => g[metaA.champ] !== null && g[metaB.champ] !== null)
      .map((g) => {
        const cleA = String(g[metaA.champ]);
        const cleB = String(g[metaB.champ]);
        return {
          cle: `${cleA}|${cleB}`,
          libelle: `${libellesA.get(cleA) ?? cleA} / ${libellesB.get(cleB) ?? cleB}`,
          valeur: g._count._all
        };
      })
      .sort((a, b) => b.valeur - a.valeur);

    return { code: def.code, libelle: def.libelle, famille: def.famille, unite: def.unite, valeur: null, repartition };
  }
}
