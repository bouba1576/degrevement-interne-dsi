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

  it("appelle onFermer au clic sur l'overlay, sur le bouton fermer, et sur Échap", async () => {
    const onFermer = jest.fn();
    render(
      <Modal titre="Titre" onFermer={onFermer}>
        Contenu
      </Modal>
    );

    // Échap est désormais géré par Radix (Dialog.Content), qui écoute sur
    // document — pas window, comme le faisait l'implémentation précédente
    // maison. Sans conséquence pour un utilisateur réel (un vrai appui
    // clavier remonte par document avant d'atteindre window), seule la
    // cible de la simulation change ici.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onFermer).toHaveBeenCalledTimes(1);

    // Radix attache son écouteur de clic extérieur de façon différée (un
    // tick après le montage) pour éviter qu'un même clic déclenchant
    // l'ouverture ne referme immédiatement le dialogue — vérifié en isolant
    // le comportement avant d'adapter ce test : un clic synchrone juste
    // après le rendu n'est jamais capté, un clic après un tick l'est
    // toujours. Sans conséquence pour un utilisateur réel (un vrai clic
    // survient bien après le montage).
    //
    // Requête par sélecteur brut sur document (pas container : Dialog.Portal
    // rend l'overlay directement en enfant de <body>, hors du conteneur créé
    // par render()), et pas getByRole : Radix marque l'overlay aria-hidden
    // pendant que le dialogue est ouvert (masquage correct de l'arrière-plan
    // pour les lecteurs d'écran, comportement voulu) — un élément aria-hidden
    // est, par construction, exclu des requêtes de rôle de testing-library.
    // Vérifié en isolant le DOM réel avant d'adapter.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const overlay = document.querySelector('[role="presentation"]')!;
    fireEvent.pointerDown(overlay);
    fireEvent.click(overlay);
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
    // Sélecteur brut sur document, pas container (Portal) ni getByRole
    // (aria-hidden) — cf. commentaire du test précédent.
    render(
      <Modal titre="Titre" onFermer={jest.fn()}>
        Contenu
      </Modal>
    );
    expect(document.querySelector('[role="presentation"]')).toHaveClass("z-superposition");
  });
});
