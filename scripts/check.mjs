#!/usr/bin/env node
// Smoke test: build the city from the dev snapshot, laid out by the engine from scratch, at every view and report. Fails on NaN/undefined,
// on a city that is not the same twice from the same data, and on a station kind the legend does not explain.
import { readFileSync, writeFileSync } from "node:fs";
import { buildCity, VIEWS } from "../src/lib/city/city.js";
import { stationFragments } from "../src/lib/city/stations.js";
import { KIT_PLUGINS, EFFECT_PLUGINS } from "../src/lib/city/plugins/index.js";
import { EFFECTS } from "../src/lib/city/effects.js";
import { KINDS } from "../src/lib/server/relay/events.mjs";
import { layoutCity } from "../src/lib/server/engine.mjs";
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const data = JSON.parse(readFileSync(args.data ?? "dev/snapshot.json", "utf8"));
const config = JSON.parse(readFileSync(args.config ?? "city.config.json", "utf8"));
const layout = args.layout ? JSON.parse(readFileSync(args.layout, "utf8")) : layoutCity(data, config, null); // --layout: a layout from a relay's /layout.json
const here = new URL(".", import.meta.url);
let kinds = null;
for (const az of args.az ? [+args.az] : VIEWS) {
  const t = performance.now(), city = buildCity({ data, layout, config, az });
  const bad = (city.svg.match(/NaN|undefined/g) || []).length;
  console.log(`az ${az}: ${city.items} items, ${(city.svg.length / 1e6).toFixed(2)} MB, ${Math.round(performance.now() - t)} ms${bad ? `, ${bad} NaN/undefined` : ""}`);
  if (args.out) writeFileSync(args.out.replace("{az}", az), city.svg);
  if (bad) process.exitCode = 1;
  kinds ??= new Set(Object.values(city.model.stations).map((s) => s.kind).filter(Boolean));
  // the model carries everything the maps animate: a field lost (a stray comment, a rename) fails here, not silently on the page
  const lost = ["stations", "repos", "groups", "days", "people", "runs", "drones", "roofs", "homes", "lights", "pads", "ticker", "sky", "platter"].filter((k) => city.model[k] == null || (Array.isArray(city.model[k]) && !city.model[k].length && ["lights", "ticker", "runs"].includes(k)));
  if (lost.length) { console.log(`az ${az}: model has no ${lost.join(", ")}`); process.exitCode = 1; }
  // deterministic: the same data draws the same city, byte for byte
  if (buildCity({ data, layout, config, az }).svg !== city.svg) { console.log(`az ${az}: NOT DETERMINISTIC`); process.exitCode = 1; }
}
// every kind of station the city draws has a row in the legend (data-kind on a <dt> in src/lib/ui/Legend.svelte)
const html = readFileSync(new URL("../src/lib/ui/Legend.svelte", here), "utf8");
const explained = new Set([...html.matchAll(/data-kind="([^"]+)"/g)].flatMap((m) => m[1].split(",").map((s) => s.trim())));
// the org's own words join the Height row from the config (Legend.svelte: own)
for (const k of [...Object.values(config.layout?.kinds ?? {}), ...(config.layout?.districts ?? []).map((d) => d.name), config.layout?.newcomers?.name]) if (k) explained.add(k);
const missing = [...kinds].filter((k) => !explained.has(k));
console.log(`legend: ${kinds.size} station kinds, ${missing.length ? `MISSING ${missing.join(", ")}` : "all explained"}`);
if (missing.length) process.exitCode = 1;
// a house in its first day stands under a crane: draw the city as if a few houses had just been built
{
  const born = Object.fromEntries(Object.keys(layout.houses ?? {}).slice(0, 5).map((l) => [l, data.now - 3600]));
  for (const three of [false, true]) {
    const svg = buildCity({ data, layout: { ...layout, houseBorn: born }, config, az: 72, three }).svg, bad = (svg.match(/NaN|undefined/g) || []).length;
    if (bad) { console.log(`new houses${three ? " (3d)" : ""}: ${bad} NaN/undefined`); process.exitCode = 1; }
  }
}
// the 3D view is built from two recordings of the same city; both must be clean too
for (const az of [72, 252]) {
  const t = performance.now(), rec = buildCity({ data, layout, config, az, three: true });
  // a JSON null in a primitive is a bug; a login such as "nullndr" is not
  const bad = (rec.svg.match(/NaN|undefined|[:,[]null\b/g) || []).length, solids = (rec.svg.match(/class="iso-solid"/g) || []).length;
  console.log(`3d record ${az}: ${solids} solids, ${(rec.svg.length / 1e6).toFixed(2)} MB, ${Math.round(performance.now() - t)} ms${bad ? `, ${bad} bad values` : ""}`);
  if (bad) process.exitCode = 1;
}
// the builder worker prepares both recordings into the map's geometry (view/scene3d.js prepare(), client/worker.js):
// it must run without a DOM and give finite numbers, for the whole city and for a few stations redrawn in place
{
  const { three } = await import("../src/lib/client/worker.js");
  const input = { data, layout, config }, some = Object.keys(data.repos).slice(0, 6);
  for (const [what, ids] of [["city", null], [`${some.length} stations`, some]]) {
    const t = performance.now(), { prep } = three(input, ids);
    let n = 0, bad = 0;
    for (const m of Object.values(prep.pieces)) for (const p of m.values()) { for (const v of p.pos) { n++; if (!Number.isFinite(v)) bad++; } }
    console.log(`3d prepare (${what}): ${(n / 3 / 1e6).toFixed(2)}M vertices, ${Math.round(performance.now() - t)} ms${bad ? `, ${bad} bad values` : ""}`);
    if (bad || !n) process.exitCode = 1;
  }
}
// in place: every repository's drawing slices out of the city as whole groups that carry their own position, so
// a station rebuilt from new data lands where the full build would draw it (src/lib/city/stations.js)
{
  const city = buildCity({ data, layout, config, az: 72 }), ids = Object.keys(data.repos).filter((n) => city.model.roofs?.[n]);
  const frags = stationFragments(city.svg, ids), empty = ids.filter((n) => !frags[n].length);
  const loose = ids.filter((n) => frags[n].some((f) => !/^<g data-station="[^"]+"/.test(f) || !f.endsWith("</g>")));
  console.log(`stations: ${ids.length} slice in place${empty.length ? `, NO FRAGMENTS for ${empty.join(", ")}` : ""}${loose.length ? `, BROKEN for ${loose.join(", ")}` : ""}`);
  if (empty.length || loose.length) process.exitCode = 1;
}
// only: a patch draws the city with buildCity({ only }) and slices the same fragments, byte for byte, with the same model
{
  for (const three of [false, true]) {
    const full = buildCity({ data, layout, config, az: 72, three }), all = [...new Set([...full.svg.matchAll(/<g data-station="([^"]+)"/g)].map((m) => m[1]))];
    for (const offset of [0, 3]) {
      const pick = all.filter((id, i) => i % 7 === offset).concat(offset ? ["relay", "day-3"] : []).filter((id) => all.includes(id));
      const t = performance.now(), part = buildCity({ data, layout, config, az: 72, three, only: pick }), ms = Math.round(performance.now() - t);
      const a = stationFragments(full.svg, pick), b = stationFragments(part.svg, pick), differ = pick.filter((id) => JSON.stringify(a[id]) !== JSON.stringify(b[id]));
      const modelSame = JSON.stringify({ ...full.model, vb: 0 }) === JSON.stringify({ ...part.model, vb: 0 }); // the viewBox is the full drawing's alone
      console.log(`only${three ? " (3d)" : ""}: ${pick.length} of ${all.length} stations in ${ms} ms${differ.length ? `, DIFFER: ${differ.slice(0, 6).join(", ")}` : ", byte for byte"}${modelSame ? "" : ", MODEL DIFFERS"}`);
      if (differ.length || !modelSame) process.exitCode = 1;
    }
  }
}
// plugins (src/lib/city/plugins/): a schema, a legend row, kits that stay inside their plan at their height and draw the same
// twice, effects that play only known primitives in known hues
{
  const problems = [], word = /^[a-z][a-z0-9.-]*$/, legendOk = (l) => l && ["signal", "formula", "window"].every((f) => typeof l[f] === "string" && l[f].trim());
  const BUILTIN_KITS = ["apps", "catalog", "sites", "upstream", "retired", "tower"], PRIMS = ["drone", "ring", "beam", "drop", "smoke", "launch", "blink", "flag"], HUES = ["accent", "live", "c", "m", "a", "v", "lo", undefined];
  const seen = new Set();
  for (const pl of KIT_PLUGINS) {
    const who = `kit ${pl.id}`;
    if (!word.test(pl.id ?? "") || BUILTIN_KITS.includes(pl.id) || seen.has(pl.id)) problems.push(`${who}: id must be new, lower case`);
    seen.add(pl.id);
    if (typeof pl.name !== "string" || !legendOk(pl.legend) || typeof pl.draw !== "function") { problems.push(`${who}: needs name, legend { signal, formula, window } and draw()`); continue; }
    if (!explained.has(pl.name)) problems.push(`${who}: no legend row with data-kind="${pl.name}" in src/lib/ui/Legend.svelte`);
    const plan = { x: 10, y: 20, w: 36, d: 26, r: 1 };
    for (const h of [16, 48, 140]) for (const on of [false, true]) {
      const probe = { kit: pl.id, id: "probe-repo", plan, h, on };
      const a = buildCity({ data, layout, config, az: 72, probe }), b = buildCity({ data, layout, config, az: 72, probe });
      if (a.svg !== b.svg) problems.push(`${who}: not the same twice at height ${h}`);
      if (/NaN|undefined/.test(a.svg)) problems.push(`${who}: NaN or undefined at height ${h}`);
      if (!(a.top >= h)) problems.push(`${who}: top ${a.top} is below its height ${h}`);
      const xs = a.frame.map((p) => p[0]), ys = a.frame.map((p) => p[1]), box = [Math.min(...xs) - 1, Math.max(...xs) + 1, Math.min(...ys) - 1, Math.max(...ys) + 1];
      const pts = [...a.svg.replace(/<path class="iso-halo"[^>]*>/g, "").matchAll(/ d="([^"]+)"/g)].flatMap((m) => [...m[1].matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((q) => [+q[1], +q[2]]));
      const out = pts.filter(([x, y]) => x < box[0] || x > box[1] || y < box[2] || y > box[3]);
      if (out.length) problems.push(`${who}: ${out.length} points outside its plan at height ${h}`);
      const r3 = buildCity({ data, layout, config, az: 252, three: true, probe });
      if (/NaN|undefined/.test(r3.svg)) problems.push(`${who}: NaN or undefined in 3D at height ${h}`);
    }
  }
  const at = { roof: [0, 0, 40], hub: [10, 10, 80], crown: [10, 10, 120], homes: [[5, 5, 30]], home: [5, 5, 30], flags: [], archive: [0, 30, 20] };
  for (const pl of EFFECT_PLUGINS) {
    const who = `effect ${pl.kind}`;
    if (!word.test(pl.kind ?? "") || KINDS.includes(pl.kind) || EFFECTS[pl.kind] !== pl.play) problems.push(`${who}: kind must be new`);
    if (typeof pl.name !== "string" || !legendOk(pl.legend) || typeof pl.play !== "function") { problems.push(`${who}: needs name, legend { signal, formula, window } and play()`); continue; }
    if (!explained.has(pl.name)) problems.push(`${who}: no legend row with data-kind="${pl.name}" in src/lib/ui/Legend.svelte`);
    if (pl.webhook && (typeof pl.webhook.event !== "string" || typeof pl.webhook.map !== "function")) problems.push(`${who}: webhook needs event and map()`);
    try { pl.webhook?.map({}); } catch (e) { problems.push(`${who}: webhook.map throws on an empty payload`); }
    const prims = pl.play({ kind: pl.kind, repo: "probe-repo", actor: "someone" }, at);
    if (!Array.isArray(prims)) { problems.push(`${who}: play() must return primitives`); continue; }
    for (const p of prims) if (!PRIMS.includes(p.t) || !HUES.includes(p.hue) || JSON.stringify(p).includes("null")) problems.push(`${who}: bad primitive ${JSON.stringify(p)}`);
  }
  console.log(`plugins: ${KIT_PLUGINS.length} kits, ${EFFECT_PLUGINS.length} effects${problems.length ? `, ${problems.length} PROBLEMS` : ", all good"}`);
  for (const p of problems) console.log(`  ${p}`);
  if (problems.length) process.exitCode = 1;
}
