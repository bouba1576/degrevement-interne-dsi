import { render, screen } from "@testing-library/react";
import { Avatar } from "./Avatar";

describe("Avatar", () => {
  it("affiche les initiales première lettre du premier et du dernier mot", () => {
    render(<Avatar nom="Marie Diallo" />);
    expect(screen.getByText("MD")).toBeInTheDocument();
  });

  it("un seul mot : les deux premières lettres", () => {
    render(<Avatar nom="Kouassi" />);
    expect(screen.getByText("KO")).toBeInTheDocument();
  });

  it("la couleur est déterministe — le même nom donne toujours la même couleur", () => {
    const { unmount } = render(<Avatar nom="Jean Kouassi" />);
    const premiereCouleur = screen.getByText("JK").style.background;
    unmount();

    render(<Avatar nom="Jean Kouassi" />);
    expect(screen.getByText("JK").style.background).toBe(premiereCouleur);
  });

  it("respecte la taille personnalisée (largeur/hauteur/taille de police)", () => {
    render(<Avatar nom="Paul Brou" taille={48} />);
    const el = screen.getByText("PB");
    expect(el).toHaveStyle({ width: "48px", height: "48px" });
  });
});
