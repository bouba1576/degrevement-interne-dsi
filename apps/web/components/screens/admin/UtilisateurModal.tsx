"use client";

import { useMemo, useState } from "react";
import { Button, Modal } from "@pgd/ui";
import type { DirectionResponsabiliteVue, EnumMethodeMfa, RoleVue, SousFluxVue, UtilisateurAdminVue } from "@pgd/contracts";
import { ApiError, genererSecretTotpAdmin } from "@/lib/api";

export interface UtilisateurModalValeur {
  nom: string;
  roles: string[];
  directionId: string;
  serviceId: string;
  sousFluxId: string;
  mfaMethode: EnumMethodeMfa;
  actif: boolean;
}

export interface UtilisateurModalProps {
  // Création : identifiantAd/nom viennent de la recherche AD (jamais une
  // saisie libre — décision actée, évite de pré-enregistrer une faute de
  // frappe jamais authentifiable). Édition : utilisateur déjà pré-enregistré.
  identifiantAd: string;
  nomInitial: string;
  utilisateur: UtilisateurAdminVue | null;
  roles: RoleVue[];
  directions: DirectionResponsabiliteVue[];
  sousFluxOptions: SousFluxVue[];
  onFermer: () => void;
  onConfirmer: (valeur: UtilisateurModalValeur) => void;
  chargement: boolean;
  erreur: string | null;
  // Priorité 1 (19/08/2026) — rafraîchit la liste (badge « TOTP enrôlé »)
  // après une génération réussie, sans affecter l'état local de cette
  // modale (le panneau QR reste affiché tel quel jusqu'à fermeture).
  onEnrolementTotpReussi?: () => void;
}

type EtatTotp =
  | { type: "repos" }
  | { type: "confirmationRegeneration" }
  | { type: "enCours" }
  | { type: "resultat"; qrCodeDataUrl: string; secretBase32: string; issuer: string }
  | { type: "erreur"; message: string };

export function UtilisateurModal({
  identifiantAd,
  nomInitial,
  utilisateur,
  roles,
  directions,
  sousFluxOptions,
  onFermer,
  onConfirmer,
  chargement,
  erreur,
  onEnrolementTotpReussi
}: UtilisateurModalProps) {
  const [etatTotp, setEtatTotp] = useState<EtatTotp>({ type: "repos" });
  const [valeur, setValeur] = useState<UtilisateurModalValeur>(
    utilisateur
      ? {
          nom: utilisateur.nom,
          roles: utilisateur.roles.map((r) => r.code),
          directionId: utilisateur.directionId ?? "",
          serviceId: utilisateur.serviceId ?? "",
          sousFluxId: utilisateur.sousFluxId ?? "",
          mfaMethode: utilisateur.mfaMethode,
          actif: utilisateur.actif
        }
      : { nom: nomInitial, roles: [], directionId: "", serviceId: "", sousFluxId: "", mfaMethode: "DUO", actif: true }
  );

  const set = <K extends keyof UtilisateurModalValeur>(k: K, v: UtilisateurModalValeur[K]) =>
    setValeur((s) => ({ ...s, [k]: v }));

  const toggleRole = (code: string) =>
    setValeur((s) => ({ ...s, roles: s.roles.includes(code) ? s.roles.filter((r) => r !== code) : [...s.roles, code] }));

  // Changer de direction vide le service choisi — un service appartient à
  // une seule direction (FK réelle, ServiceResponsabilite.directionId).
  const changerDirection = (directionId: string) => setValeur((s) => ({ ...s, directionId, serviceId: "" }));

  const servicesDeLaDirection = useMemo(
    () => directions.find((d) => d.id === valeur.directionId)?.services ?? [],
    [directions, valeur.directionId]
  );

  const sousFluxParCircuit = useMemo(() => {
    const table: Record<string, SousFluxVue[]> = {};
    for (const s of sousFluxOptions) (table[s.circuit] ??= []).push(s);
    return table;
  }, [sousFluxOptions]);

  const valide = valeur.nom.trim().length > 0 && valeur.roles.length > 0;

  // Agit sur mfaMethode persisté côté serveur (utilisateur.mfaMethode), pas
  // sur la valeur en cours de saisie (valeur.mfaMethode) — le serveur refuse
  // tant que ce changement n'a pas été enregistré (422 MFA_METHODE_INVALIDE).
  async function lancerGenerationTotp() {
    if (!utilisateur) return;
    setEtatTotp({ type: "enCours" });
    try {
      const resultat = await genererSecretTotpAdmin(utilisateur.id);
      setEtatTotp({ type: "resultat", ...resultat });
      onEnrolementTotpReussi?.();
    } catch (e) {
      setEtatTotp({ type: "erreur", message: e instanceof ApiError ? e.message : "Génération impossible." });
    }
  }

  function copierSecret(secret: string) {
    void navigator.clipboard.writeText(secret);
  }

  return (
    <Modal
      titre={utilisateur ? `Modifier ${utilisateur.nom}` : "Pré-enregistrer un utilisateur"}
      icone="user"
      onFermer={onFermer}
      large
      pied={
        <>
          <Button onClick={onFermer} variante="fantome" taille="petite">
            Annuler
          </Button>
          <Button disabled={!valide || chargement} onClick={() => onConfirmer(valeur)} variante="sombre" taille="petite">
            {chargement ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erreur && <p className="text-13 font-semibold text-rouge700">{erreur}</p>}

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-13">
            Identifiant AD
            <input value={identifiantAd} disabled className="rounded border border-gris300 bg-gris50 px-2 py-1 font-mono text-13 text-gris500" />
          </label>
          <label className="flex flex-col gap-1 text-13">
            Nom
            <input value={valeur.nom} onChange={(e) => set("nom", e.target.value)} className="rounded border border-gris300 px-2 py-1 text-13" />
          </label>
          <label className="flex flex-col gap-1 text-13">
            Direction de rattachement
            <select
              value={valeur.directionId}
              onChange={(e) => changerDirection(e.target.value)}
              className="rounded border border-gris300 px-2 py-1 text-13"
            >
              <option value="">— Choisir —</option>
              {directions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.libelle}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-13">
            Service de rattachement
            <select
              value={valeur.serviceId}
              onChange={(e) => set("serviceId", e.target.value)}
              disabled={!valeur.directionId}
              className="rounded border border-gris300 px-2 py-1 text-13 disabled:bg-gris50 disabled:text-gris500"
            >
              <option value="">— Aucun —</option>
              {servicesDeLaDirection.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.libelle}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-13">
            Sous-flux de rattachement
            <select
              value={valeur.sousFluxId}
              onChange={(e) => set("sousFluxId", e.target.value)}
              className="rounded border border-gris300 px-2 py-1 text-13"
            >
              <option value="">— Aucun —</option>
              {Object.entries(sousFluxParCircuit).map(([circuit, options]) => (
                <optgroup key={circuit} label={circuit}>
                  {options.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.libelle}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <span className="text-11 text-gris500">
              Source de préremplissage à la création d&apos;un dossier — reste modifiable par l&apos;initiateur.
            </span>
          </label>
          <label className="flex flex-col gap-1 text-13">
            Méthode MFA
            <select
              value={valeur.mfaMethode}
              onChange={(e) => set("mfaMethode", e.target.value as EnumMethodeMfa)}
              className="rounded border border-gris300 px-2 py-1 text-13"
            >
              <option value="DUO">DUO</option>
              <option value="TOTP">TOTP</option>
            </select>
          </label>
          {utilisateur && (
            <label className="flex items-center gap-2 self-end pb-1 text-13">
              <input type="checkbox" checked={valeur.actif} onChange={(e) => set("actif", e.target.checked)} />
              Compte actif
            </label>
          )}
        </div>

        <div>
          <div className="mb-2 text-12 font-bold uppercase tracking-wide text-gris600">
            Rôles ({valeur.roles.length}) — au moins un requis
          </div>
          <div className="grid max-h-[220px] grid-cols-2 gap-1.5 overflow-y-auto">
            {roles.map((r) => (
              <label
                key={r.code}
                className={`flex items-center gap-2 rounded border px-2 py-1.5 text-13 ${
                  valeur.roles.includes(r.code) ? "border-orange bg-orange50" : "border-gris200"
                }`}
              >
                <input type="checkbox" checked={valeur.roles.includes(r.code)} onChange={() => toggleRole(r.code)} />
                <span>
                  <span className="font-semibold">{r.libelle}</span>
                  <span className="ml-1 font-mono text-12 text-gris500">{r.code}</span>
                </span>
              </label>
            ))}
          </div>
          {utilisateur && (
            <p className="mt-2 text-12 text-gris600">
              Un changement de rôle n&apos;affecte pas une session déjà ouverte — il devient effectif à la
              prochaine connexion de cette personne.
            </p>
          )}
        </div>

        {utilisateur && (
          <div className="rounded border border-gris200 p-3">
            <div className="mb-2 text-12 font-bold uppercase tracking-wide text-gris600">Secret TOTP</div>

            {utilisateur.mfaMethode !== "TOTP" ? (
              <p className="text-13 text-gris600">
                {valeur.mfaMethode === "TOTP"
                  ? "Enregistrez d'abord ce changement de méthode MFA — la génération n'est possible qu'une fois « TOTP » confirmé côté serveur."
                  : "Sans objet pour la méthode DUO."}
              </p>
            ) : (
              <>
                <p className="mb-2 text-13 text-gris600">
                  {utilisateur.totpEnrole ? "Un secret est déjà enrôlé pour ce compte." : "Aucun secret enrôlé pour ce compte."}
                </p>

                {etatTotp.type === "repos" && (
                  <button
                    type="button"
                    onClick={() =>
                      utilisateur.totpEnrole ? setEtatTotp({ type: "confirmationRegeneration" }) : void lancerGenerationTotp()
                    }
                    className="rounded border border-gris300 px-3 py-1.5 text-13 font-bold text-gris700"
                  >
                    {utilisateur.totpEnrole ? "Régénérer le secret TOTP" : "Générer un QR TOTP"}
                  </button>
                )}

                {etatTotp.type === "confirmationRegeneration" && (
                  <div className="rounded border border-orange bg-orange50 p-2">
                    <p className="mb-2 text-13 font-semibold text-orangeTexteSurClair">
                      L&apos;ancien secret sera immédiatement invalidé — toute application d&apos;authentification qui le
                      portait cessera de fonctionner, sans message d&apos;erreur avant la prochaine tentative de
                      connexion de cette personne.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void lancerGenerationTotp()}
                        className="rounded bg-orange px-3 py-1.5 text-13 font-bold text-noir"
                      >
                        Confirmer la régénération
                      </button>
                      <button
                        type="button"
                        onClick={() => setEtatTotp({ type: "repos" })}
                        className="rounded border border-gris300 px-3 py-1.5 text-13 font-bold text-gris700"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}

                {etatTotp.type === "enCours" && (
                  <button type="button" disabled className="rounded border border-gris300 px-3 py-1.5 text-13 font-bold text-gris400">
                    Génération…
                  </button>
                )}

                {etatTotp.type === "erreur" && (
                  <div>
                    <p className="mb-2 text-13 font-semibold text-rouge700">{etatTotp.message}</p>
                    <button
                      type="button"
                      onClick={() => setEtatTotp({ type: "repos" })}
                      className="rounded border border-gris300 px-3 py-1.5 text-13 font-bold text-gris700"
                    >
                      Réessayer
                    </button>
                  </div>
                )}

                {etatTotp.type === "resultat" && (
                  <div className="flex flex-col gap-3">
                    <p className="rounded border border-rouge700 bg-rougeFond p-2 text-12 font-semibold text-rouge700">
                      Ce QR contient le secret en clair. Transmettez-le à la personne concernée par un canal
                      sécurisé — jamais par e-mail ou messagerie interne non chiffrée. Il est déjà enregistré
                      côté serveur : fermer cette fenêtre ne l&apos;annule pas.
                    </p>
                    <div className="flex items-start gap-4">
                      {/* data URL locale (jamais une ressource distante) — <img> plutôt que next/image */}
                      <img src={etatTotp.qrCodeDataUrl} alt="QR code TOTP" className="h-[160px] w-[160px] rounded border border-gris200" />
                      <div className="flex flex-col gap-2">
                        <div>
                          <div className="text-11 font-bold uppercase tracking-wide text-gris600">Saisie manuelle</div>
                          <div className="flex items-center gap-2">
                            <code className="rounded bg-gris50 px-2 py-1 font-mono text-12">{etatTotp.secretBase32}</code>
                            <button
                              type="button"
                              onClick={() => copierSecret(etatTotp.secretBase32)}
                              className="text-12 font-semibold text-encre underline"
                            >
                              Copier
                            </button>
                          </div>
                        </div>
                        <a
                          href={etatTotp.qrCodeDataUrl}
                          download={`qr-totp-${utilisateur.identifiantAd.replace(/[^a-z0-9.]+/gi, "-")}.png`}
                          className="text-12 font-semibold text-encre underline"
                        >
                          Télécharger le PNG
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
