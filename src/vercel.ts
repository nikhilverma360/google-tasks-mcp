// Vercel serverless entrypoint: exports a Web-standard handler via hono/vercel.
// api/index.ts re-exports this module so @vercel/node traces/bundles src/
// (never import a prebuilt build/ file — it is not in the function package).
import process from "node:process";
import { handle } from "hono/vercel";
import { loadConfig } from "./config.ts";
import { buildDeps } from "./deps.ts";
import { createApp } from "./server/app.ts";

const app = createApp(await buildDeps(loadConfig(process.env)));

export default handle(app);
