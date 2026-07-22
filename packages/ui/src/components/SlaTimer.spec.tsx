import { render, screen, act } from "@testing-library/react";
import { SlaTimer } from "./SlaTimer";

const HORLOGE_FIXE = () => new Date("2026-07-22T10:00:00Z");

describe("SlaTimer", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("affiche un compte à rebours calculé à partir d'une échéance FOURNIE, jamais recalculée (aucune heure ouvrée réimplémentée ici)", () => {
    // Échéance dans 2h tout rond depuis l'horloge fixe — si ce composant
    // recalculait lui-même les heures ouvrées, le texte ne correspondrait
    // pas à une simple soustraction de dates.
    render(<SlaTimer echeanceSla="2026-07-22T12:00:00Z" maintenant={HORLOGE_FIXE} />);
    expect(screen.getByText("02:00:00")).toBeInTheDocument();
    expect(screen.getByText(/restant \(heures ouvrées\)/)).toBeInTheDocument();
  });

  it("passe en alerte sous 4h restantes, sans dépasser l'échéance", () => {
    render(<SlaTimer echeanceSla="2026-07-22T12:00:00Z" maintenant={() => new Date("2026-07-22T09:00:00Z")} />);
    // 3h restantes < 4h → alerte, pas dépassé
    expect(screen.getByText("03:00:00")).toBeInTheDocument();
    expect(screen.queryByText("SLA dépassé")).not.toBeInTheDocument();
  });

  it("affiche « SLA dépassé » quand l'échéance fournie est déjà passée", () => {
    render(<SlaTimer echeanceSla="2026-07-22T08:00:00Z" maintenant={HORLOGE_FIXE} />);
    expect(screen.getByText("SLA dépassé")).toBeInTheDocument();
  });

  it("le mode compact réutilise exactement la pilule de Badge/StatusBadge (text-12, comme la maquette qui ne redéfinit aucune taille en mode compact)", () => {
    render(<SlaTimer echeanceSla="2026-07-22T12:00:00Z" compact maintenant={HORLOGE_FIXE} />);
    const pilule = screen.getByText("02:00:00").closest("span")!;
    expect(pilule).toHaveClass("rounded-full", "text-12");
  });

  it("préfixe « Dépassé + » en mode compact quand l'échéance est passée", () => {
    render(<SlaTimer echeanceSla="2026-07-22T08:00:00Z" compact maintenant={HORLOGE_FIXE} />);
    expect(screen.getByText(/Dépassé \+/)).toBeInTheDocument();
  });

  it("se rafraîchit chaque seconde sans recalculer l'échéance elle-même", () => {
    jest.useFakeTimers();
    let maintenant = new Date("2026-07-22T11:59:58Z");
    render(<SlaTimer echeanceSla="2026-07-22T12:00:00Z" maintenant={() => maintenant} />);
    expect(screen.getByText("00:00:02")).toBeInTheDocument();

    maintenant = new Date("2026-07-22T11:59:59Z");
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText("00:00:01")).toBeInTheDocument();
  });
});
