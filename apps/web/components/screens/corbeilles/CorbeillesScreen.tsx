"use client";

import { useCallback, useEffect, useState } from "react";
import { Chip } from "@pgd/ui";
import type { SessionUtilisateur, TacheVue } from "@pgd/contracts";
import { ApiError, claimTache, listerTachesCorbeille, unclaimTache } from "@/lib/api";
import { TaskCard } from "./TaskCard";

export interface CorbeillesScreenProps {
  utilisateur: SessionUtilisateur;
  onOuvrirDossier: (demandeId: string) => void;
}

// Pas de filtrage des rôles par "type V/A" (docs/design/screens2.jsx,
// D2.roleByCode[r]?.type) : cet attribut n'existe pas sur le vrai `Role`
// (EnumTypeRole = METIER/PIVOT/SYSTEME, un axe différent de typeActeur
// V/A/C qui est une propriété de TÂCHE, pas de rôle). Tous les rôles de la
// session sont affichés ; un rôle sans tâche de corbeille montre simplement
// une file vide, plutôt que de deviner quels rôles "comptent".
export function CorbeillesScreen({ utilisateur, onOuvrirDossier }: CorbeillesScreenProps) {
  const [roleActif, setRoleActif] = useState(utilisateur.roles[0] ?? null);
  const [taches, setTaches] = useState<TacheVue[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargementId, setChargementId] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!roleActif) return;
    try {
      const [enCorbeille, reclamees] = await Promise.all([
        listerTachesCorbeille({ role: roleActif, etat: "EN_CORBEILLE" }),
        listerTachesCorbeille({ role: roleActif, etat: "RECLAMEE" })
      ]);
      setTaches([...enCorbeille.taches, ...reclamees.taches]);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Erreur inattendue.");
    }
  }, [roleActif]);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function handleClaim(tacheId: string) {
    setChargementId(tacheId);
    try {
      await claimTache(tacheId);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Récupération impossible.");
    } finally {
      setChargementId(null);
    }
  }

  async function handleUnclaim(tacheId: string) {
    setChargementId(tacheId);
    try {
      await unclaimTache(tacheId);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Libération impossible.");
    } finally {
      setChargementId(null);
    }
  }

  if (utilisateur.roles.length === 0) {
    return <p className="text-13 text-gris600">Aucun rôle de corbeille rattaché à votre session.</p>;
  }

  const mesReclamees = (taches ?? []).filter((t) => t.etat === "RECLAMEE" && t.agentClaimId === utilisateur.id);
  const enCorbeille = (taches ?? []).filter((t) => t.etat === "EN_CORBEILLE");
  const autresReclamees = (taches ?? []).filter((t) => t.etat === "RECLAMEE" && t.agentClaimId !== utilisateur.id);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {utilisateur.roles.map((role) => (
          <Chip key={role} actif={roleActif === role} onClick={() => setRoleActif(role)}>
            {role}
          </Chip>
        ))}
      </div>

      {erreur && <p className="mb-3 text-13 font-semibold text-rouge700">{erreur}</p>}

      {!taches ? (
        <p className="text-13 text-gris600">Chargement…</p>
      ) : (
        <div className="flex flex-col gap-6">
          {mesReclamees.length > 0 && (
            <div>
              <h3 className="mb-2 text-14 font-bold">Mes tâches récupérées ({mesReclamees.length})</h3>
              <div className="flex flex-col gap-3">
                {mesReclamees.map((t) => (
                  <TaskCard
                    key={t.id}
                    tache={t}
                    mine
                    locked={false}
                    chargement={chargementId === t.id}
                    onClaim={() => handleClaim(t.id)}
                    onUnclaim={() => handleUnclaim(t.id)}
                    onOuvrir={() => onOuvrirDossier(t.demandeId)}
                  />
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-14 font-bold">File de la corbeille ({enCorbeille.length})</h3>
            {enCorbeille.length === 0 ? (
              <p className="text-13 text-gris600">Aucune tâche en attente pour ce rôle.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {enCorbeille.map((t) => (
                  <TaskCard
                    key={t.id}
                    tache={t}
                    mine={false}
                    locked={false}
                    chargement={chargementId === t.id}
                    onClaim={() => handleClaim(t.id)}
                    onUnclaim={() => handleUnclaim(t.id)}
                    onOuvrir={() => onOuvrirDossier(t.demandeId)}
                  />
                ))}
              </div>
            )}
          </div>

          {autresReclamees.length > 0 && (
            <div>
              <h3 className="mb-2 text-14 font-bold text-gris600">Récupérées par un collègue ({autresReclamees.length})</h3>
              <div className="flex flex-col gap-3">
                {autresReclamees.map((t) => (
                  <TaskCard
                    key={t.id}
                    tache={t}
                    mine={false}
                    locked
                    chargement={false}
                    onClaim={() => handleClaim(t.id)}
                    onUnclaim={() => handleUnclaim(t.id)}
                    onOuvrir={() => onOuvrirDossier(t.demandeId)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
