// The database: Postgres at DATABASE_URL (postgres://…), or PGlite (Postgres in WebAssembly, in-process) for
// "pglite:memory" (gone when the process ends) or "pglite:<folder>". Migrations in drizzle/ are applied on
// connect, one process at a time on Postgres (a deploy overlaps the old and the new container: an advisory lock,
// held on a reserved session while the migrator runs on the pool's other connections). Plain Node, no SvelteKit:
// the relay, the scripts and the tests share it.
//
//   const { db, close } = await connect(url);
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import * as schema from "./schema.js";

const MIGRATIONS = ["drizzle", fileURLToPath(new URL("../../../../drizzle", import.meta.url))].find((d) => existsSync(d)) ?? "drizzle";
const MIGRATE_LOCK = 726269656; // the advisory lock's key, this app's alone

export async function connect(url = "pglite:memory") {
  if (url.startsWith("pglite:")) {
    const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([import("@electric-sql/pglite"), import("drizzle-orm/pglite"), import("drizzle-orm/pglite/migrator")]);
    const where = url.slice("pglite:".length);
    const client = new PGlite(where === "memory" || !where ? undefined : where);
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return { db, kind: "pglite", close: () => client.close() };
  }
  const [{ default: postgres }, { drizzle }, { migrate }] = await Promise.all([import("postgres"), import("drizzle-orm/postgres-js"), import("drizzle-orm/postgres-js/migrator")]);
  const client = postgres(url, { max: 10, onnotice: () => {} });
  const db = drizzle(client, { schema });
  const lock = await client.reserve();
  try { await lock`select pg_advisory_lock(${MIGRATE_LOCK})`; await migrate(db, { migrationsFolder: MIGRATIONS }); }
  finally { try { await lock`select pg_advisory_unlock(${MIGRATE_LOCK})`; } catch {} lock.release(); }
  return { db, kind: "postgres", close: () => client.end() };
}

export { schema };
