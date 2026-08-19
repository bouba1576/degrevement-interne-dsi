"use client";

import { useState } from "react";
import { Modal, Icon } from "@pgd/ui";
import { estFormeIdentifiantAdValide, type AnnuaireResultat } from "@pgd/contracts";
import { ApiError, rechercherAnnuaireAd } from "@/lib/api";

export interface AnnuaireRechercheModalProps {
  onFermer: () => void;
  onSelectionner: (resultat: AnnuaireResultat) => void;
  // Identifiants déjà pré-enregistrés — affiché dans les résultats pour que
  // l'admin voie immédiatement qu'une sélection ouvrira l'édition, pas une
  // création (même identifiantAd, deux issues possibles selon ce test).
  identifiantsDejaPreEnregistres: Set<string>;
}

// Recherche AD — canal historique, préféré tant que l'annuaire est joignable
// (décision d'origine : une faute de frappe en saisie libre créerait un
// compte qui ne pourra jamais s'authentifier, l'identifiant réel restant la
// clé d'appariement). La saisie manuelle ci-dessous est additive, pas un
// remplacement (déploiement V1, 18/08/2026 : ni DUO ni l'annuaire AD ne sont
// joignables aujourd'hui, et l'API AD réelle n'a de toute façon jamais eu de
// capacité de recherche — un seul point d'accès, l'authentification, cf.
// CLAUDE.md « API AD réelle ». LdapPort.rechercher() ne peut donc pas rester
// le seul chemin de pré-enregistrement). Même garde-fou de forme que le
// contrat serveur (`estFormeIdentifiantAdValide`, importé directement — pas
// une réimplémentation locale) : accepte la forme e-mail (socle de test dev)
// et la forme brute (username AD réel, confirmé 19/08/2026, cf. CLAUDE.md).

export function AnnuaireRechercheModal({ onFermer, onSelectionner, identifiantsDejaPreEnregistres }: AnnuaireRechercheModalProps) {
  const [mode, setMode] = useState<"recherche" | "manuel">("recherche");

  const [motCle, setMotCle] = useState("");
  const [resultats, setResultats] = useState<AnnuaireResultat[] | null>(null);
  const [recherche, setRecherche] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const [nomManuel, setNomManuel] = useState("");
  const [identifiantManuel, setIdentifiantManuel] = useState("");
  const [erreurManuel, setErreurManuel] = useState<string | null>(null);

  async function lancerRecherche(e: React.FormEvent) {
    e.preventDefault();
    if (motCle.trim().length < 2) {
      setErreur("Saisissez au moins 2 caractères.");
      return;
    }
    setRecherche(true);
    setErreur(null);
    try {
      setResultats(await rechercherAnnuaireAd(motCle.trim()));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Recherche impossible.");
      setResultats(null);
    } finally {
      setRecherche(false);
    }
  }

  function validerEtContinuerManuel(e: React.FormEvent) {
    e.preventDefault();
    const identifiant = identifiantManuel.trim();
    const nom = nomManuel.trim();
    if (!nom) {
      setErreurManuel("Le nom est requis.");
      return;
    }
    if (!estFormeIdentifiantAdValide(identifiant)) {
      setErreurManuel(
        "Forme attendue : identifiant@domaine (ex. jean.kouassi@orange.com), ou un identifiant AD brut sans espace (ex. c_afofana6) — existence non vérifiable ici."
      );
      return;
    }
    setErreurManuel(null);
    onSelectionner({ identifiantAd: identifiant, nom, groupesAd: [] });
  }

  return (
    <Modal titre="Nouvel utilisateur" icone="search" onFermer={onFermer}>
      <div className="mb-4 flex gap-1 rounded border border-gris200 bg-gris50 p-1">
        <button
          type="button"
          onClick={() => setMode("recherche")}
          className={`flex-1 rounded px-3 py-1.5 text-13 font-bold ${mode === "recherche" ? "bg-blanc text-encre shadow-sm" : "text-gris600"}`}
        >
          Rechercher dans l&rsquo;annuaire
        </button>
        <button
          type="button"
          onClick={() => setMode("manuel")}
          className={`flex-1 rounded px-3 py-1.5 text-13 font-bold ${mode === "manuel" ? "bg-blanc text-encre shadow-sm" : "text-gris600"}`}
        >
          Saisir manuellement
        </button>
      </div>

      {mode === "recherche" && (
        <>
          <form onSubmit={lancerRecherche} className="mb-4 flex gap-2">
            <input
              value={motCle}
              onChange={(e) => setMotCle(e.target.value)}
              placeholder="Nom ou identifiant AD…"
              className="flex-1 rounded border border-gris300 px-3 py-2 text-13"
              autoFocus
            />
            <button type="submit" disabled={recherche} className="rounded bg-encre px-4 py-2 text-13 font-bold text-blanc disabled:opacity-50">
              {recherche ? "Recherche…" : "Rechercher"}
            </button>
          </form>

          {erreur && <p className="mb-3 text-13 font-semibold text-rouge700">{erreur}</p>}

          {resultats && resultats.length === 0 && <p className="text-13 text-gris600">Aucune correspondance dans l'annuaire.</p>}

          {resultats && resultats.length > 0 && (
            <div className="flex flex-col gap-2">
              {resultats.map((r) => {
                const dejaPresent = identifiantsDejaPreEnregistres.has(r.identifiantAd);
                return (
                  <button
                    key={r.identifiantAd}
                    type="button"
                    onClick={() => onSelectionner(r)}
                    className="flex items-center justify-between rounded border border-gris200 px-3 py-2 text-left hover:border-encre"
                  >
                    <div>
                      <div className="text-13 font-bold">{r.nom}</div>
                      <div className="font-mono text-12 text-gris600">{r.identifiantAd}</div>
                      {r.groupesAd.length > 0 && (
                        <div className="mt-0.5 text-12 text-gris500">Groupes AD : {r.groupesAd.join(", ")}</div>
                      )}
                    </div>
                    {dejaPresent ? (
                      <span className="flex items-center gap-1 text-12 font-semibold text-encre">
                        <Icon nom="edit" taille={13} /> Déjà pré-enregistré — modifier
                      </span>
                    ) : (
                      <span className="text-12 font-semibold text-vert700">+ Pré-enregistrer</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {mode === "manuel" && (
        <form onSubmit={validerEtContinuerManuel} className="flex flex-col gap-3">
          <p className="text-12 text-gris600">
            À utiliser seulement si l&rsquo;annuaire n&rsquo;est pas joignable. Aucune vérification d&rsquo;existence n&rsquo;est possible
            ici — une faute de frappe restera invisible jusqu&rsquo;à la première tentative de connexion réelle.
          </p>
          <label className="text-12 font-semibold text-gris700">
            Nom complet
            <input
              value={nomManuel}
              onChange={(e) => setNomManuel(e.target.value)}
              placeholder="Jean Kouassi"
              className="mt-1 w-full rounded border border-gris300 px-3 py-2 text-13"
              autoFocus
            />
          </label>
          <label className="text-12 font-semibold text-gris700">
            Identifiant AD
            <input
              value={identifiantManuel}
              onChange={(e) => setIdentifiantManuel(e.target.value)}
              placeholder="jean.kouassi@orange.com"
              className="mt-1 w-full rounded border border-gris300 px-3 py-2 font-mono text-13"
            />
          </label>
          {erreurManuel && <p className="text-13 font-semibold text-rouge700">{erreurManuel}</p>}
          <button type="submit" className="rounded bg-encre px-4 py-2 text-13 font-bold text-blanc">
            Continuer
          </button>
        </form>
      )}
    </Modal>
  );
}
