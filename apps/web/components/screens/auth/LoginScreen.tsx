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
      // Deux formats coexistent légitimement (e-mail pour le socle de test
      // dev, identifiant AD brut pour un compte réel — cf. CLAUDE.md,
      // « identifiantAd = username brut, pas une adresse e-mail »). Le client
      // ne devine ni ne transforme jamais : la saisie part telle quelle,
      // deviner le format reviendrait à réintroduire exactement le bug déjà
      // trouvé et corrigé (complétion silencieuse `@orange.com`).
      const reponse = await login({ identifiantAd: identifiantAd.trim(), motDePasse });
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
          {/* docs/design/ui.jsx:62-74 (BrandMark) — une fois l'image chargée,
              le conteneur devient transparent (fond orange = repli seulement
              si l'image est absente) et l'image REMPLIT le carré size×size
              (styles.css:90, object-fit: contain) — jamais une icône réduite
              à l'intérieur d'un fond orange. */}
          <div className="grid h-11 w-11 shrink-0 place-items-center">
            <img src="/logo-orange.png" alt="Orange Côte d'Ivoire" className="h-full w-full object-contain" />
          </div>
          <div>
            <b className="block text-[16px]">Orange Côte d&apos;Ivoire</b>
            <span className="text-11 uppercase tracking-[.1em] text-gris400">DSI · AIP</span>
          </div>
        </div>
        <div>
          <PlatformIllustration />
          <h1 className="max-w-[440px] text-[32px] font-bold leading-tight tracking-tight">
            Plateforme de Gestion des Dégrèvements
          </h1>
          <p className="mt-3 max-w-[400px] text-14 leading-relaxed text-gris300">
            Saisie multi-circuit, routage automatique, corbeilles partagées et traçabilité complète des décisions de
            dégrèvement.
          </p>
          <div className="mt-6 flex max-w-[410px] flex-col gap-4">
            {(
              [
                { icone: "edit" as const, titre: "Saisie & routage automatisés", texte: "Fiches DOBB, DXC et Wholesale calculées et orientées par les règles." },
                { icone: "inbox" as const, titre: "Corbeilles partagées", texte: "Affectation par rôle, claim/unclaim, aucun blocage en cas d'absence." },
                { icone: "shield" as const, titre: "Traçabilité & contrôle", texte: "Journal d'audit horodaté, contrôle a posteriori, conformité SOX." }
              ]
            ).map((b) => (
              <div key={b.icone} className="flex items-start gap-3">
                <div className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[9px] border border-orange/30 bg-orange/[.16] text-orange">
                  <Icon nom={b.icone} taille={19} />
                </div>
                <div>
                  <div className="text-[13.5px] font-bold">{b.titre}</div>
                  <div className="text-12 leading-snug text-gris400">{b.texte}</div>
                </div>
              </div>
            ))}
          </div>
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
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris500">
                    <Icon nom="user" taille={16} />
                  </span>
                  <input
                    value={identifiantAd}
                    onChange={(e) => setIdentifiantAd(e.target.value)}
                    placeholder="identifiant AD"
                    autoFocus
                    className="w-full rounded border border-gris300 py-2 pl-9 pr-3 text-14 font-normal"
                  />
                </div>
              </label>
              <label className="mb-4 flex flex-col gap-1 text-13 font-bold text-gris800">
                Mot de passe d&apos;entreprise
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris500">
                    <Icon nom="lock" taille={16} />
                  </span>
                  <input
                    type="password"
                    value={motDePasse}
                    onChange={(e) => setMotDePasse(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded border border-gris300 py-2 pl-9 pr-3 text-14 font-normal"
                  />
                </div>
              </label>
              <button
                type="submit"
                disabled={chargement || !identifiantAd.trim() || !motDePasse.trim()}
                className="flex w-full items-center justify-center gap-2 rounded bg-orange px-4 py-2.5 text-14 font-bold text-noir disabled:opacity-50"
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
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris500">
                    <Icon nom="lock" taille={16} />
                  </span>
                  <input
                    value={codeTotp}
                    onChange={(e) => setCodeTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="------"
                    maxLength={6}
                    autoFocus
                    className="w-full rounded border border-gris300 py-2 pl-9 pr-3 text-center font-mono text-[22px] tracking-[.4em]"
                  />
                </div>
              </label>
              <button
                type="submit"
                disabled={chargement || codeTotp.length !== 6}
                className="flex w-full items-center justify-center gap-2 rounded bg-orange px-4 py-2.5 text-14 font-bold text-noir disabled:opacity-50"
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

// Port fidèle de docs/design/screens_auth.jsx (PlatformIllustration) — SVG
// purement décoratif, aucune donnée réelle (le montant "3 872 000 F" est un
// exemple de la maquette, jamais un chiffre live).
function PlatformIllustration() {
  return (
    <div className="mb-7 w-full max-w-[470px]">
      <svg viewBox="0 0 470 250" width="100%" style={{ display: "block" }} role="img" aria-label="Illustration de la plateforme de gestion des dégrèvements">
        <defs>
          <linearGradient id="pgGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FF7900" />
            <stop offset="1" stopColor="#E8590C" />
          </linearGradient>
          <filter id="pgShadow" x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx="0" dy="10" stdDeviation="14" floodColor="#000" floodOpacity="0.28" />
          </filter>
        </defs>

        <ellipse cx="120" cy="120" rx="115" ry="100" fill="#4BB4E6" opacity="0.16" />
        <ellipse cx="350" cy="150" rx="110" ry="95" fill="#FF7900" opacity="0.14" />

        <g opacity="0.9">
          <path
            d="M250 70 H300 a14 14 0 0 1 14 14 V150 a14 14 0 0 0 14 14 H392"
            fill="none"
            stroke="#5a6573"
            strokeWidth="3"
            strokeDasharray="2 9"
            strokeLinecap="round"
          />
          {(
            [
              [250, 70],
              [314, 108],
              [406, 164]
            ] as const
          ).map(([cx, cy], i) => (
            <g key={i}>
              <circle cx={cx} cy={cy} r="15" fill={i === 2 ? "url(#pgGrad)" : "#1f2733"} stroke={i === 2 ? "#FF7900" : "#3a4654"} strokeWidth="2" />
              {i === 2 ? (
                <path d={`M${cx - 6} ${cy} l4 4 l8 -9`} fill="none" stroke="#000" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <circle cx={cx} cy={cy} r="4.5" fill="#4BB4E6" />
              )}
            </g>
          ))}
        </g>

        <g filter="url(#pgShadow)" transform="rotate(-5 150 130)">
          <rect x="70" y="56" width="190" height="150" rx="12" fill="#ffffff" />
          <rect x="70" y="56" width="190" height="34" rx="12" fill="url(#pgGrad)" />
          <rect x="70" y="78" width="190" height="12" fill="url(#pgGrad)" />
          <circle cx="90" cy="73" r="7" fill="#fff" opacity="0.9" />
          <path d="M86.5 73 l2.5 2.5 l4.5 -5" fill="none" stroke="#E8590C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <text x="104" y="78" fontSize="13" fontWeight="700" fill="#fff" fontFamily="Helvetica, Arial, sans-serif">
            Dégrèvement
          </text>
          <rect x="88" y="106" width="92" height="8" rx="4" fill="#cfd6de" />
          <rect x="88" y="122" width="140" height="8" rx="4" fill="#e3e8ed" />
          <rect x="88" y="138" width="120" height="8" rx="4" fill="#e3e8ed" />
          <rect x="88" y="160" width="154" height="32" rx="8" fill="#FFF3E8" stroke="#FFD2A6" strokeWidth="1" />
          <text x="98" y="180" fontSize="10" fill="#9a4a00" fontFamily="Helvetica, Arial, sans-serif">
            TTC
          </text>
          <text x="234" y="181" fontSize="12.5" fontWeight="800" fill="#E8590C" textAnchor="end" fontFamily="Helvetica, Arial, sans-serif">
            3 872 000 F
          </text>
        </g>

        <g transform="translate(330 60)" filter="url(#pgShadow)">
          <circle cx="0" cy="0" r="34" fill="#1f8a5b" />
          <circle cx="0" cy="0" r="34" fill="none" stroke="#fff" strokeWidth="2" opacity="0.5" />
          <path d="M-14 0 l9 9 l18 -20" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
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
          fait ? "bg-vert700 text-blanc" : actif ? "bg-orange text-noir" : "bg-gris200 text-gris600"
        }`}
      >
        {fait ? <Icon nom="check" taille={13} couleur="currentColor" /> : n}
      </div>
      <span className={`text-12 font-semibold ${actif || fait ? "text-noir" : "text-gris500"}`}>{label}</span>
    </div>
  );
}
