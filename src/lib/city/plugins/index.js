// Plugins: building kits and effects that anyone can add by pull request, without touching the renderer.
//
// A kit is a kind of building (city/plugins/kits/*.js). It default-exports
//   { id, name, legend: { signal, formula, window }, draw({ id, plan, h, on, building, repo, kit }) → { svg, top, roof? } }
// `plan` is the parcel's footprint ({ x, y, w, d }, city units), `h` the height the city's one scale gives the
// repository (draw to exactly that height: height is history), `on` whether it had a commit in the last 7 days
// (light the windows or a lamp, nothing else), `building` its first days under scaffolding, `repo` its row in the
// data, and `kit` the renderer's drawing helpers (S, L, slab, path3, k, G, P, Dt, at, lamp, byDepth, hash, nearX,
// nearY, inX, inY, VX, VY). Use hash(...) seeded from the id for any variation, never Math.random. A repository
// takes a kit with `layout.kits: { "<repo>": "<kit id>" }` in city.config.json; it keeps its parcel and its dock.
//
// An effect is a new kind of live event (city/plugins/effects/*.js). It default-exports
//   { kind, name, legend: { signal, formula, window }, webhook?: { event, map(payload) → fields | null }, play(e, at) → primitives }
// `webhook` turns a GitHub webhook (`event` is its X-GitHub-Event name) into the event's fields (or null to skip);
// `play` returns primitives from city/effects.js (drone, ring, beam, drop, smoke, launch, blink, flag) at the
// anchors `at` (roof, hub, crown, homes, home, archive). A plugin never replaces a built-in kind or kit.
//
// Every plugin needs a legend row in ui/Legend.svelte (data-kind="<name>"), and `node scripts/check.mjs` checks the
// schema, draws each kit at three heights (no NaN, inside its footprint, the same twice) and plays each effect.
import capsule from "./kits/capsule.js";
import star from "./effects/star.js";

export const KIT_PLUGINS = [capsule];
export const EFFECT_PLUGINS = [star];
