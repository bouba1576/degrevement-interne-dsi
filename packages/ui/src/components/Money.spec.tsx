import { render, screen } from "@testing-library/react";
import { Money } from "./Money";

describe("Money", () => {
  it("formate un montant avec séparateur de milliers et suffixe FCFA", () => {
    render(<Money valeur={5250000} />);
    expect(screen.getByText("5 250 000 FCFA")).toBeInTheDocument();
  });

  it("arrondit à l'affichage sans changer la valeur reçue (formatage, pas un recalcul)", () => {
    render(<Money valeur={1234.6} />);
    expect(screen.getByText("1 235 FCFA")).toBeInTheDocument();
  });

  it("affiche un tiret cadratin pour une valeur absente", () => {
    render(<Money valeur={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("la variante forte applique la graisse, jamais une valeur différente", () => {
    render(<Money valeur={1000} fort />);
    expect(screen.getByText("1 000 FCFA")).toHaveClass("font-bold");
  });
});
