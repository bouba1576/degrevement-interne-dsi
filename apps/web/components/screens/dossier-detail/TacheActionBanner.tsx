"use client";

import { useEffect, useState } from "react";
import { Button, Icon, Modal, SlaTimer, TypeActeurBadge } from "@pgd/ui";
import type { Demande, EtapeDossier, MembreRoleVue, RevueChamp, SessionUtilisateur, TacheVue } from "@pgd/contracts";
import {
  ApiError,
  approuverTache,
  claimTache,
  deleguerTache,
  listerMembresRole,
  rejeterTache,
  trouverTache,
  unclaimTache
} from "@/lib/api";
import { DeleguerModal } from "./DeleguerModal";
import { ExaminerModal } from "./ExaminerModal";

export interface TacheActionBannerProps {
  etapes: EtapeDossier[];
  utilisateur: SessionUtilisateur;
  // Ajoutés le 25/08/2026 (modal d'examen) — le bandeau doit désormais
  // afficher les champs du dossier (ExaminerModal), pas seulement agir sur
  // la tâche.
  demande: Demande;
  motifLibelle: string | null;
  circuitLibelle: string | null;
  onActionEffectuee: () => void;
}

export function TacheActionBanner({
  etapes,
  utilisateur,
  demande,
  motifLibelle,
  circuitLibelle,
  onActionEffectuee
}: TacheActionBannerProps) {
  const etapeActionnable = etapes.find(
    (e) => utilisateur.roles.includes(e.roleCode) && (e.etat === "EN_CORBEILLE" || e.etat === "RECLAMEE")
  );

  const [tache, setTache] = useState<TacheVue | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [modalRejet, setModalRejet] = useState(false);
  const [modalExamen, setModalExamen] = useState(false);
  const [modalDeleguer, setModalDeleguer] = useState(false);
  // GET /api/referentiels/roles/:roleCode/membres (25/08/2026, bouton
  // Déléguer — cf. CLAUDE.md « Aucune route ne liste ou ne recherche les
  // utilisateurs »). Sert deux besoins avec un seul fetch : peupler le
  // sélecteur du modal Déléguer, ET résoudre le nom du collègue qui a
  // réclamé la tâche (ci-dessous, reclameeParAutre) — jamais un second appel
  // pour le second besoin.
  const [membres, setMembres] = useState<MembreRoleVue[] | null>(null);
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

  useEffect(() => {
    if (!etapeActionnable) {
      setMembres(null);
      return;
    }
    let annule = false;
    listerMembresRole(etapeActionnable.roleCode).then((m) => {
      if (!annule) setMembres(m);
    });
    return () => {
      annule = true;
    };
  }, [etapeActionnable]);

  if (!etapeActionnable || !tache) return null;

  const nomCollegue = membres?.find((m) => m.id === tache.agentClaimId)?.nom ?? null;
  const candidatsDelegation = (membres ?? []).filter((m) => m.id !== utilisateur.id);

  const reclameeParMoi = tache.etat === "RECLAMEE" && tache.agentClaimId === utilisateur.id;
  const reclameeParAutre = tache.etat === "RECLAMEE" && tache.agentClaimId !== utilisateur.id;

  // Avertissement SoD (25/08/2026, audit du profil Validateur) — CONFORT
  // D'AFFICHAGE UNIQUEMENT, jamais la garantie : approximé par nom
  // (EtapeDossier.acteurNom n'expose aucun id), le serveur (SodGuard, R3/
  // R21/R24) reste la seule vérification réelle. Un faux négatif (deux
  // acteurs homonymes) laisserait passer ce bandeau mais échouerait quand
  // même à l'action réelle (403) ; un faux positif bloquerait ce bandeau
  // sans bloquer réellement — risque jugé acceptable pour un simple
  // avertissement anticipé, jamais utilisé comme contrôle d'accès.
  const etapePrecedente = etapes.find((e) => e.ordre === etapeActionnable.ordre - 1);
  const sodSuspect = !!etapePrecedente?.dateDecision && etapePrecedente.acteurNom === utilisateur.nom;

  const etapesBloquantes = etapes.filter((e) => e.bloquant);
  const isFinal =
    etapesBloquantes.length > 0 && etapeActionnable.ordre === Math.max(...etapesBloquantes.map((e) => e.ordre));

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

  async function handleApprouver(revue: RevueChamp[]) {
    await executer(() => approuverTache(tache!.id, { revue }));
    setModalExamen(false);
  }

  // Rejet déclenché depuis l'examen (anomalie signalée) — toujours un
  // renvoi par défaut (clore: false), jamais une clôture terminale : ce
  // chemin est un raccourci de « j'ai trouvé un problème en revoyant le
  // dossier », pas une décision de clore définitivement. Le bouton
  // « Rejeter » dédié (modalRejet, ci-dessous), avec sa case « et
  // clôturer », reste le seul chemin vers une clôture terminale.
  async function handleRejeterDepuisExamen(motifCompile: string) {
    await executer(() => rejeterTache(tache!.id, { motif: motifCompile, clore: false }));
    setModalExamen(false);
  }

  async function handleDeleguer(valeur: { delegataireId: string; debut: string; fin: string; noteInterim: string }) {
    await executer(() => deleguerTache(tache!.id, valeur));
    setModalDeleguer(false);
  }

  return (
    <div className="mb-4 rounded-6 border-l-4 border-orange bg-orange50 p-5">
      {erreur && <p className="mb-2 text-13 font-semibold text-rouge700">{erreur}</p>}

      {reclameeParAutre ? (
        // Port fidèle de docs/design/styles.css:372 (.lock-banner) — jusqu'ici
        // un <p> de texte gris ordinaire, sans encart ni icône (trouvé en
        // auditant ce bandeau, 25/08/2026).
        <div className="flex items-center gap-2.5 rounded border border-orange100 bg-orange50 px-3.5 py-2.5 text-[12.5px] font-semibold text-orangeTexteSurClair">
          <Icon nom="lock" taille={16} />
          Tâche récupérée par {nomCollegue ?? "un collègue"} — libération automatique à expiration du verrou.
        </div>
      ) : sodSuspect ? (
        // Bandeau SoD (docs/design/screens2.jsx:403-405) — jusqu'ici absent :
        // un agent bloqué par R3/R21/R24 voyait le même bandeau « Récupérer »
        // que tout le monde, et ne découvrait le blocage qu'après un clic
        // (erreur générique). Couleur reprise telle quelle (rouge, jamais de
        // fond/bordure supplémentaire — déjà à l'intérieur du bandeau
        // orange).
        <div className="flex items-start gap-2 text-13">
          <Icon nom="shield" taille={18} className="mt-0.5 shrink-0 text-rouge700" />
          <div>
            <p className="font-bold text-rouge700">Séparation des tâches (SoD)</p>
            <p className="text-gris700">
              Vous êtes déjà intervenu à l&apos;étape précédente de ce dossier : vous ne pouvez pas traiter celle-ci.
            </p>
          </div>
        </div>
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
              <Button disabled={chargement} onClick={() => executer(() => unclaimTache(tache.id))} variante="fantome" taille="petite">
                Libérer
              </Button>
              <Button disabled={chargement} onClick={() => setModalDeleguer(true)} variante="fantome" taille="petite">
                <Icon nom="delegate" taille={15} /> Déléguer
              </Button>
              <Button disabled={chargement} onClick={() => setModalRejet(true)} variante="danger" taille="petite">
                Rejeter
              </Button>
              <Button disabled={chargement} onClick={() => setModalExamen(true)} variante="succes" taille="petite">
                <Icon nom="eye" taille={15} /> Examiner {etapeActionnable.typeActeur === "V" ? "(vérification)" : "(validation)"}
              </Button>
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
              <Button onClick={() => setModalRejet(false)} variante="fantome" taille="petite">
                Annuler
              </Button>
              <Button
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
                variante="danger"
                taille="petite"
              >
                {clore ? "Confirmer le rejet et la clôture" : "Confirmer le rejet et le renvoi"}
              </Button>
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

      {modalExamen && (
        <ExaminerModal
          demande={demande}
          typeActeur={etapeActionnable.typeActeur}
          roleLibelle={etapeActionnable.roleLibelle}
          motifLibelle={motifLibelle}
          circuitLibelle={circuitLibelle}
          isFinal={isFinal}
          onFermer={() => setModalExamen(false)}
          onApprouver={handleApprouver}
          onRejeter={handleRejeterDepuisExamen}
          chargement={chargement}
        />
      )}

      {modalDeleguer && (
        <DeleguerModal
          roleLibelle={etapeActionnable.roleLibelle}
          membres={candidatsDelegation}
          onFermer={() => setModalDeleguer(false)}
          onConfirmer={handleDeleguer}
          chargement={chargement}
        />
      )}
    </div>
  );
}
