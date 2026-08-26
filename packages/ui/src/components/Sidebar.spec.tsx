import { render, screen, fireEvent } from "@testing-library/react";
import { Sidebar } from "./Sidebar";

describe("Sidebar", () => {
  it("affiche les articles de l'espace de travail communs à tout utilisateur authentifié, quel que soit le rôle", () => {
    render(<Sidebar roles={["RESPONSABLE_DXC"]} routeActuelle="home" onNaviguer={() => {}} />);
    expect(screen.getByText("Tableau de bord")).toBeInTheDocument();
    expect(screen.getByText("Mes demandes")).toBeInTheDocument();
    expect(screen.getByText("Corbeilles")).toBeInTheDocument();
    expect(screen.getByText("Contrôle a posteriori")).toBeInTheDocument();
  });

  // 25/08/2026, demande explicite — POST /api/demandes porte désormais le
  // même @Roles() côté serveur (DemandesController) : ce gate ici n'est
  // qu'un confort de navigation, la vraie garantie reste le 403 serveur.
  it("masque « Nouvelle demande » à un rôle qui n'est ni INITIATEUR_<CIRCUIT> ni ADMIN_PGD", () => {
    render(<Sidebar roles={["RESPONSABLE_DXC"]} routeActuelle="home" onNaviguer={() => {}} />);
    expect(screen.queryByText("Nouvelle demande")).not.toBeInTheDocument();
  });

  it.each(["INITIATEUR_DOBB", "INITIATEUR_DXC", "INITIATEUR_DF"])(
    "affiche « Nouvelle demande » à un porteur du rôle %s",
    (role) => {
      render(<Sidebar roles={[role]} routeActuelle="home" onNaviguer={() => {}} />);
      expect(screen.getByText("Nouvelle demande")).toBeInTheDocument();
    }
  );

  it("affiche « Nouvelle demande » à ADMIN_PGD, même sans rôle INITIATEUR_<CIRCUIT>", () => {
    render(<Sidebar roles={["ADMIN_PGD"]} routeActuelle="home" onNaviguer={() => {}} />);
    expect(screen.getByText("Nouvelle demande")).toBeInTheDocument();
  });

  it("masque le groupe Pilotage sans le rôle ADMIN_PGD — confort d'affichage, pas un contrôle (les routes restent gardées côté serveur)", () => {
    render(<Sidebar roles={["AGENT_DXC"]} routeActuelle="home" onNaviguer={() => {}} />);
    expect(screen.queryByText("Pilotage")).not.toBeInTheDocument();
    expect(screen.queryByText("Administration")).not.toBeInTheDocument();
    expect(screen.queryByText("Intégrations")).not.toBeInTheDocument();
    expect(screen.queryByText("Modules")).not.toBeInTheDocument();
    expect(screen.queryByText("Journal d'audit")).not.toBeInTheDocument();
    expect(screen.queryByText("Consultation")).not.toBeInTheDocument();
    expect(screen.queryByText("Reporting")).not.toBeInTheDocument();
  });

  it("affiche le groupe Pilotage avec le rôle ADMIN_PGD", () => {
    render(<Sidebar roles={["ADMIN_PGD"]} routeActuelle="home" onNaviguer={() => {}} />);
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
      <Sidebar roles={["ADMIN_PGD"]} routeActuelle="home" onNaviguer={() => {}} compteMesDemandes={3} compteCorbeilles={0} />
    );
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();

    rerender(<Sidebar roles={["ADMIN_PGD"]} routeActuelle="home" onNaviguer={() => {}} />);
    expect(screen.queryByText("3")).not.toBeInTheDocument();
  });

  it("appelle onNaviguer avec la route de l'article cliqué", () => {
    const onNaviguer = jest.fn();
    render(<Sidebar roles={["ADMIN_PGD"]} routeActuelle="home" onNaviguer={onNaviguer} />);
    fireEvent.click(screen.getByText("Nouvelle demande"));
    expect(onNaviguer).toHaveBeenCalledWith("nouvelle");
  });

  it("marque la route active", () => {
    render(<Sidebar roles={["ADMIN_PGD"]} routeActuelle="corbeilles" onNaviguer={() => {}} />);
    expect(screen.getByText("Corbeilles").closest("button")).toHaveClass("text-blanc");
  });
});
