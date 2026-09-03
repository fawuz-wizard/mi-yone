// When running against the REAL backend, reseed the database before the suite —
// the mock resets itself on server start; PostgreSQL does not. This keeps every
// run reproducible (same guarantee the mock gave for free).
import { execSync } from "node:child_process";
import path from "node:path";

export default function globalSetup() {
  if (!process.env.MIYONE_BACKEND_URL) return; // mock mode: nothing to do
  const backendDir = path.resolve(__dirname, "../../backend");
  // The seed drops every table first and refuses without this flag (and outside
  // MIYONE_ENV=dev|demo) — the E2E suite only ever targets a development database.
  execSync("python3 -m app.seed --i-understand-this-deletes-everything", { cwd: backendDir, stdio: "inherit" });
}
