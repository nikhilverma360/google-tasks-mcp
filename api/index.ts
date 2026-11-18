// Vercel serverless entry: import the TypeScript app so @vercel/node/esbuild
// traces and bundles src/ (do not import ../build — that file is not in the
// function bundle). src/vercel.ts exports a Web Handler `{ fetch }`.
export { default } from "../src/vercel.ts";
