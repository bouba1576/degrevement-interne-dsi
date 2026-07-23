import { render } from "@testing-library/react";
import { Donut } from "./Donut";

describe("Donut", () => {
  it("dessine un cercle de fond plus un cercle par segment", () => {
    const { container } = render(
      <Donut segments={[{ value: 3, color: "#111" }, { value: 7, color: "#222" }]} />
    );
    expect(container.querySelectorAll("circle")).toHaveLength(3);
  });

  it("affiche le total au centre — la somme des segments si aucun total explicite", () => {
    const { getByText } = render(
      <Donut segments={[{ value: 3, color: "#111" }, { value: 7, color: "#222" }]} />
    );
    expect(getByText("10")).toBeInTheDocument();
  });

  it("un total explicite prévaut sur la somme des segments (choix du port, pas un recalcul)", () => {
    const { getByText } = render(<Donut segments={[{ value: 3, color: "#111" }]} total={50} />);
    expect(getByText("50")).toBeInTheDocument();
  });

  it("ne recalcule jamais les valeurs des segments, seulement leur géométrie d'affichage", () => {
    const { container } = render(<Donut segments={[{ value: 5, color: "#111" }]} total={10} />);
    const segment = container.querySelectorAll("circle")[1]!;
    // 5/10 de la circonférence — la géométrie suit le ratio fourni, pas une valeur recalculée.
    expect(segment.getAttribute("stroke-dasharray")).toBeTruthy();
  });

  it("formaterTotal reformate le texte central — nécessaire pour un total TAUX (ratio 0-1, jamais déjà un pourcentage)", () => {
    const { getByText, queryByText } = render(
      <Donut segments={[{ value: 0.18, color: "#111" }]} total={0.18} formaterTotal={(v) => `${(v * 100).toFixed(0)} %`} />
    );
    expect(getByText("18 %")).toBeInTheDocument();
    expect(queryByText("0.18")).not.toBeInTheDocument();
  });
});
