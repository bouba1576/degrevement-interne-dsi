// Implémentation réelle déplacée dans @pgd/database (partagée avec
// apps/worker/src/jobs/sla-escalation.service.ts — R9 : une seule fonction de
// calcul des heures ouvrées, jamais deux qui pourraient diverger). Ce fichier
// ne fait que ré-exporter, pour ne pas casser les imports existants.
export { ajouterHeuresOuvrees, type ConfigCalendrierSla } from "@pgd/database";
