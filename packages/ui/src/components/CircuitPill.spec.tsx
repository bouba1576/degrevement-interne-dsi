import { render, screen } from "@testing-library/react";
import { CircuitPill } from "./CircuitPill";
import { circuit } from "../../tokens/semantic";

describe("CircuitPill", () => {
  it("affiche le code du circuit", () => {
    render(<CircuitPill code="DOBB" />);
    expect(screen.getByText("DOBB")).toBeInTheDocument();
  });

  it("porte un rayon rectangulaire (rounded), pas une pilule complète — forme réellement différente de Badge", () => {
    render(<CircuitPill code="DXC" />);
    expect(screen.getByText("DXC")).toHaveClass("rounded");
    expect(screen.getByText("DXC")).not.toHaveClass("rounded-full");
  });

  it.each(["DOBB", "DXC", "DF"] as const)("colore %s depuis le token sémantique circuit, pas une couleur en dur", (code) => {
    render(<CircuitPill code={code} />);
    expect(screen.getByText(code)).toHaveStyle({ color: circuit[code].texte, background: circuit[code].fond });
  });
});
