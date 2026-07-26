"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Empty, Icon, type NomIcone } from "@pgd/ui";
import type { EnumTypeNotification, NotificationVue } from "@pgd/contracts";
import { ApiError, listerNotifications, marquerNotificationLue } from "@/lib/api";

export interface NotificationBellProps {
  onOuvrirDossier: (demandeId: string) => void;
}

// Ferme la lacune documentée dans CLAUDE.md (« GET /api/notifications —
// question fermée et implémentée (Phase 9.2) », section « Reste à faire ») :
// la route existe depuis Phase 9.2, `apps/web` ne la consommait nulle part
// (vérifié par recherche, aucune occurrence de listerNotifications avant ce
// composant). docs/design/app.jsx (NotifDropdown) ne fait pas foi ici — sa
// forme (myTasks/myAlerts) vient de la simulation client (engine.jsx/
// data.jsx, jamais portée), pas du modèle réel Notification
// (demandeId/type/canal/lu/horodatage, cf. CLAUDE.md). Construit depuis le
// contrat réel, pas depuis la maquette — silence de maquette sur la forme
// exacte, pas sur l'existence de la fonctionnalité (cloche + badge déjà
// positionnées dans app.jsx et déjà provisionnées dans les tokens
// d'empilement, `--z-index-notification`, jamais utilisé jusqu'ici).
const LIBELLE_TYPE: Record<EnumTypeNotification, string> = {
  NOUVELLE_TACHE: "Nouvelle tâche à traiter",
  AVANCEMENT: "Avancement de dossier",
  REJET: "Dossier rejeté",
  VALIDATION: "Dossier validé",
  ESCALADE: "Escalade SLA",
  ERREUR_SI: "Erreur de restitution SI"
};

const ICONE_TYPE: Record<EnumTypeNotification, NomIcone> = {
  NOUVELLE_TACHE: "inbox",
  AVANCEMENT: "arrowRight",
  REJET: "x",
  VALIDATION: "check",
  ESCALADE: "alert",
  ERREUR_SI: "alert"
};

export function NotificationBell({ onOuvrirDossier }: NotificationBellProps) {
  const [ouvert, setOuvert] = useState(false);
  const [nonLues, setNonLues] = useState(0);
  const [notifications, setNotifications] = useState<NotificationVue[] | null>(null);
  const conteneurRef = useRef<HTMLDivElement>(null);

  const rafraichirCompte = useCallback(async () => {
    try {
      const reponse = await listerNotifications({ lu: false, page: 1, limit: 1 });
      setNonLues(reponse.total);
    } catch {
      // Compteur secondaire — un échec ici n'empêche pas le reste de l'écran.
    }
  }, []);

  useEffect(() => {
    void rafraichirCompte();
  }, [rafraichirCompte]);

  useEffect(() => {
    function surClicExterieur(e: MouseEvent) {
      if (conteneurRef.current && !conteneurRef.current.contains(e.target as Node)) {
        setOuvert(false);
      }
    }
    document.addEventListener("mousedown", surClicExterieur);
    return () => document.removeEventListener("mousedown", surClicExterieur);
  }, []);

  async function basculerOuverture() {
    const prochainEtat = !ouvert;
    setOuvert(prochainEtat);
    if (prochainEtat) {
      try {
        const reponse = await listerNotifications({ page: 1, limit: 10 });
        setNotifications(reponse.data);
      } catch (e) {
        setNotifications(e instanceof ApiError ? [] : []);
      }
    }
  }

  async function surClicNotification(n: NotificationVue) {
    if (!n.lu) {
      try {
        await marquerNotificationLue(n.id);
        setNotifications((liste) => liste?.map((x) => (x.id === n.id ? { ...x, lu: true } : x)) ?? null);
        setNonLues((c) => Math.max(0, c - 1));
      } catch {
        // Marquage best-effort — la navigation reste possible même en échec.
      }
    }
    setOuvert(false);
    if (n.demandeId) onOuvrirDossier(n.demandeId);
  }

  return (
    <div ref={conteneurRef} className="relative">
      <button
        type="button"
        onClick={() => void basculerOuverture()}
        aria-label="Notifications"
        title="Notifications"
        className="relative grid h-34 w-34 shrink-0 place-items-center rounded border border-gris200 bg-blanc text-gris700 hover:border-gris400 hover:text-encre"
      >
        <Icon nom="bell" taille={16} />
        {nonLues > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid h-[18px] min-w-5 place-items-center rounded-9 bg-orange px-1.5 text-11 font-extrabold text-noir">
            {nonLues > 99 ? "99+" : nonLues}
          </span>
        )}
      </button>

      {ouvert && (
        <div className="absolute right-0 top-full z-notification mt-2 w-[340px] overflow-hidden rounded-8 border border-gris200 bg-blanc shadow-lg">
          <div className="flex items-center gap-2 border-b border-gris100 px-4 py-3">
            <b className="text-13">Notifications</b>
            {nonLues > 0 && (
              <span className="ml-auto grid h-[18px] min-w-5 place-items-center rounded-9 bg-orange px-1.5 text-11 font-extrabold text-noir">
                {nonLues}
              </span>
            )}
          </div>
          <div className="max-h-[380px] overflow-y-auto">
            {notifications === null ? (
              <p className="p-6 text-13 text-gris600">Chargement…</p>
            ) : notifications.length === 0 ? (
              <Empty icone="check" titre="Aucune notification" />
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => void surClicNotification(n)}
                  className={`flex w-full items-start gap-3 border-b border-gris100 px-4 py-3 text-left last:border-0 hover:bg-gris50 ${
                    n.lu ? "" : "bg-orange/[.05]"
                  }`}
                >
                  <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-orange/[.12] text-orangeTexteSurClair">
                    <Icon nom={ICONE_TYPE[n.type]} taille={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-semibold">{LIBELLE_TYPE[n.type]}</span>
                    <span className="block text-11 text-gris500">{new Date(n.horodatage).toLocaleString("fr-FR")}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
