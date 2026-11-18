// Vercel serverless entrypoint. Export a Web Handler (`{ fetch }`), not
// hono/vercel's default (req)=>Response wrapper: @vercel/node treats a bare
// default export as the Node (req, res) signature and ignores a returned
// Response (FUNCTION_INVOCATION_TIMEOUT + headers.get TypeError).
import process from "node:process";
import { loadConfig } from "./config.ts";
import { buildDeps } from "./deps.ts";
import { createApp } from "./server/app.ts";

const app = createApp(await buildDeps(loadConfig(process.env)));

export default {
  fetch: (request: Request): Response | Promise<Response> => app.fetch(request),
};
