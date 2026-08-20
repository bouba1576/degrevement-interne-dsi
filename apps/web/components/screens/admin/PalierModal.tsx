"use client";

import { useEffect, useState } from "react";
import { Button, Modal } from "@pgd/ui";
import type { EnumCircuit, EnumTypeActeur, PalierVue, RoleVue } from "@pgd/contracts";
import { ApiError, listerRoles } from "@/lib/api";

export interface EtapeEdition {
  roleCode: string;
  typeActeur: EnumTypeActeur;
  bloquant: boolean;
  slaHeures: string;
}

export interface PalierModalValeur {
  circuit: EnumCircuit;
  segment: string;
  sousFlux: string;
  borneMin: string;
  borneMax: string;
  labelPalier: string;
  etapes: EtapeEdition[];
}

export interface PalierModalProps {
  palier: PalierVue | null;
  circuitParDefaut?: EnumCircuit;
  onFermer: () => void;
  onConfirmer: (valeur: PalierModalValeur) => void;
  chargement: boolean;
}

function etapeParDefaut(): EtapeEdition {
  return { roleCode: "", typeActeur: "V", bloquant: true, slaHeures: "24" };
}

// R1/R2/R11 : la chaîne d'étapes d'un palier EST la règle de routage pour la
// tranche (circuit, segment, bornes) — pas de champ dédié pour distinguer un
// contrôle FRA d'une validation V/A ordinaire (cf. CLAUDE.md, convention R12
// par donnée : roleCode='FRA' + typeActeur='C'). L'ordre se change par
// boutons haut/bas, jamais par glisser-déposer natif — même capacité, moins
// de code, et le glisser-déposer accessible au clavier est un chantier en
// soi (arbitrage explicite, pas un raccourci pris par défaut).
// `modeAffectation` n'est pas exposé : ENUM_AFFECTATION n'a qu'une seule
// valeur possible ("PULL", R5 — jamais de désignation nominative), un
// sélecteur à un seul choix n'ajouterait rien.
export function PalierModal({ palier, circuitParDefaut, onFermer, onConfirmer, chargement }: PalierModalProps) {
  const [roles, setRoles] = useState<RoleVue[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [valeur, setValeur] = useState<PalierModalValeur>(
    palier
      ? {
          circuit: palier.circuit,
          segment: palier.segment,
          sousFlux: palier.sousFlux ?? "",
          borneMin: String(palier.borneMin),
          borneMax: String(palier.borneMax),
          labelPalier: palier.labelPalier ?? "",
          etapes: palier.etapesRegle
            .slice()
            .sort((a, b) => a.ordre - b.ordre)
            .map((e) => ({ roleCode: e.roleCode, typeActeur: e.typeActeur, bloquant: e.bloquant, slaHeures: String(e.slaHeures) }))
        }
      : { circuit: circuitParDefaut ?? "DOBB", segment: "B2B", sousFlux: "", borneMin: "0", borneMax: "", labelPalier: "", etapes: [etapeParDefaut()] }
  );

  useEffect(() => {
    listerRoles()
      .then(setRoles)
      .catch((e) => setErreur(e instanceof ApiError ? e.message : "Impossible de charger les rôles."));
  }, []);

  const valide =
    valeur.segment.trim().length > 0 &&
    Number.isFinite(Number(valeur.borneMin)) &&
    Number.isFinite(Number(valeur.borneMax)) &&
    Number(valeur.borneMax) > Number(valeur.borneMin) &&
    valeur.etapes.length > 0 &&
    valeur.etapes.every((e) => e.roleCode.trim().length > 0 && Number.isFinite(Number(e.slaHeures)));

  function ajouterEtape() {
    setValeur((v) => ({ ...v, etapes: [...v.etapes, etapeParDefaut()] }));
  }

  function retirerEtape(index: number) {
    setValeur((v) => ({ ...v, etapes: v.etapes.filter((_, i) => i !== index) }));
  }

  function deplacer(index: number, direction: -1 | 1) {
    setValeur((v) => {
      const cible = index + direction;
      if (cible < 0 || cible >= v.etapes.length) return v;
      const etapes = v.etapes.slice();
      const [retiree] = etapes.splice(index, 1);
      etapes.splice(cible, 0, retiree!);
      return { ...v, etapes };
    });
  }

  function modifierEtape(index: number, partiel: Partial<EtapeEdition>) {
    setValeur((v) => ({ ...v, etapes: v.etapes.map((e, i) => (i === index ? { ...e, ...partiel } : e)) }));
  }

  return (
    <Modal
      titre={palier ? "Modifier le palier" : "Nouveau palier"}
      onFermer={onFermer}
      large
      pied={
        <>
          <button type="button" onClick={onFermer} className="rounded border border-gris200 px-3 py-1.5 text-13 font-bold text-gris700">
            Annuler
          </button>
          <Button disabled={!valide || chargement} onClick={() => onConfirmer(valeur)} variante="sombre" taille="petite">
            Confirmer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {erreur && <p className="text-13 font-semibold text-rouge700">{erreur}</p>}

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-13">
            Circuit
            <select
              value={valeur.circuit}
              disabled={!!palier}
              onChange={(e) => setValeur((v) => ({ ...v, circuit: e.target.value as EnumCircuit }))}
              className="rounded border border-gris300 px-2 py-1 text-13 disabled:bg-gris50 disabled:text-gris500"
            >
              <option value="DOBB">DOBB</option>
              <option value="DXC">DXC</option>
              <option value="DF">DF</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-13">
            Segment
            <input value={valeur.segment} onChange={(e) => setValeur((v) => ({ ...v, segment: e.target.value }))} className="rounded border border-gris300 px-2 py-1 text-13" />
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 text-13">
            Borne min (XOF)
            <input
              type="number"
              value={valeur.borneMin}
              onChange={(e) => setValeur((v) => ({ ...v, borneMin: e.target.value }))}
              className="rounded border border-gris300 px-2 py-1 font-mono text-13"
            />
          </label>
          <label className="flex flex-col gap-1 text-13">
            Borne max (XOF)
            <input
              type="number"
              value={valeur.borneMax}
              onChange={(e) => setValeur((v) => ({ ...v, borneMax: e.target.value }))}
              className="rounded border border-gris300 px-2 py-1 font-mono text-13"
            />
          </label>
          <label className="flex flex-col gap-1 text-13">
            Sous-flux (optionnel)
            <input value={valeur.sousFlux} onChange={(e) => setValeur((v) => ({ ...v, sousFlux: e.target.value }))} className="rounded border border-gris300 px-2 py-1 text-13" />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-13">
          Label du palier
          <input
            value={valeur.labelPalier}
            onChange={(e) => setValeur((v) => ({ ...v, labelPalier: e.target.value }))}
            placeholder="ex. palier de subdélégation — PO6-07"
            className="rounded border border-gris300 px-2 py-1 text-13"
          />
        </label>

        <div className="border-t border-gris100 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-13 font-bold">Étapes de la chaîne ({valeur.etapes.length})</h4>
            <button type="button" onClick={ajouterEtape} className="rounded border border-gris300 px-2 py-1 text-12 font-bold text-gris700">
              + Étape
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {valeur.etapes.map((e, i) => (
              <div key={i} className="flex items-center gap-2 rounded border border-gris200 p-2">
                <div className="flex flex-col">
                  <button type="button" onClick={() => deplacer(i, -1)} disabled={i === 0} className="text-12 text-gris600 disabled:opacity-30">
                    ▲
                  </button>
                  <button type="button" onClick={() => deplacer(i, 1)} disabled={i === valeur.etapes.length - 1} className="text-12 text-gris600 disabled:opacity-30">
                    ▼
                  </button>
                </div>
                <span className="w-5 text-center text-12 font-bold text-gris600">{i + 1}</span>
                <select
                  value={e.roleCode}
                  onChange={(ev) => modifierEtape(i, { roleCode: ev.target.value })}
                  className="rounded border border-gris300 px-2 py-1 text-13"
                >
                  <option value="">— rôle —</option>
                  {roles?.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.code}
                    </option>
                  ))}
                </select>
                <select
                  value={e.typeActeur}
                  onChange={(ev) => modifierEtape(i, { typeActeur: ev.target.value as EnumTypeActeur })}
                  className="rounded border border-gris300 px-2 py-1 text-13"
                >
                  <option value="V">V</option>
                  <option value="A">A</option>
                  <option value="C">C</option>
                </select>
                <input
                  type="number"
                  value={e.slaHeures}
                  onChange={(ev) => modifierEtape(i, { slaHeures: ev.target.value })}
                  className="w-20 rounded border border-gris300 px-2 py-1 text-13"
                  title="SLA (heures ouvrées)"
                />
                <label className="flex items-center gap-1 text-12">
                  <input type="checkbox" checked={e.bloquant} onChange={(ev) => modifierEtape(i, { bloquant: ev.target.checked })} />
                  bloquant
                </label>
                <button type="button" onClick={() => retirerEtape(i)} className="ml-auto text-12 font-semibold text-rouge700 underline">
                  Retirer
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
