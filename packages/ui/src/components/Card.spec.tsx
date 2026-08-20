import { render, screen } from "@testing-library/react";
import { Card, CardHeader } from "./Card";

describe("Card", () => {
  it("porte les classes structurelles réelles de .card (border-gris200, jamais border-gris100)", () => {
    const { container } = render(<Card>Contenu</Card>);
    expect(container.firstChild).toHaveClass("rounded-6", "border", "border-gris200", "bg-blanc");
  });

  it("accepte une className supplémentaire sans écraser les classes structurelles", () => {
    const { container } = render(<Card className="p-5">Contenu</Card>);
    expect(container.firstChild).toHaveClass("rounded-6", "border-gris200", "p-5");
  });
});

describe("CardHeader", () => {
  it("porte la bordure claire du bandeau (border-gris100, distincte du contour border-gris200 de Card)", () => {
    render(<CardHeader titre="Montants" />);
    const titre = screen.getByText("Montants");
    expect(titre.parentElement).toHaveClass("border-b", "border-gris100", "px-5", "py-4");
  });

  it("le titre utilise text-14 font-bold", () => {
    render(<CardHeader titre="Montants" />);
    expect(screen.getByText("Montants")).toHaveClass("text-14", "font-bold");
  });

  it("affiche l'icône uniquement si fournie", () => {
    const { container, rerender } = render(<CardHeader titre="Sans icône" />);
    expect(container.querySelector("svg")).toBeNull();

    rerender(<CardHeader titre="Avec icône" icone="doc" />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("affiche l'action fournie", () => {
    render(<CardHeader titre="Titre" action={<button type="button">Ajouter</button>} />);
    expect(screen.getByRole("button", { name: "Ajouter" })).toBeInTheDocument();
  });
});
