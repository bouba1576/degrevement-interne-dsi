"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Chip, Empty, Icon } from "@pgd/ui";
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
  // Compteur EN_CORBEILLE par rôle (docs/design/screens2.jsx:230-236 — badge
  // orange sur chaque puce, pas seulement le rôle actif). `listerTachesCorbeille`
  // n'a pas de variante allégée (limit fixé à 200, pas de comptage seul côté
  // serveur) — même appel que celui déjà fait pour le rôle actif, répété pour
  // chacun des rôles de la session (typiquement 1 à 3), jamais un coût
  // disproportionné qui justifierait d'omettre le badge (cf. correctif
  // MesDemandesScreen — une commodité d'implémentation n'est jamais une
  // catégorie de divergence légitime).
  const [comptes, setComptes] = useState<Record<string, number>>({});

  const charger = useCallback(async () => {
    if (!roleActif) return;
    try {
      const [enCorbeille, reclamees, ...comptesReponses] = await Promise.all([
        listerTachesCorbeille({ role: roleActif, etat: "EN_CORBEILLE" }),
        listerTachesCorbeille({ role: roleActif, etat: "RECLAMEE" }),
        ...utilisateur.roles.map((role) => listerTachesCorbeille({ role, etat: "EN_CORBEILLE" }))
      ]);
      setTaches([...enCorbeille.taches, ...reclamees.taches]);
      setComptes(Object.fromEntries(utilisateur.roles.map((role, i) => [role, comptesReponses[i]!.total])));
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Erreur inattendue.");
    }
  }, [roleActif, utilisateur.roles]);

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
            {/* Mini-pastille de comptage, taille propre à cet usage imbriqué
                (maquette : style={{padding:"1px 6px"}}) — le composant Badge
                standard (px-2.5 py-1) serait visuellement trop lourd niché
                dans une puce déjà compacte. */}
            {!!comptes[role] && (
              <span className="rounded-full bg-orange50 px-1.5 py-px text-11 font-bold text-orangeTexteSurClair">
                {comptes[role]}
              </span>
            )}
          </Chip>
        ))}
      </div>

      {/* docs/design/screens2.jsx:274-275 (CorbeilleInfo, .alert-blue) — seule
          la portion sans dépendance à une donnée bloquée est reprise : le
          reste de CorbeilleInfo (libellé du rôle, groupe AD, avatars des
          membres) exige GET /api/admin/roles (ADMIN_PGD-only, vérifié) —
          catégorie 2 confirmée, pas construite. Le texte informatif, lui,
          n'a aucune dépendance de donnée — l'omettre aurait été la même
          erreur que MesDemandesScreen : laisser une commodité d'implémentation
          (« tout ou rien ») décider d'un choix qui n'en est pas un. */}
      <div className="mb-4 flex items-start gap-2.5 rounded border border-[#c5e6f5] bg-bleuFond p-3 text-13 text-bleu700">
        <Icon nom="info" taille={14} className="mt-px shrink-0" />
        <span>Récupérer une tâche pose un verrou de 4 h. Sans action, elle revient automatiquement en corbeille.</span>
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
              <Card>
                <Empty icone="inbox" titre="Corbeille vide">
                  Aucune tâche en attente pour ce rôle.
                </Empty>
              </Card>
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
