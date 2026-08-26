"use client";

import { useEffect, useState } from "react";
import { Button, Icon, Modal, SlaTimer, TypeActeurBadge, useToast } from "@pgd/ui";
import type { Demande, EtapeDossier, MembreRoleVue, RevueChamp, SessionUtilisateur, TacheVue } from "@pgd/contracts";
import {
  ApiError,
  approuverTache,
  claimTache,
  deleguerTache,
  listerMembresRole,
  prolongerVerrouTache,
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

  const toast = useToast();
  const [tache, setTache] = useState<TacheVue | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [modalRejet, setModalRejet] = useState(false);
  const [modalExamen, setModalExamen] = useState(false);
  const [modalDeleguer, setModalDeleguer] = useState(false);
  const [modalVerrouExpire, setModalVerrouExpire] = useState(false);
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

  // Modal de confirmation d'expiration du verrou (25/08/2026, demande
  // explicite) — surveille tache.verrouExpireAt tant que la tâche est
  // réclamée PAR MOI, déclenche le modal dès que l'échéance est atteinte
  // (même cadence de vérification — 1s — que SlaTimer, packages/ui). Ne se
  // referme jamais tout seul (pas de setModalVerrouExpire(false) côté
  // watcher) : seules les deux actions du modal (Continuer/Libérer) le
  // ferment — le locks-sweeper (apps/worker, cron 5 min) libère de toute
  // façon la tâche si personne ne répond, ce modal n'est qu'une chance
  // donnée à l'humain d'agir avant cette libération automatique.
  useEffect(() => {
    const detenuParMoi = tache?.etat === "RECLAMEE" && tache.agentClaimId === utilisateur.id;
    if (!detenuParMoi || !tache?.verrouExpireAt) {
      setModalVerrouExpire(false);
      return;
    }
    const echeance = new Date(tache.verrouExpireAt).getTime();
    function verifier() {
      if (Date.now() >= echeance) setModalVerrouExpire(true);
    }
    verifier();
    const intervalle = setInterval(verifier, 1000);
    return () => clearInterval(intervalle);
  }, [tache, utilisateur.id]);

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

  // Retourne `true` en cas de succès, `false` en cas d'échec (erreur déjà
  // posée dans `erreur`) — nécessaire depuis que les appelants (toast de
  // confirmation, 25/08/2026) doivent distinguer les deux : avant, chaque
  // appelant fermait sa modale et poursuivait inconditionnellement après
  // `executer(...)`, même en échec (l'erreur restait affichée, mais la
  // modale se fermait quand même — déjà le comportement existant, pas
  // aggravé ici, seulement rendu explicite pour que le toast ne mente
  // jamais sur un échec réel).
  async function executer(action: () => Promise<unknown>): Promise<boolean> {
    setChargement(true);
    setErreur(null);
    try {
      await action();
      onActionEffectuee();
      return true;
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Action impossible.");
      return false;
    } finally {
      setChargement(false);
    }
  }

  async function handleApprouver(revue: RevueChamp[]) {
    const succes = await executer(() => approuverTache(tache!.id, { revue }));
    setModalExamen(false);
    if (succes) {
      toast({ ton: "succes", titre: "Étape approuvée", message: `Dossier ${demande.reference} — ${etapeActionnable!.roleLibelle}.` });
    }
  }

  // Rejet déclenché depuis l'examen (anomalie signalée) — toujours un
  // renvoi par défaut (clore: false), jamais une clôture terminale : ce
  // chemin est un raccourci de « j'ai trouvé un problème en revoyant le
  // dossier », pas une décision de clore définitivement. Le bouton
  // « Rejeter » dédié (modalRejet, ci-dessous), avec sa case « et
  // clôturer », reste le seul chemin vers une clôture terminale.
  async function handleRejeterDepuisExamen(motifCompile: string) {
    const succes = await executer(() => rejeterTache(tache!.id, { motif: motifCompile, clore: false }));
    setModalExamen(false);
    if (succes) {
      toast({ ton: "info", titre: "Dossier rejeté et renvoyé", message: `Dossier ${demande.reference} — renvoyé à l'initiateur pour correction.` });
    }
  }

  async function handleDeleguer(valeur: { delegataireId: string; debut: string; fin: string; noteInterim: string }) {
    await executer(() => deleguerTache(tache!.id, valeur));
    setModalDeleguer(false);
  }

  // « Continuer à garder la main » — pas via executer() (chargement/erreur
  // partagés conviennent, mais on a besoin de la TacheVue à jour pour
  // reposer tache.verrouExpireAt, executer() ne renvoie qu'un booléen).
  async function handleContinuerVerrou() {
    setChargement(true);
    setErreur(null);
    try {
      const misAJour = await prolongerVerrouTache(tache!.id);
      setTache(misAJour);
      setModalVerrouExpire(false);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Action impossible.");
    } finally {
      setChargement(false);
    }
  }

  async function handleLibererDefinitivement() {
    const succes = await executer(() => unclaimTache(tache!.id));
    setModalVerrouExpire(false);
    if (succes) {
      toast({ ton: "info", titre: "Dossier libéré", message: `Dossier ${demande.reference} — remis en corbeille.` });
    }
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
                    const cloreCeRejet = clore;
                    await rejeterTache(tache.id, {
                      motif: motifRejet.trim(),
                      clore,
                      motifCloture: clore ? motifCloture.trim() : undefined
                    });
                    setModalRejet(false);
                    setMotifRejet("");
                    setClore(false);
                    setMotifCloture("");
                    toast({
                      ton: "info",
                      titre: cloreCeRejet ? "Dossier rejeté et clôturé" : "Dossier rejeté et renvoyé",
                      message: `Dossier ${demande.reference}.`
                    });
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

      {modalVerrouExpire && (
        // Pas de fermeture par Échap/clic extérieur/croix (onFermer no-op) —
        // une décision explicite est requise, sans quoi le locks-sweeper
        // (apps/worker, cron 5 min) libère la tâche de toute façon.
        <Modal titre="Vous détenez cette tâche depuis longtemps" icone="lock" onFermer={() => {}}>
          <div className="flex flex-col gap-4 text-13">
            <p className="text-gris700">
              Le délai de récupération de cette tâche est atteint. Souhaitez-vous continuer à la traiter, ou la
              libérer pour qu&apos;un autre agent puisse la reprendre ?
            </p>
            <div className="flex justify-end gap-2.5">
              <Button disabled={chargement} onClick={handleLibererDefinitivement} variante="fantome" taille="petite">
                Libérer définitivement
              </Button>
              <Button disabled={chargement} onClick={handleContinuerVerrou} variante="sombre" taille="petite">
                <Icon nom="lock" taille={14} /> Continuer à garder la main
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
