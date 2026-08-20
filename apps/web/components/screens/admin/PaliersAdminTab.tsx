"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, CircuitPill, Empty, Icon, Money, TypeActeurBadge } from "@pgd/ui";
import type { CircuitVue, EnumCircuit, PalierVue, RoleVue, TrouPalier } from "@pgd/contracts";
import { ApiError, creerPalier, listerCircuits, listerPaliers, listerRoles, modifierPalier, supprimerPalier } from "@/lib/api";
import { PalierModal, type PalierModalValeur } from "./PalierModal";

// Port du volet « Processus » de la maquette (docs/design/screens3.jsx,
// MatriceView) : rail de circuits à gauche + canevas de tranches à droite,
// chaîne d'étapes en timeline verticale (Soumission → étapes → Validé),
// simulateur de montant en lecture pure sur les bornes déjà chargées.
//
// Volontairement non repris de la maquette :
// - « Nouveau processus » (créer un circuit à la volée) : EnumCircuit est un
//   ENUM Postgres à 3 valeurs fixes (DOBB/DXC/DF) — contredit le modèle de
//   données, catégorie 1 de la règle de contrainte visuelle, pas une omission.
// - Glisser-déposer pour réordonner les étapes : décision déjà actée dans
//   PalierModal (boutons haut/bas, cf. commentaire dédié) — pas rouvert ici.
// - Avatars des membres par rôle : `E3.membersOfRole` n'a pas d'équivalent
//   réel, cf. CLAUDE.md « Aucune route ne liste ou ne recherche les
//   utilisateurs » — même trou déjà consigné pour CorbeillesScreen.
// - Édition inline dans le canevas : le CRUD reste dans PalierModal, comme
//   partout ailleurs dans AdminScreen (RoleModal, MotifModal) — cohérence de
//   convention, pas une omission.
export function PaliersAdminTab() {
  const [circuits, setCircuits] = useState<CircuitVue[] | null>(null);
  const [paliers, setPaliers] = useState<PalierVue[] | null>(null);
  const [trous, setTrous] = useState<TrouPalier[] | null>(null);
  const [roles, setRoles] = useState<RoleVue[] | null>(null);
  const [circuitActif, setCircuitActif] = useState<EnumCircuit>("DOBB");
  const [simulateur, setSimulateur] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [palierEnEdition, setPalierEnEdition] = useState<PalierVue | null | undefined>(undefined);
  const [chargementModal, setChargementModal] = useState(false);

  const charger = useCallback(async () => {
    try {
      const [reponsePaliers, listeCircuits, listeRoles] = await Promise.all([listerPaliers(), listerCircuits(), listerRoles()]);
      setPaliers(reponsePaliers.paliers);
      setTrous(reponsePaliers.trous);
      setCircuits(listeCircuits);
      setRoles(listeRoles);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Erreur inattendue.");
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function handleConfirmer(v: PalierModalValeur) {
    setChargementModal(true);
    try {
      const etapes = v.etapes.map((e, i) => ({
        ordre: i + 1,
        roleCode: e.roleCode,
        typeActeur: e.typeActeur,
        bloquant: e.bloquant,
        slaHeures: Number(e.slaHeures)
      }));
      const payload = {
        circuit: v.circuit,
        segment: v.segment,
        sousFlux: v.sousFlux || undefined,
        borneMin: Number(v.borneMin),
        borneMax: Number(v.borneMax),
        labelPalier: v.labelPalier || undefined,
        etapes
      };
      if (palierEnEdition) {
        await modifierPalier(palierEnEdition.id, payload);
      } else {
        await creerPalier(payload);
      }
      setPalierEnEdition(undefined);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Enregistrement impossible.");
    } finally {
      setChargementModal(false);
    }
  }

  async function handleSupprimer(id: string) {
    try {
      await supprimerPalier(id);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Suppression impossible.");
    }
  }

  const roleLibelle = useMemo(() => {
    const table: Record<string, string> = {};
    for (const r of roles ?? []) table[r.code] = r.libelle;
    return table;
  }, [roles]);

  const paliersDuCircuit = useMemo(
    () => (paliers ?? []).filter((p) => p.circuit === circuitActif).slice().sort((a, b) => a.borneMin - b.borneMin),
    [paliers, circuitActif]
  );
  const trousDuCircuit = (trous ?? []).filter((t) => t.circuit === circuitActif);
  const circuit = (circuits ?? []).find((c) => c.code === circuitActif);

  const montantTest = simulateur !== "" ? Number(simulateur) : null;
  const palierDeclencheId =
    montantTest !== null && Number.isFinite(montantTest)
      ? paliersDuCircuit.find((p) => montantTest >= p.borneMin && montantTest <= p.borneMax)?.id ?? null
      : null;

  if (!paliers || !circuits) return <p className="text-13 text-gris600">Chargement…</p>;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      {/* Rail — un onglet par circuit, comme le volet gauche de la maquette */}
      <div className="flex flex-col gap-1">
        <div className="mb-1 text-11 font-bold uppercase tracking-wide text-gris600">Processus ({circuits.length})</div>
        {circuits.map((c) => {
          const nb = (paliers ?? []).filter((p) => p.circuit === c.code).length;
          return (
            <button
              key={c.code}
              type="button"
              onClick={() => {
                setCircuitActif(c.code);
                setSimulateur("");
              }}
              className={`flex items-center gap-2 rounded-6 border px-3 py-2 text-left text-13 ${
                circuitActif === c.code ? "border-encre bg-gris50 font-bold" : "border-gris200 text-gris700"
              }`}
            >
              <CircuitPill code={c.code} />
              <span className="flex-1">
                <div className="font-semibold">{c.libelle}</div>
                <div className="text-11 text-gris600">
                  {c.segment} · {nb} tranche{nb === 1 ? "" : "s"}
                </div>
              </span>
            </button>
          );
        })}
      </div>

      {/* Canevas — tranches du circuit actif */}
      <div className="flex flex-col gap-4">
        {erreur && <p className="text-13 font-semibold text-rouge700">{erreur}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CircuitPill code={circuitActif} />
            <div>
              <div className="text-15 font-bold">{circuit?.libelle}</div>
              <div className="text-11 text-gris600">
                {circuit?.segment}
                {circuit?.processCode ? ` · ${circuit.processCode}` : ""}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-6 border border-gris200 bg-gris50 px-3 py-2">
            <Icon nom="calc" taille={15} />
            <span className="text-12 text-gris600">Tester un montant</span>
            <input
              type="number"
              value={simulateur}
              onChange={(e) => setSimulateur(e.target.value)}
              placeholder="ex. 8 000 000"
              className="w-32 rounded border border-gris300 px-2 py-1 font-mono text-12"
            />
            <span className="text-11 text-gris600">FCFA</span>
            {simulateur !== "" &&
              (palierDeclencheId ? <Badge ton="succes">tranche trouvée</Badge> : <Badge ton="erreur">aucune tranche</Badge>)}
          </div>

          <Button onClick={() => setPalierEnEdition(null)} variante="sombre" taille="petite">
            + Nouveau palier
          </Button>
        </div>

        {trousDuCircuit.length > 0 && (
          <div className="rounded border border-jaune700 bg-jauneFond p-3">
            <p className="mb-1 text-13 font-bold text-jaune700">Trous détectés entre tranches — signalés, pas bloquants</p>
            <ul className="text-12 text-gris700">
              {trousDuCircuit.map((t, i) => (
                <li key={i}>
                  {t.segment}
                  {t.sousFlux ? ` / ${t.sousFlux}` : ""} : de <Money valeur={t.borneMin} /> à <Money valeur={t.borneMax} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {paliersDuCircuit.length === 0 && (
          // docs/design/screens3.jsx:660 — <Card><Empty icon="flow"
          // title="Aucune tranche"> ..., même défaut déjà corrigé sur
          // CorbeillesScreen/ControleScreen/PiecesTab/AuditTab.
          <Card>
            <Empty icone="flow" titre="Aucune tranche">
              Cliquez sur « Nouveau palier » pour composer ce processus.
            </Empty>
          </Card>
        )}

        {paliersDuCircuit.map((p) => (
          <div key={p.id} className={`rounded-6 border bg-blanc p-4 ${p.id === palierDeclencheId ? "border-vert700" : "border-gris200"}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-13 font-bold">{p.labelPalier ?? p.segment}</span>
                {p.sousFlux && <span className="text-12 text-gris600">({p.sousFlux})</span>}
                {!p.actif && <Badge ton="neutre">inactif</Badge>}
                {p.id === palierDeclencheId && <Badge ton="succes">déclenchée</Badge>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-12 text-gris600">
                  de <Money valeur={p.borneMin} /> à <Money valeur={p.borneMax} />
                </span>
                <button type="button" onClick={() => setPalierEnEdition(p)} className="text-12 font-semibold text-encre underline">
                  Modifier
                </button>
                <button type="button" onClick={() => handleSupprimer(p.id)} className="text-12 font-semibold text-rouge700 underline">
                  Supprimer
                </button>
              </div>
            </div>

            {/* Timeline verticale — Soumission → étapes ordonnées → Validé */}
            <div className="flex flex-col gap-2 border-l-2 border-gris200 pl-4">
              <div className="flex items-center gap-2 text-12 text-gris600">
                <Icon nom="send" taille={13} /> Soumission de la demande
              </div>
              {p.etapesRegle
                .slice()
                .sort((a, b) => a.ordre - b.ordre)
                .map((e) => (
                  <div key={e.id} className="flex items-center gap-2 rounded border border-gris200 bg-gris50 p-2 text-13">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gris200 text-11 font-bold text-gris700">
                      {e.ordre}
                    </span>
                    <span className="flex-1 font-semibold">{roleLibelle[e.roleCode] ?? e.roleCode}</span>
                    <TypeActeurBadge type={e.typeActeur} />
                    <span className="flex items-center gap-1 text-12 text-gris600">
                      <Icon nom="clock" taille={12} /> {e.slaHeures} h
                    </span>
                    {!e.bloquant && <Badge ton="neutre">non bloquant</Badge>}
                  </div>
                ))}
              <div className="flex items-center gap-2 text-12 font-semibold text-vert700">
                <Icon nom="check" taille={13} /> Demande validée — transmise au SI de facturation
              </div>
            </div>
          </div>
        ))}
      </div>

      {palierEnEdition !== undefined && (
        <PalierModal
          palier={palierEnEdition}
          circuitParDefaut={circuitActif}
          onFermer={() => setPalierEnEdition(undefined)}
          onConfirmer={handleConfirmer}
          chargement={chargementModal}
        />
      )}
    </div>
  );
}
