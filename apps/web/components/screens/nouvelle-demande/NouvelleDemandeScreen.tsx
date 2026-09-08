"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Badge, Button, Card, Icon, Modal, Money, useToast } from "@pgd/ui";
import type {
  CircuitVue,
  CompteClient,
  CreerDemandeRequete,
  DemandeDetail,
  DirectionResponsabiliteVue,
  EnumAssietteTva,
  EnumCircuit,
  EnumLocalisation,
  FacteurDegrevementVue,
  JournalAuditVue,
  LibelleAjustementVue,
  ModifierDemandeRequete,
  MotifVue,
  OperateurVue,
  ParametresCalculPublicVue,
  PointContactVue,
  SessionUtilisateur,
  UniversFmiVue
} from "@pgd/contracts";
import {
  ApiError,
  creerDemande,
  erreurRegleMetierSchema,
  listerCircuitsReferentiel,
  journalAuditDemande,
  listerDirectionsReferentiel,
  listerFacteursReferentiel,
  listerLibellesAjustementActifs,
  listerMotifsActifs,
  listerOperateursReferentiel,
  listerPointsContactReferentiel,
  listerSousFluxReferentiel,
  listerUniversFmi,
  modifierDemande,
  modifierTaxes,
  obtenirDetailDemande,
  obtenirParametresCalculReferentiel,
  soumettreDemande,
  type ErreurRegleMetier
} from "@/lib/api";
import { RechercheCompte } from "./RechercheCompte";
import { ApercuRoutage } from "./ApercuRoutage";
import { PiecesTab } from "../dossier-detail/PiecesTab";

const CIRCUITS: EnumCircuit[] = ["DOBB", "DXC", "DF"];

// Badge sur la carte « Fiche d'ajustement » (Phase 10.6sexies, inventaire
// champ par champ) — contenu de maquette statique, pas une donnée
// administrable : screens1.jsx:357/326/402 montre trois badges de nature
// différente par circuit (un code interne pour DOBB, un libellé de segment
// pour DXC, un rappel de statut R12 pour DF), aucun champ réel ne les
// porte tous les trois de façon uniforme. Même statut que SEGMENT_PAR_CIRCUIT
// ci-dessus : texte d'affichage fixe, pas une règle métier. Tons alignés sur
// les classes b-orange/b-blue/b-purple de la maquette (screens1.jsx).
const BADGE_FICHE_PAR_CIRCUIT: Record<EnumCircuit, { texte: string; ton: "accent" | "info" | "special" }> = {
  DOBB: { texte: "DOBB-DAOB", ton: "accent" },
  DXC: { texte: "Pôle B2C", ton: "info" },
  DF: { texte: "Soumis au contrôle FRA", ton: "special" }
};

// Surbrillance des champs concernés par un rejet (07/09/2026, demande
// explicite) — `nom` doit correspondre EXACTEMENT au libellé déjà utilisé
// par ExaminerModal (construireLignesCommunes/construireChampsCircuit,
// ApercuTab.tsx), la seule source de la désignation structurée
// (JournalAudit.detail.champsAnomalies sur l'entrée "rejet"). Couplage par
// chaîne de libellé, fragile par construction — documenté explicitement
// dans CLAUDE.md plutôt que durci (identifiant de champ stable), décision
// actée telle quelle. Un champ dont le libellé à l'écran diffère de celui
// d'ApercuTab (ex. "Nom du client" ici vs "Client" côté ApercuTab) ne
// s'illumine jamais — silencieusement, par construction de ce couplage.
// Dernière entrée JournalAudit "rejet" du dossier (triée par horodatage
// décroissant) → { libellé -> motif }. `detail` est un JSON non typé côté
// contrat (JournalAuditVue.detail: z.unknown()) — vérifié ici à l'exécution,
// jamais supposé conforme.
function extraireChampsRejetes(entrees: JournalAuditVue[]): Map<string, string> {
  const rejets = entrees
    .filter((e) => e.action === "rejet")
    .sort((a, b) => new Date(b.horodatage).getTime() - new Date(a.horodatage).getTime());
  const dernier = rejets[0];
  const detail = dernier?.detail as { champsAnomalies?: Array<{ champ?: unknown; motif?: unknown }> } | null | undefined;
  const champs = new Map<string, string>();
  for (const c of detail?.champsAnomalies ?? []) {
    if (typeof c.champ === "string" && typeof c.motif === "string") champs.set(c.champ, c.motif);
  }
  return champs;
}

function ChampCorrige({
  nom,
  champsRejetes,
  children
}: {
  nom: string;
  champsRejetes: Map<string, string> | null;
  children: ReactNode;
}) {
  const motif = champsRejetes?.get(nom);
  return (
    <div className={motif ? "rounded-6 border-2 border-rouge700 bg-rouge50 p-2" : undefined}>
      {children}
      {motif && <p className="mt-1 text-12 font-semibold text-rouge700">Motif du rejet : {motif}</p>}
    </div>
  );
}

// Points de contact (DOBB) — promu en référentiel admin-configurable
// (25/08/2026, demande explicite) ; la liste réelle vit désormais en base
// (packages/database/prisma/seed/referentiels/point-contact.seed.ts),
// fetchée via listerPointsContactReferentiel() — plus une constante locale
// ici (cf. « Point de contact » plus bas dans ce fichier).

// Convention déjà établie pour Sidebar (packages/ui) : le code de rôle
// `INITIATEUR_<CIRCUIT>` est le seul indice réel disponible côté client — pas
// un champ serveur dédié. Simple valeur par défaut ÉDITABLE, jamais une
// garantie : `creerDemandeRequeteSchema.circuit` reste ce que l'utilisateur
// soumet réellement.
function circuitParDefaut(roles: string[]): EnumCircuit {
  for (const circuit of CIRCUITS) {
    if (roles.includes(`INITIATEUR_${circuit}`)) return circuit;
  }
  return "DXC";
}

// Carte « Mémo Wholesale » (DF uniquement) — aucun de ces champs n'a de
// colonne dédiée dans creerDemandeRequeteSchema (vérifié, zéro occurrence de
// memoDe/memoA/memoObjectif/memoContexte/memoObservation/memoReference dans
// packages/contracts/src/demande.ts). Persistés via `champsCircuit` (sac
// JSON, demande.service.ts — prévu explicitement pour « les champs_circuit
// non promus en colonnes »). Le stockage non typé côté serveur n'est pas une
// raison de saisir sans garantie : ce schéma est la SEULE validation de
// forme sur ces champs avant l'envoi.
//
// Mise à jour (24/08/2026, demande explicite) : « Montant en FCFA
// (optionnel) » et « Numéro Case » retirés de la fiche DF — Numéro Case
// reste toutefois disponible côté DOBB/DXC (champ partagé, cf. numeroCase
// plus bas). « Compte / référence » scindé en deux champs distincts :
// compteClient (colonne dédiée, partagée avec DOBB/DXC) et memoReference
// (nouveau, même sac champsCircuit que le reste de ce mémo).
const champsCircuitDfSchema = z.object({
  memoDe: z.string().trim().optional(),
  memoA: z.string().trim().optional(),
  memoObjectif: z.string().trim().optional(),
  memoContexte: z.string().trim().min(1, "Contexte de la réclamation requis (mémo DF)."),
  memoObservation: z.string().trim().optional(),
  memoReference: z.string().trim().optional()
});
type ChampsCircuitDf = z.infer<typeof champsCircuitDfSchema>;

// Carte « B2B » (DOBB uniquement) — même principe que champsCircuitDfSchema :
// ni descriptifContestation ni pointContact n'ont de colonne dédiée
// (screens1.jsx:378/386), tous deux facultatifs dans la maquette (pas de
// `req`). pointContact reste un texte libre plutôt qu'un nouveau référentiel
// admin (décision Priorité 2, 19/08/2026) — cohérent avec le traitement de
// descriptifContestation, jamais construits comme colonnes dédiées.
const champsCircuitDobbSchema = z.object({
  descriptifContestation: z.string().trim().optional(),
  pointContact: z.string().trim().optional()
});
type ChampsCircuitDobb = z.infer<typeof champsCircuitDobbSchema>;

export interface NouvelleDemandeScreenProps {
  utilisateur: SessionUtilisateur;
  // Mode reprise (24/08/2026, audit MesDemandesScreen — cf. CLAUDE.md
  // « Renvoi/clôture d'un dossier rejeté ») : un BROUILLON existant
  // (renvoyé pour correction, ou simplement jamais soumis) est chargé et
  // édité à la place d'un dossier neuf. Jamais un sélecteur de circuit —
  // le circuit du dossier existant fait foi, silencieusement, même
  // principe que sousFlux déduit du profil pour une création neuve.
  demandeId?: string;
}

// Date du jour au format YYYY-MM-DD (fuseau local, pas UTC) — valeur par
// défaut d'un <input type="date">, jamais toISOString().slice(0,10) qui
// bascule sur UTC et peut afficher la veille selon l'heure/le fuseau.
function dateDuJourLocale(): string {
  const d = new Date();
  const mois = String(d.getMonth() + 1).padStart(2, "0");
  const jour = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mois}-${jour}`;
}

// Délai du debounce de sauvegarde silencieuse (Priorité 2, option B — cf.
// CLAUDE.md et l'échange de conception dédié) — vérifié en conditions
// réelles avant d'être figé, pas réutilisé par défaut sans y penser :
// 500 ms (même valeur que le panneau Taxes, PATCH .../taxes) reste
// approprié même avec ~20 champs debouncés ensemble plutôt que ~6, parce
// que TOUS les champs partagent UN SEUL minuteur (un seul setTimeout,
// remis à zéro par chaque frappe/changement, quel que soit le champ
// touché) — le nombre de champs n'affecte donc jamais la fréquence des
// appels réseau, seule la cadence de saisie de l'utilisateur le fait,
// exactement comme pour le panneau Taxes. Vérifié en direct (Priorité 2,
// clôture) : remplissage de 8 champs à un rythme humain normal (avec des
// pauses entre champs dépassant 500 ms) → exactement 1 création puis 1
// PATCH consolidé par pause réelle, jamais un appel par champ.
const DELAI_SAUVEGARDE_MS = 500;

interface TaxesEdition {
  tscActive: boolean;
  tvaActive: boolean;
  assietteTva: EnumAssietteTva;
  tscManuelle: boolean;
  montantTscManuel: string;
  tvaManuelle: boolean;
  montantTvaManuel: string;
}

export function NouvelleDemandeScreen({ utilisateur, demandeId }: NouvelleDemandeScreenProps) {
  const router = useRouter();
  const toast = useToast();
  // Déduit silencieusement du profil, jamais affiché ni modifiable à
  // l'écran (Priorité 0.2, révision du 19/08/2026, cf. CLAUDE.md) — reste
  // un état React malgré tout (24/08/2026, mode reprise) : sur un dossier
  // BROUILLON existant, le circuit RÉEL du dossier remplace cette valeur
  // par défaut une seule fois, à la fin du chargement de reprise ci-dessous
  // — jamais un sélecteur, jamais modifié par une action utilisateur, dans
  // aucun des deux modes.
  const [circuit, setCircuit] = useState<EnumCircuit>(() => circuitParDefaut(utilisateur.roles));
  // Faux (mode reprise) tant que le dossier existant n'est pas chargé — les
  // effets scopés au circuit (motifs/libellés/sous-flux/paramètres de
  // calcul) restent en attente pour ne jamais fetcher/réinitialiser deux
  // fois (une fois avec le circuit par défaut du rôle, une fois avec le
  // circuit réel du dossier). Vrai immédiatement en création neuve.
  const [circuitPret, setCircuitPret] = useState(!demandeId);
  const [erreurReprise, setErreurReprise] = useState<string | null>(null);
  // Champs concernés par le dernier rejet — { libellé -> motif } (07/09/2026,
  // demande explicite). Peuplé une seule fois, à la fin du chargement de
  // reprise ci-dessous, depuis la dernière entrée JournalAudit "rejet" du
  // dossier — jamais recalculé ensuite (un dossier corrigé puis resoumis
  // change de statut, cet écran ne le revoit plus dans cet état).
  const [champsRejetes, setChampsRejetes] = useState<Map<string, string> | null>(null);
  // Point 11 (07/09/2026) — un dossier renvoyé pour correction porte une
  // entrée JournalAudit "renvoi-correction" (TacheWorkflowService.rejeter,
  // branche par défaut). Détecté ici, dans le même fetch que champsRejetes
  // — même best-effort, jamais bloquant. Sert uniquement à savoir si une
  // modification de champ sensible doit passer par la confirmation
  // ci-dessous ; le serveur revérifie de toute façon cette même condition
  // (source de vérité), ce drapeau client ne fait qu'éviter un aller-retour
  // systématiquement raté pour un dossier jamais soumis.
  const [estRenvoiPourCorrection, setEstRenvoiPourCorrection] = useState(false);
  // Confirmation explicite avant bascule de référence (point 11) — posée
  // par le serveur (422 CONFIRMATION_NOUVEAU_DOSSIER_REQUISE), jamais
  // devinée côté client : `payload` porte exactement la requête qui a
  // déclenché le refus, réenvoyée telle quelle avec confirmerNouveauDossier
  // une fois confirmée.
  const [confirmationNouveauDossier, setConfirmationNouveauDossier] = useState<{
    champs: string[];
    payload: ModifierDemandeRequete;
  } | null>(null);
  const [confirmationEnCours, setConfirmationEnCours] = useState(false);
  // motifId/libelle/sousFlux sont réinitialisés à "" par les effets scopés
  // au circuit (ci-dessous) avant de fetcher leur référentiel respectif —
  // en reprise, cette ref porte la valeur du dossier existant à appliquer
  // à la place du blanc, lue une fois circuitPret passe à vrai. Jamais
  // consultée en création neuve (reste null).
  const valeursReprise = useRef<{ motifId: string; libelle: string; sousFlux: string } | null>(null);
  const [nomClient, setNomClient] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [dateDemande, setDateDemande] = useState(dateDuJourLocale);
  // PGD-032/SF-PGD-330 — "Autre" (texte libre) reste mutuellement exclusif
  // avec un service référentiel réel, imposé par le serveur
  // (normaliserServiceResponsable) et repris ici côté UI.
  const [serviceAutreActif, setServiceAutreActif] = useState(false);
  const [responsabiliteServiceAutre, setResponsabiliteServiceAutre] = useState("");

  // Carte « Identification » — champs communs aux trois circuits.
  const [agentInitiateur, setAgentInitiateur] = useState(utilisateur.nom);
  const [matriculeInitiateur, setMatriculeInitiateur] = useState("");
  const [agentSaisie, setAgentSaisie] = useState(utilisateur.nom);
  const [sousFlux, setSousFlux] = useState("");
  const [libelle, setLibelle] = useState("");
  const [motifId, setMotifId] = useState("");
  // "Autre (non référencé)" (07/09/2026, demande explicite) — même mécanique
  // que serviceAutreActif/responsabiliteServiceAutre ci-dessus, répliquée
  // pour Motif (motifId réel/FK + motifAutre texte libre, mutuellement
  // exclusifs, imposé côté serveur — normaliserMotif). Libellé/Opérateur
  // n'ont PAS besoin d'un second champ de stockage : `libelle`/`nomClient`
  // sont déjà des colonnes texte libre (jamais une FK), le texte manuel
  // s'écrit directement dedans — seul un booléen UI est nécessaire pour
  // savoir si le <select> doit afficher l'option « Autre » ou une valeur
  // réelle du référentiel.
  const [motifAutreActif, setMotifAutreActif] = useState(false);
  const [motifAutre, setMotifAutre] = useState("");
  const [libelleAutreActif, setLibelleAutreActif] = useState(false);
  const [operateurAutreActif, setOperateurAutreActif] = useState(false);
  const [universFmiCode, setUniversFmiCode] = useState("");
  const [facteurCode, setFacteurCode] = useState("");

  const [motifs, setMotifs] = useState<MotifVue[] | null>(null);
  const [univers, setUnivers] = useState<UniversFmiVue[] | null>(null);
  const [facteurs, setFacteurs] = useState<FacteurDegrevementVue[] | null>(null);
  const [libellesAjustement, setLibellesAjustement] = useState<LibelleAjustementVue[] | null>(null);
  // Opérateurs (DF)/Points de contact (DOBB) — 25/08/2026, demande explicite,
  // promotion en référentiels admin-configurables. Chacun exclusif à un seul
  // circuit (pas de scoping par circuit à l'appel, contrairement à Motif/
  // LibelleAjustement) — même mécanique qu'univers/facteurs ci-dessous, un
  // seul appel, jamais rechargé au changement de circuit.
  const [operateurs, setOperateurs] = useState<OperateurVue[] | null>(null);
  const [pointsContact, setPointsContact] = useState<PointContactVue[] | null>(null);

  // Univers/facteurs sont indépendants du circuit (Phase A) — un seul appel.
  useEffect(() => {
    void listerUniversFmi().then(setUnivers);
    void listerFacteursReferentiel().then(setFacteurs);
    void listerOperateursReferentiel().then(setOperateurs);
    void listerPointsContactReferentiel().then(setPointsContact);
  }, []);

  // Motifs sont scopés au circuit (GET /api/referentiels/motifs?circuit=) —
  // rechargés à chaque changement de circuit ; une sélection déjà faite pour
  // l'ancien circuit n'a aucune raison de rester valide pour le nouveau.
  // Gardé par circuitPret (24/08/2026, mode reprise) : ne fetche qu'une fois
  // le circuit réel connu — jamais avec le circuit par défaut du rôle
  // d'abord, jamais deux fois. valeursReprise fournit le motifId du dossier
  // existant à la place du blanc habituel ; reste `""` en création neuve
  // (ref jamais peuplée dans ce mode).
  useEffect(() => {
    if (!circuitPret) return;
    setMotifs(null);
    void listerMotifsActifs(circuit).then((liste) => {
      setMotifs(liste);
      setMotifId(valeursReprise.current?.motifId ?? "");
    });
  }, [circuit, circuitPret]);

  // LIBELLE (docs/10 remarques DOBB #3 / DXC #16) — même mécanique que
  // Motif : référentiel réel scopé au circuit, jamais un tableau codé en
  // dur (R11). DF exclu côté API (aucun libellé seedé pour ce circuit — son
  // formulaire utilise « Objet », un texte libre). Même garde/reprise que
  // Motif ci-dessus — libelle est un texte libre (pas un id), donc appliqué
  // directement, sans attendre le fetch de la liste d'options.
  useEffect(() => {
    if (!circuitPret) return;
    setLibelle(valeursReprise.current?.libelle ?? "");
    setLibellesAjustement(null);
    void listerLibellesAjustementActifs(circuit).then(setLibellesAjustement);
  }, [circuit, circuitPret]);

  // Sous-flux — RÉVISION Priorité 0.2 (19/08/2026, cf. CLAUDE.md) : jamais
  // affiché ni modifiable à l'écran, déduit silencieusement du
  // `sousFluxId` du profil de session. Décision inversant la présélection
  // éditable d'origine (SF-PGD-109), sur instruction explicite après
  // consultation métier. Aucun repli applicatif si le sousFluxId du profil
  // ne correspond à aucune entrée du circuit déduit (profil sans
  // sousFluxId, ou sousFluxId d'un autre circuit) — traité comme une
  // précondition opérationnelle (profil admin correct), pas une garantie
  // à coder : deux cas réels de ce type trouvés et corrigés en base avant
  // cette révision (jean.kouassi, FGGK6451), cf. CLAUDE.md.
  // Gardé par circuitPret, même principe que Motif/Libellé ci-dessus. En
  // reprise, le sous-flux DÉJÀ ENREGISTRÉ sur le dossier fait foi — jamais
  // re-dérivé du profil de session (qui peut avoir changé depuis la
  // création du brouillon, ou ne pas correspondre pour cet utilisateur).
  useEffect(() => {
    if (!circuitPret) return;
    if (valeursReprise.current) {
      setSousFlux(valeursReprise.current.sousFlux);
      return;
    }
    setSousFlux("");
    void listerSousFluxReferentiel(circuit).then((options) => {
      const correspondance = utilisateur.sousFluxId ? options.find((s) => s.id === utilisateur.sousFluxId) : undefined;
      if (correspondance) setSousFlux(correspondance.libelle);
    });
  }, [circuit, circuitPret, utilisateur.sousFluxId]);

  const motifSelectionne = motifs?.find((m) => m.id === motifId) ?? null;

  // Carte « DOBB/DXC » — champs partagés par les deux circuits
  // (compteClient/numeroCase/formuleAbonnement/recurrentMensuel/direction+
  // service), plus les champs propres à DOBB seul. DF exclu : sa maquette ne
  // montre aucun de ces champs (mémo distinct, carte séparée plus bas).
  const [compteClient, setCompteClient] = useState("");
  // Recherche client secondaire (Priorité 2, 19/08/2026, décision métier) —
  // remplace la recherche par ND. Purement indicative pour la préremplissage
  // (nom/compte) : aucune recherche RÉELLE par ce champ n'est câblée ici
  // (RechercheCompte reste scopé compte/nom, cf. son propre commentaire) —
  // la clé "recherche par numéro de case" reste bloquée par le même vide
  // JadePort déjà documenté (CLAUDE.md § Questions ouvertes), pas résolu par
  // ce chantier. Le champ lui-même (stockage/affichage) est réel.
  const [numeroCase, setNumeroCase] = useState("");
  const [formuleAbonnement, setFormuleAbonnement] = useState("");
  // Montant (FCFA), pas un booléen (Priorité 2, 19/08/2026, décision métier)
  // — aligné sur la maquette (screens1.jsx, "Montant récurrent mensuel (HT)").
  const [recurrentMensuel, setRecurrentMensuel] = useState("");
  const [directionRespId, setDirectionRespId] = useState("");
  const [serviceRespId, setServiceRespId] = useState("");
  const [localisation, setLocalisation] = useState<EnumLocalisation | "">("");
  const [dateReceptionBo, setDateReceptionBo] = useState("");
  const [dateReceptionOci, setDateReceptionOci] = useState("");
  const [numeroAppel, setNumeroAppel] = useState("");
  // DOBB uniquement (screens1.jsx:378/383-386) — champsCircuitDobbSchema
  // pour descriptifContestation/pointContact, colonnes réelles existantes
  // pour les deux dates de période contestée (periodeContesteeJours reste
  // calculé serveur, jamais une saisie manuelle — décision déjà actée).
  const [descriptifContestation, setDescriptifContestation] = useState("");
  const [debutPeriodeContestee, setDebutPeriodeContestee] = useState("");
  const [finPeriodeContestee, setFinPeriodeContestee] = useState("");
  const [pointContact, setPointContact] = useState("");
  const [agentResponsable, setAgentResponsable] = useState("");

  const [directions, setDirections] = useState<DirectionResponsabiliteVue[] | null>(null);

  // Indépendant du circuit (Phase A) — un seul appel, même principe qu'univers/facteurs.
  useEffect(() => {
    void listerDirectionsReferentiel().then(setDirections);
  }, []);

  // Badge de code process ("PO2_B-17", etc.) sur la carte Identification —
  // Circuit.processCode est une donnée admin réelle (AdminCircuitsController),
  // jamais un tableau codé en dur.
  const [circuits, setCircuits] = useState<CircuitVue[] | null>(null);
  useEffect(() => {
    void listerCircuitsReferentiel().then(setCircuits);
  }, []);
  const processCode = circuits?.find((c) => c.code === circuit)?.processCode ?? null;

  const directionSelectionnee = directions?.find((d) => d.id === directionRespId) ?? null;

  // Carte « Mémo Wholesale » — DF uniquement, cf. champsCircuitDfSchema
  // ci-dessus pour la validation avant envoi.
  const [memoDe, setMemoDe] = useState(utilisateur.nom);
  const [memoA, setMemoA] = useState("Service Fraude & Revenue Assurance");
  const [memoObjectif, setMemoObjectif] = useState("Soumettre l'ajustement au contrôle FRA");
  const [memoContexte, setMemoContexte] = useState("");
  const [memoObservation, setMemoObservation] = useState("");
  const [memoReference, setMemoReference] = useState("");

  // Carte « Montant à ajuster » — Priorité 2 (19/08/2026, décision métier
  // confirmée) : remplace RechercheNd/SelecteurLignes/Lignes retenues,
  // saisie libre au niveau du dossier plutôt que dérivée d'une somme de
  // lignes (R18 abandonnée, cf. CLAUDE.md « Fiches d'ajustement — abandon
  // du rattachement à une ligne réelle »).
  const [montantHt, setMontantHt] = useState("");

  // « Taxes appliquées » (panneau latéral) — lecture seule, jamais un
  // override : GET /api/referentiels/parametres-calcul/:circuit, projection
  // à 4 champs. Rechargé à chaque changement de circuit, indépendant de
  // `demande` (une donnée de circuit, pas de dossier).
  const [parametresCalcul, setParametresCalcul] = useState<ParametresCalculPublicVue | null>(null);
  useEffect(() => {
    if (!circuitPret) return;
    setParametresCalcul(null);
    void obtenirParametresCalculReferentiel(circuit)
      .then(setParametresCalcul)
      .catch(() => setParametresCalcul(null));
  }, [circuit, circuitPret]);

  // docs/10 remarques DOBB #9 / DXC #18 — sélection d'un résultat de
  // RechercheCompte renseigne compteClient ET nomClient d'un coup (« le nom
  // remonte après la saisie du numéro »). Reste éditable manuellement
  // ensuite : la recherche est un raccourci, pas un verrou.
  function appliquerCompteTrouve(compte: CompteClient) {
    setCompteClient(compte.numeroCompte);
    setNomClient(compte.nomClient);
  }

  function choisirDirection(id: string) {
    setDirectionRespId(id);
    // Un service choisi pour l'ancienne direction n'a aucune raison de rester
    // valide pour la nouvelle — même principe que la réinitialisation du
    // motif au changement de circuit.
    setServiceRespId("");
  }

  function choisirServiceReel(id: string) {
    setServiceRespId(id);
    if (id) toggleServiceAutre(false);
  }

  function toggleServiceAutre(actif: boolean) {
    setServiceAutreActif(actif);
    // "masqué ET vidé" (PGD-032) : une valeur résiduelle non visible qui
    // partirait quand même à la sauvegarde serait invisible à l'œil, donc on
    // la vide ici, pas seulement en CSS.
    if (!actif) setResponsabiliteServiceAutre("");
    else setServiceRespId("");
  }

  // "Autre (non référencé)" sur Motif (07/09/2026) — même mécanique exacte
  // que Responsabilité/service ci-dessus, répliquée pour ce champ.
  function choisirMotifReel(id: string) {
    setMotifId(id);
    if (id) toggleMotifAutre(false);
  }

  function toggleMotifAutre(actif: boolean) {
    setMotifAutreActif(actif);
    if (!actif) setMotifAutre("");
    else setMotifId("");
  }

  // Libellé/Opérateur (07/09/2026) — même bascule visuelle que Motif/Service,
  // mais sans second champ de stockage : `libelle`/`nomClient` sont déjà des
  // colonnes texte libre, le texte manuel s'y écrit directement (cf.
  // commentaire sur libelleAutreActif/operateurAutreActif ci-dessus).
  function toggleLibelleAutre(actif: boolean) {
    setLibelleAutreActif(actif);
    setLibelle("");
  }

  function choisirLibelleReel(valeur: string) {
    setLibelleAutreActif(false);
    setLibelle(valeur);
  }

  function toggleOperateurAutre(actif: boolean) {
    setOperateurAutreActif(actif);
    setNomClient("");
  }

  function choisirOperateurReel(valeur: string) {
    setOperateurAutreActif(false);
    setNomClient(valeur);
  }

  const [demande, setDemande] = useState<DemandeDetail | null>(null);
  const demandeRef = useRef<DemandeDetail | null>(null);
  useEffect(() => {
    demandeRef.current = demande;
  }, [demande]);
  // Déclaré ici (avant son usage par le chargement de reprise ci-dessous),
  // pas à côté du reste de la mécanique de debounce plus bas — même ref,
  // simplement consultée par deux effets distincts désormais.
  const premierRendu = useRef(true);

  // Mode reprise (24/08/2026) — charge un BROUILLON existant (renvoyé pour
  // correction ou jamais soumis) et peuple l'état du formulaire à sa place,
  // plutôt que de partir d'un dossier neuf. `demandeId` vient de l'écran
  // (route ?id=), jamais saisi par l'utilisateur ici. Vérifié CÔTÉ CLIENT
  // (statut BROUILLON + initiateur courant) en plus de la garantie serveur
  // déjà en place (InitiateurDemandeGuard sur PATCH) — un dossier non
  // éligible affiche une erreur explicite plutôt que de tenter une
  // sauvegarde silencieuse vouée à échouer.
  useEffect(() => {
    if (!demandeId) return;
    let annule = false;
    void (async () => {
      try {
        const detail = await obtenirDetailDemande(demandeId);
        if (annule) return;
        const d = detail.demande;
        if (d.initiateurId !== utilisateur.id || d.statut !== "BROUILLON") {
          setErreurReprise("Ce dossier n'est plus modifiable, ou ne vous appartient pas.");
          setCircuitPret(true);
          return;
        }
        const cc = (d.champsCircuit ?? {}) as Record<string, unknown>;
        const texte = (v: unknown, defaut = ""): string => (typeof v === "string" ? v : defaut);

        setNomClient(d.nomClient);
        setCommentaire(d.commentaire ?? "");
        setDateDemande(d.dateDemande ? d.dateDemande.slice(0, 10) : dateDuJourLocale());
        setAgentInitiateur(d.agentInitiateur ?? utilisateur.nom);
        setMatriculeInitiateur(d.matriculeInitiateur ?? "");
        setAgentSaisie(d.agentSaisie ?? utilisateur.nom);
        setUniversFmiCode(d.universFmiCode ?? "");
        setFacteurCode(d.facteurCode ?? "");
        setCompteClient(d.compteClient ?? "");
        setNumeroCase(d.numeroCase ?? "");
        setFormuleAbonnement(d.formuleAbonnement ?? "");
        setRecurrentMensuel(d.recurrentMensuel ? String(d.recurrentMensuel) : "");
        setDirectionRespId(d.directionRespId ?? "");
        setServiceRespId(d.serviceRespId ?? "");
        setResponsabiliteServiceAutre(d.responsabiliteServiceAutre ?? "");
        setServiceAutreActif(!!d.responsabiliteServiceAutre);
        // Motif "Autre (non référencé)" (07/09/2026) — motifAutre est une
        // colonne dédiée (pas un texte libre dérivé d'un référentiel), donc
        // aucune course possible avec le fetch des motifs : posé directement
        // ici, comme responsabiliteServiceAutre ci-dessus. Défensif : jamais
        // actif si motifId réel est posé (mutuellement exclusifs côté
        // serveur, normaliserMotif).
        setMotifAutre(d.motifAutre ?? "");
        setMotifAutreActif(!d.motifId && !!d.motifAutre);
        setLocalisation(d.localisation ?? "");
        setDateReceptionBo(d.dateReceptionBo ?? "");
        setDateReceptionOci(d.dateReceptionOci ?? "");
        setNumeroAppel(d.numeroAppel ?? "");
        setDebutPeriodeContestee(d.debutPeriodeContestee ?? "");
        setFinPeriodeContestee(d.finPeriodeContestee ?? "");
        setAgentResponsable(d.agentResponsable ?? "");
        setMontantHt(d.montantHt ? String(d.montantHt) : "");
        setDescriptifContestation(texte(cc.descriptifContestation));
        setPointContact(texte(cc.pointContact));
        setMemoDe(texte(cc.memoDe, utilisateur.nom));
        setMemoA(texte(cc.memoA, "Service Fraude & Revenue Assurance"));
        setMemoObjectif(texte(cc.memoObjectif, "Soumettre l'ajustement au contrôle FRA"));
        setMemoContexte(texte(cc.memoContexte));
        setMemoObservation(texte(cc.memoObservation));
        setMemoReference(texte(cc.memoReference));

        // Surbrillance des champs rejetés (07/09/2026, demande explicite) —
        // meilleur effort, jamais bloquant : un échec de cette requête ne
        // doit jamais empêcher la reprise du dossier elle-même (contrairement
        // à obtenirDetailDemande ci-dessus), c'est un confort d'affichage,
        // pas une donnée structurante du formulaire.
        try {
          const audit = await journalAuditDemande(demandeId);
          setChampsRejetes(extraireChampsRejetes(audit));
          setEstRenvoiPourCorrection(audit.some((e) => e.action === "renvoi-correction"));
        } catch {
          setChampsRejetes(null);
          setEstRenvoiPourCorrection(false);
        }

        // Libellé/Opérateur "Autre (non référencé)" (07/09/2026) — best-effort,
        // jamais bloquant, même discipline que champsRejetes ci-dessus. Un
        // fetch dédié plutôt qu'une dépendance à libellesAjustement/operateurs
        // (état du composant, potentiellement pas encore chargé à ce stade —
        // race avec l'effet scopé au circuit ci-dessous) : `d` est déjà en
        // main ici, comparer directement contre une liste fraîchement
        // récupérée évite toute course d'ordre de résolution des promesses.
        if (d.circuit !== "DF" && d.libelle) {
          try {
            const liste = await listerLibellesAjustementActifs(d.circuit);
            setLibelleAutreActif(!liste.some((l) => l.libelle === d.libelle));
          } catch {
            setLibelleAutreActif(false);
          }
        }
        if (d.circuit === "DF" && d.nomClient) {
          try {
            const liste = await listerOperateursReferentiel();
            setOperateurAutreActif(!liste.some((o) => o.libelle === d.nomClient));
          } catch {
            setOperateurAutreActif(false);
          }
        }

        // motifId/libelle/sousFlux : consommés par les effets scopés au
        // circuit une fois circuitPret vrai (ils réinitialisent sinon ces
        // trois champs), jamais posés directement ici.
        valeursReprise.current = { motifId: d.motifId ?? "", libelle: d.libelle ?? "", sousFlux: d.sousFlux ?? "" };

        setDemande(detail);
        // Le prochain passage de l'effet de sauvegarde silencieuse (déclenché
        // par tous les setXxx ci-dessus) ne doit PAS écrire un PATCH
        // identique à ce qui vient d'être chargé — même garde que le tout
        // premier montage d'un formulaire vide.
        premierRendu.current = true;
        setCircuit(d.circuit);
        setCircuitPret(true);
      } catch (e) {
        if (!annule) {
          setErreurReprise(e instanceof ApiError ? e.message : "Impossible de charger ce dossier.");
          setCircuitPret(true);
        }
      }
    })();
    return () => {
      annule = true;
    };
    // Dépendance volontairement réduite à demandeId : un chargement de
    // reprise par montage, jamais reflété par utilisateur/circuit
    // (immuables une fois posés, cf. commentaires ci-dessus).
  }, [demandeId]);

  const [sauvegardeEnCours, setSauvegardeEnCours] = useState(false);
  const [erreurSauvegarde, setErreurSauvegarde] = useState<string | null>(null);

  // Mécanisme entièrement automatique (règle permanente CLAUDE.md
  // « mécanismes d'interaction contraignants ») — l'aperçu de routage se
  // relance à chaque sauvegarde réussie, y compris la toute première fois
  // que le panneau apparaît (cf. ApercuRoutage.tsx). Compteur opaque : tout
  // incrément relance previsualiser() côté enfant.
  const [apercuDeclencheur, setApercuDeclencheur] = useState(0);

  const [soumissionEnCours, setSoumissionEnCours] = useState(false);
  const [erreursSoumission, setErreursSoumission] = useState<ErreurRegleMetier[] | null>(null);
  const [erreurSoumissionUnique, setErreurSoumissionUnique] = useState<string | null>(null);

  // Panneau « Taxes appliquées » — interactif dès qu'un dossier existe,
  // câblé sur PATCH /api/demandes/{id}/taxes (DemandeWorkflowService.
  // modifierTaxes, R25). Resynchronisé depuis le serveur à chaque
  // changement d'objet `demande` — jamais pendant la frappe.
  const [taxesEdition, setTaxesEdition] = useState<TaxesEdition | null>(null);
  const [enregistrementTaxes, setEnregistrementTaxes] = useState(false);
  const [erreurTaxes, setErreurTaxes] = useState<string | null>(null);

  const taxesEditionRef = useRef<TaxesEdition | null>(null);
  const debounceTaxesRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (debounceTaxesRef.current) clearTimeout(debounceTaxesRef.current);
    },
    []
  );

  useEffect(() => {
    if (!demande) {
      setTaxesEdition(null);
      taxesEditionRef.current = null;
      return;
    }
    const synchronise: TaxesEdition = {
      tscActive: demande.demande.tscActive,
      tvaActive: demande.demande.tvaActive,
      assietteTva: demande.demande.assietteTva,
      tscManuelle: demande.demande.tscManuelle,
      montantTscManuel: demande.demande.montantTscManuel != null ? String(demande.demande.montantTscManuel) : "",
      tvaManuelle: demande.demande.tvaManuelle,
      montantTvaManuel: demande.demande.montantTvaManuel != null ? String(demande.demande.montantTvaManuel) : ""
    };
    setTaxesEdition(synchronise);
    taxesEditionRef.current = synchronise;
  }, [demande]);

  // Aperçu client — reproduit la formule EXACTE de MontantService.calculer()
  // (apps/api/src/modules/demandes/services/montant.service.ts), vérifiée
  // avant d'être ajoutée ici plutôt que supposée. tauxTsc/tauxTva viennent du
  // DOSSIER (demande.demande, figés à sa création/dernier recalcul), jamais
  // de ParametresCalculPublicVue (le défaut COURANT du circuit, potentiellement
  // différent). Purement illustratif — les montants réellement appliqués
  // restent demande.demande.montantTsc/Tva/Ttc.
  function previsualiserTaxes(e: TaxesEdition) {
    if (!demande) return { tsc: 0, tva: 0, ttc: 0, assietteAffichable: false };
    const ht = demande.demande.montantHt;
    const tauxTsc = demande.demande.tauxTsc;
    const tauxTva = demande.demande.tauxTva;
    const tsc = !e.tscActive
      ? 0
      : e.tscManuelle
        ? Math.max(0, Number(e.montantTscManuel) || 0)
        : Math.max(0, Math.round(ht * tauxTsc * 100) / 100);
    const assiette = e.assietteTva === "HT_TSC" ? ht + tsc : ht;
    const tva = !e.tvaActive
      ? 0
      : e.tvaManuelle
        ? Math.max(0, Number(e.montantTvaManuel) || 0)
        : Math.max(0, Math.round(assiette * tauxTva * 100) / 100);
    const assietteAffichable = e.tscActive && e.tvaActive && e.assietteTva === "HT_TSC" && !e.tvaManuelle;
    return { tsc, tva, ttc: Math.max(0, ht + tsc + tva), assiette, assietteAffichable };
  }

  async function handleEnregistrerTaxes() {
    const demandeActuelle = demandeRef.current;
    const edition = taxesEditionRef.current;
    if (!demandeActuelle || !edition) return;
    setEnregistrementTaxes(true);
    setErreurTaxes(null);
    try {
      const misAJour = await modifierTaxes(demandeActuelle.demande.id, {
        tscActive: edition.tscActive,
        tvaActive: edition.tvaActive,
        assietteTva: edition.assietteTva,
        tscManuelle: edition.tscManuelle,
        montantTscManuel: edition.tscManuelle ? Math.max(0, Number(edition.montantTscManuel) || 0) : null,
        tvaManuelle: edition.tvaManuelle,
        montantTvaManuel: edition.tvaManuelle ? Math.max(0, Number(edition.montantTvaManuel) || 0) : null
      });
      setDemande(misAJour);
      setApercuDeclencheur((n) => n + 1);
    } catch (e) {
      setErreurTaxes(e instanceof ApiError ? e.message : "Erreur inattendue.");
    } finally {
      setEnregistrementTaxes(false);
    }
  }

  function planifierSauvegardeTaxes() {
    if (debounceTaxesRef.current) clearTimeout(debounceTaxesRef.current);
    debounceTaxesRef.current = setTimeout(() => {
      debounceTaxesRef.current = null;
      void handleEnregistrerTaxes();
    }, DELAI_SAUVEGARDE_MS);
  }

  function mettreAJourTaxes(updater: (s: TaxesEdition) => TaxesEdition) {
    setTaxesEdition((s) => {
      if (!s) return s;
      const suivant = updater(s);
      taxesEditionRef.current = suivant;
      return suivant;
    });
    planifierSauvegardeTaxes();
  }

  // Construit le corps de la sauvegarde silencieuse (création ou
  // modification, même forme — modifierDemandeRequeteSchema omet seulement
  // `circuit`) à partir de l'état courant du formulaire. `champsCircuit`
  // validé avant envoi (mêmes schémas que la validation de soumission
  // d'avant ce chantier, jamais une réimplémentation).
  function construirePayload(): { payload: CreerDemandeRequete; erreur: string | null } {
    let champsCircuit: ChampsCircuitDf | ChampsCircuitDobb | undefined;
    if (circuit === "DF") {
      const validation = champsCircuitDfSchema.safeParse({ memoDe, memoA, memoObjectif, memoContexte, memoObservation, memoReference });
      if (!validation.success) {
        return { payload: null as never, erreur: validation.error.issues[0]?.message ?? "Champs du mémo invalides." };
      }
      champsCircuit = validation.data;
    } else if (circuit === "DOBB") {
      champsCircuit = champsCircuitDobbSchema.parse({ descriptifContestation, pointContact });
    }

    const payload: CreerDemandeRequete = {
      circuit,
      dateDemande: dateDemande || undefined,
      nomClient: nomClient.trim(),
      compteClient: compteClient.trim() || undefined,
      numeroCase: numeroCase.trim() || undefined,
      agentInitiateur: agentInitiateur.trim() || undefined,
      matriculeInitiateur: matriculeInitiateur.trim() || undefined,
      agentSaisie: agentSaisie.trim() || undefined,
      sousFlux: sousFlux.trim() || undefined,
      localisation: circuit === "DOBB" && localisation ? localisation : undefined,
      dateReceptionBo: circuit === "DOBB" ? dateReceptionBo || undefined : undefined,
      dateReceptionOci: circuit === "DOBB" ? dateReceptionOci || undefined : undefined,
      formuleAbonnement: circuit === "DOBB" || circuit === "DXC" ? formuleAbonnement.trim() || undefined : undefined,
      numeroAppel: circuit === "DOBB" ? numeroAppel.trim() || undefined : undefined,
      // Période contestée étendue à DXC (07/09/2026, demande explicite) —
      // même mécanisme que DOBB (calcul serveur périodeContesteeJours),
      // jamais reconstruit.
      debutPeriodeContestee:
        circuit === "DOBB" || circuit === "DXC" ? debutPeriodeContestee || undefined : undefined,
      finPeriodeContestee: circuit === "DOBB" || circuit === "DXC" ? finPeriodeContestee || undefined : undefined,
      recurrentMensuel: (circuit === "DOBB" || circuit === "DXC") && recurrentMensuel ? Number(recurrentMensuel) : undefined,
      libelle: libelle.trim() || undefined,
      motifId: motifId || undefined,
      motifAutre: motifAutreActif ? motifAutre.trim() || undefined : undefined,
      universFmiCode: universFmiCode || undefined,
      facteurCode: facteurCode || undefined,
      directionRespId: directionRespId || undefined,
      serviceRespId: serviceRespId || undefined,
      responsabiliteServiceAutre: serviceAutreActif ? responsabiliteServiceAutre.trim() || undefined : undefined,
      agentResponsable: agentResponsable.trim() || undefined,
      commentaire: commentaire.trim() || undefined,
      montantHt: montantHt ? Number(montantHt) : undefined,
      champsCircuit: champsCircuit as Record<string, unknown> | undefined
    };
    return { payload, erreur: null };
  }

  // Sauvegarde silencieuse (Priorité 2, option B) — crée le dossier au
  // premier debounce une fois les champs minimaux remplis (nom client/
  // opérateur + commentaire + montant, même principe que l'ancien
  // infosCompletes), puis modifie le même dossier à chaque debounce
  // suivant. Jamais de flux en deux temps visible : aucun bouton
  // « Enregistrer », aucun champ verrouillé — seul le circuit reste figé une
  // fois le dossier créé (modifierDemandeRequeteSchema omet `circuit`, le
  // routage/segment en dépendent structurellement).
  async function sauvegarderFormulaire() {
    // Point 11 — une confirmation de bascule de référence est déjà en
    // attente : ne pas relancer un PATCH silencieux entre-temps (rejoué à
    // l'identique, il échouerait à nouveau pour la même raison). L'utilisateur
    // doit d'abord confirmer ou annuler.
    if (confirmationNouveauDossier) return;

    const demandeActuelle = demandeRef.current;
    // Garde des champs minimaux vérifiée sur l'état BRUT, avant toute
    // validation de champsCircuit (construirePayload) — bug trouvé en
    // vérification live (Priorité 1, DF) : valider le mémo DF avant même que
    // l'utilisateur ait commencé à saisir affichait « Contexte de la
    // réclamation requis » dès le premier rendu utile (dès que sousFlux se
    // préremplit depuis le profil), avant que quiconque n'ait rien tapé.
    if (!demandeActuelle && (!nomClient.trim() || !commentaire.trim() || !montantHt)) {
      return;
    }

    const { payload, erreur } = construirePayload();
    if (erreur) {
      setErreurSauvegarde(erreur);
      return;
    }

    setSauvegardeEnCours(true);
    setErreurSauvegarde(null);
    try {
      const resultat = demandeActuelle
        ? await modifierDemande(demandeActuelle.demande.id, payload)
        : await creerDemande(payload);
      setDemande(resultat);
      setApercuDeclencheur((n) => n + 1);
    } catch (e) {
      // Point 11 (07/09/2026) — un champ sensible (montant, période
      // contestée) a changé sur un dossier renvoyé pour correction : le
      // serveur refuse la modification silencieuse et exige une confirmation
      // explicite avant toute bascule vers un nouveau dossier. Jamais un
      // simple message d'erreur — une décision à présenter à l'utilisateur.
      if (e instanceof ApiError && e.code === "CONFIRMATION_NOUVEAU_DOSSIER_REQUISE" && demandeActuelle) {
        const champs = ((e.details as { champs?: string[] } | undefined)?.champs ?? []).filter(
          (c): c is string => typeof c === "string"
        );
        setConfirmationNouveauDossier({ champs, payload: payload as ModifierDemandeRequete });
      } else {
        setErreurSauvegarde(e instanceof ApiError ? e.message : "Erreur inattendue.");
      }
    } finally {
      setSauvegardeEnCours(false);
    }
  }

  const LIBELLE_CHAMP_SENSIBLE: Record<string, string> = {
    montantHt: "Montant à ajuster HT",
    debutPeriodeContestee: "Début de la période contestée",
    finPeriodeContestee: "Fin de la période contestée"
  };

  // Confirmation reçue (point 11) — réenvoie EXACTEMENT le payload qui a
  // déclenché le refus, avec confirmerNouveauDossier: true. Navigue vers le
  // nouveau dossier une fois créé (key={demandeId} sur la page force un
  // remontage propre de cet écran, cf. app/(app)/nouvelle-demande/page.tsx)
  // — jamais une mise à jour d'état locale qui laisserait cet écran croire
  // qu'il édite toujours l'ancien dossier.
  async function confirmerBasculeNouveauDossier() {
    const demandeActuelle = demandeRef.current;
    if (!confirmationNouveauDossier || !demandeActuelle) return;

    setConfirmationEnCours(true);
    try {
      const resultat = await modifierDemande(demandeActuelle.demande.id, {
        ...confirmationNouveauDossier.payload,
        confirmerNouveauDossier: true
      });
      toast({
        ton: "succes",
        titre: "Nouveau dossier créé",
        message: `Réf. ${resultat.demande.reference} — référence le dossier renvoyé pour correction.`
      });
      setConfirmationNouveauDossier(null);
      router.replace(`/nouvelle-demande?id=${resultat.demande.id}`);
    } catch (e) {
      setConfirmationNouveauDossier(null);
      setErreurSauvegarde(e instanceof ApiError ? e.message : "Erreur inattendue.");
    } finally {
      setConfirmationEnCours(false);
    }
  }

  const debounceFormulaireRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Rien à sauvegarder au tout premier rendu (formulaire vide) — même
    // garde que le premier montage d'ApercuRoutage, robuste à React
    // StrictMode (double-invocation des effets en dev).
    if (premierRendu.current) {
      premierRendu.current = false;
      return;
    }
    if (debounceFormulaireRef.current) clearTimeout(debounceFormulaireRef.current);
    debounceFormulaireRef.current = setTimeout(() => {
      debounceFormulaireRef.current = null;
      void sauvegarderFormulaire();
    }, DELAI_SAUVEGARDE_MS);
    return () => {
      if (debounceFormulaireRef.current) clearTimeout(debounceFormulaireRef.current);
    };
    // Dépendances volontairement exhaustives, listées explicitement plutôt
    // que dérivées d'un objet unique — chaque champ pertinent au formulaire
    // déclenche le même debounce, jamais un `useCallback`/`sauvegarderFormulaire`
    // qui obligerait à re-déclarer cette même liste ailleurs.
  }, [
    nomClient,
    commentaire,
    dateDemande,
    agentInitiateur,
    matriculeInitiateur,
    agentSaisie,
    sousFlux,
    libelle,
    motifId,
    motifAutre,
    universFmiCode,
    facteurCode,
    compteClient,
    numeroCase,
    formuleAbonnement,
    numeroAppel,
    descriptifContestation,
    debutPeriodeContestee,
    finPeriodeContestee,
    pointContact,
    agentResponsable,
    recurrentMensuel,
    directionRespId,
    serviceRespId,
    serviceAutreActif,
    responsabiliteServiceAutre,
    localisation,
    dateReceptionBo,
    dateReceptionOci,
    memoDe,
    memoA,
    memoObjectif,
    memoContexte,
    memoObservation,
    memoReference,
    montantHt
  ]);

  async function handleSoumettre() {
    if (!demande) return;
    setSoumissionEnCours(true);
    setErreursSoumission(null);
    setErreurSoumissionUnique(null);
    try {
      const reponse = await soumettreDemande(demande.demande.id);
      toast({
        ton: "succes",
        titre: "Demande soumise",
        message: `Réf. ${demande.demande.reference} — statut ${reponse.statut}, étape courante ${reponse.etapeCourante}.`
      });
      router.push("/mes-demandes?onglet=encours");
      return;
    } catch (e) {
      if (e instanceof ApiError && e.code === "REGLE_METIER_VIOLEE" && e.details) {
        const violations = z.array(erreurRegleMetierSchema).safeParse(e.details);
        if (violations.success) {
          setErreursSoumission(violations.data);
        } else {
          setErreurSoumissionUnique(e.message);
        }
      } else if (e instanceof ApiError) {
        setErreurSoumissionUnique(e.message);
      } else {
        setErreurSoumissionUnique("Erreur inattendue.");
      }
    } finally {
      setSoumissionEnCours(false);
    }
  }

  // Mode reprise : rien du formulaire n'est monté tant que le dossier
  // existant n'est pas chargé (ou en échec) — évite tout flash avec le
  // circuit par défaut du rôle avant que le circuit réel ne soit connu.
  if (demandeId && erreurReprise) {
    return <Card className="p-5 text-13 font-semibold text-rouge700">{erreurReprise}</Card>;
  }
  if (demandeId && !circuitPret) {
    return <p className="text-13 text-gris600">Chargement du dossier…</p>;
  }

  // Options de motif — référentiel réel scopé au circuit, jamais un tableau
  // codé en dur. Suffixe « (pièces obligatoires) » (01/09/2026, demande
  // explicite) — mentionne explicitement, DANS la liste elle-même, quels
  // motifs portent des pièces afférentes obligatoires, avant même la
  // sélection : la note détaillée sous le champ (R13, ci-dessous) ne
  // s'affichait jusqu'ici qu'APRÈS coup, une fois le motif déjà choisi.
  const motifOptions = motifs?.map((m) => (
    <option key={m.id} value={m.id}>
      {m.libelle}
      {m.piecesAfferentes.some((p) => p.obligatoire) ? " (pièces obligatoires)" : ""}
    </option>
  ));

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-4">
        {/* Carte du haut (bloc de « création différée ») retirée — Priorité 1.1
            (20/08/2026) : jamais dans la maquette. « Nom du client »/« Opérateur »
            et « Date de demande » reprennent leur emplacement EXACT de la
            maquette, vérifié via le harnais (docs/design, serveur statique) et
            screens1.jsx, pas supposé : « Date de demande » est le premier champ
            de la carte Identification (commune) ; « Nom du client »/« Opérateur »
            N'EST PAS un champ commun — la maquette le place dans la carte
            propre à chaque circuit (3ᵉ position DOBB/DXC, juste après le bloc de
            recherche client et le Numéro Case ; 3ᵉ position DF, juste après
            « À (destinataire) »), jamais dans Identification. Réf. brouillon et
            indicateur de sauvegarde silencieuse déplacés dans la carte
            Identification, seul endroit qui reste toujours visible en tête. */}

        {/* Carte « Identification » — communs aux trois circuits. Motif
            scopé au circuit courant ; univers/facteur indépendants du
            circuit. */}
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Icon nom="building" taille={17} />
            <h3 className="text-14 font-bold">
              {demande ? `Brouillon réf. ${demande.demande.reference}` : "Identification"}
            </h3>
            {sauvegardeEnCours && <span className="text-12 font-semibold text-gris600">Enregistrement…</span>}
            {processCode && (
              <span className="ml-auto">
                <Badge ton="neutre">{processCode}</Badge>
              </span>
            )}
          </div>
          {estRenvoiPourCorrection && !confirmationNouveauDossier && (
            <div className="mb-3 flex items-start gap-2.5 rounded border border-[#c5e6f5] bg-bleuFond p-3 text-13 text-bleu700">
              <Icon nom="info" taille={15} className="mt-0.5 shrink-0" />
              Dossier renvoyé pour correction. Modifier le montant ou la période contestée créera un nouveau dossier
              référençant celui-ci — une confirmation vous sera demandée.
            </div>
          )}
          {erreurSauvegarde && <p className="mb-3 text-13 font-semibold text-rouge700">{erreurSauvegarde}</p>}
          {confirmationNouveauDossier && (
            <Modal
              titre="Confirmer un nouveau dossier"
              icone="alert"
              onFermer={() => setConfirmationNouveauDossier(null)}
              pied={
                <div className="flex w-full items-center gap-3">
                  <Button
                    onClick={() => setConfirmationNouveauDossier(null)}
                    variante="fantome"
                    taille="petite"
                    disabled={confirmationEnCours}
                  >
                    Annuler
                  </Button>
                  <Button
                    onClick={() => void confirmerBasculeNouveauDossier()}
                    variante="danger"
                    taille="petite"
                    disabled={confirmationEnCours}
                    className="ml-auto"
                  >
                    <Icon nom="check" taille={15} /> Créer un nouveau dossier référençant celui-ci
                  </Button>
                </div>
              }
            >
              <p className="text-13">
                Ce dossier a été <span className="font-semibold">renvoyé pour correction</span> après un rejet. Modifier un champ
                sensible ne peut pas se faire par une simple correction silencieuse — un{" "}
                <span className="font-semibold">nouveau dossier</span> sera créé, référençant celui-ci (
                <span className="font-mono">{demande?.demande.reference}</span>), qui restera lui-même en brouillon, inchangé.
              </p>
              <ul className="mt-3 list-disc pl-5 text-13">
                {confirmationNouveauDossier.champs.map((c) => (
                  <li key={c}>{LIBELLE_CHAMP_SENSIBLE[c] ?? c}</li>
                ))}
              </ul>
              <p className="mt-3 text-12 text-gris600">
                Les pièces jointes déjà déposées sont reprises sur le nouveau dossier. Vous pourrez supprimer l'ancien
                manuellement une fois la correction soumise — rien n'est automatique.
              </p>
            </Modal>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-13 font-bold text-gris800">
                {circuit === "DF" ? "Date du mémo" : "Date de demande"}
              </label>
              <input
                className="w-full rounded border border-gris300 px-3 py-2 text-13"
                type="date"
                value={dateDemande}
                onChange={(e) => setDateDemande(e.target.value)}
              />
            </div>
            {/* Date de saisie (creeLe) — immuable, jamais acceptée en entrée
                (creerDemandeRequeteSchema ne la porte pas). Visible seulement
                une fois le dossier créé, puisqu'elle n'existe qu'à ce moment. */}
            {demande && (
              <div>
                <label className="mb-1 block text-13 font-bold text-gris800">Date de saisie</label>
                <p className="rounded border border-gris200 bg-gris50 px-3 py-2 text-13 text-gris700">
                  {new Date(demande.demande.creeLe).toLocaleDateString("fr-FR")}
                </p>
              </div>
            )}
            <ChampCorrige nom="Agent initiateur" champsRejetes={champsRejetes}>
              <label className="mb-1 block text-13 font-bold text-gris800">Agent initiateur</label>
              <input
                className="w-full rounded border border-gris300 px-3 py-2 text-13"
                value={agentInitiateur}
                onChange={(e) => setAgentInitiateur(e.target.value)}
              />
            </ChampCorrige>
            <div>
              <label className="mb-1 block text-13 font-bold text-gris800">Matricule / réf. agent initiateur</label>
              <input
                className="w-full rounded border border-gris300 px-3 py-2 text-13 font-mono"
                value={matriculeInitiateur}
                onChange={(e) => setMatriculeInitiateur(e.target.value)}
                placeholder="ex. M-2041"
              />
            </div>
            <ChampCorrige nom="Agent de saisie" champsRejetes={champsRejetes}>
              <label className="mb-1 block text-13 font-bold text-gris800">Agent de saisie</label>
              <input
                className="w-full rounded border border-gris300 px-3 py-2 text-13"
                value={agentSaisie}
                onChange={(e) => setAgentSaisie(e.target.value)}
              />
            </ChampCorrige>
            <ChampCorrige nom="Motif" champsRejetes={champsRejetes}>
              <label className="mb-1 block text-13 font-bold text-gris800">
                Motif {(circuit === "DOBB" || circuit === "DXC") && <span className="text-rouge">*</span>}
              </label>
              <select
                className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
                value={motifAutreActif ? "__autre" : motifId}
                onChange={(e) => (e.target.value === "__autre" ? toggleMotifAutre(true) : choisirMotifReel(e.target.value))}
                disabled={!motifs}
              >
                <option value="">— Choisir —</option>
                {motifOptions}
                <option value="__autre">Autre (non référencé)</option>
              </select>
              {/* "Autre (non référencé)" (07/09/2026) — motif hors catalogue,
                  saisi en texte libre (motifAutre), mutuellement exclusif
                  avec motifId réel (normaliserMotif côté serveur). Satisfait
                  MOTIF_REQUIS au même titre qu'un motif réel — cf.
                  demande-workflow.service.ts. */}
              {motifAutreActif && (
                <input
                  className="mt-2 w-full rounded border border-gris300 px-3 py-2 text-13"
                  value={motifAutre}
                  onChange={(e) => setMotifAutre(e.target.value)}
                  placeholder="Précisez le motif…"
                />
              )}
              {/* 01/09/2026, étendu à DXC le 07/09/2026 (demande explicite,
                  « tous les champs deviennent obligatoires ») — obligatoire à
                  la soumission pour DOBB/DXC, cf. demande-workflow.service.ts
                  (MOTIF_REQUIS). */}
              {(circuit === "DOBB" || circuit === "DXC") && (
                <p className="mt-1 text-12 text-gris600">Obligatoire à la soumission.</p>
              )}
              {/* R13 — pièces obligatoires du motif, affichées avant l'échec de
                  soumission plutôt que découvertes au 422. */}
              {motifSelectionne && motifSelectionne.piecesAfferentes.some((p) => p.obligatoire) && (
                <p className="mt-1 text-12 font-semibold text-orangeTexteSurClair">
                  Pièces obligatoires :{" "}
                  {motifSelectionne.piecesAfferentes
                    .filter((p) => p.obligatoire)
                    .map((p) => p.libelle)
                    .join(", ")}
                </p>
              )}
            </ChampCorrige>
            <ChampCorrige nom="Libellé" champsRejetes={champsRejetes}>
              <label className="mb-1 block text-13 font-bold text-gris800">
                {circuit === "DF" ? "Objet" : "Libellé"} <span className="text-rouge">*</span>
              </label>
              {circuit === "DF" ? (
                // DF — texte libre, jamais un référentiel (aucun LibelleAjustement
                // seedé pour ce circuit) : pas de mécanisme "Autre" à construire
                // ici, le champ EST déjà en saisie libre.
                <input
                  className="w-full rounded border border-gris300 px-3 py-2 text-13"
                  value={libelle}
                  onChange={(e) => setLibelle(e.target.value)}
                />
              ) : (
                <>
                  <select
                    className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
                    value={libelleAutreActif ? "__autre" : libelle}
                    onChange={(e) => (e.target.value === "__autre" ? toggleLibelleAutre(true) : choisirLibelleReel(e.target.value))}
                    disabled={!libellesAjustement}
                  >
                    <option value="">— Choisir —</option>
                    {libellesAjustement?.map((l) => (
                      <option key={l.id} value={l.libelle}>
                        {l.libelle}
                      </option>
                    ))}
                    <option value="__autre">Autre (non référencé)</option>
                  </select>
                  {/* "Autre (non référencé)" (07/09/2026) — même mécanique que
                      Motif ci-dessus, sans second champ de stockage : `libelle`
                      est déjà une colonne texte libre, la saisie manuelle s'y
                      écrit directement. */}
                  {libelleAutreActif && (
                    <input
                      className="mt-2 w-full rounded border border-gris300 px-3 py-2 text-13"
                      value={libelle}
                      onChange={(e) => setLibelle(e.target.value)}
                      placeholder="Précisez le libellé…"
                    />
                  )}
                </>
              )}
              <p className="mt-1 text-12 text-gris600">Obligatoire à la soumission.</p>
            </ChampCorrige>
          </div>
        </Card>

        {/* Carte « DOBB/DXC » — champs partagés par les deux circuits +
            champs propres à DOBB seul. Absente pour DF (aucune source ne les
            y montre). */}
        {(circuit === "DOBB" || circuit === "DXC") && (
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <Icon nom="flow" taille={17} />
              <h3 className="text-14 font-bold">{circuit === "DOBB" ? "Fiche d'ajustement B2B" : "Fiche d'ajustement B2C"}</h3>
              <Badge ton={BADGE_FICHE_PAR_CIRCUIT[circuit].ton}>{BADGE_FICHE_PAR_CIRCUIT[circuit].texte}</Badge>
            </div>

            <div className="mb-3">
              <RechercheCompte onCompteTrouve={appliquerCompteTrouve} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Ordre exact de la maquette, vérifié via le harnais et
                  screens1.jsx (Priorité 1.1, 20/08/2026) : Numéro Case → Nom
                  du client → Compte client — pas l'ordre précédent. */}
              <div>
                <label className="mb-1 block text-13 font-bold text-gris800">Numéro Case (JADE)</label>
                <input
                  className="w-full rounded border border-gris300 px-3 py-2 text-13 font-mono"
                  value={numeroCase}
                  onChange={(e) => setNumeroCase(e.target.value)}
                  placeholder="ex. CASE-100231"
                />
                <p className="mt-1 text-12 text-gris600">Facultatif — à titre indicatif.</p>
              </div>
              <div>
                <label className="mb-1 block text-13 font-bold text-gris800">
                  Nom du client <span className="text-rouge">*</span>
                </label>
                <input
                  className="w-full rounded border border-gris300 px-3 py-2 text-13"
                  value={nomClient}
                  onChange={(e) => setNomClient(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-13 font-bold text-gris800">
                  Compte client {circuit === "DXC" && <span className="text-rouge">*</span>}
                </label>
                <input
                  className="w-full rounded border border-gris300 px-3 py-2 text-13 font-mono"
                  value={compteClient}
                  onChange={(e) => setCompteClient(e.target.value)}
                  placeholder={circuit === "DOBB" ? "ex. B2B-880142" : "ex. B2C-4471902"}
                />
              </div>
              <ChampCorrige nom="Formule d'abonnement" champsRejetes={champsRejetes}>
                <label className="mb-1 block text-13 font-bold text-gris800">
                  Formule d'abonnement <span className="text-rouge">*</span>
                </label>
                <input
                  className="w-full rounded border border-gris300 px-3 py-2 text-13"
                  value={formuleAbonnement}
                  onChange={(e) => setFormuleAbonnement(e.target.value)}
                />
                <p className="mt-1 text-12 text-gris600">Obligatoire à la soumission.</p>
              </ChampCorrige>

              {/* Période contestée — étendue à DXC (07/09/2026, demande
                  explicite), même mécanisme que DOBB (calcul serveur
                  DemandeService.calculerJoursContestes, jamais reconstruit),
                  extrait du fragment DOBB uniquement ci-dessous pour être
                  partagé par les deux circuits. Obligatoire pour DXC depuis
                  le 07/09/2026, étendue à DOBB le même jour (demande
                  explicite, huit champs DOBB deviennent obligatoires). */}
              {(circuit === "DOBB" || circuit === "DXC") && (
                <>
                  <div>
                    <label className="mb-1 block text-13 font-bold text-gris800">
                      Début période contestée <span className="text-rouge">*</span>
                    </label>
                    <input
                      className="w-full rounded border border-gris300 px-3 py-2 text-13"
                      type="date"
                      value={debutPeriodeContestee}
                      onChange={(e) => setDebutPeriodeContestee(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-13 font-bold text-gris800">
                      Fin période contestée <span className="text-rouge">*</span>
                    </label>
                    <input
                      className="w-full rounded border border-gris300 px-3 py-2 text-13"
                      type="date"
                      value={finPeriodeContestee}
                      onChange={(e) => setFinPeriodeContestee(e.target.value)}
                    />
                  </div>
                  {/* Période contestée (jours) — la maquette (screens1.jsx:385,
                      `f.pJours`) en fait une saisie manuelle indépendante ;
                      vérifié avant de la reproduire telle quelle : le serveur
                      réel calcule déjà ce nombre depuis les deux dates
                      ci-dessus (DemandeService.calculerJoursContestes,
                      periodeContesteeJours dans demandeDetailSchema) — un
                      champ manuel dupliquerait une valeur que le serveur
                      recalcule de toute façon, avec un risque réel de
                      contradiction (l'utilisateur saisit un nombre qui ne
                      correspond pas à l'écart réel des dates). Affichage en
                      lecture seule de la valeur serveur, jamais recalculée
                      côté client (R11) — visible seulement une fois le
                      dossier créé (avant, aucune valeur n'existe encore).
                      Libellé DXC distinct (07/09/2026, demande explicite,
                      « Nombre de jours à ajuster ») — même valeur, même
                      mécanisme, jamais reconstruit, seul le texte change. */}
                  {demande && demande.demande.periodeContesteeJours !== null && (
                    <div>
                      <label className="mb-1 block text-13 font-bold text-gris800">
                        {circuit === "DXC" ? "Nombre de jours à ajuster" : "Période contestée (jours)"}
                      </label>
                      <p className="rounded border border-gris200 bg-gris50 px-3 py-2 text-13 text-gris700">
                        {demande.demande.periodeContesteeJours}
                      </p>
                    </div>
                  )}
                </>
              )}

              {circuit === "DOBB" && (
                <>
                  <div>
                    <label className="mb-1 block text-13 font-bold text-gris800">Numéro d'appel</label>
                    <input
                      className="w-full rounded border border-gris300 px-3 py-2 text-13"
                      value={numeroAppel}
                      onChange={(e) => setNumeroAppel(e.target.value)}
                      placeholder="ex. 27 22 00 00 00"
                    />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label className="mb-1 block text-13 font-bold text-gris800">
                      Descriptif de la contestation <span className="text-rouge">*</span>
                    </label>
                    <textarea
                      className="w-full rounded border border-gris300 px-3 py-2 text-13"
                      style={{ minHeight: 60 }}
                      value={descriptifContestation}
                      onChange={(e) => setDescriptifContestation(e.target.value)}
                      placeholder="Détail du cas contesté…"
                    />
                    <p className="mt-1 text-12 text-gris600">Obligatoire à la soumission.</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-13 font-bold text-gris800">
                      Localisation <span className="text-rouge">*</span>
                    </label>
                    <select
                      className="w-full rounded border border-gris300 px-3 py-2 text-13"
                      value={localisation}
                      onChange={(e) => setLocalisation(e.target.value as EnumLocalisation | "")}
                    >
                      <option value="">— Choisir —</option>
                      <option value="NATIONAL">National</option>
                      <option value="INTERNATIONAL">International</option>
                    </select>
                    <p className="mt-1 text-12 text-gris600">Obligatoire à la soumission.</p>
                  </div>
                  {/* Point de contact — <select> admin-configurable (25/08/2026,
                      demande explicite ; promu depuis Priorité 1.3,
                      20/08/2026, où la liste n'était encore qu'une constante
                      locale). Valeur toujours stockée dans champsCircuit,
                      inchangé — seule la source des options change. */}
                  <div>
                    <label className="mb-1 block text-13 font-bold text-gris800">
                      Point de contact <span className="text-rouge">*</span>
                    </label>
                    <select
                      className="w-full rounded border border-gris300 px-3 py-2 text-13"
                      value={pointContact}
                      onChange={(e) => setPointContact(e.target.value)}
                      disabled={!pointsContact}
                    >
                      <option value="">— Choisir —</option>
                      {pointsContact?.map((p) => (
                        <option key={p.id} value={p.libelle}>
                          {p.libelle}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-12 text-gris600">Obligatoire à la soumission.</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-13 font-bold text-gris800">
                      Date réception BO <span className="text-rouge">*</span>
                    </label>
                    <input
                      className="w-full rounded border border-gris300 px-3 py-2 text-13"
                      type="date"
                      value={dateReceptionBo}
                      onChange={(e) => setDateReceptionBo(e.target.value)}
                    />
                    <p className="mt-1 text-12 text-gris600">Obligatoire à la soumission.</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-13 font-bold text-gris800">
                      Date réception OCI <span className="text-rouge">*</span>
                    </label>
                    <input
                      className="w-full rounded border border-gris300 px-3 py-2 text-13"
                      type="date"
                      value={dateReceptionOci}
                      onChange={(e) => setDateReceptionOci(e.target.value)}
                    />
                    <p className="mt-1 text-12 text-gris600">Obligatoire à la soumission.</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-13 font-bold text-gris800">Agent responsable</label>
                    <input
                      className="w-full rounded border border-gris300 px-3 py-2 text-13"
                      value={agentResponsable}
                      onChange={(e) => setAgentResponsable(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div>
                <label className="mb-1 block text-13 font-bold text-gris800">Montant récurrent mensuel (HT)</label>
                <div className="flex items-center gap-2">
                  <input
                    className="w-full rounded border border-gris300 px-3 py-2 text-13 font-mono"
                    type="number"
                    min="0"
                    value={recurrentMensuel}
                    onChange={(e) => setRecurrentMensuel(e.target.value)}
                    placeholder="0"
                  />
                  <span className="text-12 text-gris600">FCFA</span>
                </div>
                <p className="mt-1 text-12 text-gris600">Laisser à 0 si non récurrent.</p>
              </div>

              {/* Responsabilité — direction/service : retirée du formulaire
                  DXC (07/09/2026, demande explicite) — DOBB seul continue de
                  les porter. */}
              {circuit === "DOBB" && (
                <ResponsabiliteFields
                  directions={directions}
                  directionRespId={directionRespId}
                  choisirDirection={choisirDirection}
                  directionSelectionnee={directionSelectionnee}
                  serviceRespId={serviceRespId}
                  choisirServiceReel={choisirServiceReel}
                  serviceAutreActif={serviceAutreActif}
                  toggleServiceAutre={toggleServiceAutre}
                  responsabiliteServiceAutre={responsabiliteServiceAutre}
                  setResponsabiliteServiceAutre={setResponsabiliteServiceAutre}
                />
              )}
            </div>
          </Card>
        )}

        {/* Carte « Mémo Wholesale » — DF uniquement. Compte client et
            Responsabilité direction+service réutilisent les mêmes champs/état
            que la carte DOBB/DXC ci-dessus ; le reste (De/À/Objectif/
            Contexte/Observation/Référence) passe par champsCircuit — cf.
            champsCircuitDfSchema plus haut. Numéro Case et Montant en FCFA
            retirés de cette fiche (24/08/2026, demande explicite) — Numéro
            Case reste disponible côté DOBB/DXC uniquement. */}
        {circuit === "DF" && (
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <Icon nom="doc" taille={17} />
              <h3 className="text-14 font-bold">Mémo d'ajustement Wholesale</h3>
              <Badge ton={BADGE_FICHE_PAR_CIRCUIT.DF.ton}>{BADGE_FICHE_PAR_CIRCUIT.DF.texte}</Badge>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-13 font-bold text-gris800">
                  De (émetteur) <span className="text-rouge">*</span>
                </label>
                <input
                  className="w-full rounded border border-gris300 px-3 py-2 text-13"
                  value={memoDe}
                  onChange={(e) => setMemoDe(e.target.value)}
                />
                <p className="mt-1 text-12 text-gris600">Obligatoire à la soumission.</p>
              </div>
              <div>
                <label className="mb-1 block text-13 font-bold text-gris800">
                  À (destinataire) <span className="text-rouge">*</span>
                </label>
                <input
                  className="w-full rounded border border-gris300 px-3 py-2 text-13"
                  value={memoA}
                  onChange={(e) => setMemoA(e.target.value)}
                />
                <p className="mt-1 text-12 text-gris600">Obligatoire à la soumission.</p>
              </div>
              {/* Ordre exact de la maquette (Priorité 1.1, 20/08/2026) :
                  Opérateur en 3ᵉ position, juste après « À ». <select>
                  admin-configurable (25/08/2026, demande explicite) — texte
                  libre jusqu'ici, promu en référentiel (Operateur), même
                  champ nomClient qu'avant (partagé avec DOBB/DXC « Nom du
                  client »), seule la présentation change. */}
              <div>
                <label className="mb-1 block text-13 font-bold text-gris800">
                  Opérateur <span className="text-rouge">*</span>
                </label>
                <select
                  className="w-full rounded border border-gris300 px-3 py-2 text-13"
                  value={operateurAutreActif ? "__autre" : nomClient}
                  onChange={(e) => (e.target.value === "__autre" ? toggleOperateurAutre(true) : choisirOperateurReel(e.target.value))}
                  disabled={!operateurs}
                >
                  <option value="">— Choisir —</option>
                  {operateurs?.map((o) => (
                    <option key={o.id} value={o.libelle}>
                      {o.libelle}
                    </option>
                  ))}
                  <option value="__autre">Autre (non référencé)</option>
                </select>
                {/* "Autre (non référencé)" (07/09/2026) — même mécanique que
                    Motif/Libellé ci-dessus, sans second champ de stockage :
                    `nomClient` (partagé avec DOBB/DXC « Nom du client ») est
                    déjà une colonne texte libre. */}
                {operateurAutreActif && (
                  <input
                    className="mt-2 w-full rounded border border-gris300 px-3 py-2 text-13"
                    value={nomClient}
                    onChange={(e) => setNomClient(e.target.value)}
                    placeholder="Précisez l'opérateur…"
                  />
                )}
              </div>
              <div>
                <label className="mb-1 block text-13 font-bold text-gris800">Compte client</label>
                <input
                  className="w-full rounded border border-gris300 px-3 py-2 text-13 font-mono"
                  value={compteClient}
                  onChange={(e) => setCompteClient(e.target.value)}
                  placeholder="ex. WS-1142"
                />
              </div>
              <div>
                <label className="mb-1 block text-13 font-bold text-gris800">Référence</label>
                <input
                  className="w-full rounded border border-gris300 px-3 py-2 text-13 font-mono"
                  value={memoReference}
                  onChange={(e) => setMemoReference(e.target.value)}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="mb-1 block text-13 font-bold text-gris800">
                  Objectif <span className="text-rouge">*</span>
                </label>
                <input
                  className="w-full rounded border border-gris300 px-3 py-2 text-13"
                  value={memoObjectif}
                  onChange={(e) => setMemoObjectif(e.target.value)}
                />
                <p className="mt-1 text-12 text-gris600">Obligatoire à la soumission.</p>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="mb-1 block text-13 font-bold text-gris800">
                  Contexte de la réclamation <span className="text-rouge">*</span>
                </label>
                <textarea
                  className="w-full rounded border border-gris300 px-3 py-2 text-13"
                  style={{ minHeight: 56 }}
                  value={memoContexte}
                  onChange={(e) => setMemoContexte(e.target.value)}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="mb-1 block text-13 font-bold text-gris800">Observation</label>
                <textarea
                  className="w-full rounded border border-gris300 px-3 py-2 text-13"
                  style={{ minHeight: 48 }}
                  value={memoObservation}
                  onChange={(e) => setMemoObservation(e.target.value)}
                />
              </div>
              <ResponsabiliteFields
                directions={directions}
                directionRespId={directionRespId}
                choisirDirection={choisirDirection}
                directionSelectionnee={directionSelectionnee}
                serviceRespId={serviceRespId}
                choisirServiceReel={choisirServiceReel}
                serviceAutreActif={serviceAutreActif}
                toggleServiceAutre={toggleServiceAutre}
                responsabiliteServiceAutre={responsabiliteServiceAutre}
                setResponsabiliteServiceAutre={setResponsabiliteServiceAutre}
              />
            </div>
          </Card>
        )}

        {/* Univers FMI / Facteur de dégrèvement — regroupement de la maquette
            (screens1.jsx:463-469, carte "Montant & commentaire" juste avant
            les pièces jointes). */}
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Icon nom="filter" taille={17} />
            <h3 className="text-14 font-bold">Classification</h3>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-13 font-bold text-gris800">
                Univers FMI <span className="text-rouge">*</span>
              </label>
              <select
                className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
                value={universFmiCode}
                onChange={(e) => setUniversFmiCode(e.target.value)}
                disabled={!univers}
              >
                <option value="">— Choisir —</option>
                {univers?.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.libelle}
                  </option>
                ))}
              </select>
              {/* 01/09/2026, demande explicite — obligatoire à la soumission
                  pour les trois circuits, cf. demande-workflow.service.ts
                  (UNIVERS_FMI_REQUIS). */}
              <p className="mt-1 text-12 text-gris600">Obligatoire à la soumission.</p>
            </div>
            <div>
              <label className="mb-1 block text-13 font-bold text-gris800">
                Facteur de dégrèvement <span className="text-rouge">*</span>
              </label>
              <select
                className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
                value={facteurCode}
                onChange={(e) => setFacteurCode(e.target.value)}
                disabled={!facteurs}
              >
                <option value="">— Choisir —</option>
                {facteurs?.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.libelle}
                  </option>
                ))}
              </select>
              {/* 01/09/2026, demande explicite — obligatoire à la soumission
                  pour les trois circuits, cf. demande-workflow.service.ts
                  (FACTEUR_REQUIS). */}
              <p className="mt-1 text-12 text-gris600">Obligatoire à la soumission.</p>
            </div>
          </div>
        </Card>

        {/* Carte « Montant à ajuster » — Priorité 2 (19/08/2026) : remplace
            RechercheNd/SelecteurLignes/Lignes retenues. Saisie libre au
            niveau du dossier (Demande.montantHt), plus commentaire (R14,
            obligatoire à la soumission, jamais à la création — même
            mécanisme cumulable que R13/sous-flux). */}
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Icon nom="calc" taille={17} />
            <h3 className="text-14 font-bold">Montant {circuit === "DF" ? "à ajuster (FCFA)" : "& commentaire"}</h3>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-13 font-bold text-gris800">
                Montant à ajuster HT (FCFA) <span className="text-rouge">*</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  className="w-full rounded border border-gris300 px-3 py-2 text-13 font-mono"
                  type="number"
                  min="0"
                  value={montantHt}
                  onChange={(e) => setMontantHt(e.target.value)}
                  placeholder="0"
                />
                <span className="text-12 text-gris600">FCFA</span>
              </div>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <ChampCorrige nom="Commentaire" champsRejetes={champsRejetes}>
                <label className="mb-1 block text-13 font-bold text-gris800">
                  Commentaire {circuit !== "DF" && <span className="text-rouge">*</span>}
                </label>
                <textarea
                  className="w-full rounded border border-gris300 px-3 py-2 text-13"
                  style={{ minHeight: 56 }}
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                />
                {/* R14 assouplie pour DF (24/08/2026) — reste obligatoire pour
                    DOBB/DXC, cf. demande-workflow.service.ts. */}
                <p className="mt-1 text-12 text-gris600">
                  {circuit === "DF" ? "Facultatif pour DF." : "Obligatoire à la soumission (R14)."}
                </p>
              </ChampCorrige>
            </div>
          </div>
        </Card>

        {/* Pièces justificatives — la maquette (screens1.jsx:479) les affiche
            dès l'écran de création, pour les trois circuits identiquement.
            Le serveur exige un demandeId (POST /api/demandes/{id}/pieces)
            qui n'existe qu'une fois la sauvegarde silencieuse déclenchée —
            même gate que le panneau Taxes et ApercuRoutage. */}
        {demande && (
          <>
            <PiecesTab
              demandeId={demande.demande.id}
              pieces={demande.pieces}
              onChange={(nouvelles) => setDemande((d) => (d ? { ...d, pieces: nouvelles } : d))}
              // Cet écran n'est jamais atteint que par l'initiateur du dossier
              // (création ou mode reprise, cf. CLAUDE.md) — toujours vrai ici,
              // contrairement à DossierDetailScreen où n'importe quel viewer
              // authentifié peut ouvrir un dossier tiers.
              peutModifier
            />
            {/* 07/09/2026, demande explicite — au moins une pièce jointe
                devient obligatoire à la soumission pour DXC (jusqu'ici
                facultative sur ce circuit, R13 ne s'appliquant que si le
                motif choisi porte une pièce afférente obligatoire — cf.
                demande-workflow.service.ts, PIECE_JOINTE_REQUISE). */}
            {circuit === "DXC" && (
              <p className="mt-2 text-12 text-gris600">Au moins une pièce jointe est obligatoire à la soumission (DXC).</p>
            )}
          </>
        )}
      </div>

      {/* Panneau latéral — équivalent du bloc « Calcul automatique / Routage
          prévu / Soumettre » de la maquette (docs/design/screens1.jsx),
          aligné en haut à droite du formulaire plutôt qu'empilé dessous. */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-26">
        {/* « Calcul automatique » (docs/design/screens1.jsx:484-537) — la
            maquette nomme la carte englobante « Calcul automatique »
            (card-head), « Taxes appliquées » n'y est qu'un sous-titre
            interne (tiny muted uppercase) : le h3 de carte était nommé
            « Taxes appliquées » à tort, corrigé ici. Lecture seule tant
            qu'aucun dossier n'existe (rien à quoi rattacher un PATCH
            /taxes) : affiche alors les défauts du circuit. Devient
            interactif dès que `demande` existe. */}
        {!demande && parametresCalcul && (
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <Icon nom="calc" taille={17} />
              <h3 className="text-14 font-bold">Calcul automatique</h3>
            </div>
            <div className="mb-1 text-11 font-bold uppercase tracking-[.05em] text-gris600">Taxes appliquées</div>
            <div className="flex flex-col gap-1 text-13 text-gris700">
              <span>
                TSC {parametresCalcul.tscActiveDefaut ? "appliquée" : "non appliquée"} (
                {(parametresCalcul.tauxTsc * 100).toFixed(2)} %)
              </span>
              <span>
                TVA {parametresCalcul.tvaActiveDefaut ? "appliquée" : "non appliquée"} (
                {(parametresCalcul.tauxTva * 100).toFixed(2)} %)
              </span>
              <span>Assiette TVA par défaut : {parametresCalcul.assietteTvaDefaut === "HT_TSC" ? "HT + TSC" : "HT seul"}</span>
            </div>
            <p className="mt-2 text-12 text-gris600">Modifiable une fois le montant HT saisi.</p>
          </Card>
        )}

        {demande && taxesEdition && (
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <Icon nom="calc" taille={17} />
              <h3 className="text-14 font-bold">Calcul automatique</h3>
              {enregistrementTaxes && <span className="text-12 font-semibold text-gris600">Enregistrement…</span>}
            </div>
            <div className="mb-3 text-11 font-bold uppercase tracking-[.05em] text-gris600">Taxes appliquées</div>

            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={() => mettreAJourTaxes((s) => ({ ...s, tscActive: !s.tscActive }))}
                className={`rounded border px-3 py-1 text-12 font-bold ${
                  taxesEdition.tscActive ? "border-vert700 bg-vertFond text-vertTexteSurClair" : "border-gris300 text-gris700"
                }`}
              >
                TSC {taxesEdition.tscActive ? "active" : "inactive"}
              </button>
              <button
                type="button"
                onClick={() => mettreAJourTaxes((s) => ({ ...s, tvaActive: !s.tvaActive }))}
                className={`rounded border px-3 py-1 text-12 font-bold ${
                  taxesEdition.tvaActive ? "border-vert700 bg-vertFond text-vertTexteSurClair" : "border-gris300 text-gris700"
                }`}
              >
                TVA {taxesEdition.tvaActive ? "active" : "inactive"}
              </button>
            </div>

            {taxesEdition.tscActive && taxesEdition.tvaActive && (
              <div className="mb-3">
                <span className="mb-1 block text-12 font-bold text-gris700">Assiette de la TVA</span>
                <div className="flex flex-col gap-2">
                  <label className="flex items-start gap-2 text-12">
                    <input
                      type="radio"
                      name="assietteTva"
                      className="mt-0.5"
                      checked={taxesEdition.assietteTva === "HT"}
                      onChange={() => mettreAJourTaxes((s) => ({ ...s, assietteTva: "HT" }))}
                    />
                    <span>
                      <strong>Nouvelle règle</strong> — TVA sur le <strong>montant HT</strong>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-12">
                    <input
                      type="radio"
                      name="assietteTva"
                      className="mt-0.5"
                      checked={taxesEdition.assietteTva === "HT_TSC"}
                      onChange={() => mettreAJourTaxes((s) => ({ ...s, assietteTva: "HT_TSC" }))}
                    />
                    <span>
                      <strong>Ancienne règle</strong> — TVA sur <strong>HT + TSC</strong>
                    </span>
                  </label>
                </div>
              </div>
            )}

            <div className="mb-3">
              <label className="flex items-center gap-2 text-13">
                <input
                  type="checkbox"
                  checked={taxesEdition.tscManuelle}
                  onChange={(e) => mettreAJourTaxes((s) => ({ ...s, tscManuelle: e.target.checked }))}
                />
                Saisir la TSC manuellement
              </label>
              {taxesEdition.tscManuelle && (
                <>
                  <input
                    className="mt-1 w-full rounded border border-gris300 px-3 py-2 text-13"
                    type="number"
                    min="0"
                    value={taxesEdition.montantTscManuel}
                    onChange={(e) => mettreAJourTaxes((s) => ({ ...s, montantTscManuel: e.target.value }))}
                  />
                  <p className="mt-1 text-12 text-gris600">Remplace le calcul automatique pour ce dossier.</p>
                </>
              )}
              {!taxesEdition.tscActive && (
                <p className="mt-1 text-12 text-gris600">TSC inactive — une saisie manuelle resterait sans effet (TSC à 0).</p>
              )}
            </div>

            <div className="mb-3">
              <label className="flex items-center gap-2 text-13">
                <input
                  type="checkbox"
                  checked={taxesEdition.tvaManuelle}
                  onChange={(e) => mettreAJourTaxes((s) => ({ ...s, tvaManuelle: e.target.checked }))}
                />
                Saisir la TVA manuellement
              </label>
              {taxesEdition.tvaManuelle && (
                <>
                  <input
                    className="mt-1 w-full rounded border border-gris300 px-3 py-2 text-13"
                    type="number"
                    min="0"
                    value={taxesEdition.montantTvaManuel}
                    onChange={(e) => mettreAJourTaxes((s) => ({ ...s, montantTvaManuel: e.target.value }))}
                  />
                  <p className="mt-1 text-12 text-gris600">Remplace le calcul automatique pour ce dossier.</p>
                </>
              )}
              {!taxesEdition.tvaActive && (
                <p className="mt-1 text-12 text-gris600">TVA inactive — une saisie manuelle resterait sans effet (TVA à 0).</p>
              )}
            </div>

            {(() => {
              const preview = previsualiserTaxes(taxesEdition);
              const tauxTvaPourcent = demande ? (Number(demande.demande.tauxTva) * 100).toFixed(2) : "0";
              const suffixeTva = taxesEdition.tvaManuelle
                ? "saisie manuelle"
                : taxesEdition.assietteTva === "HT_TSC"
                  ? "sur HT+TSC"
                  : "sur HT";
              return (
                <div className="mb-3 flex flex-col gap-1 border-t border-gris200 pt-2 text-13">
                  {preview.assietteAffichable && (
                    <div className="flex justify-between text-12 text-gris500">
                      <span>HT + TSC</span>
                      <Money valeur={preview.assiette ?? 0} />
                    </div>
                  )}
                  <div className="flex justify-between text-gris600">
                    <span>TSC</span>
                    <Money valeur={preview.tsc} />
                  </div>
                  <div className="flex justify-between text-gris600">
                    <span>TVA ({tauxTvaPourcent} %) · {suffixeTva}</span>
                    <Money valeur={preview.tva} />
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>
                      {!taxesEdition.tscActive && !taxesEdition.tvaActive
                        ? "Total HT (aperçu)"
                        : "Total TTC (aperçu)"}
                    </span>
                    <Money valeur={preview.ttc} fort className="text-orange600" />
                  </div>
                </div>
              );
            })()}

            {erreurTaxes && <p className="mb-2 text-13 font-semibold text-rouge700">{erreurTaxes}</p>}
          </Card>
        )}

        {/* Priorité 1.7 (20/08/2026) : structure du panneau visible dès le
            chargement du formulaire, avant toute saisie — vérifié via le
            harnais, la maquette affiche « Routage prévu » avec le
            placeholder "Saisissez un montant HT pour visualiser le
            circuit." dès le premier rendu (screens1.jsx:565), jamais masqué
            en attendant une donnée. Changement de condition d'affichage
            seulement : ApercuRoutage lui-même reste 100% server-computed
            (R11), rien n'est calculé côté client avant que `demande` existe. */}
        {demande ? (
          <ApercuRoutage demandeId={demande.demande.id} declencheur={apercuDeclencheur} circuit={circuit} />
        ) : (
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <Icon nom="flow" taille={17} />
              <h3 className="text-14 font-bold">Routage prévu</h3>
            </div>
            <p className="text-13 text-gris600">Saisissez un montant HT pour visualiser le circuit.</p>
          </Card>
        )}

        {/* Toujours rendu, désactivé tant qu'aucun dossier n'existe — même
            pattern que la maquette (`disabled={!tranche}`, screens1.jsx:569),
            qui n'a jamais retiré le bouton du DOM. `handleSoumettre` garde
            déjà `if (!demande) return;`. */}
        <Card className="p-5">
          {erreursSoumission && (
            <ul className="mb-3 list-disc pl-5 text-13 font-semibold text-rouge700">
              {erreursSoumission.map((v, i) => (
                <li key={i}>{v.message}</li>
              ))}
            </ul>
          )}
          {erreurSoumissionUnique && <p className="mb-3 text-13 font-semibold text-rouge700">{erreurSoumissionUnique}</p>}
          <Button onClick={handleSoumettre} disabled={!demande || soumissionEnCours} taille="grande" pleineLargeur>
            <Icon nom="send" taille={17} />
            {soumissionEnCours ? "Soumission…" : "Soumettre la demande"}
          </Button>
          <p className="mt-2 text-center text-12 text-gris600">Un identifiant unique sera généré et l&apos;action journalisée.</p>
        </Card>
      </div>
    </div>
  );
}

// Extrait de la carte DOBB/DXC puis réutilisé tel quel par la carte mémo DF
// — même champs réels (directionRespId/serviceRespId), même bascule "Autre"
// mutuellement exclusive. Un seul endroit à faire évoluer si cette logique
// change, plutôt que deux copies susceptibles de diverger silencieusement.
interface ResponsabiliteFieldsProps {
  directions: DirectionResponsabiliteVue[] | null;
  directionRespId: string;
  choisirDirection: (id: string) => void;
  directionSelectionnee: DirectionResponsabiliteVue | null;
  serviceRespId: string;
  choisirServiceReel: (id: string) => void;
  serviceAutreActif: boolean;
  toggleServiceAutre: (actif: boolean) => void;
  responsabiliteServiceAutre: string;
  setResponsabiliteServiceAutre: (v: string) => void;
}

function ResponsabiliteFields({
  directions,
  directionRespId,
  choisirDirection,
  directionSelectionnee,
  serviceRespId,
  choisirServiceReel,
  serviceAutreActif,
  toggleServiceAutre,
  responsabiliteServiceAutre,
  setResponsabiliteServiceAutre
}: ResponsabiliteFieldsProps) {
  return (
    <>
      <div>
        <label className="mb-1 block text-13 font-bold text-gris800">Responsabilité — direction</label>
        <select
          className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
          value={directionRespId}
          onChange={(e) => choisirDirection(e.target.value)}
          disabled={!directions || serviceAutreActif}
        >
          <option value="">— Choisir —</option>
          {directions?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.libelle}
            </option>
          ))}
        </select>
      </div>
      {/* Priorité 1.4 (20/08/2026) : PAS une case à cocher « Autre » à côté
          du select — un <select> UNIQUE dont l'une des options est « Autre »
          (vérifié via le harnais, screens1.jsx/screens3.jsx : la maquette
          n'a d'ailleurs elle-même aucun mécanisme de révélation, « Autre »
          y est une simple option statique — le champ de saisie manuelle est
          une capacité réelle du système, ajoutée ici, pas montrée par le
          prototype). Sélectionner cette option déclenche exactement le même
          mécanisme de masquage/vidage déjà construit (PGD-032/SF-PGD-330,
          toggleServiceAutre) — seul le déclencheur change. */}
      <div>
        <label className="mb-1 block text-13 font-bold text-gris800">Responsabilité — service</label>
        <select
          className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
          value={serviceAutreActif ? "__autre" : serviceRespId}
          onChange={(e) => (e.target.value === "__autre" ? toggleServiceAutre(true) : choisirServiceReel(e.target.value))}
          disabled={!directionSelectionnee}
        >
          <option value="">— Choisir —</option>
          {directionSelectionnee?.services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.libelle}
            </option>
          ))}
          <option value="__autre">Autre (non référencé)</option>
        </select>
        {serviceAutreActif && (
          <input
            className="mt-2 w-full rounded border border-gris300 px-3 py-2 text-13"
            value={responsabiliteServiceAutre}
            onChange={(e) => setResponsabiliteServiceAutre(e.target.value)}
            placeholder="Préciser le service"
          />
        )}
      </div>
    </>
  );
}
