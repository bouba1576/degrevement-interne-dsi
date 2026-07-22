import { render, screen } from "@testing-library/react";
import { TypeActeurBadge } from "./TypeActeurBadge";

describe("TypeActeurBadge", () => {
  it.each([
    ["V", "Vérification"],
    ["A", "Validation"],
    ["C", "Contrôle"]
  ] as const)("affiche le libellé métier pour le type %s", (type, libelle) => {
    render(<TypeActeurBadge type={type} />);
    expect(screen.getByText(libelle)).toBeInTheDocument();
  });

  it("réutilise la forme pilule commune (rounded-full), comme Badge/StatusBadge", () => {
    render(<TypeActeurBadge type="V" />);
    expect(screen.getByText("Vérification")).toHaveClass("rounded-full");
  });
});
