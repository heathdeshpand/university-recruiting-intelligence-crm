import { PrismaClient } from "@prisma/client";
import { env } from "@/lib/env";

/**
 * A single PrismaClient per process.
 *
 * Next.js dev mode hot-reloads modules, which would otherwise open a new
 * connection pool on every edit until Postgres refuses new connections.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      env.NODE_ENV === "development"
        ? [{ emit: "event", level: "error" }, { emit: "event", level: "warn" }]
        : [{ emit: "event", level: "error" }],
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
