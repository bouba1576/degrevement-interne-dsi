import { render, screen } from "@testing-library/react";
import { IconButton } from "./IconButton";

describe("IconButton", () => {
  it("porte les classes structurelles réelles de .iconbtn (34px, rounded bare = r1)", () => {
    render(<IconButton icone="x" ariaLabel="Fermer" onClick={() => {}} />);
    const bouton = screen.getByRole("button", { name: "Fermer" });
    expect(bouton).toHaveClass("h-34", "w-34", "rounded", "border-gris200", "bg-blanc", "text-gris700");
  });

  it("survol utilise text-encre, jamais text-noir (--ink = encre, pas noir — bug trouvé dans Modal.tsx)", () => {
    render(<IconButton icone="x" ariaLabel="Fermer" onClick={() => {}} />);
    const bouton = screen.getByRole("button", { name: "Fermer" });
    expect(bouton).toHaveClass("hover:enabled:text-encre");
    expect(bouton).not.toHaveClass("hover:enabled:text-noir");
  });

  it("exige un aria-label (nom accessible), jamais une icône seule sans nom", () => {
    render(<IconButton icone="trash" ariaLabel="Supprimer" onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Supprimer" })).toBeInTheDocument();
  });

  it("transmet onClick et disabled", () => {
    const onClick = jest.fn();
    render(<IconButton icone="x" ariaLabel="Fermer" onClick={onClick} disabled />);
    const bouton = screen.getByRole("button", { name: "Fermer" });
    expect(bouton).toBeDisabled();
  });
});
