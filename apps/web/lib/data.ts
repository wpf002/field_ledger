import { prisma } from "@fl/db";

/**
 * Server-side read layer for the web app. Phase 0 renders every page from the
 * seeded demo farm. Money stays integer cents end to end; pages format only at
 * the display edge via <Money/>. (Transactions is the exception — it goes
 * through the live Fastify API to prove the API path end to end.)
 */
export function getDemoFarm() {
  return prisma.farm.findFirstOrThrow();
}

export async function getDemoFarmId() {
  return (await getDemoFarm()).id;
}
