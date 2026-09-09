"use client";

import type { ChangeEvent } from "react";

export interface MontantInputProps {
  // Chaîne numérique brute — même convention qu'un <input type="number">
  // natif ("", "1500000", "1500000.5", point décimal) : les quatre champs
  // remplacés (montantHt, recurrentMensuel, montantTscManuel/montantTvaManuel)
  // gardent leur state/payload inchangés, seul le rendu de saisie change.
  value: string;
  onChange: (valeurBrute: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

// Formatage en direct pendant la frappe (04, demande explicite « lors de la
// saisie », pas seulement à l'affichage comme Money/formaterMontant) —
// espace comme séparateur de milliers, virgule comme séparateur décimal
// (même convention visuelle que formaterMontant), jamais plus de 2 décimales
// (numeric(15,2) côté serveur, R11 : aucun recalcul, pure présentation).
function nettoyerBrut(saisie: string): string {
  const filtre = saisie.replace(/[^\d.,]/g, "");
  const indexSeparateur = filtre.search(/[.,]/);
  if (indexSeparateur === -1) return filtre;
  const entier = filtre.slice(0, indexSeparateur).replace(/[.,]/g, "");
  const decimales = filtre
    .slice(indexSeparateur + 1)
    .replace(/[.,]/g, "")
    .slice(0, 2);
  return `${entier}.${decimales}`;
}

function formaterAffichage(brut: string): string {
  if (!brut) return "";
  const [entier, decimales] = brut.split(".");
  const entierFormate = entier === "" ? "" : new Intl.NumberFormat("fr-FR").format(Number(entier));
  if (decimales === undefined) return brut.endsWith(".") ? `${entierFormate},` : entierFormate;
  return `${entierFormate},${decimales}`;
}

function compterChiffresAvant(texte: string, position: number): number {
  let n = 0;
  for (let i = 0; i < position && i < texte.length; i++) if (/\d/.test(texte[i] ?? "")) n++;
  return n;
}

function positionApresNChiffres(texte: string, n: number): number {
  if (n <= 0) return 0;
  let vus = 0;
  for (let i = 0; i < texte.length; i++) {
    if (/\d/.test(texte[i] ?? "")) {
      vus++;
      if (vus === n) return i + 1;
    }
  }
  return texte.length;
}

// Cursor-safe : le nombre de CHIFFRES avant le curseur (jamais le nombre de
// caractères, qui varie avec les espaces de regroupement insérés/retirés à
// chaque frappe) est préservé entre l'ancien et le nouvel affichage formaté.
export function MontantInput({ value, onChange, placeholder, disabled, className }: MontantInputProps) {
  function gererChangement(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const chiffresAvantCurseur = compterChiffresAvant(input.value, input.selectionStart ?? input.value.length);
    const brut = nettoyerBrut(input.value);
    const nouvelAffiche = formaterAffichage(brut);
    input.value = nouvelAffiche;
    const nouvellePosition = positionApresNChiffres(nouvelAffiche, chiffresAvantCurseur);
    input.setSelectionRange(nouvellePosition, nouvellePosition);
    onChange(brut);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className ?? "w-full rounded border border-gris300 px-3 py-2 text-13 font-mono"}
      value={formaterAffichage(value)}
      onChange={gererChangement}
      placeholder={placeholder ?? "0"}
      disabled={disabled}
    />
  );
}
