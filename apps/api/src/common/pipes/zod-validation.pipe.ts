import { BadRequestException, PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const resultat = this.schema.safeParse(value);
    if (!resultat.success) {
      throw new BadRequestException({
        code: "VALIDATION_ECHOUEE",
        message: "La requête ne respecte pas le schéma attendu.",
        details: resultat.error.issues.map((issue) => ({
          chemin: issue.path.join("."),
          message: issue.message
        }))
      });
    }
    return resultat.data;
  }
}
