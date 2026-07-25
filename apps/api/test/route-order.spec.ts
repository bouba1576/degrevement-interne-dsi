import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import * as ts from "typescript";

// Trouvé en revue (Phase 9.2, en vérifiant le périmètre ADMIN_PGD avant de
// construire l'écran de consultation d'audit) : AuditController déclarait
// `@Get(":demandeId")` AVANT `@Get("securite")` — Express/Nest matchent
// dans l'ordre d'enregistrement, donc GET /api/audit/securite était
// systématiquement intercepté par journalDemande("securite"), qui plantait
// en 500 (Prisma : "securite" n'est pas un UUID). Le guard ADMIN_PGD sur
// journalSecurite n'exécutait donc JAMAIS, ni pour un admin ni pour
// quiconque — code mort depuis la Phase 8, invisible à tous les tests
// existants (aucun n'appelle ces routes en HTTP réel, même défaut de
// couverture que le bug d'enveloppe ci-dessus).
//
// Balayage statique de l'AST (même méthode que envelope-contract.spec.ts) :
// pour chaque contrôleur, pour chaque verbe HTTP, compare les routes deux à
// deux dans leur ORDRE DE DÉCLARATION réel. Une route à paramètre (`:x`)
// déclarée avant une route littérale de même profondeur, dont les segments
// précédents sont identiques, rend cette dernière inatteignable — c'est
// l'ordre d'enregistrement qui compte, jamais la spécificité apparente.
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

const VERBES = ["Get", "Post", "Patch", "Put", "Delete"] as const;

interface RouteDeclaree {
  fichier: string;
  ligne: number;
  verbe: string;
  chemin: string;
  segments: string[];
}

function texteArgumentDecorateur(decorateur: ts.Decorator): string {
  if (!ts.isCallExpression(decorateur.expression)) return "";
  const [arg] = decorateur.expression.arguments;
  if (arg && ts.isStringLiteral(arg)) return arg.text;
  return "";
}

function extraireRoutes(fichier: string): RouteDeclaree[] {
  const source = ts.createSourceFile(fichier, readFileSync(fichier, "utf8"), ts.ScriptTarget.Latest, true);
  const resultats: RouteDeclaree[] = [];
  let prefixeControleur = "";

  function visiter(node: ts.Node) {
    if (ts.isClassDeclaration(node)) {
      const decorateurControleur = ts.getDecorators?.(node)?.find(
        (d) => ts.isCallExpression(d.expression) && ts.isIdentifier(d.expression.expression) && d.expression.expression.text === "Controller"
      );
      if (decorateurControleur) prefixeControleur = texteArgumentDecorateur(decorateurControleur);
    }
    if (ts.isMethodDeclaration(node)) {
      const decorateurs = ts.getDecorators?.(node) ?? [];
      for (const d of decorateurs) {
        if (!ts.isCallExpression(d.expression) || !ts.isIdentifier(d.expression.expression)) continue;
        const nomVerbe = d.expression.expression.text;
        if (!(VERBES as readonly string[]).includes(nomVerbe)) continue;
        const sousChemin = texteArgumentDecorateur(d);
        const cheminComplet = [prefixeControleur, sousChemin].filter(Boolean).join("/");
        const { line } = source.getLineAndCharacterOfPosition(node.getStart());
        resultats.push({
          fichier,
          ligne: line + 1,
          verbe: nomVerbe,
          chemin: cheminComplet,
          segments: cheminComplet.split("/").filter(Boolean)
        });
      }
    }
    ts.forEachChild(node, visiter);
  }

  visiter(source);
  return resultats;
}

function segmentEstParametre(segment: string): boolean {
  return segment.startsWith(":");
}

// Deux routes de même verbe et même profondeur collisionnent si, au premier
// segment où elles diffèrent textuellement, la route déclarée EN PREMIER
// porte un paramètre (`:x`) — elle absorbe alors toute valeur, y compris
// celle du segment littéral de la route déclarée après.
function collision(premiere: RouteDeclaree, suivante: RouteDeclaree): boolean {
  if (premiere.segments.length !== suivante.segments.length) return false;
  for (let i = 0; i < premiere.segments.length; i++) {
    const a = premiere.segments[i]!;
    const b = suivante.segments[i]!;
    if (a === b) continue;
    return segmentEstParametre(a);
  }
  return false; // chemins strictement identiques — hors périmètre de ce test
}

describe("Ordre de déclaration des routes — balayage réel de apps/api/src/**/*.controller.ts", () => {
  const fichiers = listerFichiersControleurs(join(__dirname, "..", "src"));
  const routesParFichier = new Map(fichiers.map((f) => [f, extraireRoutes(f)]));

  it("trouve bien des contrôleurs et des routes à analyser (sinon ce test ne vérifie rien)", () => {
    expect(fichiers.length).toBeGreaterThan(10);
    const total = [...routesParFichier.values()].reduce((n, r) => n + r.length, 0);
    expect(total).toBeGreaterThan(30);
  });

  it("aucune route littérale n'est rendue inatteignable par une route à paramètre déclarée avant elle, au même verbe", () => {
    const violations: string[] = [];
    for (const routes of routesParFichier.values()) {
      const parVerbe = new Map<string, RouteDeclaree[]>();
      for (const r of routes) {
        const liste = parVerbe.get(r.verbe) ?? [];
        liste.push(r);
        parVerbe.set(r.verbe, liste);
      }
      for (const liste of parVerbe.values()) {
        for (let i = 0; i < liste.length; i++) {
          for (let j = i + 1; j < liste.length; j++) {
            if (collision(liste[i]!, liste[j]!)) {
              violations.push(
                `${liste[i]!.verbe} /${liste[i]!.chemin} (${liste[i]!.fichier}:${liste[i]!.ligne}) déclarée avant ` +
                  `/${liste[j]!.chemin} (${liste[j]!.fichier}:${liste[j]!.ligne}) — cette dernière est inatteignable`
              );
            }
          }
        }
      }
    }
    if (violations.length > 0) {
      throw new Error(`Collision(s) d'ordre de route détectée(s) :\n${violations.join("\n")}`);
    }
  });
});
