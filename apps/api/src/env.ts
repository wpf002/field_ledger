import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Side-effect module imported FIRST in index.ts. ES module imports execute in
// order, so loading the root .env here — before any env-reading module is
// imported — guarantees process.env is populated at their module-load time.
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../../../.env"), override: true });
