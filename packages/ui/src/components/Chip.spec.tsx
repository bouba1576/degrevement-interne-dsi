import { render, screen } from "@testing-library/react";
import { Chip } from "./Chip";

describe("Chip", () => {
  it("rend un <span> non cliquable sans onClick, avec les classes inactives", () => {
    const { container } = render(<Chip>DOBB</Chip>);
    const chip = screen.getByText("DOBB");
    expect(chip.tagName).toBe("SPAN");
    expect(chip).toHaveClass("border-gris200", "bg-blanc", "text-gris700", "rounded-full");
    expect(container.querySelector("button")).toBeNull();
  });

  it("rend un <button> cliquable quand onClick est fourni", () => {
    render(<Chip onClick={() => {}}>DOBB</Chip>);
    expect(screen.getByRole("button", { name: "DOBB" })).toBeInTheDocument();
  });

  it("actif=true applique le fond noir, jamais l'orange (CorbeillesScreen, .chip.active)", () => {
    render(
      <Chip actif onClick={() => {}}>
        Responsable DOBB
      </Chip>
    );
    const chip = screen.getByRole("button", { name: "Responsable DOBB" });
    expect(chip).toHaveClass("bg-noir", "border-noir", "text-blanc");
    expect(chip).not.toHaveClass("bg-orange");
  });

  it("transmet onClick", () => {
    const onClick = jest.fn();
    render(
      <Chip onClick={onClick} actif={false}>
        DXC
      </Chip>
    );
    screen.getByRole("button", { name: "DXC" }).click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
