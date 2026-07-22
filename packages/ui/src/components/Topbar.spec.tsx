import { render, screen, fireEvent } from "@testing-library/react";
import { Topbar } from "./Topbar";

describe("Topbar", () => {
  it("affiche le titre et le sous-titre de la route", () => {
    render(<Topbar titre="Tableau de bord" sousTitre="Vue d'ensemble" nomUtilisateur="Aïcha Koffi" onDeconnexion={() => {}} />);
    expect(screen.getByText("Tableau de bord")).toBeInTheDocument();
    expect(screen.getByText("Vue d'ensemble")).toBeInTheDocument();
  });

  it("n'affiche pas de sous-titre quand il est absent", () => {
    render(<Topbar titre="Tableau de bord" nomUtilisateur="Aïcha Koffi" onDeconnexion={() => {}} />);
    expect(screen.queryByText("Vue d'ensemble")).not.toBeInTheDocument();
  });

  it("affiche le nom de l'utilisateur réel (SessionUtilisateur.nom), jamais un texte de bascule de rôle — RoleMenu n'a pas d'équivalent réel", () => {
    render(<Topbar titre="Tableau de bord" nomUtilisateur="Aïcha Koffi" libelleRole="Agent DXC" onDeconnexion={() => {}} />);
    expect(screen.getByText("Aïcha Koffi")).toBeInTheDocument();
    expect(screen.getByText("Agent DXC")).toBeInTheDocument();
    expect(screen.getByText("AK")).toBeInTheDocument(); // initiales de l'Avatar
  });

  it("appelle onDeconnexion au clic sur le bouton de déconnexion", () => {
    const onDeconnexion = jest.fn();
    render(<Topbar titre="Tableau de bord" nomUtilisateur="Aïcha Koffi" onDeconnexion={onDeconnexion} />);
    fireEvent.click(screen.getByRole("button", { name: "Se déconnecter" }));
    expect(onDeconnexion).toHaveBeenCalledTimes(1);
  });
});
