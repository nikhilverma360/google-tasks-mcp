// Vercel discovers this file as the serverless function. The compiled app lives
// in build/ (npm run build); vercel.json sets buildCommand and includeFiles.
export { default } from "../build/vercel.js";
