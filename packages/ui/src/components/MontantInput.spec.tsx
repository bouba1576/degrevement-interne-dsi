import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MontantInput } from "./MontantInput";

// Intl.NumberFormat("fr-FR") regroupe les milliers avec U+202F (espace fine
// insécable), jamais l'espace ASCII 0x20 — un littéral " " dans une chaîne
// de test échouerait silencieusement (« Expected/Received » visuellement
// identiques, octets différents). Toujours composer les attendus avec ce
// séparateur explicite, jamais deviné.
const SEP = " ";

// Composant contrôlé, comme il sera réellement utilisé dans
// NouvelleDemandeScreen.tsx (value/onChange, jamais un état interne) — un
// harnais avec state local reproduit fidèlement ce câblage plutôt que de
// mocker onChange, et vérifie le round-trip réel (frappe -> valeur brute ->
// réaffichage formaté).
function Harnais({ initial = "" }: { initial?: string }) {
  const [valeur, setValeur] = useState(initial);
  return <MontantInput value={valeur} onChange={setValeur} />;
}

describe("MontantInput", () => {
  it("formate les milliers en direct pendant la frappe", () => {
    render(<Harnais />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1500000" } });
    expect(input.value).toBe(`1${SEP}500${SEP}000`);
  });

  it("accepte une décimale saisie en virgule, réaffichée en virgule", () => {
    render(<Harnais />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1500000,5" } });
    expect(input.value).toBe(`1${SEP}500${SEP}000,5`);
  });

  it("accepte une décimale saisie en point (clavier numérique), réaffichée en virgule", () => {
    render(<Harnais />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1500000.5" } });
    expect(input.value).toBe(`1${SEP}500${SEP}000,5`);
  });

  it("tronque au-delà de deux décimales — numeric(15,2) côté serveur", () => {
    render(<Harnais />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1000,12345" } });
    expect(input.value).toBe(`1${SEP}000,12`);
  });

  it("ignore les caractères non numériques et le signe négatif", () => {
    render(<Harnais />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "-1a2b3c" } });
    expect(input.value).toBe("123");
  });

  it("garde un séparateur décimal en attente sans le faire disparaître pendant la frappe", () => {
    render(<Harnais />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1000," } });
    expect(input.value).toBe(`1${SEP}000,`);
  });

  it("préserve la position du curseur en nombre de chiffres, pas de caractères, malgré l'espace de regroupement inséré", () => {
    render(<Harnais initial="150000" />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe(`150${SEP}000`);
    // L'utilisateur insère "4" juste après les 3 premiers chiffres affichés
    // ("150" -> "1504"), simulé en posant directement la valeur/curseur du
    // DOM avant de déclencher l'événement (même séquence qu'un navigateur
    // réel : la frappe modifie .value puis positionne .selectionStart).
    // fireEvent.change(input, {target:{value}}) seul ne permet pas de fixer
    // aussi selectionStart avant le dispatch — et assigner .value directement
    // (sans passer par le setter natif, comme fireEvent le fait lui-même en
    // interne) laisse le _valueTracker de React désynchronisé : l'événement
    // se déclenche mais React ne perçoit jamais le changement. Reproduit ici
    // le même contournement que le composant utilise en interne.
    const setterNatif = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    setterNatif.call(input, "1504 000");
    input.selectionStart = 4;
    input.selectionEnd = 4;
    fireEvent.change(input);
    expect(input.value).toBe(`1${SEP}504${SEP}000`);
    // 4 chiffres avant le curseur d'origine ("1504") -> le curseur doit
    // retomber juste après le 4e chiffre dans le nouvel affichage, jamais
    // avant ou après l'espace de regroupement inséré au passage à 4 chiffres.
    expect(input.selectionStart).toBe(5);
  });

  it("valeur brute transmise à onChange reste au format point décimal, sans séparateur de milliers (même contrat qu'un input[type=number])", () => {
    let capture = "";
    function Sonde() {
      const [valeur, setValeur] = useState("");
      return (
        <MontantInput
          value={valeur}
          onChange={(v) => {
            capture = v;
            setValeur(v);
          }}
        />
      );
    }
    render(<Sonde />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2 500 000,75" } });
    expect(capture).toBe("2500000.75");
  });

  it("champ vide reste vide, jamais \"0\" ou \"NaN\"", () => {
    render(<Harnais />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");
  });
});
