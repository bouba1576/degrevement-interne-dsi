import { render, screen, fireEvent } from "@testing-library/react";
import { Sidebar } from "./Sidebar";

describe("Sidebar", () => {
  it("affiche les articles de l'espace de travail à tout utilisateur authentifié, quel que soit le rôle", () => {
    render(<Sidebar roles={["AGENT_DXC"]} routeActuelle="home" onNaviguer={() => {}} />);
    expect(screen.getByText("Tableau de bord")).toBeInTheDocument();
    expect(screen.getByText("Nouvelle demande")).toBeInTheDocument();
    expect(screen.getByText("Mes demandes")).toBeInTheDocument();
    expect(screen.getByText("Corbeilles")).toBeInTheDocument();
    expect(screen.getByText("Contrôle a posteriori")).toBeInTheDocument();
  });

  it("masque le groupe Pilotage sans le rôle ADMIN_PGD — confort d'affichage, pas un contrôle (les routes restent gardées côté serveur)", () => {
    render(<Sidebar roles={["AGENT_DXC"]} routeActuelle="home" onNaviguer={() => {}} />);
    expect(screen.queryByText("Pilotage")).not.toBeInTheDocument();
    expect(screen.queryByText("Administration")).not.toBeInTheDocument();
    expect(screen.queryByText("Intégrations")).not.toBeInTheDocument();
    expect(screen.queryByText("Modules")).not.toBeInTheDocument();
    expect(screen.queryByText("Journal d'audit")).not.toBeInTheDocument();
    expect(screen.queryByText("Consultation")).not.toBeInTheDocument();
  });

  it("affiche le groupe Pilotage avec le rôle ADMIN_PGD", () => {
    render(<Sidebar roles={["ADMIN_PGD"]} routeActuelle="home" onNaviguer={() => {}} />);
    expect(screen.getByText("Pilotage")).toBeInTheDocument();
    expect(screen.getByText("Administration")).toBeInTheDocument();
    expect(screen.getByText("Intégrations")).toBeInTheDocument();
    expect(screen.getByText("Journal d'audit")).toBeInTheDocument();
    expect(screen.getByText("Consultation")).toBeInTheDocument();
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
