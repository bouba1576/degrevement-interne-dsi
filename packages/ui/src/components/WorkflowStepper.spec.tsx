import { render, screen } from "@testing-library/react";
import { WorkflowStepper, type EtapeWorkflowStepper } from "./WorkflowStepper";

const HORLOGE_FIXE = new Date("2026-07-22T10:00:00Z");

function etape(partiel: Partial<EtapeWorkflowStepper>): EtapeWorkflowStepper {
  return {
    id: "t1",
    ordre: 0,
    etat: "EN_ATTENTE",
    typeActeur: "V",
    roleLibelle: "Vérificateur DOBB",
    echeanceSla: null,
    niveauEscalade: 0,
    ...partiel
  };
}

describe("WorkflowStepper", () => {
  it("affiche le libellé de rôle et le type d'acteur résolus par l'appelant", () => {
    render(<WorkflowStepper etapes={[etape({ roleLibelle: "Responsable DOBB", typeActeur: "A" })]} maintenant={HORLOGE_FIXE} />);
    expect(screen.getByText("Responsable DOBB")).toBeInTheDocument();
    expect(screen.getByText("Validation")).toBeInTheDocument();
  });

  it("ne signale SLA dépassé QUE si la tâche est active et l'échéance déjà fournie est passée — aucune heure ouvrée recalculée ici", () => {
    render(
      <WorkflowStepper
        etapes={[etape({ etat: "EN_CORBEILLE", echeanceSla: "2026-07-22T08:00:00Z" })]}
        maintenant={HORLOGE_FIXE}
      />
    );
    expect(screen.getByText("SLA dépassé")).toBeInTheDocument();
  });

  it("n'affiche rien si l'échéance fournie n'est pas dépassée", () => {
    render(
      <WorkflowStepper
        etapes={[etape({ etat: "EN_CORBEILLE", echeanceSla: "2026-07-22T18:00:00Z" })]}
        maintenant={HORLOGE_FIXE}
      />
    );
    expect(screen.queryByText("SLA dépassé")).not.toBeInTheDocument();
  });

  it("n'invente jamais un état VERIFIEE/ESCALADEE inexistant — une tâche APPROUVEE est visuellement « terminée » quel que soit typeActeur", () => {
    render(<WorkflowStepper etapes={[etape({ etat: "APPROUVEE", typeActeur: "V" })]} maintenant={HORLOGE_FIXE} />);
    expect(screen.getByText("Vérification")).toBeInTheDocument();
  });

  it("affiche un badge d'escalade fidèle au comportement réel (niveauEscalade > 0, tâche toujours en corbeille) au lieu d'un saut d'état inventé", () => {
    render(
      <WorkflowStepper etapes={[etape({ etat: "EN_CORBEILLE", niveauEscalade: 2 })]} maintenant={HORLOGE_FIXE} />
    );
    expect(screen.getByText("Escaladée x2")).toBeInTheDocument();
  });

  it("pas de badge d'escalade si niveauEscalade=0", () => {
    render(<WorkflowStepper etapes={[etape({ etat: "EN_CORBEILLE", niveauEscalade: 0 })]} maintenant={HORLOGE_FIXE} />);
    expect(screen.queryByText(/Escaladée/)).not.toBeInTheDocument();
  });
});
