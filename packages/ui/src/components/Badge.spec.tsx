import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge";
import { tonBadge } from "../../tokens/semantic";

// Depuis le passage à Tailwind (Phase 9, étape 3bis) : la structure (taille,
// espacement, rayon) est vérifiée via les classes présentes, pas via un
// style calculé — Jest/jsdom ne charge aucune feuille Tailwind générée, donc
// getComputedStyle ne verrait jamais ces propriétés. La couleur, seule
// propriété dynamique par instance, reste en style inline et reste donc
// vérifiable via toHaveStyle.
describe("Badge", () => {
  it("applique le ton neutre par défaut", () => {
    render(<Badge>Brouillon</Badge>);
    const badge = screen.getByText("Brouillon");
    expect(badge).toHaveStyle({ color: tonBadge.neutre.texte, background: tonBadge.neutre.fond });
  });

  it.each(Object.keys(tonBadge) as (keyof typeof tonBadge)[])("applique les couleurs du ton « %s » via la couche sémantique, jamais une teinte brute", (ton) => {
    render(<Badge ton={ton}>Texte</Badge>);
    const badge = screen.getByText("Texte");
    expect(badge).toHaveStyle({ color: tonBadge[ton].texte, background: tonBadge[ton].fond });
  });

  it("porte les classes Tailwind structurelles réelles (taille normale — text-12, pas text-11)", () => {
    render(<Badge>Texte</Badge>);
    const badge = screen.getByText("Texte");
    expect(badge).toHaveClass("rounded-full", "px-2.5", "py-1", "text-12");
  });

  it("n'affiche la pastille que si demandé", () => {
    const { container, rerender } = render(<Badge ton="succes">Ok</Badge>);
    expect(container.querySelectorAll("span").length).toBe(1); // un seul span : le badge, pas de pastille

    rerender(
      <Badge ton="succes" pastille>
        Ok
      </Badge>
    );
    expect(container.querySelectorAll("span").length).toBe(2); // badge + pastille
  });
});
