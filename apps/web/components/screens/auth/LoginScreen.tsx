"use client";

import { useEffect, useState } from "react";
import { Icon } from "@pgd/ui";
import { ApiError, login, verifierMfa } from "@/lib/api";

export interface LoginScreenProps {
  onConnecte: () => void;
}

type Etape = "identifiants" | "totp" | "totp-non-provisionne" | "duo-attente";

// Port de docs/design/screens_auth.jsx (LoginScreen) pour la mise en page —
// panneau de marque + panneau de formulaire, fil d'étapes, badges d'icône —
// jamais pour la logique : `DemoAccounts` et le sélecteur de persona sont
// exclus (même traitement que `RoleMenu`, cf. échange de revue), et les deux
// étapes réelles (identifiants LDAP puis défi MFA) viennent de
// `ConnexionReponse` (requiresMfa/methode/challengeId), jamais d'une
// simulation cliente (`DL.requiresMfa`, engine.jsx/data.jsx — jamais portés).
//
// DUO se valide par redirection (le navigateur est envoyé sur
// `redirectUrl`, revient sur `GET /api/auth/mfa/duo/callback` côté serveur
// qui pose les cookies puis redirige vers l'origine ou vers `/login?erreur=
// mfa_invalide` en cas d'échec) — jamais un appel JSON comme pour le TOTP.
export function LoginScreen({ onConnecte }: LoginScreenProps) {
  const [etape, setEtape] = useState<Etape>("identifiants");
  const [identifiantAd, setIdentifiantAd] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [codeTotp, setCodeTotp] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("erreur") === "mfa_invalide") {
      setErreur("L'authentification à deux facteurs a échoué ou a expiré. Réessayez.");
    }
  }, []);

  async function handleIdentifiants(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setChargement(true);
    try {
      const reponse = await login({ identifiantAd, motDePasse });
      if (!reponse.requiresMfa) {
        onConnecte();
        return;
      }
      setChallengeId(reponse.challengeId);
      if (reponse.methode === "DUO") {
        setEtape("duo-attente");
        if (reponse.redirectUrl) window.location.href = reponse.redirectUrl;
      } else if (reponse.methode === "TOTP") {
        setEtape(reponse.totpEnrole === false ? "totp-non-provisionne" : "totp");
      }
    } catch (e) {
      // Couvre aussi le 503 MFA_INDISPONIBLE (Phase 7) : son message serveur
      // ("Le second facteur (...) est actuellement indisponible.") est déjà
      // lisible, jamais remplacé ici par un texte technique générique.
      setErreur(e instanceof ApiError ? e.message : "Impossible de contacter le serveur.");
    } finally {
      setChargement(false);
    }
  }

  async function handleTotp(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeId) return;
    setErreur(null);
    setChargement(true);
    try {
      const reponse = await verifierMfa({ challengeId, code: codeTotp });
      if (!reponse.requiresMfa) onConnecte();
    } catch (e) {
      // Message toujours générique ("Code TOTP invalide.") — jamais de
      // distinction ici entre code erroné et secret absent, cf. CLAUDE.md :
      // ce serait réouvrir par l'échec ce que totpEnrole (affiché AVANT la
      // saisie, cf. étape "totp-non-provisionne") est censé prévenir.
      setErreur(e instanceof ApiError ? e.message : "Impossible de contacter le serveur.");
    } finally {
      setChargement(false);
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 bg-blanc lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-noir p-12 text-blanc lg:flex">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-orange text-blanc font-extrabold">O</div>
          <div>
            <b className="block text-[16px]">Orange Côte d&apos;Ivoire</b>
            <span className="text-11 uppercase tracking-[.1em] text-gris400">DSI · AIP</span>
          </div>
        </div>
        <div>
          <h1 className="max-w-[440px] text-[32px] font-bold leading-tight tracking-tight">
            Plateforme de Gestion des Dégrèvements
          </h1>
          <p className="mt-3 max-w-[400px] text-14 leading-relaxed text-gris300">
            Saisie multi-circuit, routage automatique, corbeilles partagées et traçabilité complète des décisions de
            dégrèvement.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {["DOBB · B2B", "DXC · B2C", "DF · Wholesale"].map((t) => (
              <span key={t} className="rounded-full border border-blanc/20 px-3 py-1 text-12 font-semibold">
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 text-11 text-gris500">
          <Icon nom="lock" taille={13} /> Authentification Active Directory + MFA (DUO / TOTP)
        </div>
      </div>

      <div className="grid place-items-center p-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-6 flex items-center gap-2">
            <StepPip n={1} actif={etape === "identifiants"} fait={etape !== "identifiants"} label="Compte AD" />
            <div className={`h-0.5 flex-1 self-center ${etape !== "identifiants" ? "bg-vert700" : "bg-gris200"}`} />
            <StepPip n={2} actif={etape !== "identifiants"} fait={false} label="MFA" />
          </div>

          {erreur && (
            <div className="mb-4 flex items-start gap-2 rounded border border-rouge700 bg-rougeFond p-3 text-13 font-semibold text-rouge700">
              <Icon nom="alert" taille={15} />
              <span>{erreur}</span>
            </div>
          )}

          {etape === "identifiants" && (
            <form onSubmit={handleIdentifiants}>
              <IconBadge nom="user" />
              <h2 className="mb-1 text-[20px] font-bold">Connexion</h2>
              <p className="mb-5 text-13 text-gris600">Identifiez-vous avec votre compte Active Directory d&apos;entreprise.</p>

              <label className="mb-3 flex flex-col gap-1 text-13 font-bold text-gris800">
                Identifiant AD
                <input
                  value={identifiantAd}
                  onChange={(e) => setIdentifiantAd(e.target.value)}
                  placeholder="prenom.nom@orange.ci"
                  autoFocus
                  className="rounded border border-gris300 px-3 py-2 text-14 font-normal"
                />
              </label>
              <label className="mb-4 flex flex-col gap-1 text-13 font-bold text-gris800">
                Mot de passe d&apos;entreprise
                <input
                  type="password"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  placeholder="••••••••"
                  className="rounded border border-gris300 px-3 py-2 text-14 font-normal"
                />
              </label>
              <button
                type="submit"
                disabled={chargement || !identifiantAd.trim() || !motDePasse.trim()}
                className="flex w-full items-center justify-center gap-2 rounded bg-encre px-4 py-2.5 text-14 font-bold text-blanc disabled:opacity-50"
              >
                {chargement ? "Vérification…" : "Continuer"} <Icon nom="arrowRight" taille={16} />
              </button>
            </form>
          )}

          {etape === "totp" && (
            <form onSubmit={handleTotp}>
              <button
                type="button"
                onClick={() => {
                  setEtape("identifiants");
                  setErreur(null);
                }}
                className="mb-4 flex items-center gap-1 text-13 font-semibold text-gris600"
              >
                <Icon nom="arrowLeft" taille={13} /> Retour
              </button>
              <IconBadge nom="shield" />
              <h2 className="mb-1 text-[20px] font-bold">Double authentification</h2>
              <p className="mb-5 text-13 text-gris600">
                Entrez le code à usage unique généré par votre application d&apos;authentification.
              </p>
              <label className="mb-4 flex flex-col gap-1 text-13 font-bold text-gris800">
                Code (6 chiffres)
                <input
                  value={codeTotp}
                  onChange={(e) => setCodeTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="------"
                  maxLength={6}
                  autoFocus
                  className="rounded border border-gris300 px-3 py-2 text-center font-mono text-[22px] tracking-[.4em]"
                />
              </label>
              <button
                type="submit"
                disabled={chargement || codeTotp.length !== 6}
                className="flex w-full items-center justify-center gap-2 rounded bg-encre px-4 py-2.5 text-14 font-bold text-blanc disabled:opacity-50"
              >
                {chargement ? "Vérification…" : "Vérifier et ouvrir la session"} <Icon nom="check" taille={16} />
              </button>
              <p className="mt-4 flex items-center justify-center gap-1.5 text-11 text-gris600">
                <Icon nom="shield" taille={13} /> Chaque tentative est journalisée.
              </p>
            </form>
          )}

          {etape === "totp-non-provisionne" && (
            <div>
              <IconBadge nom="shield" />
              <h2 className="mb-1 text-[20px] font-bold">Double authentification requise</h2>
              <p className="mb-4 text-13 text-gris700">
                Ce compte n&apos;est pas provisionné pour l&apos;authentification à deux facteurs. Contactez votre
                administrateur pour l&apos;enrôlement.
              </p>
              <button
                type="button"
                onClick={() => {
                  setEtape("identifiants");
                  setErreur(null);
                }}
                className="flex items-center gap-1 text-13 font-semibold text-encre underline"
              >
                <Icon nom="arrowLeft" taille={13} /> Retour à la connexion
              </button>
            </div>
          )}

          {etape === "duo-attente" && (
            <div>
              <IconBadge nom="shield" />
              <h2 className="mb-1 text-[20px] font-bold">Redirection vers Duo Security…</h2>
              <p className="text-13 text-gris600">
                Si la redirection ne démarre pas automatiquement, vérifiez qu&apos;aucun bloqueur de fenêtres
                contextuelles ne l&apos;empêche.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IconBadge({ nom }: { nom: "user" | "shield" }) {
  return (
    <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-orange50 text-orangeTexteSurClair">
      <Icon nom={nom} taille={24} />
    </div>
  );
}

function StepPip({ n, actif, fait, label }: { n: number; actif: boolean; fait: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`grid h-7 w-7 place-items-center rounded-full text-12 font-bold ${
          fait ? "bg-vert700 text-blanc" : actif ? "bg-encre text-blanc" : "bg-gris200 text-gris600"
        }`}
      >
        {fait ? <Icon nom="check" taille={13} couleur="currentColor" /> : n}
      </div>
      <span className={`text-12 font-semibold ${actif || fait ? "text-noir" : "text-gris500"}`}>{label}</span>
    </div>
  );
}
