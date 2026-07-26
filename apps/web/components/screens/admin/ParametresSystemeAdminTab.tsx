"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Icon } from "@pgd/ui";
import type { ModuleVue, ParametreGlobalVue } from "@pgd/contracts";
import {
  ApiError,
  listerModules,
  listerParametresGlobaux,
  modifierModule,
  modifierParametreGlobal
} from "@/lib/api";

// Regroupe Module et ParametreGlobal : deux référentiels simples (bascule /
// clé-valeur), sans rapport de contenu, mais assez petits pour ne pas
// mériter chacun leur onglet (cf. échange de décomposition, CLAUDE.md).
//
// Aucune maquette de référence pour cet onglet : le seul « ModulesScreen »
// de docs/design/ vit dans screens4.jsx, déjà exclu en bloc (numérotation
// morte PGD-2x, cf. DIVERGENCES.md). Les icônes de section ci-dessous sont
// une décision de cohérence interne avec les 6 autres onglets d'AdminScreen
// (tous désormais icône + titre, Phase 9.3), pas une extraction de maquette.
export function ParametresSystemeAdminTab() {
  const [modules, setModules] = useState<ModuleVue[] | null>(null);
  const [parametres, setParametres] = useState<ParametreGlobalVue[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [edition, setEdition] = useState<Record<string, string>>({});

  const charger = useCallback(async () => {
    try {
      const [m, p] = await Promise.all([listerModules(), listerParametresGlobaux()]);
      setModules(m);
      setParametres(p);
      setEdition(Object.fromEntries(p.map((param) => [param.cle, JSON.stringify(param.valeur)])));
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Erreur inattendue.");
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function basculerModule(module: ModuleVue) {
    setEnCours(`module:${module.code}`);
    try {
      await modifierModule(module.code, { actif: !module.actif });
      await charger();
    } catch (e) {
      // 422 MODULE_COEUR_INDESACTIVABLE attendu ici pour un module cœur — le
      // bouton désactivé côté client (ci-dessous) est un confort, la 422
      // reste la seule garantie réelle (R2 des règles non négociables).
      setErreur(e instanceof ApiError ? e.message : "Modification impossible.");
    } finally {
      setEnCours(null);
    }
  }

  async function enregistrerParametre(param: ParametreGlobalVue) {
    setEnCours(`param:${param.cle}`);
    try {
      const brut = edition[param.cle] ?? "";
      const valeur: unknown = (() => {
        try {
          return JSON.parse(brut);
        } catch {
          return brut;
        }
      })();
      await modifierParametreGlobal(param.cle, { valeur });
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Modification impossible.");
    } finally {
      setEnCours(null);
    }
  }

  if (!modules || !parametres) return <p className="text-13 text-gris600">Chargement…</p>;

  return (
    <div className="flex flex-col gap-6">
      {erreur && <p className="text-13 font-semibold text-rouge700">{erreur}</p>}

      <section>
        <div className="mb-2 flex items-center gap-2">
          <Icon nom="layers" taille={17} />
          <h3 className="text-14 font-bold">Modules</h3>
        </div>
        <div className="flex flex-col gap-2">
          {modules.map((m) => (
            <div key={m.code} className="flex items-center justify-between rounded border border-gris200 bg-blanc p-3">
              <div>
                <span className="font-mono text-13 font-bold">{m.code}</span>
                <span className="ml-2 text-13">{m.libelle}</span>
                {m.coeur && (
                  <Badge ton="info" pastille>
                    module cœur
                  </Badge>
                )}
              </div>
              <button
                type="button"
                onClick={() => basculerModule(m)}
                disabled={enCours === `module:${m.code}` || (m.coeur && m.actif)}
                title={m.coeur && m.actif ? "Un module cœur ne peut pas être désactivé" : undefined}
                className={`rounded border px-3 py-1 text-12 font-bold disabled:opacity-40 ${
                  m.actif ? "border-vert700 bg-vertFond text-vertTexteSurClair" : "border-gris300 text-gris700"
                }`}
              >
                {m.actif ? "Actif" : "Inactif"}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <Icon nom="gear" taille={17} />
          <h3 className="text-14 font-bold">Paramètres globaux</h3>
        </div>
        <div className="flex flex-col gap-2">
          {parametres.map((p) => (
            <div key={p.cle} className="rounded border border-gris200 bg-blanc p-3">
              <div className="mb-1 flex items-center justify-between">
                <div>
                  <span className="font-mono text-13 font-bold">{p.cle}</span>
                  {p.libelle && <span className="ml-2 text-12 text-gris600">{p.libelle}</span>}
                </div>
                {!p.modifiableAdmin && <Badge ton="neutre">lecture seule</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={edition[p.cle] ?? ""}
                  onChange={(e) => setEdition((prev) => ({ ...prev, [p.cle]: e.target.value }))}
                  disabled={!p.modifiableAdmin}
                  className="flex-1 rounded border border-gris300 px-2 py-1 font-mono text-13 disabled:bg-gris50 disabled:text-gris500"
                />
                {p.modifiableAdmin && (
                  <button
                    type="button"
                    onClick={() => enregistrerParametre(p)}
                    disabled={enCours === `param:${p.cle}`}
                    className="rounded bg-encre px-3 py-1 text-12 font-bold text-blanc disabled:opacity-50"
                  >
                    Enregistrer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
