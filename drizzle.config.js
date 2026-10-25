// drizzle-kit: `pnpm db:generate` writes a migration into drizzle/ from src/lib/server/db/schema.js (the app applies
// them as it starts); push, migrate and studio need DATABASE_URL.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/server/db/schema.js",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://localhost:5432/omaville" },
  verbose: true,
  strict: true,
});
