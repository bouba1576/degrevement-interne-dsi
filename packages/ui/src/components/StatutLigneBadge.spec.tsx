import { render, screen } from "@testing-library/react";
import { StatutLigneBadge } from "./StatutLigneBadge";

describe("StatutLigneBadge", () => {
  it.each([
    ["ACTIF", "Actif"],
    ["SUSPENDU", "Suspendu"],
    ["RESILIE", "Résilié"]
  ] as const)("affiche le libellé français pour %s", (statut, libelle) => {
    render(<StatutLigneBadge statut={statut} />);
    expect(screen.getByText(libelle)).toBeInTheDocument();
  });

  it("la couleur suit uniquement le statut, jamais un choix libre de l'appelant", () => {
    render(<StatutLigneBadge statut="RESILIE" />);
    expect(screen.getByText("Résilié")).toBeInTheDocument();
  });
});
