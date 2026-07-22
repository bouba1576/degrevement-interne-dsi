import { couleurs } from "../../tokens/primitives";

export interface AvatarProps {
  nom: string;
  taille?: number;
}

// Port de docs/design/ui.jsx (Avatar). La maquette lit `user.couleur` et
// `user.initiales` depuis sa propre couche de données fictive (DATA) — aucun
// des deux champs n'existe sur `Utilisateur` (packages/contracts/src/
// auth.ts, vérifié : seuls identifiantAd et nom sont présents). Ni l'un ni
// l'autre n'est une règle métier à recopier : ce sont des dérivés PUREMENT
// présentationnels d'un nom déjà réel, calculés ici, jamais une donnée
// stockée à inventer côté serveur.
//
// Couleur : hachage déterministe de `nom` vers une palette FIXE de 6 teintes
// déjà dans primitives.ts (jamais de couleur inventée) — chacune vérifiée
// ≥ 4,5:1 de contraste avec du texte blanc avant d'être retenue (la
// maquette fixe `color:#fff` sans condition ; les teintes qui échouent ce
// contraste avec du blanc — orange, vert, jaune, bleu, violet « clairs » —
// sont écartées de cette palette précisément pour ça).
const PALETTE_AVATAR = [
  couleurs.orangeTexteSurClair,
  couleurs.vertTexteSurClair,
  couleurs.rouge700,
  couleurs.bleu700,
  couleurs.violetTexte,
  couleurs.gris700
] as const;

function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "";
  if (mots.length === 1) return mots[0]!.slice(0, 2).toUpperCase();
  return (mots[0]![0]! + mots[mots.length - 1]![0]!).toUpperCase();
}

function couleurDeterministe(nom: string): string {
  let somme = 0;
  for (let i = 0; i < nom.length; i++) somme += nom.charCodeAt(i);
  return PALETTE_AVATAR[somme % PALETTE_AVATAR.length]!;
}

export function Avatar({ nom, taille = 32 }: AvatarProps) {
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full font-bold text-blanc"
      style={{ background: couleurDeterministe(nom), width: taille, height: taille, fontSize: taille * 0.38 }}
    >
      {initiales(nom)}
    </div>
  );
}
