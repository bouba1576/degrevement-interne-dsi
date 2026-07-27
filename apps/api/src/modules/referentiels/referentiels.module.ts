import { Module } from "@nestjs/common";
import { ReferentielsController } from "./referentiels.controller";
import { ReferentielsService } from "./services/referentiels.service";
import { AdminModule } from "../admin/admin.module";

@Module({
  imports: [AdminModule],
  controllers: [ReferentielsController],
  providers: [ReferentielsService]
})
export class ReferentielsModule {}
