import { PrismaClient } from "@prisma/client";

export { PrismaClient } from "@prisma/client";
export * from "@prisma/client";
export * from "./calendrier-sla.util";
export * from "./audit-immuable.util";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
