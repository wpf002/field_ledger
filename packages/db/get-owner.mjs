import { prisma } from "./src/index.js";
const owner = await prisma.user.findUnique({ where: { email: "owner@fieldandledger.test" }, include: { memberships: true } });
const viewer = await prisma.user.findUnique({ where: { email: "viewer@fieldandledger.test" }, include: { memberships: true } });
console.log("RESULT " + JSON.stringify({
  ownerId: owner?.id, ownerFarm: owner?.memberships[0]?.farmId,
  viewerId: viewer?.id, viewerFarm: viewer?.memberships[0]?.farmId,
}));
process.exit(0);
