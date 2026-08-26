"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, CircuitPill, Empty, Icon, Money, SlaTimer } from "@pgd/ui";
import type { EnumCircuit, MoniteurListeReponse, RoleVue } from "@pgd/contracts";
import { ApiError, escaladerManuellement, listerMoniteur, listerRoles, relancerCorbeille } from "@/lib/api";
import { useAppShell } from "@/lib/app-shell-context";

const CIRCUITS: EnumCircuit[] = ["DOBB", "DXC", "DF"];

// Port de docs/design/screens3.jsx:1176-1226 (MoniteurView) — « Moniteur
// d'exécution : visualisez les instances en cours par étape et intervenez
// (escalade, relance, ouverture du dossier). » Aucune contrepartie serveur
// n'existait avant ce chantier (audit AdminScreen, 25/08/2026, cf.
// CLAUDE.md) : GET /api/admin/moniteur (agrégation cross-corbeille,
// ADMIN_PGD) et POST .../relancer (rejoue notification.nouvelle_tache) sont
// construits dans le même chantier que cet écran.
//
// Non repris de la maquette — catégorie 2, aucun manque à combler par un
// contrôle inventé :
// - Avatars/membres par corbeille (E3.membersOfRole) — pas de route de
//   listing utilisateurs, même trou déjà consigné pour CorbeillesScreen/
//   PaliersAdminTab.
// - `store.relancer`/`store.escalader` de la maquette n'ont aucun effet
//   observable dans la simulation au-delà d'un toast — ici, Relancer rejoue
//   réellement notification.nouvelle_tache (nouvelles lignes Notification +
//   envoi SMTP), Escalader réutilise EscaladeManuelleService déjà construit
//   (Phase 6) : les deux ont un effet serveur réel, pas seulement visuel.
export function MoniteurAdminTab() {
  const { onOuvrirDossier } = useAppShell();
  const [instances, setInstances] = useState<MoniteurListeReponse | null>(null);
  const [roles, setRoles] = useState<RoleVue[] | null>(null);
  const [circuit, setCircuit] = useState<EnumCircuit | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async (circuitActif: EnumCircuit | null) => {
    try {
      const [listeInstances, listeRoles] = await Promise.all([listerMoniteur(circuitActif ?? undefined), listerRoles()]);
      setInstances(listeInstances);
      setRoles(listeRoles);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Erreur inattendue.");
    }
  }, []);

  useEffect(() => {
    void charger(circuit);
  }, [charger, circuit]);

  const roleLibelle = useMemo(() => {
    const table: Record<string, string> = {};
    for (const r of roles ?? []) table[r.code] = r.libelle;
    return table;
  }, [roles]);

  const groupes = useMemo(() => {
    const parRole = new Map<string, MoniteurListeReponse>();
    for (const instance of instances ?? []) {
      const liste = parRole.get(instance.roleCorbeille) ?? [];
      liste.push(instance);
      parRole.set(instance.roleCorbeille, liste);
    }
    return [...parRole.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [instances]);

  async function handleRelancer(tacheId: string) {
    setEnCours(tacheId);
    try {
      await relancerCorbeille(tacheId);
      await charger(circuit);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Relance impossible.");
    } finally {
      setEnCours(null);
    }
  }

  async function handleEscalader(tacheId: string) {
    setEnCours(tacheId);
    try {
      await escaladerManuellement(tacheId);
      await charger(circuit);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Escalade impossible.");
    } finally {
      setEnCours(null);
    }
  }

  if (!instances || !roles) return <p className="text-13 text-gris600">Chargement…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-1 flex items-start gap-2.5 rounded border border-[#c5e6f5] bg-bleuFond p-3 text-13 text-bleu700">
        Moniteur d&rsquo;exécution : visualisez les instances en cours par étape et intervenez (escalade, relance,
        ouverture du dossier). Reflète l&rsquo;état temps réel du moteur.
      </div>

      {erreur && <p className="text-13 font-semibold text-rouge700">{erreur}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setCircuit(null)}
          className={`rounded-full border px-3 py-1 text-12 font-bold ${
            circuit === null ? "border-encre bg-gris50 text-encre" : "border-gris200 text-gris700"
          }`}
        >
          Tous
        </button>
        {CIRCUITS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCircuit(c)}
            className={`rounded-full border px-3 py-1 text-12 font-bold ${
              circuit === c ? "border-encre bg-gris50 text-encre" : "border-gris200 text-gris700"
            }`}
          >
            {c}
          </button>
        ))}
        <span className="ml-auto text-12 text-gris600">{instances.length} instance(s) active(s)</span>
      </div>

      {groupes.length === 0 ? (
        <Card>
          <Empty icone="flow" titre="Aucune instance active">
            Aucune demande en cours pour ce filtre.
          </Empty>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {groupes.map(([role, items]) => (
            <div key={role} className="overflow-hidden rounded-6 border border-gris200 bg-blanc">
              <div className="flex items-center gap-2 border-b border-gris200 bg-gris50 p-3">
                <Icon nom="inbox" taille={16} />
                <h3 className="text-13 font-bold">{roleLibelle[role] ?? role}</h3>
                <Badge ton="accent">{items.length}</Badge>
                <span className="ml-auto text-12 text-gris600">étape courante</span>
              </div>
              <table className="w-full text-13">
                <thead>
                  <tr className="border-b border-gris200 text-left text-11 uppercase text-gris600">
                    <th className="px-3 py-2 font-semibold">Référence</th>
                    <th className="px-3 py-2 font-semibold">Circuit</th>
                    <th className="px-3 py-2 text-right font-semibold">TTC</th>
                    <th className="px-3 py-2 font-semibold">SLA</th>
                    <th className="px-3 py-2 font-semibold">État</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((instance) => {
                    const enRetard = instance.echeanceSla !== null && new Date(instance.echeanceSla).getTime() <= Date.now();
                    return (
                      <tr key={instance.tacheId} className="border-b border-gris100 last:border-0">
                        <td
                          className="cursor-pointer px-3 py-2 font-mono text-12 font-bold"
                          onClick={() => onOuvrirDossier(instance.demandeId)}
                        >
                          {instance.reference}
                        </td>
                        <td className="px-3 py-2">
                          <CircuitPill code={instance.circuit} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Money valeur={instance.montantTtc} fort />
                        </td>
                        <td className="px-3 py-2">
                          {instance.echeanceSla ? <SlaTimer echeanceSla={instance.echeanceSla} compact /> : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {instance.etat === "RECLAMEE" ? (
                            <Badge ton="accent">En traitement</Badge>
                          ) : (
                            <Badge ton="neutre">En attente</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              title="Relancer la corbeille"
                              disabled={enCours === instance.tacheId}
                              onClick={() => handleRelancer(instance.tacheId)}
                              className="rounded border border-gris200 p-1.5 text-gris600 hover:text-encre disabled:opacity-40"
                            >
                              <Icon nom="bell" taille={13} />
                            </button>
                            {enRetard && (
                              <button
                                type="button"
                                title="Escalader"
                                disabled={enCours === instance.tacheId}
                                onClick={() => handleEscalader(instance.tacheId)}
                                className="rounded border border-gris200 p-1.5 text-gris600 hover:text-encre disabled:opacity-40"
                              >
                                <Icon nom="arrowRight" taille={13} />
                              </button>
                            )}
                            <Button onClick={() => onOuvrirDossier(instance.demandeId)} variante="fantome" taille="petite">
                              <Icon nom="eye" taille={13} /> Ouvrir
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
