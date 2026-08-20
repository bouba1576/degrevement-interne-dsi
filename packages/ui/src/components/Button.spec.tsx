import { render, screen } from "@testing-library/react";
import { Button, type VarianteBouton, type TailleBouton } from "./Button";

describe("Button", () => {
  it("applique la variante primaire et la taille normale par défaut", () => {
    render(<Button>Valider</Button>);
    const bouton = screen.getByRole("button", { name: "Valider" });
    expect(bouton).toHaveClass("bg-orange", "text-noir", "px-4", "py-2.5", "text-14");
  });

  const variantes: Array<[VarianteBouton, string[]]> = [
    ["primaire", ["bg-orange", "text-noir"]],
    ["sombre", ["bg-noir", "text-blanc"]],
    ["fantome", ["border-gris300", "bg-blanc", "text-encre"]],
    ["danger", ["border-rouge", "text-rouge700"]],
    ["succes", ["bg-vert", "text-blanc"]]
  ];
  it.each(variantes)("applique les classes réelles de la variante « %s »", (variante, classesAttendues) => {
    render(<Button variante={variante}>Action</Button>);
    const bouton = screen.getByRole("button", { name: "Action" });
    expect(bouton).toHaveClass(...classesAttendues);
  });

  const tailles: Array<[TailleBouton, string[]]> = [
    ["petite", ["px-3", "py-1.5", "text-13"]],
    ["normale", ["px-4", "py-2.5", "text-14"]],
    ["grande", ["px-6", "py-3", "text-15"]]
  ];
  it.each(tailles)("applique le padding/texte réels de la taille « %s »", (taille, classesAttendues) => {
    render(<Button taille={taille}>Action</Button>);
    const bouton = screen.getByRole("button", { name: "Action" });
    expect(bouton).toHaveClass(...classesAttendues);
  });

  it("porte type=button par défaut, jamais submit implicite dans un formulaire", () => {
    render(<Button>Action</Button>);
    expect(screen.getByRole("button", { name: "Action" })).toHaveAttribute("type", "button");
  });

  it("accepte type=submit explicitement", () => {
    render(<Button type="submit">Envoyer</Button>);
    expect(screen.getByRole("button", { name: "Envoyer" })).toHaveAttribute("type", "submit");
  });

  it("pleineLargeur ajoute w-full", () => {
    render(<Button pleineLargeur>Action</Button>);
    expect(screen.getByRole("button", { name: "Action" })).toHaveClass("w-full");
  });

  it("disabled porte l'état réel et les classes d'opacité", () => {
    render(<Button disabled>Action</Button>);
    const bouton = screen.getByRole("button", { name: "Action" });
    expect(bouton).toBeDisabled();
    expect(bouton).toHaveClass("disabled:opacity-45", "disabled:cursor-not-allowed");
  });

  it("transmet onClick", async () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Action</Button>);
    screen.getByRole("button", { name: "Action" }).click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
