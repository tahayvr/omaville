#!/usr/bin/env node
// The public city must not carry what belongs to the members' city (collector/public.mjs). Run on any data.json.
import { readFileSync } from "node:fs";
import { publicProblems } from "../src/lib/server/collector/public.mjs";
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const data = JSON.parse(readFileSync(args.data ?? "dev/snapshot.json", "utf8"));
const problems = publicProblems(data);
console.log(problems.length ? `public projection: ${problems.length} problems\n  ${problems.slice(0, 20).join("\n  ")}` : `public projection: ok (${Object.keys(data.repos).length} repositories, ${data.people.length} people, ${(data.contributors ?? []).length} contributors)`);
if (problems.length) process.exitCode = 1;
