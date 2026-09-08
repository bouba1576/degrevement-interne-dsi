import { render, screen, fireEvent } from "@testing-library/react";
import { Sidebar } from "./Sidebar";

describe("Sidebar", () => {
  // 01/09/2026, demande explicite — « Mes demandes » retiré de la liste des
  // articles communs (désormais réservé Initiateur/Admin, cf. tests dédiés
  // ci-dessous) : ne restent communs à tout authentifié que Tableau de
  // bord/Corbeilles/Contrôle a posteriori.
  it("affiche les articles de l'espace de travail communs à tout utilisateur authentifié, quel que soit le rôle", () => {
    render(<Sidebar roles={["RESPONSABLE_DXC"]} profils={["VALIDATEUR"]} routeActuelle="home" onNaviguer={() => {}} />);
    expect(screen.getByText("Tableau de bord")).toBeInTheDocument();
    expect(screen.getByText("Corbeilles")).toBeInTheDocument();
    expect(screen.getByText("Contrôle a posteriori")).toBeInTheDocument();
  });

  // 25/08/2026, demande explicite — POST /api/demandes porte désormais le
  // même @Roles() côté serveur (DemandesController) : ce gate ici n'est
  // qu'un confort de navigation, la vraie garantie reste le 403 serveur.
  //
  // Rebranché sur `profils` (Chantier 2, 28/08/2026, docs/14) — le gate ne
  // lit plus `roles` du tout pour cette décision (proxy par préfixe
  // `startsWith("INITIATEUR_")` retiré) ; `roles` reste passé pour rester
  // fidèle au profil de test (RESPONSABLE_DXC → VALIDATEUR), mais n'est plus
  // ce que le composant consulte ici.
  it("masque « Nouvelle demande » à un profil qui n'est ni INITIATEUR ni ADMINISTRATEUR", () => {
    render(<Sidebar roles={["RESPONSABLE_DXC"]} profils={["VALIDATEUR"]} routeActuelle="home" onNaviguer={() => {}} />);
    expect(screen.queryByText("Nouvelle demande")).not.toBeInTheDocument();
  });

  // 01/09/2026, demande explicite — « Mes demandes » suit désormais la même
  // règle de visibilité que « Nouvelle demande » (Initiateur/Admin
  // uniquement) : un validateur pur n'a jamais initié de dossier, ce lien
  // n'aurait jamais rien à lui montrer.
  it("masque « Mes demandes » à un profil qui n'est ni INITIATEUR ni ADMINISTRATEUR", () => {
    render(<Sidebar roles={["RESPONSABLE_DXC"]} profils={["VALIDATEUR"]} routeActuelle="home" onNaviguer={() => {}} />);
    expect(screen.queryByText("Mes demandes")).not.toBeInTheDocument();
  });

  it("affiche « Nouvelle demande » et « Mes demandes » à un profil INITIATEUR", () => {
    render(<Sidebar roles={["INITIATEUR_DOBB"]} profils={["INITIATEUR"]} routeActuelle="home" onNaviguer={() => {}} />);
    expect(screen.getByText("Nouvelle demande")).toBeInTheDocument();
    expect(screen.getByText("Mes demandes")).toBeInTheDocument();
  });

  it("affiche « Nouvelle demande » et « Mes demandes » à ADMIN_PGD, même sans profil INITIATEUR", () => {
    render(<Sidebar roles={["ADMIN_PGD"]} profils={["ADMINISTRATEUR"]} routeActuelle="home" onNaviguer={() => {}} />);
    expect(screen.getByText("Nouvelle demande")).toBeInTheDocument();
    expect(screen.getByText("Mes demandes")).toBeInTheDocument();
  });

  // Chantier 2 (28/08/2026, docs/14) — preuve directe du bug corrigé (trouvé
  // en revue, HomeScreen.tsx) : un profil ADMINISTRATEUR porté par un rôle
  // AUTRE qu'ADMIN_PGD (SUPERVISEUR/SERVICE_TECHNIQUE) n'a jamais été un
  // porteur légitime d'INITIATEUR NI de VALIDATEUR — l'ancien complément
  // `r !== ROLE_ADMIN && !r.startsWith("INITIATEUR_")` aurait néanmoins ici
  // été vrai côté HomeScreen.estValideur (jamais dans Sidebar, qui n'a pas
  // cette logique). Vérifié explicitement ici pour Sidebar aussi, par
  // cohérence : ADMINISTRATEUR sans ADMIN_PGD ne doit montrer ni « Nouvelle
  // demande » ni « Reporting » ni le reste du groupe Pilotage — Reporting
  // reste câblé sur VALIDATEUR (profil réel) ou ADMIN_PGD (rôle précis,
  // Famille A), jamais sur ADMINISTRATEUR au sens large.
  it("un profil ADMINISTRATEUR porté par SUPERVISEUR (pas ADMIN_PGD) ne voit ni « Nouvelle demande » ni le groupe Pilotage", () => {
    render(<Sidebar roles={["SUPERVISEUR"]} profils={["ADMINISTRATEUR"]} routeActuelle="home" onNaviguer={() => {}} />);
    expect(screen.queryByText("Nouvelle demande")).not.toBeInTheDocument();
    expect(screen.queryByText("Pilotage")).not.toBeInTheDocument();
  });

  // 01/09/2026, demande explicite — un validateur pur ne voit que
  // « Reporting » dans le groupe Pilotage, jamais Consultation/Journal
  // d'audit/Administration/Intégrations (capacités strictement
  // administratives). ReportingController porte désormais
  // @ProfilRequis("VALIDATEUR", "ADMINISTRATEUR") côté serveur — ce lien
  // n'est plus un confort sans garde derrière.
  it("un validateur voit « Reporting » mais pas le reste du groupe Pilotage", () => {
    render(<Sidebar roles={["RESPONSABLE_DXC"]} profils={["VALIDATEUR"]} routeActuelle="home" onNaviguer={() => {}} />);
    expect(screen.getByText("Reporting")).toBeInTheDocument();
    expect(screen.queryByText("Consultation")).not.toBeInTheDocument();
    expect(screen.queryByText("Journal d'audit")).not.toBeInTheDocument();
    expect(screen.queryByText("Administration")).not.toBeInTheDocument();
    expect(screen.queryByText("Intégrations")).not.toBeInTheDocument();
    expect(screen.queryByText("Modules")).not.toBeInTheDocument();
  });

  it("masque tout le groupe Pilotage — y compris Reporting — à un profil qui n'est ni VALIDATEUR ni ADMIN_PGD", () => {
    render(<Sidebar roles={["INITIATEUR_DOBB"]} profils={["INITIATEUR"]} routeActuelle="home" onNaviguer={() => {}} />);
    expect(screen.queryByText("Pilotage")).not.toBeInTheDocument();
    expect(screen.queryByText("Reporting")).not.toBeInTheDocument();
    expect(screen.queryByText("Administration")).not.toBeInTheDocument();
    expect(screen.queryByText("Intégrations")).not.toBeInTheDocument();
    expect(screen.queryByText("Modules")).not.toBeInTheDocument();
    expect(screen.queryByText("Journal d'audit")).not.toBeInTheDocument();
    expect(screen.queryByText("Consultation")).not.toBeInTheDocument();
  });

  it("affiche le groupe Pilotage complet avec le rôle ADMIN_PGD", () => {
    render(<Sidebar roles={["ADMIN_PGD"]} profils={["ADMINISTRATEUR"]} routeActuelle="home" onNaviguer={() => {}} />);
    expect(screen.getByText("Pilotage")).toBeInTheDocument();
    expect(screen.getByText("Administration")).toBeInTheDocument();
    expect(screen.getByText("Intégrations")).toBeInTheDocument();
    expect(screen.getByText("Journal d'audit")).toBeInTheDocument();
    expect(screen.getByText("Consultation")).toBeInTheDocument();
    expect(screen.getByText("Reporting")).toBeInTheDocument();
    // Pas d'entrée « Modules » séparée — couverte par l'onglet « Paramètres
    // système » d'AdminScreen, jamais dupliquée dans la Sidebar.
    expect(screen.queryByText("Modules")).not.toBeInTheDocument();
  });

  it("affiche le compte fourni uniquement s'il est strictement positif", () => {
    const { rerender } = render(
      <Sidebar
        roles={["ADMIN_PGD"]}
        profils={["ADMINISTRATEUR"]}
        routeActuelle="home"
        onNaviguer={() => {}}
        compteMesDemandes={3}
        compteCorbeilles={0}
      />
    );
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();

    rerender(<Sidebar roles={["ADMIN_PGD"]} profils={["ADMINISTRATEUR"]} routeActuelle="home" onNaviguer={() => {}} />);
    expect(screen.queryByText("3")).not.toBeInTheDocument();
  });

  it("appelle onNaviguer avec la route de l'article cliqué", () => {
    const onNaviguer = jest.fn();
    render(<Sidebar roles={["ADMIN_PGD"]} profils={["ADMINISTRATEUR"]} routeActuelle="home" onNaviguer={onNaviguer} />);
    fireEvent.click(screen.getByText("Nouvelle demande"));
    expect(onNaviguer).toHaveBeenCalledWith("nouvelle");
  });

  it("marque la route active", () => {
    render(<Sidebar roles={["ADMIN_PGD"]} profils={["ADMINISTRATEUR"]} routeActuelle="corbeilles" onNaviguer={() => {}} />);
    expect(screen.getByText("Corbeilles").closest("button")).toHaveClass("text-blanc");
  });
});
