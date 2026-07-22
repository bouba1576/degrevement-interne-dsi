import { render, screen } from "@testing-library/react";
import { Empty } from "./Empty";

describe("Empty", () => {
  it("affiche le titre", () => {
    render(<Empty titre="Aucun dossier trouvé" />);
    expect(screen.getByText("Aucun dossier trouvé")).toBeInTheDocument();
  });

  it("affiche le contenu additionnel s'il est fourni", () => {
    render(<Empty titre="Aucun résultat">Essayez un autre filtre</Empty>);
    expect(screen.getByText("Essayez un autre filtre")).toBeInTheDocument();
  });

  it("n'affiche pas de conteneur enfant vide en son absence", () => {
    render(<Empty titre="Aucun résultat" />);
    expect(screen.queryByText("Essayez un autre filtre")).not.toBeInTheDocument();
  });
});
