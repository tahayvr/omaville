// The app's one relay and its sign-in, made once per server process (and kept across Vite's reloads in dev).
// The mode comes from the environment:
//   pnpm dev               with GITHUB_TOKEN, scans the org into the database like production; without one, the
//                          dev snapshot (dev/snapshot.json) is the base; unsigned hooks either way
//   pnpm dev:members       the same, plus an invented members' city (wards, a private repository), signed in as "you"
//   production (node build; the Dockerfile) DATABASE_URL, CITY_WEBHOOK_SECRET, GITHUB_TOKEN and the rest: .env.example
// Env: DATABASE_URL (Postgres; without it, in dev, an in-memory PGlite: db/index.js), CITY_DATA (a base file
//      instead of scans), CITY_SAMPLE=members, CITY_SCAN_EVERY (minutes), CITY_CONFIG (city.config.json),
//      CITY_INSECURE=1 (local work only); sign-in: see auth.js.
import { readFile } from "node:fs/promises";
import { dev } from "$app/environment";
import { env } from "$env/dynamic/private";
import { createRelay } from "./relay/relay.mjs";
import { makeAuth } from "./auth.js";
import { connect } from "./db/index.js";

export function app() {
  return (globalThis.__omaville ??= (async () => {
    const config = JSON.parse(await readFile(env.CITY_CONFIG || "city.config.json", "utf8").catch(() => "{}"));
    const sample = env.CITY_SAMPLE === "members" ? "members" : "", insecure = dev || env.CITY_INSECURE === "1";
    // the database: DATABASE_URL, or in dev an in-memory PGlite (local work then starts from the sample each time)
    const url = env.DATABASE_URL || (dev ? "pglite:memory" : "");
    if (!url) throw new Error("DATABASE_URL is not set (postgres://…, or pglite:<folder> for a single process)");
    const conn = await connect(url);
    const devSignin = insecure && sample ? "you" : "", signin = devSignin ? null : makeAuth(config, conn.db);
    const relay = await createRelay({
      env, config, db: conn, sample, insecure, devSignin, signin: !!signin,
      members: !!(signin || devSignin), // the members' city, and anything private, only once sign-in is set up
      data: env.CITY_DATA || (sample || (dev && !(env.GITHUB_TOKEN || env.GH_TOKEN)) ? "dev/snapshot.json" : undefined), // the members' sample is invented from the snapshot
      scanEvery: (env.CITY_SCAN_EVERY ?? "") !== "" ? +env.CITY_SCAN_EVERY : undefined, // "0": no scan
    });
    return { relay, signin, devSignin };
  })());
}
