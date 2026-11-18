// Vercel serverless entry: import the TypeScript app so @vercel/node/esbuild
// traces and bundles src/ (do not import ../build — that file is not in the
// function bundle even when buildCommand runs).
export { default } from "../src/vercel.ts";
