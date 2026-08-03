"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { Badge, Icon, Money } from "@pgd/ui";
import type {
  CircuitVue,
  CompteClient,
  DemandeDetail,
  DirectionResponsabiliteVue,
  EnumAssietteTva,
  EnumCircuit,
  EnumLocalisation,
  FacteurDegrevementVue,
  LibelleAjustementVue,
  MotifVue,
  ParametresCalculPublicVue,
  SessionUtilisateur,
  SoumissionReponse,
  UniversFmiVue
} from "@pgd/contracts";
import {
  ApiError,
  creerDemande,
  definirLignes,
  erreurRegleMetierSchema,
  listerCircuitsReferentiel,
  listerDirectionsReferentiel,
  listerFacteursReferentiel,
  listerLibellesAjustementActifs,
  listerMotifsActifs,
  listerUniversFmi,
  modifierTaxes,
  obtenirParametresCalculReferentiel,
  soumettreDemande,
  type ErreurRegleMetier
} from "@/lib/api";
import { RechercheCompte } from "./RechercheCompte";
import { RechercheNd } from "./RechercheNd";
import { SelecteurLignes, montantLigneParDefaut, montantLigneValide, type LigneLocale } from "./SelecteurLignes";
import { ApercuRoutage } from "./ApercuRoutage";

const CIRCUITS: EnumCircuit[] = ["DOBB", "DXC", "DF"];

// Segment associé à chaque circuit (table CLAUDE.md « Projet ») — libellé
// d'affichage statique, pas une règle métier : n'influence ni le routage ni
// le calcul, sert uniquement le badge visuel déjà présent dans la maquette
// (docs/design/screens1.jsx, badge "DOBB · B2B" etc.).
const SEGMENT_PAR_CIRCUIT: Record<EnumCircuit, string> = { DOBB: "B2B", DXC: "B2C", DF: "Wholesale" };

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

// Carte « Mémo Wholesale » (Phase 10.6, étape E, DF uniquement) — aucun de
// ces champs n'a de colonne dédiée dans creerDemandeRequeteSchema (vérifié,
// zéro occurrence de memoDe/memoA/memoObjectif/memoContexte/memoObservation
// dans packages/contracts/src/demande.ts). Persistés via `champsCircuit`
// (sac JSON, demande.service.ts:60/300/404 — prévu explicitement pour « les
// champs_circuit non promus en colonnes »). Le stockage non typé côté
// serveur n'est pas une raison de saisir sans garantie : ce schéma est la
// SEULE validation de forme sur ces champs avant l'envoi.
const champsCircuitDfSchema = z.object({
  memoDe: z.string().trim().optional(),
  memoA: z.string().trim().optional(),
  memoObjectif: z.string().trim().optional(),
  memoContexte: z.string().trim().min(1, "Contexte de la réclamation requis (mémo DF)."),
  memoObservation: z.string().trim().optional(),
  // Catégorie 4 (docs/design/DIVERGENCES.md) — la maquette (screens1.jsx:419)
  // libelle ce champ "Montant en € (optionnel)" avec un suffixe "€" et un
  // hint "Référence devise opérateur." Le système n'opère qu'en XOF
  // (ParametreCalcul.devise, "XOF" par défaut, vérifié en base) : un texte
  // "€" porté tel quel serait trompeur une fois réel, exactement comme le
  // pied de page de LoginScreen affirmant une authentification simulée sur
  // un système qui authentifie réellement. Renommé montantXof / « Montant
  // en FCFA » — aucun autre champ de ce bloc ne référence l'euro (vérifié,
  // grep dédié sur tout screens1.jsx : une seule occurrence, ce champ).
  montantXof: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? Number(v.trim()) : undefined))
    .pipe(z.number().nonnegative("Montant invalide.").optional())
});
type ChampsCircuitDf = z.infer<typeof champsCircuitDfSchema>;

export interface NouvelleDemandeScreenProps {
  utilisateur: SessionUtilisateur;
}

// Pas de POST /api/demandes au premier écran du formulaire : trouvé en
// vérification live (Phase 9.2) qu'un BROUILLON créé ainsi pollue la famille
// KPI « reçus » (RECUS_VOLUME/RECUS_MONTANT_*, aucun filtre de statut côté
// KpiEngineService — vérifié, et volontaire : kpi-engine.integration.spec.ts
// l'exige) et qu'il n'existe AUCUN moyen réel de le supprimer (`abandonner()`
// exclut explicitement BROUILLON — DEMANDE_NON_ELIGIBLE, vérifié en direct).
// Un BROUILLON créé puis jamais retouché est donc permanent. Repousser la
// création au premier "Enregistrer les lignes" (au lieu du formulaire
// minimal) réduit fortement — sans rien changer côté serveur — le nombre de
// brouillons orphelins : fermer l'onglet avant d'avoir défini une seule
// ligne ne laisse plus aucune trace. La suppression réelle d'un brouillon
// reste une question ouverte (CLAUDE.md), pas résolue ici.
// Date du jour au format YYYY-MM-DD (fuseau local, pas UTC) — valeur par
// défaut d'un <input type="date">, jamais toISOString().slice(0,10) qui
// bascule sur UTC et peut afficher la veille selon l'heure/le fuseau.
function dateDuJourLocale(): string {
  const d = new Date();
  const mois = String(d.getMonth() + 1).padStart(2, "0");
  const jour = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mois}-${jour}`;
}

interface TaxesEdition {
  tscActive: boolean;
  tvaActive: boolean;
  assietteTva: EnumAssietteTva;
  tscManuelle: boolean;
  montantTscManuel: string;
  tvaManuelle: boolean;
  montantTvaManuel: string;
}

export function NouvelleDemandeScreen({ utilisateur }: NouvelleDemandeScreenProps) {
  const [circuit, setCircuit] = useState<EnumCircuit>(() => circuitParDefaut(utilisateur.roles));
  const [nomClient, setNomClient] = useState("");
  const [commentaire, setCommentaire] = useState("");
  // Inventaire champ par champ (Phase 10.6sexies) — "Date de demande" éditable
  // de la maquette, requise ; pré-remplie à aujourd'hui, modifiable avant la
  // création du dossier (creerDemandeRequeteSchema.dateDemande, optionnel côté
  // serveur — défaut now() si absent). "Date de saisie" (creeLe) est distincte,
  // immuable, affichée en lecture seule une fois le dossier créé.
  const [dateDemande, setDateDemande] = useState(dateDuJourLocale);
  // PGD-032/SF-PGD-330 — jusqu'à l'étape C/D (Phase 10.6), aucun endpoint ne
  // listait les services référentiels réels : seul le chemin "Autre" (texte
  // libre) était actionnable. `GET /api/referentiels/directions` (Phase A)
  // ouvre désormais un vrai select ci-dessous ; "Autre" reste pour le cas non
  // référencé, les deux sont mutuellement exclusifs (choisir l'un vide
  // l'autre — le serveur l'impose déjà via `normaliserServiceResponsable`,
  // repris ici côté UI pour ne jamais donner l'impression que les deux sont
  // actifs à la fois). Vérifié en direct (Phase 9.2) : décocher puis recocher
  // "Autre" rouvre un champ vide, pas la valeur précédente.
  const [serviceAutreActif, setServiceAutreActif] = useState(false);
  const [responsabiliteServiceAutre, setResponsabiliteServiceAutre] = useState("");

  // Carte « Identification » (Phase 10.6, étape B) — champs communs aux trois
  // circuits, tous déjà présents dans creerDemandeRequeteSchema (packages/
  // contracts/src/demande.ts), aucun n'était câblé avant ce tour. Aucune
  // validation conditionnelle par circuit côté serveur (vérifié — le schéma
  // ne porte ni .refine() ni .superRefine(), chaque champ est .optional()
  // uniformément) : rien à reproduire ici au-delà de ce que le schéma exige
  // déjà (seul nomClient est requis, inchangé).
  const [agentInitiateur, setAgentInitiateur] = useState(utilisateur.nom);
  const [matriculeInitiateur, setMatriculeInitiateur] = useState("");
  const [agentSaisie, setAgentSaisie] = useState(utilisateur.nom);
  const [sousFlux, setSousFlux] = useState("");
  const [libelle, setLibelle] = useState("");
  const [motifId, setMotifId] = useState("");
  const [universFmiCode, setUniversFmiCode] = useState("");
  const [facteurCode, setFacteurCode] = useState("");

  const [motifs, setMotifs] = useState<MotifVue[] | null>(null);
  const [univers, setUnivers] = useState<UniversFmiVue[] | null>(null);
  const [facteurs, setFacteurs] = useState<FacteurDegrevementVue[] | null>(null);
  const [libellesAjustement, setLibellesAjustement] = useState<LibelleAjustementVue[] | null>(null);

  // Univers/facteurs sont indépendants du circuit (Phase A) — un seul appel.
  useEffect(() => {
    void listerUniversFmi().then(setUnivers);
    void listerFacteursReferentiel().then(setFacteurs);
  }, []);

  // Motifs sont scopés au circuit (GET /api/referentiels/motifs?circuit=) —
  // rechargés à chaque changement de circuit ; une sélection déjà faite pour
  // l'ancien circuit n'a aucune raison de rester valide pour le nouveau.
  useEffect(() => {
    setMotifId("");
    setMotifs(null);
    void listerMotifsActifs(circuit).then(setMotifs);
  }, [circuit]);

  // LIBELLE (docs/10 remarques DOBB #3 / DXC #16, Phase 10.6ter) — même
  // mécanique que Motif : référentiel réel scopé au circuit, jamais un
  // tableau codé en dur (règle non négociable 1 / R11, cf. CLAUDE.md
  // « Configurabilité complète »). DF exclu côté API (aucun libellé seedé
  // pour ce circuit — son formulaire utilise « Objet », un texte libre).
  useEffect(() => {
    setLibelle("");
    setLibellesAjustement(null);
    void listerLibellesAjustementActifs(circuit).then(setLibellesAjustement);
  }, [circuit]);

  const motifSelectionne = motifs?.find((m) => m.id === motifId) ?? null;

  // Carte « DOBB/DXC » (Phase 10.6, étape C/D) — champs partagés par les deux
  // circuits (compteClient/formuleAbonnement/recurrentMensuel/direction+
  // service), plus les champs propres à DOBB seul (localisation/canalRemontee/
  // dates réception/numeroAppel). DF exclu : sa maquette ne montre aucun de
  // ces champs (mémo distinct, cf. « E », question ouverte séparée) — pas de
  // règle serveur qui les interdise pour DF, mais aucune source ne les y
  // montre non plus, donc pas construits pour DF ici.
  const [compteClient, setCompteClient] = useState("");
  const [formuleAbonnement, setFormuleAbonnement] = useState("");
  const [recurrentMensuel, setRecurrentMensuel] = useState(false);
  const [directionRespId, setDirectionRespId] = useState("");
  const [serviceRespId, setServiceRespId] = useState("");
  const [localisation, setLocalisation] = useState<EnumLocalisation | "">("");
  const [canalRemontee, setCanalRemontee] = useState("");
  const [dateReceptionBo, setDateReceptionBo] = useState("");
  const [dateReceptionOci, setDateReceptionOci] = useState("");
  const [numeroAppel, setNumeroAppel] = useState("");

  const [directions, setDirections] = useState<DirectionResponsabiliteVue[] | null>(null);

  // Indépendant du circuit (Phase A) — un seul appel, même principe qu'univers/facteurs.
  useEffect(() => {
    void listerDirectionsReferentiel().then(setDirections);
  }, []);

  // Inventaire champ par champ (Phase 10.6sexies) — badge de code process
  // ("PO2_B-17", etc.) sur la carte Identification, absent avant ce tour.
  // Circuit.processCode est déjà une donnée admin réelle (AdminCircuitsController,
  // ModifierCircuitRequete.processCode) : jamais un tableau codé en dur ici,
  // même principe de configurabilité complète que le reste de l'écran.
  const [circuits, setCircuits] = useState<CircuitVue[] | null>(null);
  useEffect(() => {
    void listerCircuitsReferentiel().then(setCircuits);
  }, []);
  const processCode = circuits?.find((c) => c.code === circuit)?.processCode ?? null;

  const directionSelectionnee = directions?.find((d) => d.id === directionRespId) ?? null;

  // Carte « Mémo Wholesale » (Phase 10.6, étape E) — DF uniquement, cf.
  // champsCircuitDfSchema ci-dessus pour la validation avant envoi.
  const [memoDe, setMemoDe] = useState(utilisateur.nom);
  const [memoA, setMemoA] = useState("Service Fraude & Revenue Assurance");
  const [memoObjectif, setMemoObjectif] = useState("Soumettre l'ajustement au contrôle FRA");
  const [memoContexte, setMemoContexte] = useState("");
  const [memoObservation, setMemoObservation] = useState("");
  const [montantXof, setMontantXof] = useState("");

  // « Taxes appliquées » (panneau latéral) — lecture seule, jamais un
  // override : point 2 de la décomposition, cf. commit dédié
  // (GET /api/referentiels/parametres-calcul/:circuit, projection à 4
  // champs). Rechargé à chaque changement de circuit, indépendant de
  // `demande` (une donnée de circuit, pas de dossier).
  const [parametresCalcul, setParametresCalcul] = useState<ParametresCalculPublicVue | null>(null);
  useEffect(() => {
    setParametresCalcul(null);
    void obtenirParametresCalculReferentiel(circuit)
      .then(setParametresCalcul)
      .catch(() => setParametresCalcul(null));
  }, [circuit]);

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

  const [demande, setDemande] = useState<DemandeDetail | null>(null);
  const [lignesLocales, setLignesLocales] = useState<LigneLocale[]>([]);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreurEnregistrement, setErreurEnregistrement] = useState<string | null>(null);

  // Décision explicite (feu vert utilisateur, résolution du mécanisme
  // « Prévisualiser ») — l'aperçu de routage se relance automatiquement à
  // chaque sauvegarde réussie qui touche un champ pertinent au routage
  // (lignes, taxes), jamais à chaque frappe. Compteur opaque passé à
  // ApercuRoutage : tout incrément relance previsualiser() côté enfant, sauf
  // au tout premier montage du panneau (cf. ApercuRoutage.tsx, premierRendu)
  // — le bouton manuel "Prévisualiser" reste nécessaire pour ce premier
  // affichage, et disponible ensuite comme déclencheur supplémentaire.
  const [apercuDeclencheur, setApercuDeclencheur] = useState(0);

  const [soumissionEnCours, setSoumissionEnCours] = useState(false);
  const [soumissionReussie, setSoumissionReussie] = useState<SoumissionReponse | null>(null);
  const [erreursSoumission, setErreursSoumission] = useState<ErreurRegleMetier[] | null>(null);
  const [erreurSoumissionUnique, setErreurSoumissionUnique] = useState<string | null>(null);

  // Panneau « Taxes appliquées » (Phase 10.6septies, confirmation métier
  // docs/10 DOBB #1/#2/#6) — interactif dès qu'un dossier existe, câblé sur
  // PATCH /api/demandes/{id}/taxes (DemandeWorkflowService.modifierTaxes, R25).
  // Resynchronisé depuis le serveur à chaque changement d'objet `demande`
  // (création initiale, ré-enregistrement de lignes, sauvegarde des taxes
  // elle-même) — jamais pendant la frappe, `demande` ne change que sur ces
  // trois événements explicites, aucun risque d'écraser une saisie en cours.
  const [taxesEdition, setTaxesEdition] = useState<TaxesEdition | null>(null);
  const [enregistrementTaxes, setEnregistrementTaxes] = useState(false);
  const [erreurTaxes, setErreurTaxes] = useState<string | null>(null);

  useEffect(() => {
    if (!demande) {
      setTaxesEdition(null);
      return;
    }
    setTaxesEdition({
      tscActive: demande.demande.tscActive,
      tvaActive: demande.demande.tvaActive,
      assietteTva: demande.demande.assietteTva,
      tscManuelle: demande.demande.tscManuelle,
      montantTscManuel: demande.demande.montantTscManuel != null ? String(demande.demande.montantTscManuel) : "",
      tvaManuelle: demande.demande.tvaManuelle,
      montantTvaManuel: demande.demande.montantTvaManuel != null ? String(demande.demande.montantTvaManuel) : ""
    });
  }, [demande]);

  // Aperçu client — reproduit la formule EXACTE de MontantService.calculer()
  // (apps/api/src/modules/demandes/services/montant.service.ts), vérifiée
  // avant d'être ajoutée ici plutôt que supposée. tauxTsc/tauxTva viennent du
  // DOSSIER (demande.demande, figés à sa création/dernier recalcul), jamais
  // de ParametresCalculPublicVue (le défaut COURANT du circuit, potentiellement
  // différent). Purement illustratif tant que "Enregistrer" n'a pas été
  // cliqué — les montants réellement appliqués restent demande.demande.montantTsc/Tva/Ttc.
  function previsualiserTaxes(e: TaxesEdition) {
    if (!demande) return { tsc: 0, tva: 0, ttc: 0 };
    const ht = demande.demande.montantHt;
    const tauxTsc = demande.demande.tauxTsc;
    const tauxTva = demande.demande.tauxTva;
    const tsc = e.tscManuelle
      ? Math.max(0, Number(e.montantTscManuel) || 0)
      : e.tscActive
        ? Math.max(0, Math.round(ht * tauxTsc * 100) / 100)
        : 0;
    const assiette = e.assietteTva === "HT_TSC" ? ht + tsc : ht;
    const tva = e.tvaManuelle
      ? Math.max(0, Number(e.montantTvaManuel) || 0)
      : e.tvaActive
        ? Math.max(0, Math.round(assiette * tauxTva * 100) / 100)
        : 0;
    return { tsc, tva, ttc: Math.max(0, ht + tsc + tva) };
  }

  async function handleEnregistrerTaxes() {
    if (!demande || !taxesEdition) return;
    setEnregistrementTaxes(true);
    setErreurTaxes(null);
    try {
      const misAJour = await modifierTaxes(demande.demande.id, {
        tscActive: taxesEdition.tscActive,
        tvaActive: taxesEdition.tvaActive,
        assietteTva: taxesEdition.assietteTva,
        tscManuelle: taxesEdition.tscManuelle,
        montantTscManuel: taxesEdition.tscManuelle ? Math.max(0, Number(taxesEdition.montantTscManuel) || 0) : null,
        tvaManuelle: taxesEdition.tvaManuelle,
        montantTvaManuel: taxesEdition.tvaManuelle ? Math.max(0, Number(taxesEdition.montantTvaManuel) || 0) : null
      });
      setDemande(misAJour);
      setApercuDeclencheur((n) => n + 1);
    } catch (e) {
      setErreurTaxes(e instanceof ApiError ? e.message : "Erreur inattendue.");
    } finally {
      setEnregistrementTaxes(false);
    }
  }

  // onBlur du champ « Montant HT » d'une ligne (résolution du mécanisme
  // Prévisualiser, feu vert utilisateur) — ne sauvegarde QUE si le dossier
  // existe déjà : avant la première sauvegarde explicite, créer le dossier
  // silencieusement au blur reproduirait exactement le risque de brouillons
  // orphelins déjà écarté par la décision de repousser la création au premier
  // "Enregistrer les lignes" (cf. commentaire au-dessus du composant).
  async function handleBlurMontantHt() {
    if (!demande) return;
    if (lignesLocales.length === 0 || !lignesLocales.every((l) => l.formule !== null && montantLigneValide(l.montant))) return;
    await handleEnregistrerLignes();
  }

  function toggleServiceAutre(actif: boolean) {
    setServiceAutreActif(actif);
    // "masqué ET vidé" (PGD-032) : une valeur résiduelle non visible qui
    // partirait quand même à la soumission serait invisible à l'œil, visible
    // seulement en mesurant — donc on la vide ici, pas seulement en CSS.
    if (!actif) setResponsabiliteServiceAutre("");
    // Mutuellement exclusif avec un service réel (étape C/D) — activer
    // "Autre" invalide toute sélection réelle en cours, même logique que
    // choisirServiceReel dans l'autre sens.
    else setServiceRespId("");
  }

  const infosCompletes = nomClient.trim().length > 0 && commentaire.trim().length > 0;

  async function handleEnregistrerLignes() {
    if (lignesLocales.length === 0 || !lignesLocales.every((l) => l.formule !== null)) return;
    if (!demande && !infosCompletes) {
      setErreurEnregistrement("Nom du client et commentaire requis avant d'enregistrer des lignes.");
      return;
    }

    // Validation DF avant tout envoi — mirror des deux champs que la
    // maquette elle-même traite comme requis (screens1.jsx:203-204,
    // validate() : memoObjet et memoContexte). `libelle` reste .optional()
    // côté serveur (aucune règle serveur nouvelle inventée ici) : ce n'est
    // qu'un confort d'affichage avant de tenter la création, pas une
    // garantie — la seule garantie réelle sur ce champ reste celle déjà en
    // vigueur côté serveur (aucune, pour l'instant).
    let champsCircuit: ChampsCircuitDf | undefined;
    if (!demande && circuit === "DF") {
      if (!libelle.trim()) {
        setErreurEnregistrement("Objet requis (mémo DF).");
        return;
      }
      const validation = champsCircuitDfSchema.safeParse({
        memoDe, memoA, memoObjectif, memoContexte, memoObservation, montantXof
      });
      if (!validation.success) {
        setErreurEnregistrement(validation.error.issues[0]?.message ?? "Champs du mémo invalides.");
        return;
      }
      champsCircuit = validation.data;
    }

    setEnregistrement(true);
    setErreurEnregistrement(null);
    try {
      let demandeActuelle = demande;
      if (!demandeActuelle) {
        demandeActuelle = await creerDemande({
          circuit,
          dateDemande: dateDemande || undefined,
          nomClient: nomClient.trim(),
          commentaire: commentaire.trim(),
          responsabiliteServiceAutre:
            (circuit === "DOBB" || circuit === "DXC" || circuit === "DF") && serviceAutreActif
              ? responsabiliteServiceAutre.trim()
              : undefined,
          agentInitiateur: agentInitiateur.trim() || undefined,
          matriculeInitiateur: matriculeInitiateur.trim() || undefined,
          agentSaisie: agentSaisie.trim() || undefined,
          sousFlux: sousFlux.trim() || undefined,
          libelle: libelle.trim() || undefined,
          motifId: motifId || undefined,
          universFmiCode: universFmiCode || undefined,
          facteurCode: facteurCode || undefined,
          compteClient: compteClient.trim() || undefined,
          formuleAbonnement: formuleAbonnement.trim() || undefined,
          recurrentMensuel: (circuit === "DOBB" || circuit === "DXC") && recurrentMensuel ? true : undefined,
          directionRespId: directionRespId || undefined,
          serviceRespId: serviceRespId || undefined,
          localisation: circuit === "DOBB" && localisation ? localisation : undefined,
          canalRemontee: circuit === "DOBB" ? canalRemontee.trim() || undefined : undefined,
          dateReceptionBo: circuit === "DOBB" ? dateReceptionBo || undefined : undefined,
          dateReceptionOci: circuit === "DOBB" ? dateReceptionOci || undefined : undefined,
          numeroAppel: circuit === "DOBB" ? numeroAppel.trim() || undefined : undefined,
          champsCircuit: circuit === "DF" ? champsCircuit : undefined
        });
      }
      const misAJour = await definirLignes(demandeActuelle.demande.id, {
        lignes: lignesLocales.map((l) => ({
          ligneId: l.contexte.ligne.id,
          formuleId: l.formule!.formuleId,
          recurrent: l.formule!.recurrent,
          // Jamais de prorata calculé ici — le serveur (DemandeLigneService.
          // definirLignes) fait foi sur le montant, que ce soit un
          // montantHtLigne direct ou un calcul depuis les deux dates
          // (SF-PGD-062, R11). Un seul des deux modes est envoyé par ligne.
          ...(l.montant.mode === "periode"
            ? { debutPeriodeContestee: l.montant.debutPeriodeContestee, finPeriodeContestee: l.montant.finPeriodeContestee }
            : { montantHtLigne: Number(l.montant.montantHtLigne) })
        }))
      });
      setDemande(misAJour);
      setApercuDeclencheur((n) => n + 1);
    } catch (e) {
      setErreurEnregistrement(e instanceof ApiError ? e.message : "Erreur inattendue.");
    } finally {
      setEnregistrement(false);
    }
  }

  async function handleSoumettre() {
    if (!demande) return;
    setSoumissionEnCours(true);
    setErreursSoumission(null);
    setErreurSoumissionUnique(null);
    try {
      const reponse = await soumettreDemande(demande.demande.id);
      setSoumissionReussie(reponse);
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

  if (soumissionReussie) {
    return (
      <div className="rounded-6 border border-gris200 bg-blanc p-5 text-13">
        Demande soumise — statut <span className="font-bold">{soumissionReussie.statut}</span>, étape courante{" "}
        {soumissionReussie.etapeCourante}.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-4">
      <div className="rounded-6 border border-gris200 bg-blanc p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon nom="doc" taille={17} />
            <h3 className="text-14 font-bold">
              {demande ? `Brouillon réf. ${demande.demande.reference}` : "Nouvelle fiche d'ajustement"}
            </h3>
          </div>
          <span className="rounded-full border border-gris200 bg-gris50 px-3 py-1 text-12 font-bold text-gris700">
            {circuit} · {SEGMENT_PAR_CIRCUIT[circuit]}
          </span>
        </div>
        {!demande && (
          <p className="mb-3 text-12 text-gris600">
            Rien n'est encore enregistré côté serveur — la demande n'est créée qu'au premier enregistrement de lignes.
          </p>
        )}

        <label className="mb-1 block text-13 font-bold text-gris800">Circuit</label>
        <select
          className="mb-3 w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
          value={circuit}
          onChange={(e) => setCircuit(e.target.value as EnumCircuit)}
          disabled={!!demande}
        >
          {CIRCUITS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-13 font-bold text-gris800">
          {circuit === "DF" ? "Opérateur" : "Nom du client"} <span className="text-rouge">*</span>
        </label>
        <input
          className="mb-3 w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
          value={nomClient}
          onChange={(e) => setNomClient(e.target.value)}
          disabled={!!demande}
        />

        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-13 font-bold text-gris800">Date de demande</label>
            <input
              className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
              type="date"
              value={dateDemande}
              onChange={(e) => setDateDemande(e.target.value)}
              disabled={!!demande}
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
        </div>

        <label className="mb-1 block text-13 font-bold text-gris800">
          Commentaire <span className="text-rouge">*</span>
        </label>
        <textarea
          className="mb-1 w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
          style={{ minHeight: 56 }}
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          disabled={!!demande}
        />
        <p className="text-12 text-gris600">Obligatoire à la soumission (R14).</p>
      </div>

      {/* Carte « Identification » (Phase 10.6, étape B) — communs aux trois
          circuits, cf. commentaire d'état ci-dessus. Motif scopé au circuit
          courant ; univers/facteur indépendants du circuit. */}
      <div className="rounded-6 border border-gris200 bg-blanc p-5">
        <div className="mb-3 flex items-center gap-2">
          <Icon nom="building" taille={17} />
          <h3 className="text-14 font-bold">Identification</h3>
          {processCode && (
            <span className="ml-auto">
              <Badge ton="neutre">{processCode}</Badge>
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-13 font-bold text-gris800">Agent initiateur</label>
            <input
              className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
              value={agentInitiateur}
              onChange={(e) => setAgentInitiateur(e.target.value)}
              disabled={!!demande}
            />
          </div>
          <div>
            <label className="mb-1 block text-13 font-bold text-gris800">Matricule / réf. agent initiateur</label>
            <input
              className="w-full rounded border border-gris300 px-3 py-2 text-13 font-mono disabled:opacity-60"
              value={matriculeInitiateur}
              onChange={(e) => setMatriculeInitiateur(e.target.value)}
              placeholder="ex. M-2041"
              disabled={!!demande}
            />
          </div>
          <div>
            <label className="mb-1 block text-13 font-bold text-gris800">Agent de saisie</label>
            <input
              className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
              value={agentSaisie}
              onChange={(e) => setAgentSaisie(e.target.value)}
              disabled={!!demande}
            />
          </div>
          <div>
            <label className="mb-1 block text-13 font-bold text-gris800">Sous-flux</label>
            <input
              className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
              value={sousFlux}
              onChange={(e) => setSousFlux(e.target.value)}
              disabled={!!demande}
            />
          </div>
          <div>
            <label className="mb-1 block text-13 font-bold text-gris800">Motif</label>
            <select
              className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
              value={motifId}
              onChange={(e) => setMotifId(e.target.value)}
              disabled={!!demande || !motifs}
            >
              <option value="">— Choisir —</option>
              {motifs?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.libelle}
                </option>
              ))}
            </select>
            {/* R13 — pièces obligatoires du motif, affichées avant l'échec de
                soumission plutôt que découvertes au 422 (donnée déjà
                disponible via MotifVue.piecesAfferentes, Phase A). */}
            {motifSelectionne && motifSelectionne.piecesAfferentes.some((p) => p.obligatoire) && (
              <p className="mt-1 text-12 text-gris600">
                Pièces obligatoires :{" "}
                {motifSelectionne.piecesAfferentes
                  .filter((p) => p.obligatoire)
                  .map((p) => p.libelle)
                  .join(", ")}
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-13 font-bold text-gris800">
              {circuit === "DF" ? (
                <>
                  Objet <span className="text-rouge">*</span>
                </>
              ) : (
                "Libellé"
              )}
            </label>
            {circuit === "DF" ? (
              <input
                className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                disabled={!!demande}
              />
            ) : (
              <select
                className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                disabled={!!demande || !libellesAjustement}
              >
                <option value="">— Choisir —</option>
                {libellesAjustement?.map((l) => (
                  <option key={l.id} value={l.libelle}>
                    {l.libelle}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="mb-1 block text-13 font-bold text-gris800">Univers FMI</label>
            <select
              className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
              value={universFmiCode}
              onChange={(e) => setUniversFmiCode(e.target.value)}
              disabled={!!demande || !univers}
            >
              <option value="">— Choisir —</option>
              {univers?.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.libelle}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-13 font-bold text-gris800">Facteur de dégrèvement</label>
            <select
              className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
              value={facteurCode}
              onChange={(e) => setFacteurCode(e.target.value)}
              disabled={!!demande || !facteurs}
            >
              <option value="">— Choisir —</option>
              {facteurs?.map((f) => (
                <option key={f.code} value={f.code}>
                  {f.libelle}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Carte « DOBB/DXC » (Phase 10.6, étape C/D) — champs partagés par les
          deux circuits + champs propres à DOBB seul, cf. commentaire d'état
          ci-dessus. Absente pour DF (aucune source ne les y montre). */}
      {(circuit === "DOBB" || circuit === "DXC") && (
        <div className="rounded-6 border border-gris200 bg-blanc p-5">
          <div className="mb-3 flex items-center gap-2">
            <Icon nom="flow" taille={17} />
            <h3 className="text-14 font-bold">{circuit === "DOBB" ? "Fiche d'ajustement B2B" : "Fiche d'ajustement B2C"}</h3>
            <Badge ton={BADGE_FICHE_PAR_CIRCUIT[circuit].ton}>{BADGE_FICHE_PAR_CIRCUIT[circuit].texte}</Badge>
          </div>

          {!demande && (
            <div className="mb-3">
              <RechercheCompte onCompteTrouve={appliquerCompteTrouve} />
              {/* DOBB (docs/10 #9) demande que la clé de recherche soit le N°
                  de Case JADE plutôt que le N° de compte — deux clés
                  différentes, même mécanisme. `numeroCase` n'existe nulle
                  part dans le schéma (JadePort, en attente d'arbitrage) :
                  recherche par N° de compte seulement pour l'instant, pas de
                  recherche par case simulée. */}
              {circuit === "DOBB" && (
                <p className="mt-1 text-12 text-gris600">
                  Recherche par N° de compte pour l'instant — la recherche par N° de Case JADE viendra s'ajouter une fois
                  ce champ construit.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-13 font-bold text-gris800">Compte client</label>
              <input
                className="w-full rounded border border-gris300 px-3 py-2 text-13 font-mono disabled:opacity-60"
                value={compteClient}
                onChange={(e) => setCompteClient(e.target.value)}
                placeholder={circuit === "DOBB" ? "ex. B2B-880142" : "ex. B2C-4471902"}
                disabled={!!demande}
              />
            </div>
            <div>
              <label className="mb-1 block text-13 font-bold text-gris800">
                {circuit === "DOBB" ? "Formule d'abonnement" : "Formule Internet"}
              </label>
              <input
                className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
                value={formuleAbonnement}
                onChange={(e) => setFormuleAbonnement(e.target.value)}
                disabled={!!demande}
              />
            </div>

            {circuit === "DOBB" && (
              <>
                <div>
                  <label className="mb-1 block text-13 font-bold text-gris800">Numéro d'appel</label>
                  <input
                    className="w-full rounded border border-gris300 px-3 py-2 text-13"
                    value={numeroAppel}
                    onChange={(e) => setNumeroAppel(e.target.value)}
                    placeholder="ex. 27 22 00 00 00"
                    disabled={!!demande}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-13 font-bold text-gris800">Localisation</label>
                  <select
                    className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
                    value={localisation}
                    onChange={(e) => setLocalisation(e.target.value as EnumLocalisation | "")}
                    disabled={!!demande}
                  >
                    <option value="">— Choisir —</option>
                    <option value="NATIONAL">National</option>
                    <option value="INTERNATIONAL">International</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-13 font-bold text-gris800">Canal de remontée</label>
                  <input
                    className="w-full rounded border border-gris300 px-3 py-2 text-13"
                    value={canalRemontee}
                    onChange={(e) => setCanalRemontee(e.target.value)}
                    disabled={!!demande}
                  />
                </div>
                <div />
                <div>
                  <label className="mb-1 block text-13 font-bold text-gris800">Date réception BO</label>
                  <input
                    className="w-full rounded border border-gris300 px-3 py-2 text-13"
                    type="date"
                    value={dateReceptionBo}
                    onChange={(e) => setDateReceptionBo(e.target.value)}
                    disabled={!!demande}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-13 font-bold text-gris800">Date réception OCI</label>
                  <input
                    className="w-full rounded border border-gris300 px-3 py-2 text-13"
                    type="date"
                    value={dateReceptionOci}
                    onChange={(e) => setDateReceptionOci(e.target.value)}
                    disabled={!!demande}
                  />
                </div>
              </>
            )}

            <div>
              <label className="flex items-center gap-2 text-13 font-bold text-gris800">
                <input
                  type="checkbox"
                  checked={recurrentMensuel}
                  onChange={(e) => setRecurrentMensuel(e.target.checked)}
                  disabled={!!demande}
                />
                Montant récurrent mensuel
              </label>
            </div>
            <div />

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
              disabled={!!demande}
            />
          </div>
        </div>
      )}

      {/* Carte « Mémo Wholesale » (Phase 10.6, étape E) — DF uniquement.
          Compte/référence et Responsabilité direction+service réutilisent
          les mêmes champs/état que la carte DOBB/DXC ci-dessus (compteClient/
          directionRespId/serviceRespId existent déjà, seule leur visibilité
          était limitée à DOBB/DXC) ; le reste (De/À/Objectif/Contexte/
          Observation/Montant) n'a pas de colonne dédiée et passe par
          champsCircuit — cf. champsCircuitDfSchema plus haut. */}
      {circuit === "DF" && (
        <div className="rounded-6 border border-gris200 bg-blanc p-5">
          <div className="mb-3 flex items-center gap-2">
            <Icon nom="doc" taille={17} />
            <h3 className="text-14 font-bold">Mémo d'ajustement Wholesale</h3>
            <Badge ton={BADGE_FICHE_PAR_CIRCUIT.DF.ton}>{BADGE_FICHE_PAR_CIRCUIT.DF.texte}</Badge>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-13 font-bold text-gris800">De (émetteur)</label>
              <input
                className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
                value={memoDe}
                onChange={(e) => setMemoDe(e.target.value)}
                disabled={!!demande}
              />
            </div>
            <div>
              <label className="mb-1 block text-13 font-bold text-gris800">À (destinataire)</label>
              <input
                className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
                value={memoA}
                onChange={(e) => setMemoA(e.target.value)}
                disabled={!!demande}
              />
            </div>
            <div>
              <label className="mb-1 block text-13 font-bold text-gris800">Compte / référence</label>
              <input
                className="w-full rounded border border-gris300 px-3 py-2 text-13 font-mono disabled:opacity-60"
                value={compteClient}
                onChange={(e) => setCompteClient(e.target.value)}
                placeholder="ex. WS-1142"
                disabled={!!demande}
              />
            </div>
            <div>
              <label className="mb-1 block text-13 font-bold text-gris800">Montant en FCFA (optionnel)</label>
              <input
                className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
                type="number"
                min="0"
                value={montantXof}
                onChange={(e) => setMontantXof(e.target.value)}
                disabled={!!demande}
              />
              <p className="mt-1 text-12 text-gris600">Référence, indicative — sans effet sur le montant TTC réel.</p>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label className="mb-1 block text-13 font-bold text-gris800">Objectif</label>
              <input
                className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
                value={memoObjectif}
                onChange={(e) => setMemoObjectif(e.target.value)}
                disabled={!!demande}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="mb-1 block text-13 font-bold text-gris800">
                Contexte de la réclamation <span className="text-rouge">*</span>
              </label>
              <textarea
                className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
                style={{ minHeight: 56 }}
                value={memoContexte}
                onChange={(e) => setMemoContexte(e.target.value)}
                disabled={!!demande}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="mb-1 block text-13 font-bold text-gris800">Observation</label>
              <textarea
                className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
                style={{ minHeight: 48 }}
                value={memoObservation}
                onChange={(e) => setMemoObservation(e.target.value)}
                disabled={!!demande}
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
              disabled={!!demande}
            />
          </div>
        </div>
      )}

      <RechercheNd
        onLigneTrouvee={(contexte) =>
          setLignesLocales((s) =>
            s.some((l) => l.contexte.ligne.id === contexte.ligne.id)
              ? s
              : [...s, { contexte, formule: null, montant: montantLigneParDefaut() }]
          )
        }
      />

      <SelecteurLignes
        lignes={lignesLocales}
        onRetirer={(ligneId) => setLignesLocales((s) => s.filter((l) => l.contexte.ligne.id !== ligneId))}
        onChangeFormule={(ligneId, valeur) =>
          setLignesLocales((s) => s.map((l) => (l.contexte.ligne.id === ligneId ? { ...l, formule: valeur } : l)))
        }
        onChangeMontant={(ligneId, valeur) =>
          setLignesLocales((s) => s.map((l) => (l.contexte.ligne.id === ligneId ? { ...l, montant: valeur } : l)))
        }
        onEnregistrer={handleEnregistrerLignes}
        enregistrement={enregistrement}
        erreur={erreurEnregistrement}
        onBlurMontantHt={handleBlurMontantHt}
      />
      </div>

      {/* Panneau latéral — équivalent du bloc « Calcul automatique / Routage
          prévu / Soumettre » de la maquette (docs/design/screens1.jsx),
          aligné en haut à droite du formulaire plutôt qu'empilé dessous.
          Montants affichés uniquement APRÈS "Enregistrer les lignes" : ce
          sont ceux renvoyés par le serveur (demande.lignes[].montantHtLigne,
          demande.demande.montantTtc), jamais une estimation calculée ici —
          même principe qu'ApercuRoutage.
          `lg:sticky lg:top-26` (audit de complétude structurelle) — la
          maquette pose `position: sticky; top: 86` sur ce même panneau
          (screens1.jsx:483), jamais reproduit ici : sur un formulaire plus
          long que le viewport, le panneau défilait hors champ avec le
          contenu au lieu de rester visible. `top-26` reprend le padding déjà
          utilisé par `<main className="... p-26">` (AppShell.tsx) pour un
          alignement cohérent sous la Topbar. */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-26">
        {/* « Taxes appliquées » — lecture seule tant qu'aucun dossier n'existe
            (rien à quoi rattacher un PATCH /taxes) : affiche alors les
            défauts du circuit (ParametreCalcul). Devient interactif dès que
            `demande` existe, câblé sur PATCH /api/demandes/{id}/taxes
            (Phase 10.6septies, confirmation métier docs/10 DOBB #1/#2/#6). */}
        {!demande && parametresCalcul && (
          <div className="rounded-6 border border-gris200 bg-blanc p-5">
            <div className="mb-3 flex items-center gap-2">
              <Icon nom="calc" taille={17} />
              <h3 className="text-14 font-bold">Taxes appliquées</h3>
            </div>
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
            <p className="mt-2 text-12 text-gris600">Modifiable une fois le dossier créé (premier enregistrement de lignes).</p>
          </div>
        )}

        {demande && taxesEdition && (
          <div className="rounded-6 border border-gris200 bg-blanc p-5">
            <div className="mb-3 flex items-center gap-2">
              <Icon nom="calc" taille={17} />
              <h3 className="text-14 font-bold">Taxes appliquées</h3>
            </div>

            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={() => setTaxesEdition((s) => (s ? { ...s, tscActive: !s.tscActive } : s))}
                className={`rounded border px-3 py-1 text-12 font-bold ${
                  taxesEdition.tscActive ? "border-vert700 bg-vertFond text-vertTexteSurClair" : "border-gris300 text-gris700"
                }`}
              >
                TSC {taxesEdition.tscActive ? "active" : "inactive"}
              </button>
              <button
                type="button"
                onClick={() => setTaxesEdition((s) => (s ? { ...s, tvaActive: !s.tvaActive } : s))}
                className={`rounded border px-3 py-1 text-12 font-bold ${
                  taxesEdition.tvaActive ? "border-vert700 bg-vertFond text-vertTexteSurClair" : "border-gris300 text-gris700"
                }`}
              >
                TVA {taxesEdition.tvaActive ? "active" : "inactive"}
              </button>
            </div>

            {/* Assiette TVA — visible seulement quand TSC ET TVA sont actives
                (décision explicite, feu vert utilisateur) : sans TSC active,
                l'assiette HT+TSC coïnciderait avec HT seul, un choix qui
                n'aurait aucun effet réel. */}
            {taxesEdition.tscActive && taxesEdition.tvaActive && (
              <div className="mb-3">
                <span className="mb-1 block text-12 font-bold text-gris700">Assiette de la TVA</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTaxesEdition((s) => (s ? { ...s, assietteTva: "HT" } : s))}
                    className={`rounded border px-3 py-1 text-12 font-bold ${
                      taxesEdition.assietteTva === "HT" ? "border-vert700 bg-vertFond text-vertTexteSurClair" : "border-gris300 text-gris700"
                    }`}
                  >
                    HT seul
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaxesEdition((s) => (s ? { ...s, assietteTva: "HT_TSC" } : s))}
                    className={`rounded border px-3 py-1 text-12 font-bold ${
                      taxesEdition.assietteTva === "HT_TSC" ? "border-vert700 bg-vertFond text-vertTexteSurClair" : "border-gris300 text-gris700"
                    }`}
                  >
                    HT + TSC
                  </button>
                </div>
              </div>
            )}

            <div className="mb-3">
              <label className="flex items-center gap-2 text-13">
                <input
                  type="checkbox"
                  checked={taxesEdition.tscManuelle}
                  onChange={(e) => setTaxesEdition((s) => (s ? { ...s, tscManuelle: e.target.checked } : s))}
                />
                Saisir le montant TSC manuellement
              </label>
              {taxesEdition.tscManuelle && (
                <>
                  <input
                    className="mt-1 w-full rounded border border-gris300 px-3 py-2 text-13"
                    type="number"
                    min="0"
                    value={taxesEdition.montantTscManuel}
                    onChange={(e) => setTaxesEdition((s) => (s ? { ...s, montantTscManuel: e.target.value } : s))}
                  />
                  <p className="mt-1 text-12 text-gris600">Remplace le calcul automatique pour ce dossier (TSC active ou non).</p>
                </>
              )}
            </div>

            <div className="mb-3">
              <label className="flex items-center gap-2 text-13">
                <input
                  type="checkbox"
                  checked={taxesEdition.tvaManuelle}
                  onChange={(e) => setTaxesEdition((s) => (s ? { ...s, tvaManuelle: e.target.checked } : s))}
                />
                Saisir le montant TVA manuellement
              </label>
              {taxesEdition.tvaManuelle && (
                <>
                  <input
                    className="mt-1 w-full rounded border border-gris300 px-3 py-2 text-13"
                    type="number"
                    min="0"
                    value={taxesEdition.montantTvaManuel}
                    onChange={(e) => setTaxesEdition((s) => (s ? { ...s, montantTvaManuel: e.target.value } : s))}
                  />
                  <p className="mt-1 text-12 text-gris600">Remplace le calcul automatique pour ce dossier (TVA active ou non).</p>
                </>
              )}
            </div>

            {(() => {
              const preview = previsualiserTaxes(taxesEdition);
              return (
                <div className="mb-3 flex flex-col gap-1 border-t border-gris200 pt-2 text-13">
                  <div className="flex justify-between text-gris600">
                    <span>TSC</span>
                    <Money valeur={preview.tsc} />
                  </div>
                  <div className="flex justify-between text-gris600">
                    <span>TVA</span>
                    <Money valeur={preview.tva} />
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Total TTC (aperçu)</span>
                    <Money valeur={preview.ttc} fort className="text-orange600" />
                  </div>
                </div>
              );
            })()}

            {erreurTaxes && <p className="mb-2 text-13 font-semibold text-rouge700">{erreurTaxes}</p>}

            <button
              type="button"
              onClick={handleEnregistrerTaxes}
              disabled={enregistrementTaxes}
              className="w-full rounded bg-encre px-3 py-1.5 text-13 font-bold text-blanc disabled:opacity-50"
            >
              {enregistrementTaxes ? "Enregistrement…" : "Enregistrer les taxes"}
            </button>
          </div>
        )}

        {demande && demande.lignes.length > 0 && (
          <div className="rounded-6 border border-gris200 bg-blanc p-5">
            <div className="mb-3 flex items-center gap-2">
              <Icon nom="calc" taille={17} />
              <h3 className="text-14 font-bold">Montants</h3>
            </div>
            <div className="flex flex-col gap-2">
              {demande.lignes.map((l) => (
                <div key={l.id} className="flex justify-between text-13">
                  <span className="font-mono text-gris600">{l.nd}</span>
                  <Money valeur={l.montantHtLigne} />
                </div>
              ))}
              <div className="mt-2 flex justify-between border-t border-gris200 pt-2">
                <span className="font-bold">Total TTC</span>
                <Money valeur={demande.demande.montantTtc} fort className="text-orange600" />
              </div>
            </div>
          </div>
        )}

        {demande && demande.lignes.length > 0 && (
          <ApercuRoutage demandeId={demande.demande.id} declencheur={apercuDeclencheur} />
        )}

        {/* Toujours rendu, désactivé tant qu'aucune ligne n'est enregistrée —
            même pattern que la maquette (`disabled={!tranche}`,
            screens1.jsx:569), qui n'a jamais retiré le bouton du DOM.
            `handleSoumettre` garde déjà `if (!demande) return;` : aucune
            action n'est possible avant qu'une demande existe, seul le rendu
            change (audit de complétude structurelle — le bouton était
            absent, pas seulement désactivé, avant tout enregistrement de
            ligne). */}
        <div className="rounded-6 border border-gris200 bg-blanc p-5">
          {erreursSoumission && (
            <ul className="mb-3 list-disc pl-5 text-13 font-semibold text-rouge700">
              {erreursSoumission.map((v, i) => (
                <li key={i}>{v.message}</li>
              ))}
            </ul>
          )}
          {erreurSoumissionUnique && <p className="mb-3 text-13 font-semibold text-rouge700">{erreurSoumissionUnique}</p>}
          <button
            type="button"
            onClick={handleSoumettre}
            disabled={!demande || soumissionEnCours || demande.lignes.length === 0}
            className="w-full rounded bg-orange px-4 py-2 text-13 font-bold text-noir disabled:opacity-50"
          >
            {soumissionEnCours ? "Soumission…" : "Soumettre"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Extrait de la carte DOBB/DXC (Phase 10.6, étape C/D) puis réutilisé tel
// quel par la carte mémo DF (étape E) — même champs réels (directionRespId/
// serviceRespId), même bascule "Autre" mutuellement exclusive. Un seul
// endroit à faire évoluer si cette logique change, plutôt que deux copies
// susceptibles de diverger silencieusement.
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
  disabled: boolean;
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
  setResponsabiliteServiceAutre,
  disabled
}: ResponsabiliteFieldsProps) {
  return (
    <>
      <div>
        <label className="mb-1 block text-13 font-bold text-gris800">Responsabilité — direction</label>
        <select
          className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
          value={directionRespId}
          onChange={(e) => choisirDirection(e.target.value)}
          disabled={disabled || !directions || serviceAutreActif}
        >
          <option value="">— Choisir —</option>
          {directions?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.libelle}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-13 font-bold text-gris800">Responsabilité — service</label>
        <select
          className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
          value={serviceRespId}
          onChange={(e) => choisirServiceReel(e.target.value)}
          disabled={disabled || !directionSelectionnee || serviceAutreActif}
        >
          <option value="">— Choisir —</option>
          {directionSelectionnee?.services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.libelle}
            </option>
          ))}
        </select>
      </div>

      <div style={{ gridColumn: "1 / -1" }}>
        <label className="flex items-center gap-2 text-13">
          <input
            type="checkbox"
            checked={serviceAutreActif}
            onChange={(e) => toggleServiceAutre(e.target.checked)}
            disabled={disabled}
          />
          Responsabilité par service : « Autre » (non référencé)
        </label>
        {serviceAutreActif && (
          <input
            className="mt-2 w-full rounded border border-gris300 px-3 py-2 text-13"
            value={responsabiliteServiceAutre}
            onChange={(e) => setResponsabiliteServiceAutre(e.target.value)}
            placeholder="Préciser le service"
            disabled={disabled}
          />
        )}
      </div>
    </>
  );
}
