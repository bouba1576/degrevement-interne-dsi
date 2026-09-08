"use client";

import { useState } from "react";
import { Badge, Button, Icon, Modal, formaterMontant } from "@pgd/ui";
import type { ChampAnomalie, Demande, EnumTypeActeur, RevueChamp } from "@pgd/contracts";
import { construireChampsCircuit, construireLignesCommunes } from "./ApercuTab";

export interface ExaminerModalProps {
  demande: Demande;
  typeActeur: EnumTypeActeur;
  roleLibelle: string;
  motifLibelle: string | null;
  circuitLibelle: string | null;
  // Dernière étape bloquante de la chaîne — change le texte d'explication
  // (« le dossier sera validé » vs « avance à l'étape suivante »), jamais
  // le mécanisme lui-même. Calculé par l'appelant (TacheActionBanner, qui a
  // déjà `etapes`), pas recalculé ici.
  isFinal: boolean;
  onFermer: () => void;
  onApprouver: (revue: RevueChamp[]) => void | Promise<void>;
  onRejeter: (motifCompile: string, champsAnomalies: ChampAnomalie[]) => void | Promise<void>;
  chargement: boolean;
}

// Port de docs/design/screens2.jsx:600 (ApproveModal) — SF-PGD-080/081,
// PGD-055/056. Comportement contraignant, pas seulement l'habillage
// (CLAUDE.md « mécanismes d'interaction contraignants ») :
// - Posture par défaut : le dossier est présumé conforme. Le validateur ne
//   coche rien pour approuver — il SIGNALE uniquement les anomalies, un
//   motif devient obligatoire pour chaque champ signalé.
// - Toute anomalie signalée bascule l'action de « Approuver »/« Valider »
//   vers « Rejeter avec motifs » — le modal unifie les deux décisions,
//   jamais deux flux séparés à choisir en amont.
// - Le commentaire global est auto-composé depuis les anomalies (recap),
//   complétable par un texte libre additionnel.
//
// Écart de contrat assumé, pas un oubli : le payload d'origine de la
// maquette (`{champ, valeur, verdict, commentaire}` par champ) ne
// correspond pas à `RevueChamp` réel (`{champ, vu, correction?}`,
// packages/contracts/src/tache.ts). Puisqu'une anomalie route vers le
// REJET (jamais vers une approbation "avec réserves"), le payload envoyé à
// l'approbation ne porte jamais de désaccord — chaque champ y est
// simplement `vu: true`, sans `correction` (rien n'est jamais en
// contradiction sur ce chemin). `correction` reste un champ du contrat
// que ce modal n'alimente jamais : aucune spécification ne décrit un état
// "approuvé avec correction notée", et le serveur ne lit `correction` nulle
// part au-delà de la journalisation (vérifié, cf. CLAUDE.md).
export function ExaminerModal({
  demande,
  typeActeur,
  roleLibelle,
  motifLibelle,
  circuitLibelle,
  isFinal,
  onFermer,
  onApprouver,
  onRejeter,
  chargement
}: ExaminerModalProps) {
  const lignes = [...construireLignesCommunes(demande, motifLibelle, circuitLibelle), ...construireChampsCircuit(demande)];
  // Montants « toujours revus » (maquette, buildFieldRows) — ajoutés à la
  // suite, jamais dans la carte Aperçu elle-même (qui garde sa propre mise
  // en forme dédiée avec <Money/>, cf. ApercuTab.tsx).
  lignes.push(["Montant HT", formaterMontant(demande.montantHt)]);
  if (demande.tscActive) lignes.push([`TSC (${(demande.tauxTsc * 100).toFixed(2)} %)`, formaterMontant(demande.montantTsc)]);
  if (demande.tvaActive) {
    lignes.push([
      `TVA (${(demande.tauxTva * 100).toFixed(2)} %)${demande.assietteTva === "HT_TSC" ? " · sur HT+TSC" : " · sur HT"}`,
      formaterMontant(demande.montantTva)
    ]);
  }
  lignes.push(["Total TTC", formaterMontant(demande.montantTtc)]);

  const [flags, setFlags] = useState<Record<number, boolean>>({});
  const [commentaires, setCommentaires] = useState<Record<number, string>>({});
  const [commentaireLibre, setCommentaireLibre] = useState("");
  const [showErr, setShowErr] = useState(false);
  const [detail, setDetail] = useState(false);

  function toggleAnomalie(i: number) {
    setFlags((s) => ({ ...s, [i]: !s[i] }));
  }

  const indicesSignales = lignes.map((_, i) => i).filter((i) => flags[i]);
  const nbAnomalies = indicesSignales.length;
  const hasAnomalie = nbAnomalies > 0;
  const anomalieSansMotif = indicesSignales.some((i) => !(commentaires[i] && commentaires[i]!.trim()));

  const recap = indicesSignales
    .map((i) => `• ${lignes[i]![0]} : ${commentaires[i] && commentaires[i]!.trim() ? commentaires[i]!.trim() : "(motif manquant)"}`)
    .join("\n");
  const commentaireGlobal = [recap, commentaireLibre.trim()].filter(Boolean).join("\n");
  // Désignation structurée des champs en cause (07/09/2026, demande
  // explicite) — capturée ICI, avant que `commentaireGlobal` ci-dessus ne
  // détruise cette information en un seul texte libre. Même libellé exact
  // que `lignes[i][0]` (construireLignesCommunes/construireChampsCircuit,
  // ApercuTab.tsx) — c'est ce même libellé que la fiche de correction
  // (NouvelleDemandeScreen, mode reprise) comparera pour la surbrillance.
  const champsAnomalies = indicesSignales.map((i) => ({ champ: lignes[i]![0], motif: (commentaires[i] ?? "").trim() }));

  function confirmer() {
    if (hasAnomalie && anomalieSansMotif) {
      setShowErr(true);
      return;
    }
    if (hasAnomalie) {
      void onRejeter(commentaireGlobal, champsAnomalies);
    } else {
      const revue: RevueChamp[] = lignes.map(([champ]) => ({ champ, vu: true }));
      void onApprouver(revue);
    }
  }

  const libelleAction = hasAnomalie
    ? "Rejeter avec motifs"
    : typeActeur === "V"
      ? "Valider la vérification"
      : "Approuver la demande";

  return (
    <Modal
      titre={typeActeur === "V" ? "Vérification de la demande" : "Validation de la demande"}
      icone={typeActeur === "V" ? "eye" : "check"}
      onFermer={onFermer}
      large
      pied={
        <div className="flex w-full items-center gap-3">
          <div className="mr-auto">
            {nbAnomalies > 0 ? (
              <Badge ton="erreur" pastille>
                {nbAnomalies} anomalie{nbAnomalies > 1 ? "s" : ""} signalée{nbAnomalies > 1 ? "s" : ""}
              </Badge>
            ) : (
              <Badge ton="succes" pastille>
                Aucune anomalie
              </Badge>
            )}
          </div>
          <Button onClick={onFermer} variante="fantome" taille="petite">
            Annuler
          </Button>
          <Button disabled={chargement} onClick={confirmer} variante={hasAnomalie ? "danger" : "succes"} taille="petite">
            <Icon nom={hasAnomalie ? "x" : "check"} taille={15} /> {libelleAction}
          </Button>
        </div>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-6 bg-gris50 p-3 text-13">
        <Icon nom="info" taille={15} className="mt-0.5 shrink-0 text-gris600" />
        <div>
          <span className="font-bold">{demande.reference}</span> · {formaterMontant(demande.montantTtc)} · {roleLibelle}
          <p className="mt-1 text-12 text-gris600">
            Par défaut, la demande est considérée conforme. <span className="font-semibold">Signalez uniquement les champs en anomalie</span> (un
            motif est alors requis). {isFinal ? "Sans anomalie, le dossier sera « validé »." : "Sans anomalie, la demande avance à l'étape suivante."}
          </p>
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <span className="text-13 font-bold">{detail ? "Revue détaillée — signaler les anomalies" : "Synthèse de la demande"}</span>
        <button type="button" onClick={() => setDetail((v) => !v)} className="text-12 font-bold text-orange600 hover:underline">
          <Icon nom={detail ? "eye" : "edit"} taille={12} /> {detail ? "Masquer le détail" : "Examiner champ par champ"}
        </button>
      </div>

      {!detail ? (
        <div className="overflow-hidden rounded-6 border border-gris200">
          {lignes.slice(0, 8).map(([libelle, valeur], i) => (
            <div key={i} className="flex items-start gap-4 border-b border-gris100 px-3 py-2 text-13 last:border-none">
              <div className="w-44 shrink-0 text-gris600">{libelle}</div>
              <div className="flex-1 font-semibold">{valeur}</div>
            </div>
          ))}
          {lignes.length > 8 && (
            <div className="p-2 text-center text-12 text-gris600">
              + {lignes.length - 8} autres champs — « Examiner champ par champ » pour tout voir
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {lignes.map(([libelle, valeur], i) => {
            const ko = !!flags[i];
            const manquant = showErr && ko && !(commentaires[i] && commentaires[i]!.trim());
            return (
              <div
                key={i}
                className={`rounded-6 border p-3 ${ko ? "border-rouge200 bg-rouge50" : "border-gris200"} ${manquant ? "border-rouge700" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-12 text-gris600">{libelle}</div>
                    <div className="text-13 font-semibold">{valeur}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleAnomalie(i)}
                    className={`flex items-center gap-1 rounded px-2 py-1 text-12 font-bold ${
                      ko ? "bg-rouge700 text-blanc" : "border border-gris300 text-gris700"
                    }`}
                  >
                    <Icon nom={ko ? "x" : "flag"} taille={14} /> {ko ? "Anomalie" : "Signaler"}
                  </button>
                </div>
                {ko && (
                  <input
                    value={commentaires[i] ?? ""}
                    onChange={(e) => setCommentaires((s) => ({ ...s, [i]: e.target.value }))}
                    placeholder="Motif de l'anomalie (obligatoire)…"
                    className={`mt-2 w-full rounded border px-2 py-1.5 text-13 ${manquant ? "border-rouge700" : "border-gris300"}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {showErr && anomalieSansMotif && (
        <div className="mt-4 flex items-start gap-2 rounded-6 border border-rouge200 bg-rouge50 p-3 text-13 text-rouge700">
          <Icon nom="alert" taille={15} className="mt-0.5 shrink-0" />
          Chaque anomalie signalée doit comporter un motif.
        </div>
      )}

      {(hasAnomalie || commentaireLibre) && (
        <div className="mt-4 border-t border-gris100 pt-4">
          <label className="flex flex-col gap-1 text-13">
            <span className="font-bold">Commentaire global</span>
            <span className="text-12 text-gris600">Récapitulatif automatique des anomalies — complétable.</span>
            <textarea
              value={commentaireGlobal}
              onChange={(e) => {
                const val = e.target.value;
                if (recap && val.startsWith(recap)) setCommentaireLibre(val.slice(recap.length).replace(/^\n/, ""));
                else if (!recap) setCommentaireLibre(val);
              }}
              rows={3}
              placeholder="Observation éventuelle…"
              className="rounded border border-gris300 p-2 text-13"
            />
          </label>
        </div>
      )}
    </Modal>
  );
}
