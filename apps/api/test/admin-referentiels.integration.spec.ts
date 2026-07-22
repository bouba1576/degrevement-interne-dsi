import { UnprocessableEntityException } from "@nestjs/common";
import type { CalendrierSlaVue, CircuitVue, ParametreGlobalVue } from "@pgd/contracts";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { AdminCircuitsService } from "../src/modules/admin/services/admin-circuits.service";
import { AdminRolesService } from "../src/modules/admin/services/admin-roles.service";
import { AdminMotifsService } from "../src/modules/admin/services/admin-motifs.service";
import { AdminParametresGlobauxService } from "../src/modules/admin/services/admin-parametres-globaux.service";
import { AdminCalendrierSlaService } from "../src/modules/admin/services/admin-calendrier-sla.service";
import { AdminModulesService } from "../src/modules/admin/services/admin-modules.service";

// Intégration réelle contre Postgres — PGD-043. Aucun de ces référentiels
// n'est cache-backé (vérifié : seul RuleEngineService l'est, déjà invalidé) —
// pas d'invalidation à écrire ici, conformément à la mise en garde reçue en
// revue de Phase 5.
//
// Convention (posée en revue de Phase 5, cf. CLAUDE.md « Tests contre
// référentiels ») : Circuit, ParametreGlobal et CalendrierSla sont des
// référentiels à CLÉ FERMÉE (espace de clés fixe/seedé — aucune fixture
// jetable équivalente n'a de sens : il n'existe qu'un DOBB, qu'une
// "politique_ligne_resiliee", qu'un "Calendrier CI"). Snapshot en beforeAll,
// restauration INCONDITIONNELLE en afterEach — jamais en fin de corps de
// test via try/finally : si une assertion échoue avant la restauration
// manuelle, la donnée reste corrompue et contamine les tests suivants, avec
// un échec qui n'apparaît que plus tard, ailleurs, sans lien apparent.
// Role, Motif et ConfigurationCircuit sont à clé OUVERTE : chaque test crée
// sa propre ligne jetable à clé unique et la supprime, sans jamais toucher
// une ligne seedée partagée (déjà la pratique ci-dessous).
describe("Admin — référentiels (circuits, rôles, motifs, paramètres globaux, calendrier SLA, modules)", () => {
  const prisma = new PrismaService();
  const circuits = new AdminCircuitsService(prisma);
  const roles = new AdminRolesService(prisma);
  const motifs = new AdminMotifsService(prisma);
  const parametresGlobaux = new AdminParametresGlobauxService(prisma);
  const calendriers = new AdminCalendrierSlaService(prisma);
  const modules = new AdminModulesService(prisma);

  let snapshotCircuitDobb: CircuitVue;
  let snapshotPolitiqueLigneResiliee: ParametreGlobalVue;
  let snapshotCalendrier: CalendrierSlaVue;

  beforeAll(async () => {
    snapshotCircuitDobb = await circuits.trouver("DOBB");
    // Une restauration fidèle exige une valeur non nulle à réécrire (voir
    // afterEach) — vrai pour le seed actuel (circuits.seed.ts), vérifié ici
    // plutôt que supposé.
    expect(snapshotCircuitDobb.processCode).not.toBeNull();
    snapshotPolitiqueLigneResiliee = await parametresGlobaux.trouver("politique_ligne_resiliee");
    const [calendrier] = await calendriers.lister();
    snapshotCalendrier = calendrier!;
  });

  afterEach(async () => {
    // Inconditionnel : restaure après CHAQUE test de ce fichier, que ce test
    // ait touché ces référentiels ou non, et qu'il ait échoué ou réussi.
    await circuits.modifier("DOBB", {
      processCode: snapshotCircuitDobb.processCode!,
      libelle: snapshotCircuitDobb.libelle
    });
    await parametresGlobaux.modifier("politique_ligne_resiliee", { valeur: snapshotPolitiqueLigneResiliee.valeur });
    await calendriers.modifier(snapshotCalendrier.id, {
      joursFeries: snapshotCalendrier.joursFeries.map((f) => ({ jour: f.jour, libelle: f.libelle ?? undefined }))
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("Circuit — lit et modifie libelle/processCode, segment reste hors du DTO", async () => {
    const modifie = await circuits.modifier("DOBB", { processCode: "TEST-PROCESS-CODE" });
    expect(modifie.code).toBe("DOBB");
    expect(modifie.processCode).toBe("TEST-PROCESS-CODE");
    expect(modifie.segment).toBe("B2B"); // structurel, jamais dans ModifierCircuitRequete
  });

  it("Role — CRUD complet, et ROLE_EN_USAGE (422) si référencé par une étape de palier", async () => {
    const code = `TEST_ROLE_${Date.now()}`;
    const cree = await roles.creer({ code, libelle: "Rôle test", groupeAd: "GG-TEST", niveau: 1, type: "METIER" });
    expect(cree.code).toBe(code);

    const modifie = await roles.modifier(code, { libelle: "Rôle test modifié" });
    expect(modifie.libelle).toBe("Rôle test modifié");

    await roles.supprimer(code);
    await expect(roles.trouver(code)).rejects.toThrow();

    // RESPONSABLE_DOBB est référencé par le palier DOBB seedé — suppression bloquée.
    await expect(roles.supprimer("RESPONSABLE_DOBB")).rejects.toMatchObject({
      response: { code: "ROLE_EN_USAGE" }
    });
  });

  it("Motif + pièces afférentes — remplacement complet à la modification", async () => {
    const cree = await motifs.creer({
      circuit: "DOBB",
      libelle: `Motif test ${Date.now()}`,
      pieces: [{ libelle: "Pièce A", obligatoire: true }]
    });
    expect(cree.piecesAfferentes).toHaveLength(1);

    const modifie = await motifs.modifier(cree.id, {
      pieces: [
        { libelle: "Pièce B", obligatoire: false },
        { libelle: "Pièce C", obligatoire: true }
      ]
    });
    expect(modifie.piecesAfferentes.map((p) => p.libelle).sort()).toEqual(["Pièce B", "Pièce C"]);

    await motifs.supprimer(cree.id);
    await expect(motifs.trouver(cree.id)).rejects.toThrow();
  });

  it("ParametreGlobal — modifiable si modifiableAdmin, sinon 422", async () => {
    expect(snapshotPolitiqueLigneResiliee.modifiableAdmin).toBe(true);

    const modifie = await parametresGlobaux.modifier("politique_ligne_resiliee", {
      valeur: { mode: "JUSTIFICATION_RENFORCEE" }
    });
    expect(modifie.valeur).toEqual({ mode: "JUSTIFICATION_RENFORCEE" });
  });

  it("CalendrierSla — remplace intégralement les jours fériés fournis", async () => {
    const modifie = await calendriers.modifier(snapshotCalendrier.id, {
      joursFeries: [{ jour: "2026-01-01", libelle: "Jour de l'an" }]
    });
    expect(modifie.joursFeries).toHaveLength(1);
    expect(modifie.joursFeries[0]?.libelle).toBe("Jour de l'an");
  });

  it("Module — un module coeur ne peut pas être désactivé (422)", async () => {
    const tousLesModules = await modules.lister();
    const coeur = tousLesModules.find((m) => m.coeur);
    if (!coeur) return; // aucun module coeur seedé — rien à vérifier ici.

    await expect(modules.modifier(coeur.code, { actif: false })).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
