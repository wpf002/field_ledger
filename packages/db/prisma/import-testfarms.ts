import "./load-env.js"; // must be first — loads root .env before Prisma client
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { prisma, Role } from "../src/index.js";
import { importTestFarm } from "../src/testfarms/import.js";

/**
 * Loads the four test farms from data/testfarms/*.xlsx and gives the demo users
 * access (owner: all four; viewer: read-only on Dawson Charolais).
 * Run: pnpm --filter @fl/db import:testfarms
 */
export const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../data/testfarms");

export async function importAllTestFarms() {
  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".xlsx")).sort();
  const owner = await prisma.user.findUnique({ where: { email: "owner@acreflow.test" } });
  const viewer = await prisma.user.findUnique({ where: { email: "viewer@acreflow.test" } });
  for (const f of files) {
    const started = Date.now();
    const r = await importTestFarm(prisma, resolve(DATA_DIR, f));
    if (owner) await prisma.membership.create({ data: { userId: owner.id, farmId: r.farmId, role: Role.OWNER } });
    if (viewer && f.startsWith("RCK")) await prisma.membership.create({ data: { userId: viewer.id, farmId: r.farmId, role: Role.VIEWER } });
    console.log(`${r.name}: ${JSON.stringify(r.counts)} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  importAllTestFarms().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
