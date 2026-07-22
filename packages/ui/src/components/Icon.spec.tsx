import { render } from "@testing-library/react";
import { Icon } from "./Icon";

describe("Icon", () => {
  it("rend un <svg> avec la taille et le trait demandés", () => {
    const { container } = render(<Icon nom="check" taille={24} epaisseurTrait={3} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("width", "24");
    expect(svg).toHaveAttribute("height", "24");
    expect(svg).toHaveAttribute("stroke-width", "3");
  });

  it("hérite currentColor par défaut, jamais une teinte fixée dans le composant", () => {
    const { container } = render(<Icon nom="alert" />);
    expect(container.querySelector("svg")).toHaveAttribute("stroke", "currentColor");
  });

  it("accepte une couleur explicite quand le contexte l'exige", () => {
    const { container } = render(<Icon nom="alert" couleur="var(--sla-depasse-texte)" />);
    expect(container.querySelector("svg")).toHaveAttribute("stroke", "var(--sla-depasse-texte)");
  });

  it("est masqué aux lecteurs d'écran (décoratif par défaut)", () => {
    const { container } = render(<Icon nom="home" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
