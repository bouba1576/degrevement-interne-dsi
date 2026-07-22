import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";
import { statutDemande } from "../../tokens/semantic";

const LIBELLE: Record<keyof typeof statutDemande, string> = {
  brouillon: "Brouillon",
  soumis: "Soumis",
  enCours: "En cours",
  valide: "Validé",
  rejete: "Rejeté",
  abandonne: "Abandonné"
};

describe("StatusBadge", () => {
  it.each(Object.keys(statutDemande) as (keyof typeof statutDemande)[])(
    "affiche le libellé français et la couleur sémantique fixe du statut « %s »",
    (statut) => {
      render(<StatusBadge statut={statut} />);
      const badge = screen.getByText(LIBELLE[statut]);
      expect(badge).toHaveStyle({ color: statutDemande[statut].texte, background: statutDemande[statut].fond });
    }
  );

  it("brouillon et abandonne partagent la même couleur (fidèle à la maquette, pas une simplification)", () => {
    const { unmount } = render(<StatusBadge statut="brouillon" />);
    const couleurBrouillon = getComputedStyle(screen.getByText("Brouillon")).color;
    unmount();

    render(<StatusBadge statut="abandonne" />);
    const couleurAbandonne = getComputedStyle(screen.getByText("Abandonné")).color;

    expect(couleurAbandonne).toBe(couleurBrouillon);
  });

  it("taille normale : text-12 (source 11.5px, mappé au palier 12px — pas text-11)", () => {
    render(<StatusBadge statut="valide" />);
    expect(screen.getByText("Validé")).toHaveClass("text-12", "px-2.5");
  });

  it("variante compact : text-11 exact et espacement resserré (px-2), une taille réellement différente", () => {
    render(<StatusBadge statut="valide" compact />);
    expect(screen.getByText("Validé")).toHaveClass("text-11", "px-2");
    expect(screen.getByText("Validé")).not.toHaveClass("text-12");
  });
});
