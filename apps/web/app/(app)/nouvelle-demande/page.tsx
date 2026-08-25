"use client";

import { useSearchParams } from "next/navigation";
import { NouvelleDemandeScreen } from "@/components/screens/nouvelle-demande/NouvelleDemandeScreen";
import { useAppShell } from "@/lib/app-shell-context";

// Mode reprise (24/08/2026, audit MesDemandesScreen) : ?id=<uuid> reprend
// un BROUILLON existant au lieu d'en créer un neuf — jamais un choix
// utilisateur dans l'URL, uniquement posé par le lien « Corriger » de
// DossierDetailScreen/MesDemandesScreen. `key` force un remontage complet
// si l'id change (ou disparaît) sans passage par une autre page — sinon
// l'état déjà peuplé d'un premier dossier resterait affiché par-dessus le
// suivant, aucun des effets de NouvelleDemandeScreen ne gérant ce cas.
export default function NouvelleDemandePage() {
  const { utilisateur } = useAppShell();
  const params = useSearchParams();
  const demandeId = params.get("id") ?? undefined;
  return <NouvelleDemandeScreen key={demandeId ?? "nouveau"} utilisateur={utilisateur} demandeId={demandeId} />;
}
