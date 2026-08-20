"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Field, Icon, Modal, Money } from "@pgd/ui";
import type { EnumAssietteTva, ParametreCalculVue } from "@pgd/contracts";
import { ApiError, compterBrouillons, listerParametresCalcul, modifierParametreCalcul } from "@/lib/api";

interface EditionParametre {
  tauxTsc: string;
  tauxTva: string;
  tscActiveDefaut: boolean;
  tvaActiveDefaut: boolean;
  assietteTvaDefaut: EnumAssietteTva;
  devise: string;
}

function versEdition(p: ParametreCalculVue): EditionParametre {
  return {
    tauxTsc: String(p.tauxTsc),
    tauxTva: String(p.tauxTva),
    tscActiveDefaut: p.tscActiveDefaut,
    tvaActiveDefaut: p.tvaActiveDefaut,
    assietteTvaDefaut: p.assietteTvaDefaut,
    devise: p.devise
  };
}

// Un changement de taux ici recalcule IMMÉDIATEMENT tous les brouillons du
// circuit (AdminParametresCalculService.modifier, HistoriqueMontant
// origine=RECALCUL) — les demandes déjà SOUMISes gardent leur taux figé,
// jamais retouchées. Une confirmation AVANT écriture (pas seulement un
// compte-rendu après) est nécessaire dès que ce nombre est significatif :
// demandé explicitement en revue plutôt que découvert après coup.
const SEUIL_CONFIRMATION = 5;
const MONTANT_EXEMPLE = 1_000_000;

// Port partiel de docs/design/screens3.jsx (CalcConfigView) : icône d'en-tête
// + bascule visuelle de l'activation par défaut + aperçu de calcul.
//
// L'aperçu reproduit la formule EXACTE de MontantService.calculer()
// (apps/api/src/modules/demandes/services/montant.service.ts) — assiette
// TVA = HT+TSC si assietteTvaDefaut==='HT_TSC', HT seul sinon — vérifié
// contre le service réel avant d'être ajouté, pas supposé depuis la
// maquette. assietteTvaDefaut (Phase 10.6septies, confirmation métier
// docs/10 remarques DOBB #1/#2/#6) est désormais un vrai choix admin par
// circuit — le défaut HT_TSC préserve le comportement d'avant ce chantier
// pour tout circuit non retouché. Une saisie manuelle par dossier
// (Demande.assietteTva/tscManuelle/tvaManuelle) reste possible et prioritaire
// sur ce défaut, mais vit dans la fiche de demande, pas ici. Purement
// illustratif (montant fixe 1 000 000, jamais une vraie demande), avec les
// taux et bascules actuellement en cours d'édition — recalculé à chaque
// frappe, sans appel serveur.
//
// Le panneau « Rejets SLA » de la maquette (RejetsSlaPanel) n'est pas
// repris : contredit `docs/04_MCD_MLD_PGD_PROD.md` (minuteur_bloquant=FALSE
// pour l'Initiateur) — déjà tranché dans DIVERGENCES.md, catégorie
// « Écarts tranchés », pas rouvert ici.
export function ParametresCalculAdminTab() {
  const [parametres, setParametres] = useState<ParametreCalculVue[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [edition, setEdition] = useState<Record<string, EditionParametre>>({});
  const [enregistrement, setEnregistrement] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ circuit: string; nbBrouillons: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const liste = await listerParametresCalcul();
      setParametres(liste);
      setEdition(Object.fromEntries(liste.map((p) => [p.circuit, versEdition(p)])));
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Erreur inattendue.");
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function demanderEnregistrement(circuit: string) {
    setMessage(null);
    try {
      const nbBrouillons = await compterBrouillons(circuit);
      if (nbBrouillons >= SEUIL_CONFIRMATION) {
        setConfirmation({ circuit, nbBrouillons });
      } else {
        await appliquer(circuit);
      }
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Impossible de vérifier les brouillons concernés.");
    }
  }

  async function appliquer(circuit: string) {
    const e = edition[circuit];
    if (!e) return;
    setEnregistrement(circuit);
    try {
      const reponse = await modifierParametreCalcul(circuit, {
        tauxTsc: Number(e.tauxTsc),
        tauxTva: Number(e.tauxTva),
        tscActiveDefaut: e.tscActiveDefaut,
        tvaActiveDefaut: e.tvaActiveDefaut,
        assietteTvaDefaut: e.assietteTvaDefaut,
        devise: e.devise
      });
      setMessage(
        reponse.demandesBrouillonRecalculees > 0
          ? `${reponse.demandesBrouillonRecalculees} demande(s) en brouillon sur ${circuit} ont été recalculées avec le nouveau taux.`
          : `Taux mis à jour sur ${circuit} — aucun brouillon en attente sur ce circuit, rien à recalculer.`
      );
      setConfirmation(null);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Modification impossible.");
    } finally {
      setEnregistrement(null);
    }
  }

  if (!parametres) return <p className="text-13 text-gris600">Chargement…</p>;

  return (
    <div className="flex flex-col gap-4">
      {erreur && <p className="text-13 font-semibold text-rouge700">{erreur}</p>}
      {message && <p className="rounded bg-vertFond p-3 text-13 font-semibold text-vertTexteSurClair">{message}</p>}

      {parametres.map((p) => {
        const e = edition[p.circuit];
        if (!e) return null;
        // tauxTsc/tauxTva sont stockés en base comme des fractions brutes
        // (0.03 = 3 %, packages/database/prisma/schema.prisma) — le champ de
        // saisie ci-dessous les édite tels quels (convention déjà en place
        // avant ce tour, pas changée ici) ; l'aperçu doit donc appliquer la
        // fraction DIRECTEMENT, jamais divisée par 100 — vérifié contre
        // MontantService.calculer() avant d'écrire cette ligne, une erreur
        // ×100 aurait été invisible sans cette vérification.
        const ht = MONTANT_EXEMPLE;
        const tsc = e.tscActiveDefaut ? ht * Number(e.tauxTsc) : 0;
        const assiette = e.assietteTvaDefaut === "HT_TSC" ? ht + tsc : ht;
        const tva = e.tvaActiveDefaut ? assiette * Number(e.tauxTva) : 0;
        const ttc = ht + tsc + tva;
        const tauxTscPourcent = (Number(e.tauxTsc) * 100).toFixed(2);
        const tauxTvaPourcent = (Number(e.tauxTva) * 100).toFixed(2);

        return (
          <div key={p.circuit} className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <Icon nom="calc" taille={17} />
                <h3 className="font-mono text-14 font-bold">{p.circuit}</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Taux TSC (%)">
                  <input
                    type="number"
                    step="0.01"
                    value={e.tauxTsc}
                    onChange={(ev) => setEdition((prev) => ({ ...prev, [p.circuit]: { ...prev[p.circuit]!, tauxTsc: ev.target.value } }))}
                    className="rounded border border-gris300 px-2 py-1 text-13"
                  />
                </Field>
                <Field label="Taux TVA (%)">
                  <input
                    type="number"
                    step="0.01"
                    value={e.tauxTva}
                    onChange={(ev) => setEdition((prev) => ({ ...prev, [p.circuit]: { ...prev[p.circuit]!, tauxTva: ev.target.value } }))}
                    className="rounded border border-gris300 px-2 py-1 text-13"
                  />
                </Field>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setEdition((prev) => ({ ...prev, [p.circuit]: { ...prev[p.circuit]!, tscActiveDefaut: !e.tscActiveDefaut } }))}
                  className={`rounded border px-3 py-1 text-12 font-bold ${
                    e.tscActiveDefaut ? "border-vert700 bg-vertFond text-vertTexteSurClair" : "border-gris300 text-gris700"
                  }`}
                >
                  TSC {e.tscActiveDefaut ? "active" : "inactive"} par défaut
                </button>
                <button
                  type="button"
                  onClick={() => setEdition((prev) => ({ ...prev, [p.circuit]: { ...prev[p.circuit]!, tvaActiveDefaut: !e.tvaActiveDefaut } }))}
                  className={`rounded border px-3 py-1 text-12 font-bold ${
                    e.tvaActiveDefaut ? "border-vert700 bg-vertFond text-vertTexteSurClair" : "border-gris300 text-gris700"
                  }`}
                >
                  TVA {e.tvaActiveDefaut ? "active" : "inactive"} par défaut
                </button>
              </div>
              <div className="mt-3">
                <span className="mb-1 block text-12 font-bold text-gris700">Assiette de la TVA par défaut</span>
                {/* Libellés alignés sur le radio du formulaire d'ajustement
                    (docs/design/screens1.jsx:503/507) pour rester cohérents
                    d'un écran à l'autre — CalcConfigView (screens3.jsx),
                    seule source maquette pour CET écran précis, n'a qu'une
                    bascule d'affichage ("Afficher la ligne HT+TSC"), pas un
                    choix d'assiette : ParametreCalcul.assietteTvaDefaut est
                    une capacité réelle construite au-delà de ce que montre
                    ce screen précis, donc pas de libellé maquette à reprendre
                    ici mot pour mot — réutilisation du vocabulaire déjà
                    établi ailleurs plutôt qu'une invention. */}
                <div className="flex flex-col gap-2">
                  <label className="flex items-start gap-2 text-12">
                    <input
                      type="radio"
                      name={`assietteTvaDefaut-${p.circuit}`}
                      className="mt-0.5"
                      checked={e.assietteTvaDefaut === "HT"}
                      onChange={() => setEdition((prev) => ({ ...prev, [p.circuit]: { ...prev[p.circuit]!, assietteTvaDefaut: "HT" } }))}
                    />
                    <span>
                      <strong>Nouvelle règle</strong> — TVA sur le <strong>montant HT</strong>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-12">
                    <input
                      type="radio"
                      name={`assietteTvaDefaut-${p.circuit}`}
                      className="mt-0.5"
                      checked={e.assietteTvaDefaut === "HT_TSC"}
                      onChange={() => setEdition((prev) => ({ ...prev, [p.circuit]: { ...prev[p.circuit]!, assietteTvaDefaut: "HT_TSC" } }))}
                    />
                    <span>
                      <strong>Ancienne règle</strong> — TVA sur <strong>HT + TSC</strong>
                    </span>
                  </label>
                </div>
              </div>
              <Button
                onClick={() => demanderEnregistrement(p.circuit)}
                disabled={enregistrement === p.circuit}
                variante="sombre"
                taille="petite"
                className="mt-3"
              >
                {enregistrement === p.circuit ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </Card>

            {/* lg:sticky lg:top-26 (audit de complétude structurelle) — la
                maquette pose position:sticky;top:86 sur ce même panneau
                Aperçu (screens3.jsx:1059), jamais reproduit ici. */}
            <div className="rounded-6 border border-gris200 bg-gris50 p-4 lg:sticky lg:top-26">
              <div className="mb-2 flex items-center gap-2">
                <Icon nom="eye" taille={15} />
                <span className="text-12 font-bold text-gris700">Aperçu — exemple 1 000 000 FCFA HT</span>
              </div>
              <div className="flex flex-col gap-1 text-13">
                <div className="flex justify-between">
                  <span className="text-gris600">Montant HT</span>
                  <Money valeur={ht} />
                </div>
                {e.tscActiveDefaut && (
                  <div className="flex justify-between">
                    <span className="text-gris600">TSC ({tauxTscPourcent} %)</span>
                    <Money valeur={tsc} />
                  </div>
                )}
                {/* Ligne "HT + TSC" — visible seulement quand l'ancienne
                    règle est réellement en jeu (screens1.jsx:529 : applyTsc
                    && applyTva && tvaBase === "htTsc"), même condition que
                    dans le panneau Taxes du formulaire d'ajustement. */}
                {e.tscActiveDefaut && e.tvaActiveDefaut && e.assietteTvaDefaut === "HT_TSC" && (
                  <div className="flex justify-between text-12 text-gris500">
                    <span>HT + TSC</span>
                    <Money valeur={assiette} />
                  </div>
                )}
                {e.tvaActiveDefaut && (
                  <div className="flex justify-between">
                    <span className="text-gris600">
                      TVA ({tauxTvaPourcent} %) · {e.assietteTvaDefaut === "HT_TSC" ? "sur HT+TSC" : "sur HT"}
                    </span>
                    <Money valeur={tva} />
                  </div>
                )}
                <div className="mt-1 flex justify-between border-t border-gris200 pt-1 font-bold">
                  <span>Total TTC</span>
                  <Money valeur={ttc} fort className="text-orange600" />
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {confirmation && (
        <Modal
          titre="Confirmer le changement de taux"
          onFermer={() => setConfirmation(null)}
          pied={
            <>
              <Button onClick={() => setConfirmation(null)} variante="fantome" taille="petite">
                Annuler
              </Button>
              <Button
                onClick={() => appliquer(confirmation.circuit)}
                disabled={enregistrement === confirmation.circuit}
                variante="sombre"
                taille="petite"
              >
                Confirmer et recalculer
              </Button>
            </>
          }
        >
          <p className="text-13">
            Ce changement va recalculer immédiatement <strong>{confirmation.nbBrouillons} demande(s) en brouillon</strong> sur le
            circuit {confirmation.circuit} avec le nouveau taux. Les demandes déjà soumises ne sont pas concernées : leur taux reste
            figé à la date de soumission.
          </p>
        </Modal>
      )}
    </div>
  );
}
