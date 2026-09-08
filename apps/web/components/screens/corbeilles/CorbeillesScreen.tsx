"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Card, Chip, Empty, Icon, Money, TypeActeurBadge } from "@pgd/ui";
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

  // Onglet « Décidées » (07/09/2026, demande explicite) — lecture seule,
  // aucune action : les tâches déjà décidées (APPROUVEE/REJETEE) disparaissent
  // aujourd'hui purement et simplement de la vue de travail une fois traitées
  // (cette même Corbeille ne fetch jamais que EN_CORBEILLE/RECLAMEE) — l'accès
  // en lecture au dossier lui-même ne disparaît jamais (GET /api/demandes/{id}
  // ouvert à tout authentifié), mais rien ne permettait à l'agent de
  // retrouver SES propres décisions passées depuis son propre espace de
  // travail. Filtré côté client à `agentClaimId === moi` — TacheVue porte
  // déjà ce champ pour tout membre du rôle de la corbeille (R4), aucune
  // nouvelle route.
  const [onglet, setOnglet] = useState<"corbeille" | "decidees">("corbeille");
  const [decidees, setDecidees] = useState<TacheVue[] | null>(null);
  const [erreurDecidees, setErreurDecidees] = useState<string | null>(null);

  const chargerDecidees = useCallback(async () => {
    if (!roleActif) return;
    try {
      const [approuvees, rejetees] = await Promise.all([
        listerTachesCorbeille({ role: roleActif, etat: "APPROUVEE" }),
        listerTachesCorbeille({ role: roleActif, etat: "REJETEE" })
      ]);
      const mesDecisions = [...approuvees.taches, ...rejetees.taches]
        .filter((t) => t.agentClaimId === utilisateur.id)
        .sort((a, b) => new Date(b.dateDecision ?? 0).getTime() - new Date(a.dateDecision ?? 0).getTime());
      setDecidees(mesDecisions);
      setErreurDecidees(null);
    } catch (e) {
      setErreurDecidees(e instanceof ApiError ? e.message : "Erreur inattendue.");
    }
  }, [roleActif, utilisateur.id]);

  useEffect(() => {
    if (onglet === "decidees") void chargerDecidees();
  }, [onglet, chargerDecidees]);

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

      {/* Onglet Décidées (07/09/2026, demande explicite) — lecture seule,
          sans action, cf. commentaire du state ci-dessus. */}
      <div className="mb-4 flex gap-2 border-b border-gris200">
        {(
          [
            ["corbeille", "Corbeille"],
            ["decidees", "Décidées"]
          ] as const
        ).map(([cle, libelle]) => (
          <button
            key={cle}
            type="button"
            onClick={() => setOnglet(cle)}
            className={`px-3 py-2 text-13 font-semibold ${onglet === cle ? "border-b-2 border-encre text-encre" : "text-gris600"}`}
          >
            {libelle}
          </button>
        ))}
      </div>

      {onglet === "corbeille" && (
        <>
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
        </>
      )}

      {onglet === "decidees" && (
        <>
          {erreurDecidees && <p className="mb-3 text-13 font-semibold text-rouge700">{erreurDecidees}</p>}
          {!decidees ? (
            <p className="text-13 text-gris600">Chargement…</p>
          ) : decidees.length === 0 ? (
            <Card>
              <Empty icone="clock" titre="Aucune décision">
                Vous n'avez encore décidé aucune tâche pour ce rôle.
              </Empty>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {decidees.map((t) => (
                <Card key={t.id} className="p-5">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="min-w-[220px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-13 font-bold">{t.reference}</span>
                        <TypeActeurBadge type={t.typeActeur} />
                        <Badge ton={t.etat === "APPROUVEE" ? "succes" : "erreur"} pastille>
                          {t.etat === "APPROUVEE" ? "Approuvée" : "Rejetée"}
                        </Badge>
                      </div>
                      <div className="mt-1 text-13 font-semibold">{t.nomClient}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="text-12 text-gris600">Montant TTC</div>
                      <Money valeur={t.montantTtc} fort />
                      {t.dateDecision && (
                        <div className="text-12 text-gris600">
                          Décidée le {new Date(t.dateDecision).toLocaleDateString("fr-FR")}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onOuvrirDossier(t.demandeId)}
                      className="text-12 font-bold text-orange600 hover:underline"
                    >
                      Voir le dossier
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
