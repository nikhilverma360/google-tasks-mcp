// Vercel serverless entrypoint: exports a Web-standard handler via hono/vercel.
// Pair with api/index.ts + vercel.json (catch-all routes, maxDuration, public/).
import process from "node:process";
import { handle } from "hono/vercel";
import { loadConfig } from "./config.ts";
import { buildDeps } from "./deps.ts";
import { createApp } from "./server/app.ts";

const app = createApp(await buildDeps(loadConfig(process.env)));

export default handle(app);
