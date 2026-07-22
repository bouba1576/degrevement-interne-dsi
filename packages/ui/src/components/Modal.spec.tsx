import { render, screen, fireEvent } from "@testing-library/react";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("affiche le titre et le contenu", () => {
    render(
      <Modal titre="Rejeter la demande" onFermer={jest.fn()}>
        Contenu du formulaire
      </Modal>
    );
    expect(screen.getByText("Rejeter la demande")).toBeInTheDocument();
    expect(screen.getByText("Contenu du formulaire")).toBeInTheDocument();
  });

  it("appelle onFermer au clic sur l'overlay, sur le bouton fermer, et sur Échap", () => {
    const onFermer = jest.fn();
    render(
      <Modal titre="Titre" onFermer={onFermer}>
        Contenu
      </Modal>
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onFermer).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("presentation"));
    expect(onFermer).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(onFermer).toHaveBeenCalledTimes(3);
  });

  it("un clic à l'intérieur de la boîte ne ferme pas (stopPropagation)", () => {
    const onFermer = jest.fn();
    render(
      <Modal titre="Titre" onFermer={onFermer}>
        Contenu cliquable
      </Modal>
    );
    fireEvent.click(screen.getByRole("dialog"));
    expect(onFermer).not.toHaveBeenCalled();
  });

  it("la variante large utilise une largeur maximale différente (dimension ponctuelle, pas un token)", () => {
    const { rerender } = render(
      <Modal titre="Titre" onFermer={jest.fn()}>
        Contenu
      </Modal>
    );
    expect(screen.getByRole("dialog")).toHaveClass("max-w-[520px]");

    rerender(
      <Modal titre="Titre" onFermer={jest.fn()} large>
        Contenu
      </Modal>
    );
    expect(screen.getByRole("dialog")).toHaveClass("max-w-[720px]");
  });

  it("porte l'empilement nommé par rôle (z-superposition), jamais un rang arbitraire", () => {
    render(
      <Modal titre="Titre" onFermer={jest.fn()}>
        Contenu
      </Modal>
    );
    expect(screen.getByRole("presentation")).toHaveClass("z-superposition");
  });
});
