// Effects: what a city event looks like as it happens. Each kind maps to a few primitives that both views draw
// (view/fx3d.js): a drone, a ring, a beam, a drop, smoke, a launch, a blink, a flag.
// An effect is finite (a few seconds), plays on the thing the event concerns, and leaves nothing behind: the next
// snapshot makes the consequence permanent (law 4). A new kind of effect is one entry here.
//
// Hues: "accent" (cyan, the merge and the pass), "live" (magenta, alerts), the signage glows "c" "m" "a" "v", "lo".
import { EFFECT_PLUGINS } from "./plugins/index.js";
export const EFFECTS = {
  commit: (e, at) => [{ t: "drone", from: at.roof, to: at.hub, crates: Math.max(1, Math.min(6, e.n || e.bots || 1)) }, { t: "ring", at: at.roof, hue: "live", r: 7 }, ...at.homes.map((h) => ({ t: "ring", at: h, hue: "live", r: 4, delay: 0.3 }))], // and each author's house lamp
  "contributor.new": (e, at) => (at.home ? [{ t: "drop", at: at.home, hue: "a" }, { t: "ring", at: at.home, hue: "a", r: 12, delay: 0.5 }] : []), // a first contribution: a new house in the quarter
  branch: (e, at) => [{ t: "drop", at: at.roof, hue: "v" }],
  "pr.open": (e, at) => [{ t: "drop", at: at.roof, hue: "c" }],
  "pr.merge": (e, at) => [{ t: "beam", from: at.roof, to: at.crown, hue: "accent" }, { t: "ring", at: at.crown, hue: "accent", r: 26, delay: 1.1 }],
  "pr.close": (e, at) => [{ t: "ring", at: at.roof, hue: "lo", r: 8 }],
  "ci.run": (e, at) => [{ t: "ring", at: at.roof, hue: "c", r: 6 }],
  "ci.pass": (e, at) => [{ t: "ring", at: at.roof, hue: "accent", r: 11 }],
  "ci.fail": (e, at) => [{ t: "smoke", at: at.roof, hue: "live" }],
  release: (e, at) => [{ t: "launch", at: at.hub }, { t: "ring", at: at.crown, hue: "a", r: 34, delay: 0.6 }, { t: "blink" }, ...at.flags.map((h) => ({ t: "flag", at: h, delay: 1.2 }))], // and a flag on every first-timer's roof
  "issue.open": (e, at) => [{ t: "ring", at: at.roof, hue: "m", r: 7 }],
  "issue.close": (e, at) => [{ t: "ring", at: at.roof, hue: "lo", r: 7 }],
  "repo.new": (e, at) => [{ t: "ring", at: at.roof, hue: "a", r: 22 }, { t: "drop", at: at.roof, hue: "a" }],
  "repo.archive": (e, at) => [{ t: "ring", at: at.roof, hue: "lo", r: 16 }, { t: "drone", from: at.roof, to: at.archive, crates: 1 }], // a crane carries it to the archive
  "member.join": (e, at) => [{ t: "ring", at: at.hub, hue: "accent", r: 20 }],
  // Basecamp (the members' city only): at the project's ward
  "card.new": (e, at) => [{ t: "drop", at: at.ward, hue: "c" }],
  "card.move": (e, at) => [{ t: "ring", at: at.ward, hue: "c", r: 6 }], // a car shunts in the yard (the redraw moves it)
  "todo.done": (e, at) => [{ t: "ring", at: at.ward, hue: "accent", r: 8 }],
  "hill.move": (e, at) => [{ t: "drop", at: at.ward, hue: "a" }, { t: "ring", at: at.ward, hue: "a", r: 5, delay: 0.4 }], // a lantern walks
  "message.new": (e, at) => [{ t: "ring", at: at.ward, hue: "m", r: 12 }], // the mast's signal ring
  "chat.line": (e, at) => [{ t: "ring", at: at.ward, hue: "lo", r: 4 }], // a window lights
  "checkin.answer": (e, at) => [{ t: "ring", at: at.ward, hue: "a", r: 5 }],
  "upload.new": (e, at) => [{ t: "drone", from: at.hub, to: at.ward, crates: 1 }], // a crate in
  "project.new": (e, at) => [{ t: "ring", at: at.ward, hue: "a", r: 22 }, { t: "drop", at: at.ward, hue: "a" }], // ground broken
  "patron.new": (e, at) => [{ t: "drop", at: at.patron, hue: "a" }, { t: "ring", at: at.patron, hue: "a", r: 16, delay: 0.5 }, { t: "blink" }], // a corporate patron's board lights for the first time
};

for (const pl of EFFECT_PLUGINS) EFFECTS[pl.kind] ??= pl.play; // plugin effects add kinds, never replace one

// where an event plays: the repository's roof, the arcology's landing pad (hub) and its crown
export function anchorsFor(e, model) {
  const hub = model.hub ?? [0, 0, 60], crown = model.crown ?? hub;
  const homes = (e.authors ?? []).map(([login]) => model.homes?.[login]).filter(Boolean);
  const flags = (e.flags ?? []).map((login) => model.homes?.[login]).filter(Boolean);
  return { roof: (e.repo && model.roofs?.[e.repo]) || hub, hub, crown, homes, flags, home: model.homes?.[e.actor], archive: model.archive ?? hub, patron: (e.name && model.patronAt?.[e.name]) || crown, ward: (e.ward != null && model.wardAt?.[e.ward]) || hub };
}

export function primitivesFor(e, model) {
  const f = EFFECTS[e.kind];
  return f ? f(e, anchorsFor(e, model)) : [];
}
