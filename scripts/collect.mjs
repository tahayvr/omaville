#!/usr/bin/env node
// Collect the org's activity once and write data.json. The relay runs the same scan on its own schedule
// (the app's relay, CITY_SCAN_EVERY); this command is for local work, refreshing dev/snapshot.json and one-off runs.
//
//   GITHUB_TOKEN=… node scripts/collect.mjs [--out dev/snapshot.json] [--prev https://city.example.org/data.json]
//   node scripts/collect.mjs --source git --clones ./clones [--meta repos-meta.json] [--members members.json] --now 2026-10-09T23:59:59Z
//
// --prev (a path or URL; default: the output file) is the previous snapshot: when nothing changed, its
// generatedAt is kept. --projection members keeps everything (the members' city, behind sign-in).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { scan } from "../src/lib/server/collector/scan.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? "true" : all[i + 1]]] : acc), []));
const config = JSON.parse(readFileSync(args.config ?? "city.config.json", "utf8"));
if (args.org) config.org = args.org;
const out = args.out ?? "dev/snapshot.json";
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const source = args.source ?? (token ? "github" : "git");
if (source === "github" && !token) { console.error("GITHUB_TOKEN is not set"); process.exit(2); }

let prev = null;
try {
  const prevSrc = args.prev && args.prev !== "true" ? args.prev : out;
  prev = /^https?:/.test(prevSrc) ? await (await fetch(prevSrc, { cache: "no-store" })).json() : existsSync(prevSrc) ? JSON.parse(readFileSync(prevSrc, "utf8")) : null;
} catch (e) { console.error(`previous data not read: ${e.message.slice(0, 120)}`); }

const data = await scan({
  config, token, source, prev, projection: args.projection ?? "public",
  now: args.now ? Math.floor(Date.parse(args.now) / 1000) : undefined,
  clones: args.clones ?? "clones", meta: args.meta, members: args.members,
});
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(data));
console.error(`wrote ${out}`);
