import { render, screen } from "@testing-library/react";
import { Field } from "./Field";

describe("Field", () => {
  it("affiche le label et le contenu", () => {
    render(
      <Field label="Motif">
        <input />
      </Field>
    );
    expect(screen.getByText("Motif")).toBeInTheDocument();
  });

  it("affiche l'astérisque requis seulement si demandé", () => {
    const { rerender } = render(
      <Field label="Motif" requis>
        <input />
      </Field>
    );
    expect(screen.getByText("*")).toBeInTheDocument();

    rerender(
      <Field label="Motif">
        <input />
      </Field>
    );
    expect(screen.queryByText("*")).not.toBeInTheDocument();
  });

  it("l'erreur prend le pas sur l'indice — jamais les deux ensemble", () => {
    render(
      <Field label="Montant" indice="En FCFA" erreur="Montant requis">
        <input />
      </Field>
    );
    expect(screen.getByText("Montant requis")).toBeInTheDocument();
    expect(screen.queryByText("En FCFA")).not.toBeInTheDocument();
  });

  it("l'indice s'affiche en l'absence d'erreur", () => {
    render(
      <Field label="Montant" indice="En FCFA">
        <input />
      </Field>
    );
    expect(screen.getByText("En FCFA")).toBeInTheDocument();
  });
});
