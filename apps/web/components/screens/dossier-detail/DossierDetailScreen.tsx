"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, CircuitPill, Icon, StatusBadge, type StatutDemande } from "@pgd/ui";
import type { DemandeDetail, EtapeDossier, JournalAuditVue, SessionUtilisateur } from "@pgd/contracts";
import {
  ApiError,
  abandonnerDemande,
  journalAuditDemande,
  listerTachesDemande,
  modifierDemande,
  obtenirDetailDemande,
  rappelerDemande
} from "@/lib/api";
import { ApercuTab, useMotifLibelle } from "./ApercuTab";
import { CircuitTab } from "./CircuitTab";
import { PiecesTab } from "./PiecesTab";
import { AuditTab } from "./AuditTab";
import { TacheActionBanner } from "./TacheActionBanner";
import { ModifierDemandeModal, type ModifierDemandeValeur } from "./ModifierDemandeModal";
import { extraireLabelPalier } from "./labelPalier";

export interface DossierDetailScreenProps {
  dossierId: string;
  utilisateur: SessionUtilisateur;
  onRetour: () => void;
}

const CLE_STATUT: Record<DemandeDetail["demande"]["statut"], StatutDemande> = {
  BROUILLON: "brouillon",
  SOUMIS: "soumis",
  EN_COURS: "enCours",
  VALIDE: "valide",
  REJETE: "rejete",
  ABANDONNE: "abandonne"
};

type Onglet = "apercu" | "circuit" | "pieces" | "audit";

// Pas de ControleTab (PGD-070) : le contrôle a posteriori a son propre écran
// prévu (docs/design/screens3.jsx, ControleScreen) — confirmé absent de la
// maquette DE CET écran précisément parce qu'il vit ailleurs, pas omis.
// Pas d'actions superviseur (archiver/publipostage/export dossier/relancer/
// debloquer/reaffecter) : fonctionnalité maquette sans contrepartie serveur,
// catégorie distincte du silence de maquette (cf. DIVERGENCES.md).
export function DossierDetailScreen({ dossierId, utilisateur, onRetour }: DossierDetailScreenProps) {
  const [detail, setDetail] = useState<DemandeDetail | null>(null);
  const [etapes, setEtapes] = useState<EtapeDossier[] | null>(null);
  // Écarts DossierDetailScreen (Phase 10.6quinquies, point 3) — pas déjà
  // chargé ailleurs (AuditTab ne fetch le journal que lorsqu'on ouvre
  // l'onglet), donc un appel de plus ici, au même titre que les deux déjà
  // groupés dans ce Promise.all — même famille de coût que pieces.length,
  // déjà disponible via `detail` sans requête dédiée. Tableau complet
  // conservé (pas seulement .length) : sert aussi le bandeau "Rejeté par…"
  // ci-dessous (entrée JournalAudit action="cloture", cf. commentaire à son
  // usage) — un seul appel pour les deux besoins, pas un doublon.
  const [audit, setAudit] = useState<JournalAuditVue[] | null>(null);
  const [onglet, setOnglet] = useState<Onglet>("apercu");
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargementAction, setChargementAction] = useState(false);
  const [modaleModification, setModaleModification] = useState(false);
  // Avant les retours anticipés ci-dessous (Règles des Hooks) — d'où la
  // forme tolérante à `undefined` de useMotifLibelle (ApercuTab.tsx).
  // Partagé entre la ligne d'en-tête (docs/design/screens2.jsx:387,
  // "{client} · {motif} · {libellé}") et ApercuTab, un seul fetch.
  const motifLibelle = useMotifLibelle(detail?.demande.circuit, detail?.demande.motifId);

  const charger = useCallback(async () => {
    try {
      const [d, e, audit] = await Promise.all([
        obtenirDetailDemande(dossierId),
        listerTachesDemande(dossierId),
        journalAuditDemande(dossierId)
      ]);
      setDetail(d);
      setEtapes(e);
      setAudit(audit);
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Erreur inattendue.");
    }
  }, [dossierId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  if (erreur) return <p className="text-13 font-semibold text-rouge700">{erreur}</p>;
  if (!detail || !etapes) return <p className="text-13 text-gris600">Chargement…</p>;

  const { demande, lignes, pieces } = detail;
  const estInitiateur = demande.initiateurId === utilisateur.id;
  const peutAbandonnerOuRappeler = estInitiateur && (demande.statut === "SOUMIS" || demande.statut === "EN_COURS");
  // Même fenêtre d'éligibilité que Rappeler/Abandonner (statut) — mais R6
  // n'est réellement exerçable que tant qu'aucune décision n'a encore été
  // prise sur AUCUNE étape (DemandeWorkflowService.verifierAucuneDecision,
  // partagée par modifier/rappeler/abandonner) : une fois une seule étape
  // approuvée ou rejetée, le serveur refuse tout PATCH (422
  // DECISION_DEJA_PRISE), définitivement, pour le reste du cycle de vie du
  // dossier. `etapes` est déjà chargé pour l'onglet Circuit — réutilisé ici
  // pour ne pas afficher un bouton voué à toujours échouer, sans dupliquer
  // la règle elle-même (le 422 reste la seule garantie réelle, ceci n'est
  // qu'un confort d'affichage, R2 des règles non négociables).
  const aucuneDecisionPrise = etapes.every((e) => e.dateDecision === null);
  const peutModifier = peutAbandonnerOuRappeler && aucuneDecisionPrise;
  // Bandeaux "Rejeté par…"/"Dossier validé" (docs/design/screens2.jsx:431-432,
  // DIVERGENCES.md, jamais capturés avant ce tour). Le rejet ne mène à REJETE
  // que dans le cas terminal clore=true (le renvoi par défaut remet le
  // dossier en BROUILLON, cf. CLAUDE.md § « Renvoi ou clôture d'un dossier
  // rejeté ») — l'auteur/motif ne sont donc pas des champs de Demande mais
  // l'entrée JournalAudit action="cloture" (commentaire=motifCloture),
  // déjà chargée ci-dessus pour le compteur d'onglet.
  const entreeCloture = audit
    ? [...audit].reverse().find((a) => a.action === "cloture")
    : undefined;
  const controleEnAttente = etapes.some((e) => e.typeActeur === "C" && e.dateDecision === null);
  // Partagé entre ApercuTab (chip "Tranche X", carte Montants) et CircuitTab
  // (carte "Règle appliquée") — un seul calcul sur `audit` déjà chargé ici,
  // jamais un second fetch dupliqué par onglet.
  const labelPalier = audit ? extraireLabelPalier(audit) : null;

  async function handleAbandonner() {
    setChargementAction(true);
    try {
      await abandonnerDemande(dossierId);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Abandon impossible.");
    } finally {
      setChargementAction(false);
    }
  }

  async function handleRappeler() {
    setChargementAction(true);
    try {
      await rappelerDemande(dossierId);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Rappel impossible.");
    } finally {
      setChargementAction(false);
    }
  }

  async function handleModifier(valeur: ModifierDemandeValeur) {
    setChargementAction(true);
    try {
      await modifierDemande(dossierId, {
        nomClient: valeur.nomClient,
        libelle: valeur.libelle || undefined,
        commentaire: valeur.commentaire || undefined
      });
      setModaleModification(false);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Modification impossible.");
    } finally {
      setChargementAction(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={onRetour}
        className="mb-3 flex items-center gap-1 text-13 font-semibold text-gris600"
      >
        <Icon nom="arrowLeft" taille={13} /> Retour
      </button>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-mono text-22 font-bold">{demande.reference}</h2>
            <CircuitPill code={demande.circuit} />
            <StatusBadge statut={CLE_STATUT[demande.statut]} />
          </div>
          {/* docs/design/screens2.jsx:387 — "{client} · {motif} · {libellé}",
              chaque segment optionnel filtré plutôt qu'un "·" orphelin. */}
          <p className="text-13 text-gris600">
            {[demande.nomClient, motifLibelle, demande.libelle].filter(Boolean).join(" · ")}
          </p>
        </div>
        {peutAbandonnerOuRappeler && (
          <div className="flex gap-2">
            {peutModifier && (
              <Button disabled={chargementAction} onClick={() => setModaleModification(true)} variante="fantome" taille="petite">
                Modifier
              </Button>
            )}
            <Button disabled={chargementAction} onClick={handleRappeler} variante="fantome" taille="petite">
              Rappeler
            </Button>
            <Button disabled={chargementAction} onClick={handleAbandonner} variante="fantome" taille="petite">
              Abandonner
            </Button>
          </div>
        )}
      </div>

      {demande.statut !== "VALIDE" && demande.statut !== "REJETE" && (
        <TacheActionBanner etapes={etapes} utilisateur={utilisateur} onActionEffectuee={charger} />
      )}

      {demande.statut === "REJETE" && (
        <div className="mb-4 flex items-start gap-2 rounded-6 border border-rouge200 bg-rouge50 p-3 text-13">
          <Icon nom="x" taille={17} className="mt-0.5 shrink-0 text-rouge700" />
          <div>
            <p className="font-bold text-rouge700">
              Rejeté{entreeCloture ? ` par ${entreeCloture.acteur}` : ""}
            </p>
            <p className="text-gris700">Motif : {entreeCloture?.commentaire ?? "—"}</p>
          </div>
        </div>
      )}
      {demande.statut === "VALIDE" && (
        <div className="mb-4 flex items-start gap-2 rounded-6 border border-vert200 bg-vert50 p-3 text-13">
          <Icon nom="check" taille={17} className="mt-0.5 shrink-0 text-vert700" />
          <div>
            <p className="font-bold text-vert700">Dossier validé</p>
            <p className="text-gris700">
              Toutes les étapes bloquantes approuvées · transmis au SI de facturation
              {controleEnAttente ? " · contrôle a posteriori en attente" : ""}.
            </p>
          </div>
        </div>
      )}

      <div className="mb-4 flex gap-1 border-b border-gris200">
        {(
          [
            ["apercu", "Aperçu"],
            ["circuit", "Circuit de validation"],
            ["pieces", `Pièces (${pieces.length})`],
            ["audit", audit === null ? "Journal d'audit" : `Journal d'audit (${audit.length})`]
          ] as const
        ).map(([cle, libelle]) => (
          <button
            key={cle}
            type="button"
            onClick={() => setOnglet(cle)}
            className={`px-3 py-2 text-13 font-semibold ${onglet === cle ? "border-b-2 border-encre text-encre" : "text-gris600"}`}
          >
            {libelle}
          </button>
        ))}
      </div>

      {onglet === "apercu" && (
        <ApercuTab demande={demande} lignes={lignes} labelPalier={labelPalier} motifLibelle={motifLibelle} />
      )}
      {onglet === "circuit" && <CircuitTab demandeId={dossierId} labelPalier={labelPalier} />}
      {onglet === "pieces" && (
        <PiecesTab
          demandeId={dossierId}
          pieces={pieces}
          onChange={(nouvelles) => setDetail({ ...detail, pieces: nouvelles })}
        />
      )}
      {onglet === "audit" && <AuditTab demandeId={dossierId} />}

      {modaleModification && (
        <ModifierDemandeModal
          demande={demande}
          onFermer={() => setModaleModification(false)}
          onConfirmer={handleModifier}
          chargement={chargementAction}
        />
      )}
    </div>
  );
}
