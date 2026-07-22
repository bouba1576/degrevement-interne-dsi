import { render, screen } from "@testing-library/react";
import { KpiCarte } from "./KpiCarte";

describe("KpiCarte", () => {
  it("affiche le libellé et la valeur fournie par l'appelant, sans reformater", () => {
    render(<KpiCarte libelle="Montant total reçu (HT)" valeur="1 234 567 FCFA" icone="chart" couleur="#FF7900" />);
    expect(screen.getByText("Montant total reçu (HT)")).toBeInTheDocument();
    expect(screen.getByText("1 234 567 FCFA")).toBeInTheDocument();
  });

  it("accepte un ReactNode comme valeur (ex. le composant Money), pas seulement une chaîne", () => {
    render(<KpiCarte libelle="Volume" valeur={<span data-testid="valeur-riche">42</span>} icone="doc" couleur="#4BB4E6" />);
    expect(screen.getByTestId("valeur-riche")).toBeInTheDocument();
  });
});
