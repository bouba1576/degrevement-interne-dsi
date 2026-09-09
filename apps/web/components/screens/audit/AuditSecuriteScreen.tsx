"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@pgd/ui";
import type { EnumEvenementSecurite, EnumTypeActivite, JournalActiviteVue, JournalSecuriteVue } from "@pgd/contracts";
import { ApiError, journalActivite, journalSecurite } from "@/lib/api";
import { JournalSecuriteTable } from "./JournalSecuriteTable";
import { JournalActiviteTable } from "./JournalActiviteTable";

const LIMITE = 50;

// Même 7 valeurs que JournalSecuriteTable.LIBELLE_EVENEMENT (les deux
// dernières ajoutées au même moment, cf. enumEvenementSecurite) — pas de
// Record partagé entre les deux fichiers : ici une liste ORDONNÉE pour un
// <select>, là un dictionnaire de rendu, deux formes différentes pour le
// même référentiel de 7 valeurs fixes (fermé, cf. convention de test Phase 5
// — pas un référentiel ouvert justifiant une route dédiée).
const EVENEMENTS: Array<{ valeur: EnumEvenementSecurite | ""; libelle: string }> = [
  { valeur: "", libelle: "Tous les événements" },
  { valeur: "LOGIN", libelle: "Connexion" },
  { valeur: "LOGOUT", libelle: "Déconnexion" },
  { valeur: "MFA_CHALLENGE", libelle: "Défi MFA" },
  { valeur: "RBAC_REFUS", libelle: "Refus RBAC" },
  { valeur: "SOD_REFUS", libelle: "Refus SoD" },
  { valeur: "ACCES_NON_PROVISIONNE", libelle: "Accès non provisionné" },
  { valeur: "TOTP_ENROLEMENT_ADMIN", libelle: "Enrôlement TOTP (admin)" }
];

// Même principe que EVENEMENTS ci-dessus — 2 valeurs fixes (EnumTypeActivite),
// liste ordonnée pour ce <select>, jamais un Record partagé avec
// JournalActiviteTable.LIBELLE_TYPE.
const TYPES_ACTIVITE: Array<{ valeur: EnumTypeActivite | ""; libelle: string }> = [
  { valeur: "", libelle: "Tous les types" },
  { valeur: "NAVIGATION", libelle: "Navigation" },
  { valeur: "ACTION", libelle: "Action" }
];

function Pagination({
  page,
  nbPages,
  onChanger
}: {
  page: number;
  nbPages: number;
  onChanger: (p: number) => void;
}) {
  if (nbPages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-center gap-3">
      <button
        type="button"
        onClick={() => onChanger(Math.max(1, page - 1))}
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
        onClick={() => onChanger(Math.min(nbPages, page + 1))}
        disabled={page >= nbPages}
        className="rounded border border-gris300 px-3 py-1 text-12 font-bold text-gris700 disabled:opacity-40"
      >
        Suivant
      </button>
    </div>
  );
}

// Onglet « Sécurité » — inchangé au comportement près depuis avant ce
// chantier (extrait ici pour cohabiter avec l'onglet « Activité », Option B
// de la conception validée : extension d'AuditSecuriteScreen, deux onglets
// internes, jamais un second écran séparé).
function SectionSecurite() {
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

      <Card className="mb-4 flex flex-wrap items-end gap-3 p-5">
        <label className="flex flex-1 flex-col gap-1 text-13" style={{ minWidth: 200 }}>
          Compte
          <input
            value={compte}
            onChange={(e) => changerFiltre(setCompte, e.target.value)}
            placeholder="identifiant@orange.com"
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
      </Card>

      {erreur && <p className="mb-3 text-13 font-semibold text-rouge700">{erreur}</p>}

      {!entrees ? (
        <p className="text-13 text-gris600">Chargement…</p>
      ) : (
        <>
          <p className="mb-2 text-12 text-gris600">{total} événement(s)</p>
          <JournalSecuriteTable entrees={entrees} />
          <Pagination page={page} nbPages={nbPages} onChanger={setPage} />
        </>
      )}
    </div>
  );
}

// Onglet « Activité » (étape 4, CLAUDE.md « Journal d'activité
// administrateur ») — même patron exact que SectionSecurite ci-dessus,
// jamais une abstraction commune : les deux journaux n'ont aucun champ ni
// filtre en commun au-delà de compte/dates (le référentiel EVENEMENTS vs
// TYPES_ACTIVITE diffère, tout comme les tables de rendu).
function SectionActivite() {
  const [entrees, setEntrees] = useState<JournalActiviteVue[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [compte, setCompte] = useState("");
  const [type, setType] = useState<EnumTypeActivite | "">("");
  const [depuis, setDepuis] = useState("");
  const [jusqua, setJusqua] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const reponse = await journalActivite({
        utilisateur: compte.trim() || undefined,
        type: type || undefined,
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
  }, [compte, type, depuis, jusqua, page]);

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
        Journal d&apos;activité — écrans consultés et actions modifiant réellement quelque chose côté serveur, tous
        utilisateurs. Ne duplique jamais le journal d&apos;audit métier par dossier (approbation, rejet, soumission,
        déjà consultable dans le détail de chaque dossier) ni le journal de sécurité (onglet « Sécurité »).
      </p>

      <Card className="mb-4 flex flex-wrap items-end gap-3 p-5">
        <label className="flex flex-1 flex-col gap-1 text-13" style={{ minWidth: 200 }}>
          Compte
          <input
            value={compte}
            onChange={(e) => changerFiltre(setCompte, e.target.value)}
            placeholder="identifiant@orange.com"
            className="rounded border border-gris300 px-2 py-1.5 text-13"
          />
        </label>
        <label className="flex flex-col gap-1 text-13">
          Type
          <select
            value={type}
            onChange={(e) => changerFiltre(setType, e.target.value as EnumTypeActivite | "")}
            className="rounded border border-gris300 px-2 py-1.5 text-13"
          >
            {TYPES_ACTIVITE.map((t) => (
              <option key={t.valeur} value={t.valeur}>
                {t.libelle}
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
      </Card>

      {erreur && <p className="mb-3 text-13 font-semibold text-rouge700">{erreur}</p>}

      {!entrees ? (
        <p className="text-13 text-gris600">Chargement…</p>
      ) : (
        <>
          <p className="mb-2 text-12 text-gris600">{total} entrée(s)</p>
          <JournalActiviteTable entrees={entrees} />
          <Pagination page={page} nbPages={nbPages} onChanger={setPage} />
        </>
      )}
    </div>
  );
}

// Écran d'audit — Option B de la conception validée (08/09/2026, CLAUDE.md
// « Journal d'activité administrateur ») : extension d'AuditSecuriteScreen,
// deux onglets internes, jamais un second écran séparé. « Sécurité » reste
// le comportement d'origine ; « Activité » est nouveau (étape 4).
export function AuditSecuriteScreen() {
  const [onglet, setOnglet] = useState<"securite" | "activite">("securite");

  return (
    <div>
      <div className="mb-4 flex gap-2 border-b border-gris200">
        {(
          [
            ["securite", "Sécurité"],
            ["activite", "Activité"]
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

      {onglet === "securite" && <SectionSecurite />}
      {onglet === "activite" && <SectionActivite />}
    </div>
  );
}
