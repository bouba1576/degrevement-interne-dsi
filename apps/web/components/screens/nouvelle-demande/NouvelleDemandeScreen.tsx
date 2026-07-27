"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { Icon, Money } from "@pgd/ui";
import type {
  DemandeDetail,
  EnumCircuit,
  FacteurDegrevementVue,
  MotifVue,
  SessionUtilisateur,
  SoumissionReponse,
  UniversFmiVue
} from "@pgd/contracts";
import {
  ApiError,
  creerDemande,
  definirLignes,
  erreurRegleMetierSchema,
  listerFacteursReferentiel,
  listerMotifsActifs,
  listerUniversFmi,
  soumettreDemande,
  type ErreurRegleMetier
} from "@/lib/api";
import { RechercheNd } from "./RechercheNd";
import { SelecteurLignes, montantLigneParDefaut, type LigneLocale } from "./SelecteurLignes";
import { ApercuRoutage } from "./ApercuRoutage";

const CIRCUITS: EnumCircuit[] = ["DOBB", "DXC", "DF"];

// Segment associé à chaque circuit (table CLAUDE.md « Projet ») — libellé
// d'affichage statique, pas une règle métier : n'influence ni le routage ni
// le calcul, sert uniquement le badge visuel déjà présent dans la maquette
// (docs/design/screens1.jsx, badge "DOBB · B2B" etc.).
const SEGMENT_PAR_CIRCUIT: Record<EnumCircuit, string> = { DOBB: "B2B", DXC: "B2C", DF: "Wholesale" };

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
export function NouvelleDemandeScreen({ utilisateur }: NouvelleDemandeScreenProps) {
  const [circuit, setCircuit] = useState<EnumCircuit>(() => circuitParDefaut(utilisateur.roles));
  const [nomClient, setNomClient] = useState("");
  const [commentaire, setCommentaire] = useState("");
  // PGD-032/SF-PGD-330 — aucun endpoint ne liste les services référentiels
  // réels aujourd'hui (recherche dédiée, négative) : impossible de proposer
  // un vrai select. Seul le chemin "Autre" (texte libre) est donc actionnable
  // ici ; la case à cocher démontre malgré tout le comportement exigé —
  // masqué ET vidé quand on quitte "Autre" — sur le seul champ qui existe
  // réellement dans le contrat (`responsabiliteServiceAutre`). Vérifié en
  // direct (Phase 9.2) : décocher puis recocher rouvre un champ vide, pas la
  // valeur précédente.
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

  const motifSelectionne = motifs?.find((m) => m.id === motifId) ?? null;

  const [demande, setDemande] = useState<DemandeDetail | null>(null);
  const [lignesLocales, setLignesLocales] = useState<LigneLocale[]>([]);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreurEnregistrement, setErreurEnregistrement] = useState<string | null>(null);

  const [soumissionEnCours, setSoumissionEnCours] = useState(false);
  const [soumissionReussie, setSoumissionReussie] = useState<SoumissionReponse | null>(null);
  const [erreursSoumission, setErreursSoumission] = useState<ErreurRegleMetier[] | null>(null);
  const [erreurSoumissionUnique, setErreurSoumissionUnique] = useState<string | null>(null);

  function toggleServiceAutre(actif: boolean) {
    setServiceAutreActif(actif);
    // "masqué ET vidé" (PGD-032) : une valeur résiduelle non visible qui
    // partirait quand même à la soumission serait invisible à l'œil, visible
    // seulement en mesurant — donc on la vide ici, pas seulement en CSS.
    if (!actif) setResponsabiliteServiceAutre("");
  }

  const infosCompletes = nomClient.trim().length > 0 && commentaire.trim().length > 0;

  async function handleEnregistrerLignes() {
    if (lignesLocales.length === 0 || !lignesLocales.every((l) => l.formule !== null)) return;
    if (!demande && !infosCompletes) {
      setErreurEnregistrement("Nom du client et commentaire requis avant d'enregistrer des lignes.");
      return;
    }
    setEnregistrement(true);
    setErreurEnregistrement(null);
    try {
      let demandeActuelle = demande;
      if (!demandeActuelle) {
        demandeActuelle = await creerDemande({
          circuit,
          nomClient: nomClient.trim(),
          commentaire: commentaire.trim(),
          responsabiliteServiceAutre:
            circuit === "DOBB" && serviceAutreActif ? responsabiliteServiceAutre.trim() : undefined,
          agentInitiateur: agentInitiateur.trim() || undefined,
          matriculeInitiateur: matriculeInitiateur.trim() || undefined,
          agentSaisie: agentSaisie.trim() || undefined,
          sousFlux: sousFlux.trim() || undefined,
          libelle: libelle.trim() || undefined,
          motifId: motifId || undefined,
          universFmiCode: universFmiCode || undefined,
          facteurCode: facteurCode || undefined
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
          Nom du client <span className="text-rouge">*</span>
        </label>
        <input
          className="mb-3 w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
          value={nomClient}
          onChange={(e) => setNomClient(e.target.value)}
          disabled={!!demande}
        />

        {circuit === "DOBB" && !demande && (
          <div className="mb-3">
            <label className="flex items-center gap-2 text-13">
              <input type="checkbox" checked={serviceAutreActif} onChange={(e) => toggleServiceAutre(e.target.checked)} />
              Responsabilité par service : « Autre » (non référencé)
            </label>
            {serviceAutreActif && (
              <input
                className="mt-2 w-full rounded border border-gris300 px-3 py-2 text-13"
                value={responsabiliteServiceAutre}
                onChange={(e) => setResponsabiliteServiceAutre(e.target.value)}
                placeholder="Préciser le service"
              />
            )}
          </div>
        )}

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
            <label className="mb-1 block text-13 font-bold text-gris800">Libellé</label>
            <input
              className="w-full rounded border border-gris300 px-3 py-2 text-13 disabled:opacity-60"
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              disabled={!!demande}
            />
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
      />
      </div>

      {/* Panneau latéral — équivalent du bloc « Calcul automatique / Routage
          prévu / Soumettre » de la maquette (docs/design/screens1.jsx),
          aligné en haut à droite du formulaire plutôt qu'empilé dessous.
          Montants affichés uniquement APRÈS "Enregistrer les lignes" : ce
          sont ceux renvoyés par le serveur (demande.lignes[].montantHtLigne,
          demande.demande.montantTtc), jamais une estimation calculée ici —
          même principe qu'ApercuRoutage. */}
      <div className="flex flex-col gap-4">
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

        {demande && demande.lignes.length > 0 && <ApercuRoutage demandeId={demande.demande.id} />}

        {demande && (
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
              disabled={soumissionEnCours || demande.lignes.length === 0}
              className="w-full rounded bg-orange px-4 py-2 text-13 font-bold text-noir disabled:opacity-50"
            >
              {soumissionEnCours ? "Soumission…" : "Soumettre"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
