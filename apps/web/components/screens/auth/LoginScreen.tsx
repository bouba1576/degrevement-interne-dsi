"use client";

import { useEffect, useState } from "react";
import { Button, Icon } from "@pgd/ui";
import { API_URL } from "@/lib/api";

// Plus de props (onConnecte retirée le 20/08/2026, avec app/login/page.tsx)
// — elle n'avait de sens que pour l'ancien flux XHR (login()/verifierMfa()
// résolus côté client, puis router.replace("/") déclenché ICI). La
// redirection Keycloak fait quitter cette page entièrement ; au retour,
// c'est AppLayout ((app)/layout.tsx, fetchSession() au montage) qui détecte
// la nouvelle session — un mécanisme déjà indépendant de LoginScreen, pas
// un nouveau à construire.
//
// Architecture Keycloak (20/08/2026, décision actée) — un seul bouton,
// aucun formulaire identifiant/mot de passe visible, aucune bascule. Le
// navigateur est redirigé plein-page vers GET /api/auth/keycloak/login
// (KeycloakController) ; l'authentification AD et le second facteur ont
// lieu entièrement sur une page hébergée par Keycloak, jamais dans PGD.
// Retour sur GET /api/auth/keycloak/callback (côté serveur, jamais vu par
// ce composant), qui pose les cookies de session puis redirige vers
// l'origine — ou vers cette même page avec ?erreur=... en cas de refus.
//
// POST /api/auth/login et POST /api/auth/mfa/verify (formulaire, TOTP)
// restent intacts côté serveur — ils ne servent plus qu'à la suite de
// tests et aux quinze identités de test persistantes, authentifiées par
// appel direct, jamais par un bouton de cet écran.
//
// Port de docs/design/screens_auth.jsx (LoginScreen) pour le panneau de
// marque uniquement (logo, illustration, texte, badges circuit) — aucune
// maquette n'existe pour un bouton unique de redirection, cf. échange de
// conception : reprend le même style que le bouton primaire déjà établi
// (Button variante="primaire", packages/ui) plutôt que d'inventer une
// esthétique nouvelle.
export function LoginScreen() {
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("erreur");
    if (code === "keycloak_invalide") {
      setErreur("La connexion a échoué ou a expiré. Réessayez.");
    } else if (code === "compte_non_provisionne") {
      setErreur("Ce compte n'a pas été pré-enregistré. Contactez votre administrateur.");
    }
  }, []);

  function handleConnexion() {
    window.location.href = `${API_URL}/api/auth/keycloak/login`;
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
          <Icon nom="lock" taille={13} /> Authentification sécurisée
        </div>
      </div>

      <div className="grid place-items-center p-10">
        <div className="w-full max-w-[380px]">
          {erreur && (
            <div className="mb-4 flex items-start gap-2 rounded border border-rouge700 bg-rougeFond p-3 text-13 font-semibold text-rouge700">
              <Icon nom="alert" taille={15} />
              <span>{erreur}</span>
            </div>
          )}

          <div className="mb-6">
            <div className="mb-1 text-[20px] font-bold">Connexion</div>
            <p className="text-13 text-gris600">Identifiez-vous depuis la page sécurisée de votre organisation.</p>
          </div>

          <Button variante="primaire" taille="normale" pleineLargeur onClick={handleConnexion}>
            Se connecter
            <Icon nom="arrowRight" taille={16} />
          </Button>

          <p className="mt-3 text-center text-12 text-gris600">
            Vous serez redirigé vers la page de connexion sécurisée de votre organisation.
          </p>
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
