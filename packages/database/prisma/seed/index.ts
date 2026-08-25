import { PrismaClient } from "@prisma/client";
import { seedCircuits } from "./referentiels/circuits.seed";
import { seedRoles } from "./referentiels/roles.seed";
import { seedPaliers } from "./referentiels/paliers.seed";
import { seedMotifs } from "./referentiels/motifs.seed";
import { seedLibellesAjustement } from "./referentiels/libelles-ajustement.seed";
import { seedPointsContact } from "./referentiels/point-contact.seed";
import { seedSousFlux } from "./referentiels/sous-flux.seed";
import { seedUniversEtFacteurs } from "./referentiels/univers-facteurs.seed";
import { seedResponsabilites } from "./referentiels/responsabilites.seed";
import { seedKpiDefinitions } from "./referentiels/kpi.seed";
import { seedParametresGlobaux } from "./referentiels/parametres-globaux.seed";
import { seedCalendrierSla } from "./referentiels/calendrier.seed";
import { seedModules } from "./referentiels/modules.seed";
import { seedAdmins } from "./admin/admins.seed";
import { seedDemo } from "./demo/demo.seed";

const prisma = new PrismaClient();

async function main() {
  console.log("[seed] référentiels…");
  await seedCircuits(prisma);
  await seedRoles(prisma);
  await seedPaliers(prisma);
  await seedMotifs(prisma);
  await seedLibellesAjustement(prisma);
  await seedPointsContact(prisma);
  await seedSousFlux(prisma);
  await seedUniversEtFacteurs(prisma);
  await seedResponsabilites(prisma);
  await seedKpiDefinitions(prisma);
  await seedParametresGlobaux(prisma);
  await seedCalendrierSla(prisma);
  await seedModules(prisma);

  console.log("[seed] comptes ADMIN_PGD réels…");
  await seedAdmins(prisma);

  console.log("[seed] jeu de démonstration (SF-PGD-303)…");
  await seedDemo(prisma);

  console.log("[seed] terminé.");
}

main()
  .catch((erreur) => {
    console.error(erreur);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
