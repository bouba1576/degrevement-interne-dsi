import { Injectable, UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@pgd/database";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import { CacheService } from "../../../infra/redis/cache.service";
import { CalendrierSlaService } from "./calendrier-sla.service";

interface EtapeCache {
  ordre: number;
  roleCode: string;
  roleLibelle: string;
  typeActeur: string;
  bloquant: boolean;
  slaHeures: number;
  modeAffectation: string;
}

interface ConfigurationCache {
  id: string;
  circuit: string;
  segment: string;
  sousFlux: string | null;
  borneMin: number;
  borneMax: number;
  labelPalier: string | null;
  etapesRegle: EtapeCache[];
}

const TTL_CACHE_SECONDES = 300;

// CONVENTION R12 — À NE PAS CASSER (documentée aussi dans CLAUDE.md) :
// un contrôle a posteriori R12 se reconnaît par roleCode === ROLE_CODE_FIABILISATION
// ET typeActeur === "C" sur une étape de palier. Ce n'est PAS un nouveau
// champ de schéma : EtapeRegle n'a aucun moyen de distinguer ce contrôle
// d'un N1/N2 générique (typeActeur=C est le seul signal commun), donc R12
// s'appuie sur l'identifiant du rôle — déjà seedé, sans ambiguïté aujourd'hui.
//
// CORRIGÉ le 27/08/2026 (docs/14_Matrice_SoD_et_WF_SLA_KPI.md, transcrit
// d'un document source réel) — la convention reposait sur FRA depuis la
// Phase 5, mais docs/14 montre que FRA n'a JAMAIS "valider"/effectuer un
// contrôle dans ses actions listées (reçoit/commente/fait suivre au DF/
// rejette/renvoie — jamais "valide"), SLA 48h (ordre d'une étape bloquante,
// pas d'un contrôle a posteriori). FIABILISATION, elle, porte un
// vocabulaire de contrôle explicite ("valide le contrôle du dossier",
// "invalide le dossier suite au contrôle"), SLA 10 jours — incompatible
// avec une étape bloquante, cohérent avec un contrôle a posteriori.
// ROLE_CODE_FRA (nom d'origine de cette constante) est retiré : FRA n'est
// plus le rôle désigné par cette convention.
//
// FRAGILITÉ ASSUMÉE, inchangée par cette correction : EtapeRegle ne porte
// toujours aucun champ dédié pour distinguer ce contrôle d'un N1/N2
// générique. Si le rôle FIABILISATION est un jour renommé ou supprimé sans
// mettre à jour cette convention, R12 ne lève PAS d'erreur — une chaîne
// sans étape "FIABILISATION" se lit simplement comme « aucun contrôle
// requis », silencieusement. Le test rule-engine.integration.spec.ts
// « le rôle FIABILISATION existe dans le référentiel » est la seule chose
// qui rend cette dérive détectable.
export const ROLE_CODE_FIABILISATION = "FIABILISATION";

// RuleEngineService — Phase 4 (moteur minimal, lecture directe) + Phase 5
// (cache Redis + invalidation, PGD-040). Interface inchangée depuis la Phase 4
// (PGD-036 exigeait déjà la sélection du palier et l'instanciation de la
// chaîne dans la transaction de soumission) — seule la lecture de
// configuration_circuit/etape_regle passe désormais par le cache.
//
// Clé de cache : palier:{circuit}:{segment} → toutes les configurations
// actives de ce couple (sous_flux spécifique ET générique), le choix entre
// sous_flux exact / générique et la correspondance de montant se font en
// mémoire contre cet ensemble déjà chargé — pas de clé par montant exact
// (cardinalité illimitée) ni par sous_flux (le générique doit rester
// consultable même si un sous_flux spécifique existe par ailleurs).
//
// PostgreSQL reste la source de vérité (CLAUDE.md règle 4) : le TTL est un
// filet de sécurité, l'invalidation à l'écriture (invaliderCache, appelée par
// l'administration des paliers en Phase 5.5) est le mécanisme réel.
//
// Zéro règle en dur : aucun seuil, aucun rôle, aucun nom de circuit n'apparaît
// ici — tout vient de configuration_circuit / etape_regle. L'anti-chevauchement
// des bornes est garanti en base depuis la Phase 1
// (excl_configuration_circuit_chevauchement) : ce service suppose les paliers
// cohérents et laisse la base refuser une incohérence, il ne la revérifie pas.
@Injectable()
export class RuleEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendrierSla: CalendrierSlaService,
    private readonly cache: CacheService
  ) {}

  private cleCache(circuit: string, segment: string): string {
    return `palier:${circuit}:${segment}`;
  }

  async invaliderCache(circuit: string, segment: string): Promise<void> {
    await this.cache.invalidate(this.cleCache(circuit, segment));
  }

  private async configurationsActives(
    circuit: string,
    segment: string,
    client: Prisma.TransactionClient | PrismaService
  ): Promise<ConfigurationCache[]> {
    const cle = this.cleCache(circuit, segment);
    const enCache = await this.cache.get<ConfigurationCache[]>(cle);
    if (enCache) return enCache;

    const configurations = await client.configurationCircuit.findMany({
      where: { circuit: circuit as never, segment, actif: true },
      include: { etapesRegle: { orderBy: { ordre: "asc" }, include: { role: { select: { libelle: true } } } } }
    });

    const valeur: ConfigurationCache[] = configurations.map((config) => ({
      id: config.id,
      circuit: config.circuit,
      segment: config.segment,
      sousFlux: config.sousFlux,
      borneMin: Number(config.borneMin),
      borneMax: Number(config.borneMax),
      labelPalier: config.labelPalier,
      etapesRegle: config.etapesRegle.map((e) => ({
        ordre: e.ordre,
        roleCode: e.roleCode,
        roleLibelle: e.role.libelle,
        typeActeur: e.typeActeur,
        bloquant: e.bloquant,
        slaHeures: e.slaHeures,
        modeAffectation: e.modeAffectation
      }))
    }));

    await this.cache.set(cle, valeur, TTL_CACHE_SECONDES);
    return valeur;
  }

  async selectionnerConfiguration(
    params: { circuit: string; segment: string; sousFlux: string | null; montantTtc: number },
    client: Prisma.TransactionClient | PrismaService = this.prisma
  ): Promise<ConfigurationCache> {
    const configurations = await this.configurationsActives(params.circuit, params.segment, client);

    const couvreMontant = (c: ConfigurationCache) =>
      params.montantTtc >= c.borneMin && params.montantTtc <= c.borneMax;

    // Une configuration au sous_flux exact prime sur la configuration
    // générique (sous_flux NULL) du même circuit/segment — cf. paliers.seed.ts.
    const specifique = params.sousFlux
      ? configurations.find((c) => c.sousFlux === params.sousFlux && couvreMontant(c))
      : undefined;

    const configuration = specifique ?? configurations.find((c) => c.sousFlux === null && couvreMontant(c));

    if (!configuration || configuration.etapesRegle.length === 0) {
      // Jamais de routage par défaut silencieux — un montant hors de tout
      // palier configuré est un blocage explicite, nommé.
      throw new UnprocessableEntityException({
        code: "AUCUN_PALIER_CORRESPONDANT",
        message: `Aucun palier de routage configuré ne couvre ${params.montantTtc} XOF pour le circuit ${params.circuit}.`,
        details: { circuit: params.circuit, segment: params.segment, sousFlux: params.sousFlux, montantTtc: params.montantTtc }
      });
    }

    return configuration;
  }

  // R12/PGD-041 : TTC > 5M exige un contrôle a posteriori dans la chaîne —
  // cf. la convention ROLE_CODE_FIABILISATION documentée en tête de fichier.
  // Renommée le 27/08/2026 (était possedeControleFra) — le nom d'origine
  // impliquait à tort que FRA était ce rôle de contrôle.
  possedeControleR12(configuration: ConfigurationCache): boolean {
    return configuration.etapesRegle.some((e) => e.typeActeur === "C" && e.roleCode === ROLE_CODE_FIABILISATION);
  }

  // Instanciation (CLAUDE.md « Moteur de règles pivot ») : première étape
  // non-contrôle -> EN_CORBEILLE (avec échéance SLA), étapes non-contrôle
  // suivantes -> EN_ATTENTE, type_acteur=C -> POST_CLOTURE (contrôle a
  // posteriori, hors chaîne bloquante). L'obligation R12 est vérifiée par
  // l'appelant (DemandeWorkflowService) via possedeControleR12 avant
  // d'instancier — EnumTypeActeur reste par ailleurs non glosé, aucune autre
  // logique ne s'appuie dessus.
  async instancierChaine(demandeId: string, configuration: ConfigurationCache, client: Prisma.TransactionClient): Promise<void> {
    let premiereEtapeAffectee = false;

    for (const etape of configuration.etapesRegle) {
      if (etape.typeActeur === "C") {
        await client.tache.create({
          data: {
            demandeId,
            roleCorbeille: etape.roleCode,
            ordre: etape.ordre,
            typeActeur: etape.typeActeur as never,
            bloquant: etape.bloquant,
            slaHeures: etape.slaHeures,
            modeAffectation: etape.modeAffectation as never,
            etat: "POST_CLOTURE"
          }
        });
        continue;
      }

      const premiere = !premiereEtapeAffectee;
      premiereEtapeAffectee = true;

      await client.tache.create({
        data: {
          demandeId,
          roleCorbeille: etape.roleCode,
          ordre: etape.ordre,
          typeActeur: etape.typeActeur as never,
          bloquant: etape.bloquant,
          slaHeures: etape.slaHeures,
          modeAffectation: etape.modeAffectation as never,
          etat: premiere ? "EN_CORBEILLE" : "EN_ATTENTE",
          echeanceSla: premiere ? await this.calendrierSla.calculerEcheance(new Date(), etape.slaHeures) : undefined
        }
      });
    }
  }
}
