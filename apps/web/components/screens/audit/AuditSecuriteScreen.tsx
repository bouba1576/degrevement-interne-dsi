"use client";

import { useCallback, useEffect, useState } from "react";
import type { EnumEvenementSecurite, JournalSecuriteVue } from "@pgd/contracts";
import { ApiError, journalSecurite } from "@/lib/api";
import { JournalSecuriteTable } from "./JournalSecuriteTable";

const LIMITE = 50;

const EVENEMENTS: Array<{ valeur: EnumEvenementSecurite | ""; libelle: string }> = [
  { valeur: "", libelle: "Tous les événements" },
  { valeur: "LOGIN", libelle: "Connexion" },
  { valeur: "LOGOUT", libelle: "Déconnexion" },
  { valeur: "MFA_CHALLENGE", libelle: "Défi MFA" },
  { valeur: "RBAC_REFUS", libelle: "Refus RBAC" },
  { valeur: "SOD_REFUS", libelle: "Refus SoD" }
];

// Journal de SÉCURITÉ uniquement (connexions, MFA, refus RBAC/SoD) — pas le
// journal d'audit métier des dossiers (transitions soumission/approbation/
// rejet), déjà consultable dans DossierDetailScreen (par dossier) et sans
// vue transversale à ce jour (aucune route serveur ne l'agrège à travers
// tous les dossiers, cf. CLAUDE.md Questions ouvertes). Dit explicitement
// dans l'en-tête ci-dessous pour ne pas laisser croire à un admin qu'il
// consulte l'audit complet du système.
//
// Filtres réels envoyés au serveur (GET /api/audit/securite) — jamais un
// filtrage recalculé sur une page déjà reçue. `utilisateur` est un
// identifiantAd (résolu côté serveur, AuditService.journalSecurite), pas un
// uuid à connaître à l'avance.
export function AuditSecuriteScreen() {
  const [entrees, setEntrees] = useState<JournalSecuriteVue[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [compte, setCompte] = useState("");
  const [evenement, setEvenement] = useState<EnumEvenementSecurite | "">("");
  const [depuis, setDepuis] = useState("");
  const [jusqua, setJusqua] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const reponse = await journalSecurite({
        utilisateur: compte.trim() || undefined,
        evenement: evenement || undefined,
        depuis: depuis || undefined,
        jusqua: jusqua || undefined,
        page,
        limit: LIMITE
      });
      setEntrees(reponse.data);
      setTotal(reponse.total);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Erreur inattendue.");
    }
  }, [compte, evenement, depuis, jusqua, page]);

  useEffect(() => {
    void charger();
  }, [charger]);

  function changerFiltre<T>(setter: (v: T) => void, valeur: T) {
    setter(valeur);
    setPage(1);
  }

  const nbPages = Math.max(1, Math.ceil(total / LIMITE));

  return (
    <div>
      <p className="mb-4 text-13 text-gris600">
        Journal de sécurité — connexions, défis MFA et refus d&apos;accès (RBAC/SoD), tous utilisateurs. Ne couvre pas
        les transitions métier des dossiers (soumission, approbation, rejet) — consultables dans le détail de chaque
        dossier.
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-6 border border-gris200 bg-blanc p-4">
        <label className="flex flex-1 flex-col gap-1 text-13" style={{ minWidth: 200 }}>
          Compte
          <input
            value={compte}
            onChange={(e) => changerFiltre(setCompte, e.target.value)}
            placeholder="identifiant@orange.ci"
            className="rounded border border-gris300 px-2 py-1.5 text-13"
          />
        </label>
        <label className="flex flex-col gap-1 text-13">
          Événement
          <select
            value={evenement}
            onChange={(e) => changerFiltre(setEvenement, e.target.value as EnumEvenementSecurite | "")}
            className="rounded border border-gris300 px-2 py-1.5 text-13"
          >
            {EVENEMENTS.map((ev) => (
              <option key={ev.valeur} value={ev.valeur}>
                {ev.libelle}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-13">
          Depuis
          <input
            type="date"
            value={depuis}
            onChange={(e) => changerFiltre(setDepuis, e.target.value)}
            className="rounded border border-gris300 px-2 py-1.5 text-13"
          />
        </label>
        <label className="flex flex-col gap-1 text-13">
          Jusqu&apos;au
          <input
            type="date"
            value={jusqua}
            onChange={(e) => changerFiltre(setJusqua, e.target.value)}
            className="rounded border border-gris300 px-2 py-1.5 text-13"
          />
        </label>
      </div>

      {erreur && <p className="mb-3 text-13 font-semibold text-rouge700">{erreur}</p>}

      {!entrees ? (
        <p className="text-13 text-gris600">Chargement…</p>
      ) : (
        <>
          <p className="mb-2 text-12 text-gris600">{total} événement(s)</p>
          <JournalSecuriteTable entrees={entrees} />
          {nbPages > 1 && (
            <div className="mt-3 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded border border-gris300 px-3 py-1 text-12 font-bold text-gris700 disabled:opacity-40"
              >
                Précédent
              </button>
              <span className="text-12 text-gris600">
                Page {page} / {nbPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(nbPages, p + 1))}
                disabled={page >= nbPages}
                className="rounded border border-gris300 px-3 py-1 text-12 font-bold text-gris700 disabled:opacity-40"
              >
                Suivant
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
