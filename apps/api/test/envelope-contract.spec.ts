import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import * as ts from "typescript";

// Généralise response-envelope.interceptor.spec.ts (qui ne fixe le contrat
// qu'avec des exemples inventés) en un balayage RÉEL de tout apps/api/src :
// trouvé en Phase 9.2, DemandesController.lister/AuditController.
// journalSecurite/NotificationsController.lister retournaient tous les trois
// { <clé>, meta } au lieu de { data, meta } — invisible à l'intercepteur
// (estDejaEnveloppe ne vérifie que la présence de "meta"), invisible aux
// tests existants (aucun n'appelle ces routes en HTTP réel). Un test qui se
// contente d'exemples synthétiques ne protège que les trois routes déjà
// corrigées ; celui-ci lit chaque contrôleur RÉEL et échoue sur toute
// nouvelle route qui réintroduirait la même forme fautive — pas de table à
// tenir à jour (contrairement à guard-coverage.spec.ts, où la table est
// nécessaire faute de décorateur marquant "ceci est une route de liste") :
// l'invariant « meta implique data » est universel, vérifiable sans
// connaître par avance quelles routes existent.
function listerFichiersControleurs(dossier: string): string[] {
  const resultats: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) {
      resultats.push(...listerFichiersControleurs(chemin));
    } else if (entree.endsWith(".controller.ts")) {
      resultats.push(chemin);
    }
  }
  return resultats;
}

interface ObjetRetourne {
  fichier: string;
  ligne: number;
  proprietes: string[];
}

function nomPropriete(p: ts.ObjectLiteralElementLike): string | null {
  if ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name) {
    if (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) return p.name.text;
  }
  return null;
}

function extraireObjetsRetournes(fichier: string): ObjetRetourne[] {
  const source = ts.createSourceFile(fichier, readFileSync(fichier, "utf8"), ts.ScriptTarget.Latest, true);
  const resultats: ObjetRetourne[] = [];

  function visiter(node: ts.Node) {
    if (ts.isReturnStatement(node) && node.expression && ts.isObjectLiteralExpression(node.expression)) {
      const proprietes = node.expression.properties.map(nomPropriete).filter((n): n is string => n !== null);
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      resultats.push({ fichier, ligne: line + 1, proprietes });
    }
    ts.forEachChild(node, visiter);
  }

  visiter(source);
  return resultats;
}

describe("Contrat d'enveloppe HTTP — balayage réel de apps/api/src/**/*.controller.ts", () => {
  const fichiers = listerFichiersControleurs(join(__dirname, "..", "src"));
  const objetsRetournes = fichiers.flatMap(extraireObjetsRetournes);

  it("trouve bien des contrôleurs à analyser (sinon ce test ne vérifie rien)", () => {
    expect(fichiers.length).toBeGreaterThan(10);
    expect(objetsRetournes.length).toBeGreaterThan(10);
  });

  it("toute réponse de contrôleur portant 'meta' porte aussi 'data' (jamais une autre clé de liste à côté de meta)", () => {
    const violations = objetsRetournes.filter((o) => o.proprietes.includes("meta") && !o.proprietes.includes("data"));
    if (violations.length > 0) {
      const detail = violations.map((v) => `${v.fichier}:${v.ligne} → { ${v.proprietes.join(", ")} }`).join("\n");
      throw new Error(
        `Réponse(s) avec 'meta' sans 'data' détectée(s) — ResponseEnvelopeInterceptor perdra la liste réelle (cf. CLAUDE.md) :\n${detail}`
      );
    }
  });

  // Preuve que le balayage détecte réellement la forme { data, meta } quand
  // elle existe (sinon le test précédent passerait aussi si l'extraction
  // AST était cassée et ne trouvait jamais rien).
  it("détecte au moins les 3 routes de liste paginée connues au moment de l'écriture", () => {
    const avecDataEtMeta = objetsRetournes.filter((o) => o.proprietes.includes("data") && o.proprietes.includes("meta"));
    expect(avecDataEtMeta.length).toBeGreaterThanOrEqual(3);
  });
});
