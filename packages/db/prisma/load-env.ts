import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Side-effect module imported FIRST in seed.ts. ES module imports execute in
// order, so loading the root .env here — before the Prisma client is imported —
// guarantees DATABASE_URL is populated before any query runs.
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../../../.env"), override: false });
