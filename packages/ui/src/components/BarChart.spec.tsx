import { render, screen } from "@testing-library/react";
import { BarChart } from "./BarChart";

describe("BarChart", () => {
  it("affiche une colonne par donnée, avec son libellé", () => {
    render(
      <BarChart
        donnees={[
          { label: "Jan", value: 10 },
          { label: "Fév", value: 20 }
        ]}
      />
    );
    expect(screen.getByText("Jan")).toBeInTheDocument();
    expect(screen.getByText("Fév")).toBeInTheDocument();
  });

  it("la colonne au maximum atteint 100% de hauteur — une échelle visuelle, pas un recalcul métier", () => {
    render(
      <BarChart
        donnees={[
          { label: "A", value: 5 },
          { label: "B", value: 10 }
        ]}
      />
    );
    const colonneMax = screen.getByText("B").previousElementSibling as HTMLElement;
    expect(colonneMax).toHaveStyle({ height: "100%" });
  });

  it("applique le formateur fourni plutôt que la valeur brute", () => {
    render(<BarChart donnees={[{ label: "A", value: 1000 }]} formater={(v) => `${v} FCFA`} />);
    expect(screen.getByText("1000 FCFA")).toBeInTheDocument();
  });
});
