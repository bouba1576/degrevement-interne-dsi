import { Injectable } from "@nestjs/common";
import type { KpiDefinition, Prisma } from "@pgd/database";
import type { KpiDefinitionVue, KpiQuery, KpiRepartition, KpiValeur } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import { CacheService } from "../../../infra/redis/cache.service";
import type { UtilisateurRequete } from "../../../common/guards/auth.guard";

type DemandeWhere = Prisma.DemandeWhereInput;
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

  async calculer(query: KpiQuery, utilisateur: UtilisateurRequete): Promise<KpiValeur[]> {
    const cle = `kpi:resultats:${JSON.stringify(query)}:${this.cleScope(query, utilisateur)}`;
    const enCache = await this.cache.get<KpiValeur[]>(cle);
    if (enCache) {
      return enCache;
    }

    const definitions = await this.prisma.kpiDefinition.findMany();
    const resultats = await Promise.all(definitions.map((def) => this.calculerUn(def, query, utilisateur)));

    await this.cache.set(cle, resultats, TTL_CACHE_SECONDES);
    return resultats;
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
