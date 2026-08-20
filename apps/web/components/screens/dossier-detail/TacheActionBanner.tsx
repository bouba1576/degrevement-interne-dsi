"use client";

import { useEffect, useState } from "react";
import { Button, Icon, Modal, SlaTimer, TypeActeurBadge } from "@pgd/ui";
import type { EtapeDossier, SessionUtilisateur, TacheVue } from "@pgd/contracts";
import { ApiError, approuverTache, claimTache, rejeterTache, trouverTache, unclaimTache } from "@/lib/api";

export interface TacheActionBannerProps {
  etapes: EtapeDossier[];
  utilisateur: SessionUtilisateur;
  onActionEffectuee: () => void;
}

// Déléguer (POST /api/taches/{id}/deleguer) est délibérément absent ici :
// la route réelle exige un delegataireId (uuid) mais aucune route ne permet
// de rechercher un agent par nom/identifiant AD pour le résoudre — un champ
// texte demandant un UUID brut serait une UX qui ne marche pas, pas un
// raccourci acceptable. Absence constatée, pas un oubli : à traiter comme sa
// propre étape (recherche d'agent), pas comblée ici par un champ inutilisable.
export function TacheActionBanner({ etapes, utilisateur, onActionEffectuee }: TacheActionBannerProps) {
  const etapeActionnable = etapes.find(
    (e) => utilisateur.roles.includes(e.roleCode) && (e.etat === "EN_CORBEILLE" || e.etat === "RECLAMEE")
  );

  const [tache, setTache] = useState<TacheVue | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [modalRejet, setModalRejet] = useState(false);
  const [motifRejet, setMotifRejet] = useState("");
  // Décision métier du 12/08/2026 (docs/12, CLAUDE.md « PRIORITÉ ») : par
  // défaut un rejet renvoie le dossier à l'initiateur pour correction ;
  // « clore » bascule vers l'ancien comportement terminal, choisi
  // explicitement ici, au moment même du rejet — jamais une règle
  // automatique.
  const [clore, setClore] = useState(false);
  const [motifCloture, setMotifCloture] = useState("");

  useEffect(() => {
    if (!etapeActionnable) {
      setTache(null);
      return;
    }
    let annule = false;
    trouverTache(etapeActionnable.id).then((t) => {
      if (!annule) setTache(t);
    });
    return () => {
      annule = true;
    };
  }, [etapeActionnable]);

  if (!etapeActionnable || !tache) return null;

  const reclameeParMoi = tache.etat === "RECLAMEE" && tache.agentClaimId === utilisateur.id;
  const reclameeParAutre = tache.etat === "RECLAMEE" && tache.agentClaimId !== utilisateur.id;

  async function executer(action: () => Promise<unknown>) {
    setChargement(true);
    setErreur(null);
    try {
      await action();
      onActionEffectuee();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Action impossible.");
    } finally {
      setChargement(false);
    }
  }

  return (
    <div className="mb-4 rounded-6 border-l-4 border-orange bg-orange50 p-4">
      {erreur && <p className="mb-2 text-13 font-semibold text-rouge700">{erreur}</p>}

      {reclameeParAutre ? (
        <p className="text-13 text-gris700">Tâche récupérée par un collègue — libération automatique à expiration du verrou.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[200px] flex-1">
            <div className="flex items-center gap-2">
              <span className="text-orange600">
                <Icon nom="bell" taille={17} />
              </span>
              <span className="text-13 font-bold">Action requise — {etapeActionnable.roleLibelle}</span>
              <TypeActeurBadge type={etapeActionnable.typeActeur} />
            </div>
            {reclameeParMoi ? (
              <p className="text-12 text-gris600">Tâche récupérée par vous.</p>
            ) : (
              <p className="text-12 text-gris600">Récupérez la tâche pour la traiter.</p>
            )}
            {reclameeParMoi && etapeActionnable.echeanceSla && (
              <div className="mt-2">
                <SlaTimer echeanceSla={etapeActionnable.echeanceSla} compact />
              </div>
            )}
          </div>

          {!reclameeParMoi && (
            <Button disabled={chargement} onClick={() => executer(() => claimTache(tache.id))} variante="sombre" taille="petite">
              <Icon nom="lock" taille={15} /> Récupérer
            </Button>
          )}

          {reclameeParMoi && (
            <>
              <button
                type="button"
                disabled={chargement}
                onClick={() => executer(() => unclaimTache(tache.id))}
                className="rounded border border-gris200 px-3 py-1.5 text-13 font-bold text-gris700 disabled:opacity-50"
              >
                Libérer
              </button>
              <button
                type="button"
                disabled={chargement}
                onClick={() => setModalRejet(true)}
                className="rounded bg-rouge700 px-3 py-1.5 text-13 font-bold text-blanc disabled:opacity-50"
              >
                Rejeter
              </button>
              <button
                type="button"
                disabled={chargement}
                onClick={() => executer(() => approuverTache(tache.id, {}))}
                className="rounded bg-vert700 px-3 py-1.5 text-13 font-bold text-blanc disabled:opacity-50"
              >
                Approuver
              </button>
            </>
          )}
        </div>
      )}

      {modalRejet && (
        <Modal
          titre="Rejeter le dossier"
          onFermer={() => setModalRejet(false)}
          pied={
            <>
              <button
                type="button"
                onClick={() => setModalRejet(false)}
                className="rounded border border-gris200 px-3 py-1.5 text-13 font-bold text-gris700"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={
                  motifRejet.trim().length === 0 ||
                  (clore && motifCloture.trim().length === 0) ||
                  chargement
                }
                onClick={() =>
                  executer(async () => {
                    await rejeterTache(tache.id, {
                      motif: motifRejet.trim(),
                      clore,
                      motifCloture: clore ? motifCloture.trim() : undefined
                    });
                    setModalRejet(false);
                    setMotifRejet("");
                    setClore(false);
                    setMotifCloture("");
                  })
                }
                className="rounded bg-rouge700 px-3 py-1.5 text-13 font-bold text-blanc disabled:opacity-50"
              >
                {clore ? "Confirmer le rejet et la clôture" : "Confirmer le rejet et le renvoi"}
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-13">
              Motif de rejet
              <textarea
                value={motifRejet}
                onChange={(e) => setMotifRejet(e.target.value)}
                rows={3}
                className="rounded border border-gris200 p-2 text-13"
              />
            </label>

            <label className="flex items-start gap-2 text-13">
              <input type="checkbox" className="mt-0.5" checked={clore} onChange={(e) => setClore(e.target.checked)} />
              <span>
                Et clôturer le dossier, au lieu de le renvoyer à l&apos;initiateur pour correction
                <span className="block text-12 text-gris600">
                  Par défaut, un rejet renvoie le dossier à l&apos;initiateur (statut Brouillon) pour qu&apos;il corrige et
                  resoumette. Cochez cette case pour clôturer définitivement le dossier à la place.
                </span>
              </span>
            </label>

            {clore && (
              <label className="flex flex-col gap-1 text-13">
                Motif de clôture
                <textarea
                  value={motifCloture}
                  onChange={(e) => setMotifCloture(e.target.value)}
                  rows={3}
                  className="rounded border border-gris200 p-2 text-13"
                />
              </label>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
