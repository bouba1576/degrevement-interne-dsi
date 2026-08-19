// Sidebar (packages/ui) affiche cette entrée pour ADMIN_PGD mais aucun écran
// réel n'existe encore derrière (ConsultationScreen, docs/design/screens2.jsx
// — hors périmètre, cf. CLAUDE.md « Autres écrans du mockup sans
// contrepartie »). Fallback identique à celui déjà affiché par l'ancien
// app/page.tsx pour toute route inconnue, pas un comportement nouveau.
export default function ConsultationPage() {
  return <p className="text-13 text-gris600">Écran « consultation » à construire (Phase 9.2, étapes suivantes).</p>;
}
