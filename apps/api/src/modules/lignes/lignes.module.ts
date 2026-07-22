import { Module } from "@nestjs/common";
import { LignesController } from "./lignes.controller";
import { ComptesController } from "./comptes.controller";
import { LigneService } from "./services/ligne.service";
import { CompteService } from "./services/compte.service";
import { CrmImportService } from "./services/crm-import.service";
import { CrmStubAdapter } from "./providers/crm-stub.adapter";

@Module({
  controllers: [LignesController, ComptesController],
  providers: [LigneService, CompteService, CrmImportService, CrmStubAdapter],
  exports: [CrmImportService]
})
export class LignesModule {}
