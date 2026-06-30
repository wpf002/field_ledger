import type { FastifyInstance } from "fastify";
import { prisma } from "@fl/db";

/** Convenience reads the web app uses to drive the live Transactions page. */
export async function registerFarm(app: FastifyInstance) {
  // The demo is single-farm; return the first farm so the client can scope calls.
  app.get("/farm", async () => {
    return prisma.farm.findFirstOrThrow({ select: { id: true, name: true } });
  });

  // Accounts (chart of accounts) for the Add Transaction category picker.
  app.get("/farms/:farmId/accounts", async (req) => {
    const { farmId } = req.params as { farmId: string };
    return prisma.account.findMany({
      where: { farmId },
      orderBy: [{ kind: "asc" }, { label: "asc" }],
      select: { id: true, code: true, label: true, kind: true, scheduleFCode: true },
    });
  });
}
