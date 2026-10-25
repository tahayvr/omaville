// Omaville: the org drawn as a city on the Omarchy mark. Pure: data in, SVG out.
// Runs in the browser (main thread or a worker) and in Node.
import * as K0 from "./kit/iso-kit.mjs";
import * as G0 from "./kit/lathe.mjs";
import * as K3 from "./kit3d.js";
import { KIT_PLUGINS } from "./plugins/index.js";
import { LOGO, C, X0, Y0, BOARDS, inCourtyard, PARCELS, DOCK, PZ, H, SCENERY_MAX, hash, CHANNEL, SKYLINE, sceneryPick, ringOf, ringCells, streetsOf, civicAt, STREET } from "./grid.js";

export const VIEWS = [72, 162, 252, 342];
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const stamp = (t) => { const d = new Date(t * 1000); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };

// three: true records 3D primitives (see kit3d.js) instead of drawing; the 3D view builds its scene from that record
// only: a list of station ids: the whole city is still laid out and its model made (the belts, the drones, the roofs
// depend on everything), but only those stations are drawn, so a patch of a few stations costs a fraction of a build.
// DRAW is on while a wanted station draws; while it is off the kits' projection and string work answer nothing,
// while the projection and the painter's order stay real, so the groups come out in the full build's order. check.mjs
// proves a fragment drawn this way is byte for byte the full build's, and the model the same.
export function buildCity({ data: DATA, layout: LAYOUT, config: CONFIG = {}, az = 72, three = false, probe = null, only = null }) { // probe: draw one plugin kit alone (scripts/check.mjs)
const MODE3D = !!three, ONLY = only ? new Set(only) : null;
let DRAW = !ONLY;
const QUIET = { pathOf: "", lineOnTop: "", segment: "", onTop: "", planOutline: "", sideSeam: "", ring: "", sideArc: "", knurl: "", haloOf: "", translateAlong: "", solidSvg: "", lineSvg: "", dotsSvg: "", faceTextSvg: "", slabOf: null, cylinder: null, extrude: null, radialTicks: { minor: "", major: "" }, topTicks: { minor: "", major: "" }, sphereOf: null, solidOf: null, prismOf: null, disc: null };
const quiet = (kit) => (ONLY ? Object.fromEntries(Object.entries(kit).map(([n, f]) => [n, typeof f === "function" && n in QUIET ? (...a) => (DRAW ? f(...a) : QUIET[n]) : f])) : kit);
const k = quiet(MODE3D ? K3 : K0), G = quiet(MODE3D ? K3.G : G0);
const drawing = (id, f) => { if (!ONLY) return f(); const was = DRAW; DRAW = ONLY.has(id); try { return f(); } finally { DRAW = was; } }; // a station's drawing, on only when it is wanted
const RP = DATA.repos;
const c30 = (n) => (RP[n] ? RP[n].c30 : 0);
const c7 = (n) => (RP[n] ? RP[n].c7 : 0);
// lifetime commits: what height follows (data before schema 3 only has the 30-day count, so a short city, never a broken one)
const life = (n) => (RP[n] ? RP[n].total ?? RP[n].c30 : 0);
const crew7 = (n) => (RP[n] ? RP[n].people7 ?? RP[n].people : 0);
const AZ = az, EL = 33; // a lower eye than the classic 38: the skyline reads taller (map3d.js starts the camera at the same angle)
const LM = LAYOUT.landmarks ?? {}, has = (id) => !!RP[id] && !!LM[id];
const DISTRICT = Object.fromEntries((CONFIG.layout?.districts ?? []).map((d) => [d.id, d]));
const BUILD_DAYS = CONFIG.layout?.newcomers?.buildDays ?? 14;
// the contributors' quarter: one tower per person (layout.houses: login → "i,j:slot") in rings around the mark,
// with any repository lots the full mark sent out there; RINGS = how many rings are open
const HOUSES = LAYOUT.houses ?? {};
const CONTRIB = Object.fromEntries((DATA.contributors ?? []).map((c) => [c.login, c]));
const PERSON = Object.fromEntries((DATA.people ?? []).filter((p) => p.gh).map((p) => [p.gh, p]));
const RINGS = Math.max(0, ...Object.values(HOUSES).map((v) => ringOf(v.split(":")[0])), ...Object.keys(LAYOUT.lots ?? {}).map(ringOf), ...Object.values(LAYOUT.wards ?? {}).map(ringOf));
// the org's corporate patrons, by tier id as its patrons file names them: config.patrons.crown on the arcology's
// crown, config.patrons.boards on the billboards
const PATRONS = CONFIG.patrons ?? {}, patronNames = (tier) => ((DATA.patrons ?? []).find((t) => t.id === tier)?.members ?? []).map((m) => m.name);
const FOUNDING_CORP = patronNames(PATRONS.crown?.tier), DIST_CORP = patronNames(PATRONS.boards?.tier);
const PATRON_PAGE = PATRONS.site ? new URL(PATRONS.page ?? "/", PATRONS.site).href : "";
// the city draws corporate patrons only: each board screen is its own station, patron:<slug>, with its card
const patronId = (name) => "patron:" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const PATRON_AT = {}; // name → where its board or crown face is (city units, deck included), for patron.new
const logoOf = (name) => (DATA.patrons ?? []).flatMap((t) => t.members ?? []).find((m) => m.name === name)?.logo;
// a corporate patron's logo on its screen: an image on the face's plane, drawn as a single-tone stencil (CSS on the
// flat plate, scene3d.js in 3D); tl, tr, bl are its top-left, top-right and bottom-left corners in city units
function logo(url, tl, tr, bl, glow, screen = false) { // screen: on a lit screen, where it is drawn white
  const q = [tl, tr, bl].map((p) => p.map((v) => +v.toFixed(2)).join(",")).join(" "), href = String(url).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  if (MODE3D) return `<image class="ow-logo" data-quad="${q}" data-glow="${glow}"${screen ? ' data-screen=""' : ""} href="${href}"/>`;
  const [a, b, c] = [tl, tr, bl].map(at);
  return `<image class="ow-logo" data-glow="${glow}" href="${href}" width="1" height="1" preserveAspectRatio="xMidYMid meet" transform="matrix(${(b[0] - a[0]).toFixed(3)} ${(b[1] - a[1]).toFixed(3)} ${(c[0] - a[0]).toFixed(3)} ${(c[1] - a[1]).toFixed(3)} ${a[0].toFixed(2)} ${a[1].toFixed(2)})"/>`;
}
// where: "crown" or "boards" (config.patrons' tiers), on: where in the city
const patronStation = (name, where, on) => {
  const m = (DATA.patrons ?? []).flatMap((t) => t.members ?? []).find((x) => x.name === name) ?? {}, href = m.href || PATRON_PAGE, label = PATRONS[where]?.label ?? "Patron";
  station(patronId(name), { kind: "Patron board", title: name, what: `${label[0].toUpperCase() + label.slice(1)}, ${on}${PATRON_PAGE ? `, as ${PATRON_PAGE.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")} lists them` : ""}.`, href, link: href.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") });
};

// ---------- the mark ----------

const X = (i) => X0 + i * C, Y = (j) => Y0 + j * C;
const cell = (i, j) => ({ x: X(i), y: Y(j), w: C, d: C, r: 0 });
// the strokes as rectangles of cells: [i0, j0, i1, j1] inclusive
const STROKES = [
  [0, 0, 14, 0], [0, 1, 0, 13], [14, 1, 14, 13], [0, 14, 7, 14], [9, 14, 14, 14],
  [2, 2, 7, 2], [11, 2, 12, 2], [2, 3, 2, 11], [12, 3, 12, 11], [2, 12, 12, 12],
  [7, 1, 7, 1], [1, 7, 1, 7], [7, 13, 7, 13],
];
for (let j = 0; j < 15; j++) for (let i = 0; i < 15; i++) {
  const covered = STROKES.some(([a, b, c, d]) => i >= a && i <= c && j >= b && j <= d);
  if (covered !== (LOGO[j][i] === "#")) throw new Error(`stroke map wrong at ${i},${j}`);
}

const WIDTH = 1040, HEIGHT = 760;
const FLOOR = { x: X0 - 22 - RINGS * C, y: Y0 - 22 - RINGS * C, w: (15 + 2 * RINGS) * C + 44, d: (15 + 2 * RINGS) * C + 64, r: 10 }; // grows outward as the quarter opens rings
const FLOOR_H = 10;
// One height scale for every building in town (H and SCENERY_MAX live in grid.js, shared with the layout)
const P = k.fitProjection([...k.boxCorners(FLOOR, -FLOOR_H - 4, 0), [X(1), Y(0), 110], [X(0), Y(12), 120], [X(2), Y(4), 120]], WIDTH, HEIGHT, { pad: 16, azimuth: AZ, elevation: EL });
const at = MODE3D ? (p) => p : (p) => k.iso(p, P);
// which faces the camera sees: +x when VX > 0, +y when VY > 0
const VX = Math.cos((AZ * Math.PI) / 180) > 0 ? 1 : -1, VY = Math.sin((AZ * Math.PI) / 180) > 0 ? 1 : -1;
const nearX = (p) => (VX > 0 ? p.x + p.w : p.x), farX = (p) => (VX > 0 ? p.x : p.x + p.w);
const nearY = (p) => (VY > 0 ? p.y + p.d : p.y), farY = (p) => (VY > 0 ? p.y : p.y + p.d);
const inX = (p, off, w = 0) => (VX > 0 ? p.x + p.w - off - w : p.x + off); // a strip of width w set back off from the near x edge
const inY = (p, off, d = 0) => (VY > 0 ? p.y + p.d - off - d : p.y + off);
const backX = (p, off, w = 0) => (VX > 0 ? p.x + off : p.x + p.w - off - w);
const backY = (p, off, d = 0) => (VY > 0 ? p.y + off : p.y + p.d - off - d);
const dep = (x, y, z = 0) => k.depthOf([x, y, z], P);
const byDepth = (list, f = (o) => o) => list.slice().sort((a, b) => { const [ax, ay] = f(a), [bx, by] = f(b); return dep(ax, ay) - dep(bx, by); });
const th = (v) => Math.round(v * 1000) / 1000;
const readDir = (axis) => { const v = k.axisVector(P, axis === "x" ? [1, 0, 0] : [0, 1, 0]); return axis === "x" ? [v[0] >= 0 ? 1 : -1, 0] : [0, v[0] >= 0 ? 1 : -1]; };
function textMatrix(at, z, axis, vertical) { // text that always reads left to right, on a top face or a vertical face
  const d = readDir(axis);
  if (MODE3D) return { m: K3.tok({ t: "tm", at: [at[0], at[1], z], d, v: vertical ? 1 : 0, n: vertical ? (axis === "x" ? [0, VY, 0] : [VX, 0, 0]) : [0, 0, 1] }), anchor: d[0] + d[1] > 0 ? "start" : "end" };
  const o = k.iso([at[0], at[1], z], P);
  const u = k.axisVector(P, [d[0], d[1], 0]), v = vertical ? k.axisVector(P, [0, 0, -1]) : k.axisVector(P, [-d[1], d[0], 0]);
  const flip = !vertical && u[0] * v[1] - u[1] * v[0] < 0;
  const vv = flip ? [-v[0], -v[1]] : v;
  return { m: `matrix(${th(u[0])} ${th(u[1])} ${th(vv[0])} ${th(vv[1])} ${th(o[0])} ${th(o[1])})`, anchor: d[0] + d[1] > 0 ? "start" : "end" };
}
// MATERIAL: what the solids being drawn are made of, by use (brick workshops, concrete decks and scenery, steel masts
// and machines, zinc silos, stucco houses). The light theme colours each (app.css, scene3d.js PALETTE.light.materials);
// the dark theme ignores it and keeps its face tones. A solid that names its own class (ow-leaf) keeps it.
let MATERIAL = "";
const withMaterial = (m, f) => { const was = MATERIAL; MATERIAL = m; try { return f(); } finally { MATERIAL = was; } };
const S = (paths, style) => (DRAW ? k.solidSvg(paths, MATERIAL && !style?.className ? { ...style, className: "ow-mat ow-" + MATERIAL } : style) : "");
const L = (d, style) => (!DRAW ? "" : d.startsWith("<") ? d : k.lineSvg(d, style));
// ---- neon ----
const hueAt = (x, y, z) => { const v = Math.abs(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453) % 1; return v < 0.14 ? "off" : v < 0.66 ? "c" : v < 0.88 ? "m" : "a"; };
const N = (d, hue = "c", w = 1, glow = "") => !DRAW ? "" : `<g class="ow-neon" data-hue="${hue}"${glow ? ` data-glow="${glow}"` : ""}><path class="ow-bloom" d="${d}" style="stroke-width:${3.6 * w}px"/><path class="ow-core" d="${d}" style="stroke-width:${0.9 * w}px"/></g>`;
const SLOT = { hall: "~hall", press: "~press", disc: "~disc", dispatch: "~dispatch" };
for (const [repo, slot] of Object.entries(LM)) if (RP[repo]) SLOT[slot] = repo;
// the landmark slots' words come from the org's config: config.layout.kinds (a slot's kind of station, by slot name
// without its number), config.layout.landmarks (a repository's { slot, what }) and config.layout.signs (by slot)
const KIND = { hall: "Assembly hall", press: "Press", disc: "Disc press", dispatch: "Dispatch racks", works: "Works", pod: "Pod", ...(CONFIG.layout?.kinds ?? {}) };
const SIGN = CONFIG.layout?.signs ?? {};
const landmark = (slot, what) => { const id = SLOT[slot], c = (CONFIG.layout?.landmarks ?? {})[id]; station(id, { kind: KIND[slot.replace(/-\d+$/, "")], what: (c && typeof c === "object" && c.what) || what }); };
// glow: one of the city's four signage hues (c cool blue, m magenta, a amber, v violet), kept for signs, billboards
// and street light; without it a neon line or a sign stays grey
const GLOWS = ["c", "m", "a", "v"];
const glowOf = (text) => GLOWS[Math.floor(hash(text.length, text.charCodeAt(0), text.charCodeAt(text.length - 1)) * 4)];
function sign(text, at, z, face, hue, size = 7, glow = "") {
  if (!DRAW) return "";
  const { m, anchor } = textMatrix(at, z, face === "left" ? "x" : "y", true);
  return `<g class="ow-sign" data-hue="${hue}"${glow ? ` data-glow="${glow}"` : ""}><text class="ow-sign-bloom" transform="${m}" font-size="${size}" text-anchor="${anchor}">${text}</text><text class="ow-sign-core" transform="${m}" font-size="${size}" text-anchor="${anchor}">${text}</text></g>`;
}
function signCentered(text, center, z, face, hue, size = 7, glow = "") { // a sign whose middle sits on `center`, whichever way it reads
  const d = readDir(face === "left" ? "x" : "y"), len = text.length * size * 0.62, s = d[0] + d[1] > 0 ? 1 : -1;
  return sign(text, [center[0] - s * d[0] * len / 2, center[1] - s * d[1] * len / 2], z, face, hue, size, glow);
}
const topText = (at, z, text, along, size = 6, tone = "mid") => { if (!DRAW) return ""; const { m, anchor } = textMatrix(at, z, along, false); return k.faceTextSvg(m, text, { size, tone, anchor }); };
const Dt = (pts, style) => (DRAW ? k.dotsSvg(pts, style) : "");
const slab = (plan, z, h, steps = 3, bevel = 0.5) => k.slabOf(plan, z, h, P, steps, bevel);
const path3 = (pts, closed = false) => k.pathOf(pts.map(at), closed);
// lift onto the deck. A single station group takes the transform itself, so the group is whole on its own and a
// station sliced out of the city (city/stations.js) keeps its place
const singleGroup = (svg) => {
  if (!svg.startsWith("<g data-station=") || !svg.endsWith("</g>")) return false;
  let depth = 0; const tag = /<g[\s>]|<\/g>/g; let t;
  while ((t = tag.exec(svg))) { if (t[0] === "</g>") { if (--depth === 0) return t.index + 4 === svg.length; } else depth++; }
  return false;
};
const lift = (svg) => (singleGroup(svg) ? svg.replace(/^<g (data-station="[^"]*")/, `<g $1 transform="${k.translateAlong(P, [0, 0, PZ])}"`) : `<g transform="${k.translateAlong(P, [0, 0, PZ])}">${svg}</g>`);

// ---------- items and painter's order ----------
const items = [];
// CELL: the claimable cell (a lot "i,j" or a district slot "apps:5") whose stand-in is being drawn: scenery, props
// or an empty parcel. Its groups are tagged data-cell, so a page can take them away when a repository claims the
// cell live and draw the new station there (city/stations.js)
let CELL = null;
// ON: the station being drawn had a commit in the last 7 days; its window panes carry data-on and light up (law: light is now)
let ON = false;
const withOn = (on, f) => { const was = ON; ON = !!on; try { return f(); } finally { ON = was; } };
function item(fp, z1, svg, meta = {}) { items.push({ fp, z1, svg: CELL ? `<g data-cell="${CELL}">${svg}</g>` : svg, ...meta }); }
const fpOf = (plan) => ({ x0: plan.x, x1: plan.x + plan.w, y0: plan.y, y1: plan.y + plan.d });
function screenBox(it) {
  const base = it.platform ? 0 : it.ground ? 0 : PZ;
  const pts = [[it.fp.x0, it.fp.y0], [it.fp.x1, it.fp.y0], [it.fp.x0, it.fp.y1], [it.fp.x1, it.fp.y1]].flatMap(([x, y]) => [at([x, y, it.platform ? 0 : base]), at([x, y, (it.platform ? 0 : base) + it.z1])]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
}
const inside = (fp, x, y) => x >= fp.x0 - 0.01 && x <= fp.x1 + 0.01 && y >= fp.y0 - 0.01 && y <= fp.y1 + 0.01;
function ordered() {
  const n = items.length, box = items.map(screenBox);
  const depth = items.map((it) => k.depthOf([(it.fp.x0 + it.fp.x1) / 2, (it.fp.y0 + it.fp.y1) / 2, 0], P));
  const succ = items.map(() => []), indeg = new Array(n).fill(0);
  const edge = (a, b) => { succ[a].push(b); indeg[b]++; };
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    if (a === b) continue;
    const A = box[a], B = box[b];
    if (A[1] <= B[0] || B[1] <= A[0] || A[3] <= B[2] || B[3] <= A[2]) continue;
    const ia = items[a], ib = items[b], fa = ia.fp, fb = ib.fp;
    if (ia.platform && !ib.platform && !ib.ground) {
      // a platform goes under whatever stands on it
      const cx = (fb.x0 + fb.x1) / 2, cy = (fb.y0 + fb.y1) / 2;
      if (inside(fa, cx, cy)) { edge(a, b); continue; }
    }
    if (ib.platform && !ia.platform && !ia.ground) {
      const cx = (fa.x0 + fa.x1) / 2, cy = (fa.y0 + fa.y1) / 2;
      if (inside(fb, cx, cy)) continue;
    }
    const behind = (f, g) => (VX > 0 ? f.x1 <= g.x0 + 0.01 : f.x0 >= g.x1 - 0.01) || (VY > 0 ? f.y1 <= g.y0 + 0.01 : f.y0 >= g.y1 - 0.01);
    const ab = behind(fa, fb), ba = behind(fb, fa);
    if (ab && !ba) edge(a, b);
  }
  const out = [], ready = [];
  for (let i = 0; i < n; i++) if (!indeg[i]) ready.push(i);
  while (ready.length) {
    ready.sort((a, b) => (items[b].platform - items[a].platform) || depth[b] - depth[a]);
    const i = ready.pop(); out.push(items[i]);
    for (const j of succ[i]) if (!--indeg[j]) ready.push(j);
  }
  if (out.length !== n) {
    // name one cycle, so the geometry that causes it can be found
    const label = (i) => `${(items[i].svg.match(/data-station="([^"]+)"/) || [])[1] ?? (items[i].platform ? "platform" : "?")}[${[items[i].fp.x0, items[i].fp.y0, items[i].fp.x1, items[i].fp.y1].map(Math.round)}]z${Math.round(items[i].z1)}${items[i].ground ? "g" : items[i].platform ? "p" : ""}`;
    const state = new Array(n).fill(0), stack = [];
    let cycle = null;
    const dfs = (i) => { if (cycle) return; state[i] = 1; stack.push(i); for (const j of succ[i]) { if (state[j] === 1) { cycle = stack.slice(stack.indexOf(j)).concat(j); return; } if (!state[j]) dfs(j); if (cycle) return; } stack.pop(); state[i] = 2; };
    for (let i = 0; i < n && !cycle; i++) if (indeg[i] > 0 && !state[i]) dfs(i);
    throw new Error(`painter cycle at az ${AZ}: ${n - out.length} items unresolved; cycle: ${(cycle ?? []).map(label).join(" -> ")}`);
  }
  return out;
}
// stuff standing on a platform. Its footprint (used only for the painter's order) is clamped to the stroke it
// stands on: a drawer or a sign that overhangs the stroke's edge must not be ordered against the ground outside
// it by the wrong axis, which made cycles once the contributors' rings stood beside the strokes.
const STROKE_RECTS = STROKES.map(([a, b, c, d]) => ({ x0: X(a), y0: Y(b), x1: X(c + 1), y1: Y(d + 1) }));
function clampToStroke(fp) {
  const cx = (fp.x0 + fp.x1) / 2, cy = (fp.y0 + fp.y1) / 2;
  const s = STROKE_RECTS.find((r) => cx >= r.x0 && cx <= r.x1 && cy >= r.y0 && cy <= r.y1);
  return s ? { x0: Math.max(fp.x0, s.x0 + 0.5), x1: Math.min(fp.x1, s.x1 - 0.5), y0: Math.max(fp.y0, s.y0 + 0.5), y1: Math.min(fp.y1, s.y1 - 0.5) } : fp;
}
function onDeck(fp, z1, svg) { item(clampToStroke(fp), z1, lift(svg)); }
// a plinth as tall as the deck, for whatever counts but stands off the mark: a lot, a block of the quarter
function plinth(...a) { return withMaterial("concrete", () => plinthNow(...a)); } // concrete, in the light theme's colour
function plinthNow(plan, id = null) { // id: the repository whose lot it is, so the plinth is redrawn with its station
  const out = [S(slab(plan, 0, PZ, 2, 0.8), { tone: "mid" }), L(k.planOutline(k.insetPlan(plan, 1.2), PZ, P, 0.5), { tone: "faint" })];
  item(fpOf(plan), PZ, id ? `<g data-station="${id}" data-plinth>${out.join("")}</g>` : out.join(""), { platform: true });
}
function onPlinth(fp, z1, svg) { item(fp, z1, lift(svg)); }

// ---------- parts ----------
function screws(plan, z, inset = 3) { return Dt(k.corners(plan, inset).map(([x, y]) => at([x, y, z])), { size: 0.45 }); }
function pane(pts) { if (!DRAW) return ""; const [x, y, z] = pts[0]; const v = Math.abs(Math.sin(x * 3.1 + y * 7.7 + z * 1.3) * 9973.1) % 1; return `<path class="ow-win" data-hue="${hueAt(x, y, z)}"${ON ? ' data-on=""' : ""}${v < 0.06 ? ` data-flick="${Math.floor(v * 1000) % 4}"` : ""} d="${path3(pts, true)}"/>`; }
function winX(x0, x1, y, z0, z1, cols, rows) { // windows on a face of constant y
  const out = []; const w = (x1 - x0) / cols, h = (z1 - z0) / rows;
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    const a = x0 + c * w + w * 0.2, b = x0 + (c + 1) * w - w * 0.2, lo = z0 + r * h + h * 0.22, hi = z0 + (r + 1) * h - h * 0.22;
    out.push(pane([[a, y, lo], [b, y, lo], [b, y, hi], [a, y, hi]]));
  }
  return out.join("");
}
function winY(x, y0, y1, z0, z1, cols, rows) { // windows on a face of constant x
  const out = []; const w = (y1 - y0) / cols, h = (z1 - z0) / rows;
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    const a = y0 + c * w + w * 0.2, b = y0 + (c + 1) * w - w * 0.2, lo = z0 + r * h + h * 0.24, hi = z0 + (r + 1) * h - h * 0.24;
    out.push(pane([[x, a, lo], [x, b, lo], [x, b, hi], [x, a, hi]]));
  }
  return out.join("");
}
function doorX(x, w, y, h) { const o = [path3([[x, y, 0], [x, y, h], [x + w, y, h], [x + w, y, 0]])]; for (let z = 2.2; z < h; z += 2.2) o.push(path3([[x + 0.6, y, z], [x + w - 0.6, y, z]])); return o.join(""); }
function doorY(x, y, w, h) { const o = [path3([[x, y, 0], [x, y, h], [x, y + w, h], [x, y + w, 0]])]; for (let z = 2.2; z < h; z += 2.2) o.push(path3([[x, y + 0.6, z], [x, y + w - 0.6, z]])); return o.join(""); }
function lamp(x, y, z, on) {
  return S(k.cylinder(x, y, 1.6, z, 2.4, P, 10), { tone: "mid" }) + Dt([at([x, y, z + 3.6])], { size: on ? 1.3 : 0.7, tone: on ? "hi" : "lo", pulse: on });
}
function vent(x, y, z, r = 3) {
  return S(k.cylinder(x, y, r, z, 4, P, 20), { tone: "mid" }) + L(k.ring(x, y, r - 1, z + 4, P, 20), { tone: "lo" }) + L(k.sideArc(x, y, r, z + 2, P, 16), { tone: "faint" });
}
function crate(...a) { return withMaterial("timber", () => crateNow(...a)); } // timber, in the light theme's colour
function crateNow(x, y, z, s = 6, h = 5, tone = "hi") {
  const plan = { x, y, w: s, d: s, r: 0.6 };
  return S(slab(plan, z, h, 2, 0.3), { tone, crease: "lo" }) + L(k.lineOnTop([x + s / 2, y], [x + s / 2, y + s], z + h, P), { tone: "faint" });
}
function worker(x, y) {
  return `<path class="iso-halo" d="${k.haloOf({ x: x - 2, y: y - 2, w: 4, d: 4, r: 2 }, 0, 0.1, P)}" style="filter:blur(2px)"/>` +
    S(k.cylinder(x, y, 2.1, 0, 7.4, P, 18), { tone: "mid" }) + L(k.sideArc(x, y, 2.1, 4.2, P, 12), { tone: "lo" }) +
    S(G.sphereOf([x, y, 9.2], 1.8, P, { steps: 28 }), { tone: "hi", crease: "none" }) + S(k.cylinder(x, y, 2.2, 10.2, 0.8, P, 18), { tone: "hi" });
}
function workers(count, x0, y0, dx, dy, per, station) {
  if (!station) return;
  drawing(station, () => { for (let i = 0; i < count; i++) {
    const x = x0 + (i % per) * dx, y = y0 + Math.floor(i / per) * dy;
    onDeck({ x0: x - 2.3, x1: x + 2.3, y0: y - 2.3, y1: y + 2.3 }, 11, `<g data-station="${station}" data-worker>${worker(x, y)}</g>`);
  } });
}
const crew = (n, cap = 8) => Math.min(cap, crew7(n)); // workers at a station: the people who committed there this week
const LABELS = [];
const label = (x, y, text, along = "x") => LABELS.push({ x, y, text, along });

// ---------- platforms (the mark) and ground ----------
function ground() {
  const out = [`<path class="iso-halo" d="${k.haloOf(FLOOR, -FLOOR_H - 4, FLOOR_H, P)}"/>`];
  for (const [x, y] of k.corners(FLOOR, 26).sort((a, b) => k.depthOf([...a, 0], P) - k.depthOf([...b, 0], P))) {
    withMaterial("steel", () => { out.push(S(k.cylinder(x, y, 9, -FLOOR_H - 4, 2, P, 28), { tone: "lo" })); out.push(S(k.cylinder(x, y, 7, -FLOOR_H - 2, 2, P, 28), { tone: "mid" })); }); // the feet
  }
  withMaterial("board", () => out.push(S(slab(FLOOR, -FLOOR_H, FLOOR_H, 10, 1.6), { tone: "mid" }))); // the board the model stands on: a dark table in the light theme
  out.push(`<path class="ow-ground" d="${k.pathOf(k.ringOf(FLOOR, 10).map(([x, y]) => at([x, y, 0])), true)}"/>`);
  out.push(L(k.planOutline(k.insetPlan(FLOOR, 6), 0, P, 10), { tone: "lo" }));
  const grid = [];
  const LO = -RINGS, HI = 15 + RINGS;
  for (let i = LO; i <= HI; i++) grid.push(k.lineOnTop([X(i), Y(LO) - 10], [X(i), Y(HI) + 10], 0, P));
  for (let j = LO; j <= HI; j++) grid.push(k.lineOnTop([X(LO) - 10, Y(j)], [X(HI) + 10, Y(j)], 0, P));
  out.push(L(grid.join(""), { tone: "faint" }));
  const dots = [];
  for (let j = 0; j < 15; j++) for (let i = 0; i < 15; i++) if (LOGO[j][i] === "." ) dots.push(at([X(i) + C / 2, Y(j) + C / 2, 0]));
  out.push(Dt(dots, { size: 0.5, tone: "lo" }));
  out.push(...STREETS); // the quarter's roads
  const sc = k.corners(FLOOR, 14);
  out.push(L(sc.map(([x, y]) => k.ring(x, y, 2.6, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(Dt(sc.map(([x, y]) => at([x, y, 0])), { size: 0.55 }));
  // a ruler along the front edge: one tick per day of the 30-day window
  const strip = { x: X(0), y: Y(15 + RINGS) + 22, w: 300, d: 8, r: 1 };
  out.push(S(slab(strip, 0, 0.6, 3, 0), { tone: "lo", crease: "none" }));
  const t = k.topTicks(strip.x, strip.x + 300, 10, 7, strip.y + 0.8, 0.6, [2, 4], P);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  out.push(topText([readDir("x")[0] > 0 ? strip.x + 306 : strip.x - 6, strip.y + 7], 0.6, `${DATA.window?.days ?? 30} DAYS · ${stamp(DATA.days[0].at)} – ${stamp(DATA.days[DATA.days.length - 1].at)} ${new Date(DATA.days[DATA.days.length - 1].at * 1000).getUTCFullYear()}`, "x"));
  return out.join("");
}
function platforms() {
  STROKES.forEach(([a, b, c, d], n) => {
    const plan = { x: X(a), y: Y(b), w: (c - a + 1) * C, d: (d - b + 1) * C, r: 0 };
    const out = [S(slab(plan, 0, PZ, 2, 0.8), { tone: "mid" })];
    // deck joints every cell, a kerb line inset
    const joints = [];
    if (plan.w > C) for (let i = a + 1; i <= c; i++) joints.push(k.lineOnTop([X(i), plan.y + 1], [X(i), plan.y + plan.d - 1], PZ, P));
    if (plan.d > C) for (let j = b + 1; j <= d; j++) joints.push(k.lineOnTop([plan.x + 1, Y(j)], [plan.x + plan.w - 1, Y(j)], PZ, P));
    out.push(L(joints.join(""), { tone: "faint" }));
    out.push(N(k.sideSeam(plan, PZ - 0.6, P, 2), "c", 0.55));
    const lab = LABELS.filter((l) => l.x >= plan.x && l.x <= plan.x + plan.w && l.y >= plan.y && l.y <= plan.y + plan.d);
    for (const l of lab) out.push(topText([l.x, l.y], PZ, l.text, l.along));
    item(fpOf(plan), PZ, `<g data-stroke="${n}">${out.join("")}</g>`, { platform: true });
  });
}

// ---------- conveyors ----------
const RUNS = [];
// A run carries the work of the stations that feed it: one crate per commit this week, placed along the
// belt by the day it landed (0 = a week ago, 1 = now), so a busy day is a dense cluster. Commits by bots and
// routine accounts ride too, as their own count (bots: low dark totes): they move the belt but build nothing.
// The speed follows the rate, people and bots together.
function makeRun(id, station, feeds, axis, c, dir) {
  const W = DATA.window?.days ?? 30, events = [], bots = [];
  // each crate at its commit's real time in the week (at7); data without it spreads a day's commits over the day
  const place = (days, list) => { for (let kday = 0; kday < 7; kday++) { const cnt = days[W - 7 + kday] ?? 0; for (let m = 0; m < cnt; m++) list.push(Math.round(((kday + (m + 0.5) / cnt) / 7) * 1000) / 1000); } };
  for (const n of feeds) {
    if (RP[n]?.at7) events.push(...RP[n].at7); else place(RP[n]?.days ?? [], events);
    if (RP[n]?.botAt7) bots.push(...RP[n].botAt7); else place(RP[n]?.bots ?? [], bots);
  }
  events.sort((a, b) => a - b); bots.sort((a, b) => a - b);
  const run = { id, station, rate: feeds.reduce((t, n) => t + c7(n), 0), events, bots, axis, c, dir, segments: [] };
  RUNS.push(run);
  return run;
}
function belt(run, from, to, chunk = 34) { drawing(run.station, () => beltNow(run, from, to, chunk)); } // a belt is its station's (or scenery)
function beltNow(...a) { return withMaterial("steel", () => beltNowNow(...a)); } // steel, in the light theme's colour
function beltNowNow(run, from, to, chunk) {
  const width = 13, axis = run.axis;
  const len = to - from, pieces = Math.max(1, Math.ceil(len / chunk)), step = len / pieces;
  for (let i = 0; i < pieces; i++) {
    const a = from + i * step, b = a + step;
    const plan = axis === "x" ? { x: a, y: run.c - width / 2, w: b - a, d: width, r: 0.4 } : { x: run.c - width / 2, y: a, w: width, d: b - a, r: 0.4 };
    const out = [];
    const legs = [];
    for (let s = a + 3; s < b - 1; s += 16) for (const side of [-1, 1]) legs.push(axis === "x" ? [s, run.c + side * (width / 2 - 1)] : [run.c + side * (width / 2 - 1), s]);
    legs.sort((p, q) => k.depthOf([p[0], p[1], 0], P) - k.depthOf([q[0], q[1], 0], P));
    for (const [lx, ly] of legs) out.push(S(k.cylinder(lx, ly, 0.9, 0, 5.4, P, 12), { tone: "lo" }));
    const bed = axis === "x" ? { x: a, y: run.c - width / 2 + 1.6, w: b - a, d: width - 3.2, r: 0 } : { x: run.c - width / 2 + 1.6, y: a, w: width - 3.2, d: b - a, r: 0 };
    out.push(S(slab(bed, 5.4, 1.8, 2, 0), { tone: "lo", crease: "none" }));
    const rollers = [];
    for (let s = a + 2; s < b - 0.5; s += 3.2) rollers.push(axis === "x" ? k.lineOnTop([s, bed.y], [s, bed.y + bed.d], 7.2, P) : k.lineOnTop([bed.x, s], [bed.x + bed.w, s], 7.2, P));
    out.push(L(rollers.join(""), { tone: "faint" }));
    const r1 = axis === "x" ? { x: a, y: run.c - width / 2, w: b - a, d: 1.6, r: 0.3 } : { x: run.c - width / 2, y: a, w: 1.6, d: b - a, r: 0.3 };
    const r2 = axis === "x" ? { x: a, y: run.c + width / 2 - 1.6, w: b - a, d: 1.6, r: 0.3 } : { x: run.c + width / 2 - 1.6, y: a, w: 1.6, d: b - a, r: 0.3 };
    const [rf, rn] = dep(r1.x + r1.w / 2, r1.y + r1.d / 2) <= dep(r2.x + r2.w / 2, r2.y + r2.d / 2) ? [r1, r2] : [r2, r1];
    out.push(S(slab(rf, 5.4, 2.6, 2, 0.3), { tone: "mid" }));
    out.push(`<g data-belt="${run.id}" data-from="${a}" data-to="${b}"></g>`);
    out.push(S(slab(rn, 5.4, 2.6, 2, 0.3), { tone: "mid" }));
    out.push(N(axis === "x" ? k.lineOnTop([a + 0.5, rn.y + 0.8], [b - 0.5, rn.y + 0.8], 8, P) : k.lineOnTop([rn.x + 0.8, a + 0.5], [rn.x + 0.8, b - 0.5], 8, P), "c", 0.7));
    onDeck(fpOf(plan), 9, run.station ? `<g data-station="${run.station}" data-belt-of>${out.join("")}</g>` : `<g>${out.join("")}</g>`); // a belt lights with the station whose work it carries, and says so
  }
  run.segments.push({ from, to });
}

// ---------- stations ----------
const STATIONS = {};
const station = (id, info) => { if (id) STATIONS[id] = { ...info, what: info.what || RP[id]?.desc || "" }; };

// Assembly hall (the hall slot, the org's primary repository) on the inner west stroke, long along y: now an arcology with a spire
const HALL = {};
function hall(x0, y0, w, d) {
  const id = SLOT.hall, plan = { x: x0, y: y0, w, d, r: 2 };
  const H0 = 18, hMain = Math.max(H0 + 6, H(life(id))); // the spire carries the one scale; the podium is part of it
  ON = c7(id) > 0;
  const out = [`<path class="iso-halo" d="${k.haloOf(plan, 0, hMain, P)}"/>`];
  out.push(S(slab(plan, 0, H0, 4, 0.6), { tone: "mid", inner: L(k.sideSeam(plan, H0 - 4, P, 4), { tone: "lo" }) }));
  const x1 = plan.x + plan.w;
  out.push(ribbons(plan.x, x1, plan.y, plan.y + plan.d, 4, H0 - 5, "y", 4.5));
  out.push(L(doorX(plan.x + w / 2 - 7, 14, nearY(plan), 9), { tone: "mid" }));
  { const d = readDir("y")[1]; if (SIGN.hall) out.push(sign(SIGN.hall, [nearX(plan) + 0.2 * VX, d > 0 ? plan.y + plan.d - 40 : plan.y + 40], H0 - 6, "right", "c", 7)); }
  out.push(S(slab(k.insetPlan(plan, -0.6), H0, 1.2, 4, 0.3), { tone: "mid" }));
  // The arcology: one megastructure of three joined towers on a shared podium (a stepped tower, the spire with
  // the sky deck, and a stacked tower with the landing pad), bridged at two levels. The spire carries the one
  // scale on the hall's lifetime commits; the wings stand at fixed fractions of it.
  const seg = (plan.d - 12) / 3;
  const towers = [0, 1, 2].map((i) => ({ p: { x: plan.x + 4, y: plan.y + 4 + i * (seg + 2), w: plan.w - 10, d: seg - 6, r: 1 }, h: H0 + 1 + (hMain - H0) * [0.68, 1, 0.52][i] }));
  const seq = VY > 0 ? [0, 1, 2] : [2, 1, 0]; // far to near
  seq.forEach((i, s) => {
    const t = towers[i];
    const r = i === 1 ? rotunda(t.p.x + t.p.w / 2, t.p.y + t.p.d / 2, Math.min(t.p.w, t.p.d) / 2 - 1, t.h - H0, { mast: 40, on: c7(id) > 0, deck: true, crown: true })
      : i === 0 ? tower(t.p, t.h - H0, { flip: true, mast: 12, on: c7(id) > 0 }) : jenga(t.p, t.h - H0, { pad: true });
    if (i === 1) {
      HALL.crown = [r.crown[0], r.crown[1], r.crown[2] + H0 + 1.2 + PZ];
      // the mast array: two side masts beside the main one, and a beacon ring part way up it (scenery on the landmark; the height stays the spire's)
      const [mx, my, mz] = r.crown, base = mz - 40, rr = Math.min(t.p.w, t.p.d) / 2 - 1, s = rr * 0.42;
      r.svg += antenna(mx + s, my - s, base, 24, c7(id) > 0) + antenna(mx - s, my + s, base, 17, c7(id) > 0);
      r.svg += N(k.ring(mx, my, 2.6, base + 26, P, 20) + k.ring(mx, my, 2, base + 33, P, 16), "c", 0.7);
      r.svg += L(path3([[mx + s, my - s, base + 19], [mx, my, base + 22]]) + path3([[mx - s, my + s, base + 13], [mx, my, base + 16]]), { tone: "lo" });
    }
    if (i === 1 && FOUNDING_CORP.length) {
      // the founding corporate patrons, one per face of the crown's top drum (+x, +y, −x, −y); the two faces toward the camera are drawn
      const rr = Math.min(t.p.w, t.p.d) / 2 - 1, hgt = t.h - H0, drum = hgt > 80 ? rr * 0.56 : hgt > 40 ? rr * 0.7 : rr, z0 = hgt > 80 ? hgt * 0.8 : hgt > 40 ? hgt * 0.66 : 5;
      const cx = t.p.x + t.p.w / 2, cy = t.p.y + t.p.d / 2, z = H0 + 1.2 + z0 + (hgt - z0) * 0.45;
      const faces = [[VX > 0 ? 0 : 2, [cx + VX * (drum + 0.6), cy], "right"], [VY > 0 ? 1 : 3, [cx, cy + VY * (drum + 0.6)], "left"]];
      for (const [idx, c, face] of faces) if (FOUNDING_CORP[idx]) {
        const nm = FOUNDING_CORP[idx], g = glowOf(nm), lg = logoOf(nm);
        out.push(signCentered(nm.toUpperCase(), c, z, face, "c", 3, g));
        if (lg) { const s = face === "right" ? readDir("y")[1] : readDir("x")[0], P3 = (u, v) => (face === "right" ? [c[0], c[1] + u, v] : [c[0] + u, c[1], v]); out.push(logo(lg, P3(-s * 3, z + 9.5), P3(s * 3, z + 9.5), P3(-s * 3, z + 3.5), g)); } // its logo above the name
      }
      FOUNDING_CORP.forEach((nm) => { PATRON_AT[nm] = [cx, cy, z + PZ]; }); // every face, drawn or not, is on the crown
    }
    if (i === 2) HALL.pad = [r.roof[0], r.roof[1], r.roof[2] + H0 + 1.2 + PZ];
    out.push(`<g transform="${k.translateAlong(P, [0, 0, H0 + 1.2])}">${r.svg.replace(/<path class="iso-halo"[^>]*>/, "")}</g>`);
    if (s < 2) { // sky bridge to the next tower toward the camera
      const a = Math.min(i, seq[s + 1]), b = Math.max(i, seq[s + 1]);
      const lowH = Math.min(towers[a].h, towers[b].h) - H0, by0 = towers[a].p.y + towers[a].p.d, by1 = towers[b].p.y;
      for (const [f, wdt] of [[0.3, 12], [0.72, 8]]) {
        const zb = H0 + lowH * f, bp = { x: t.p.x + t.p.w / 2 - wdt / 2, y: by0 - 1, w: wdt, d: by1 - by0 + 2, r: 0.4 };
        out.push(S(slab(bp, zb, 5, 2, 0.3), { tone: "hi", crease: "lo" }));
        out.push(ribbons(bp.x, bp.x + bp.w, bp.y, bp.y + bp.d, zb + 0.2, zb + 5, "y", 3));
      }
    }
  });
  ON = false;
  onDeck(fpOf(plan), hMain + 34, `<g data-station="${id}">${out.join("")}</g>`);
  landmark("hall", "The org's main repository: one arcology of three joined towers. Every workshop's output ends up here.");
}

function press(cx, cy) {
  const id = SLOT.press, plan = { x: cx - 20, y: cy - 18, w: 40, d: 36, r: 1.5 };
  const out = [`<path class="iso-halo" d="${k.haloOf(plan, 0, 20, P)}"/>`];
  out.push(S(slab(plan, 0, 10, 3, 0.8), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(plan, 4), 10, P, 3), { tone: "faint" }));
  out.push(screws(plan, 10, 3));
  const top = Math.max(20, H(life(id))); // the head of the press stands at the one scale
  const cols = [[plan.x + 3, plan.y + 3], [plan.x + plan.w - 9, plan.y + 3], [plan.x + 3, plan.y + plan.d - 9], [plan.x + plan.w - 9, plan.y + plan.d - 9]];
  const col = (x, y) => S(slab({ x, y, w: 6, d: 6, r: 0.6 }, 10, top - 10, 2, 0.3), { tone: "mid" });
  const cs = byDepth(cols, ([x, y]) => [x + 3, y + 3]);
  out.push(col(...cs[0]), col(...cs[1]), col(...cs[2]));
  out.push(S(slab({ x: cx - 9, y: cy - 8, w: 18, d: 16, r: 0.8 }, 10, 4, 2, 0.4), { tone: "lo" }));
  out.push(`<g data-part="ram">${S(slab({ x: cx - 10, y: cy - 9, w: 20, d: 18, r: 0.8 }, 20, 6, 2, 0.4), { tone: "hi", crease: "lo" })}${S(k.cylinder(cx, cy, 3, 26, top - 27, P, 20), { tone: "mid", crease: "none" })}</g>`);
  out.push(col(...cs[3]));
  const head = { x: plan.x + 1.5, y: plan.y + 1.5, w: plan.w - 3, d: plan.d - 3, r: 1 };
  out.push(S(slab(head, top, 7, 3, 0.6), { tone: "mid" }));
  out.push(screws(head, top + 7, 4));
  out.push(N(path3([[farX(head), nearY(head), top + 1], [nearX(head), nearY(head), top + 1], [nearX(head), farY(head), top + 1]]), "a"));
  out.push(vent(plan.x + 30, plan.y + 26, top + 7, 3.4));
  out.push(lamp(plan.x + 8, plan.y + 28, top + 7, c7(id) > 0));
  onDeck(fpOf(plan), top + 14, `<g data-station="${id}">${out.join("")}</g>`);
  landmark("press", "A build pipeline. The ram works faster the more commits landed this week.");
}

let PLATTER;
function discPress(cx, cy) {
  const id = SLOT.disc, plan = { x: cx - 18, y: cy - 16, w: 36, d: 32, r: 2 };
  const h = H(life(id));
  const out = [`<path class="iso-halo" d="${k.haloOf(plan, 0, h, P)}"/>`];
  out.push(S(slab(plan, 0, h, 4, 0.8), { tone: "mid", inner: L(k.sideSeam(plan, h - 4, P, 4), { tone: "lo" }) }));
  const fy = nearY(plan);
  out.push(L(path3([[plan.x + 4, fy, 4], [plan.x + 14, fy, 4], [plan.x + 14, fy, h - 7], [plan.x + 4, fy, h - 7]], true), { tone: "lo" }));
  out.push(Dt([at([plan.x + 22, fy, h - 9]), at([plan.x + 26, fy, h - 9])], { size: 0.6, tone: "hi" }));
  PLATTER = [cx, cy, h + 2];
  out.push(S(k.cylinder(cx, cy, 13, h, 2, P, 64, 0.5), { tone: "hi", crease: "lo" }));
  const ticks = k.radialTicks(cx, cy, 12, 48, 6, h + 2, [1, 2.2], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(L(k.ring(cx, cy, 4, h + 2, P, 32), { tone: "mid" }));
  out.push(`<path data-part="platter" class="iso-line" data-tone="lit" data-free="end" d="" style="stroke-width:1"/>`);
  out.push(S(k.cylinder(cx, cy, 1.6, h + 2, 2, P, 16), { tone: "mid" }));
  out.push(N(k.ring(cx, cy, 13, h + 2, P, 64), "m", 0.9));
  out.push(lamp(plan.x + plan.w - 4, plan.y + 4, h, c7(id) > 0));
  onDeck(fpOf(plan), h + 6, `<g data-station="${id}">${out.join("")}</g>`);
  landmark("disc", "A release image. The platter turns faster the more it changed this week.");
}

function rack(x0, y0) { // dispatch: a shelf rack as tall as its lifetime commits, one shelf every 13 units, stocked full
  const id = SLOT.dispatch, plan = { x: x0, y: y0, w: 40, d: 40, r: 1 };
  const out = [], top = H(life(id)), shelves = []; for (let z = 0.6; z < top - 8; z += 13) shelves.push(z);
  const posts = byDepth([[plan.x, plan.y], [plan.x + plan.w - 3, plan.y], [plan.x, plan.y + plan.d - 3], [plan.x + plan.w - 3, plan.y + plan.d - 3]]);
  const post = ([x, y]) => S(slab({ x, y, w: 3, d: 3, r: 0.4 }, 0, top, 2, 0.2), { tone: "mid" });
  out.push(post(posts[0]), post(posts[1]), post(posts[2]));
  for (const z of shelves) {
    out.push(S(slab({ x: plan.x + 0.5, y: plan.y + 0.5, w: plan.w - 1, d: plan.d - 1, r: 0.4 }, z, 1.2, 2, 0.2), { tone: "mid" }));
    const spots = []; for (let yy = plan.y + 4; yy < plan.y + plan.d - 9; yy += 11) for (let xx = plan.x + 4; xx < plan.x + plan.w - 9; xx += 11) spots.push([xx, yy]);
    for (const [xx, yy] of byDepth(spots)) out.push(S(slab({ x: xx, y: yy, w: 8, d: 8, r: 0.4 }, z + 1.2, 8, 2, 0.3), { tone: "lo", crease: "faint" })); // containers: part of the rack's form, not a count
  }
  out.push(post(posts[3]));
  out.push(S(slab(plan, top, 1.4, 2, 0.2), { tone: "mid" }));
  out.push(N(k.planOutline(plan, top + 1.4, P, 2), "c"));
  out.push(lamp(plan.x + 4, plan.y + 4, top + 1.4, c7(id) > 0));
  onDeck(fpOf(plan), top + 6, `<g data-station="${id}">${out.join("")}</g>`);
  ROOF[id] = [plan.x + plan.w / 2, plan.y + plan.d / 2, PZ + top];
  landmark("dispatch", "What ships the org's work out.");
}

// the truck stands on the ground in the gap of the outer ring, nose out
function truck(x0, y0) {
  const out = [];
  const w = 28, len = 66;
  const wheel = (x, y) => S(G.disc(0, 3, 4.2, G.frameOf([x, y, 4.2], [1, 0, 0], [0, 1, 0], [0, 0, 1]), P), { tone: "lo" });
  const tr = { x: x0, y: y0, w, d: len, r: 1 };
  out.push(`<path class="iso-halo" d="${k.haloOf(tr, 0, 30, P)}"/>`);
  const farW = VX > 0 ? x0 - 0.5 : x0 + w - 2.5, nearW = VX > 0 ? x0 + w - 2.5 : x0 - 0.5;
  for (const y of [y0 + 8, y0 + 18, y0 + 56]) out.push(wheel(farW, y));
  const box = { x: x0, y: y0, w, d: 46, r: 0.6 };
  out.push(S(slab(box, 6, 28, 2, 0.4), { tone: "hi", crease: "lo", inner: L(k.sideSeam(box, 10, P, 2), { tone: "faint" }) }));
  const fx = nearX(box), ribs = []; for (let y = y0 + 4; y < y0 + 46; y += 4) ribs.push(path3([[fx, y, 10], [fx, y, 33]]));
  const cab = { x: x0 + 1, y: y0 + 48, w: w - 2, d: 17, r: 2 }, cfx = nearX(cab);
  const parts = [() => S(slab(box, 6, 28, 2, 0.4), { tone: "hi", crease: "lo", inner: L(k.sideSeam(box, 10, P, 2), { tone: "faint" }) }) + L(ribs.join(""), { tone: "faint" }) + (VY < 0 ? L(path3([[x0 + 4, y0, 8], [x0 + w - 4, y0, 8], [x0 + w - 4, y0, 32], [x0 + 4, y0, 32]], true) + path3([[x0 + w / 2, y0, 8], [x0 + w / 2, y0, 32]]), { tone: "lo" }) : ""),
    () => S(slab(cab, 6, 18, 3, 0.5), { tone: "mid" }) + (VY > 0 ? L(path3([[x0 + 5, y0 + 65, 14], [x0 + w - 5, y0 + 65, 14], [x0 + w - 5, y0 + 65, 21], [x0 + 5, y0 + 65, 21]], true), { tone: "lo" }) : "") + L(path3([[cfx, y0 + 56, 14], [cfx, y0 + 62, 14], [cfx, y0 + 62, 21], [cfx, y0 + 56, 21]], true), { tone: "lo" })];
  (VY > 0 ? parts : parts.slice().reverse()).forEach((f) => out.push(f()));
  for (const y of [y0 + 8, y0 + 18, y0 + 56]) out.push(wheel(nearW, y));
  item(fpOf(tr), 34, out.join(""), { ground: true }); // scenery: dispatch's truck carries no count
}


// ---- cyberpunk architecture ----
function ribbons(x0, x1, y0, y1, z0, z1, face, floor = 5) { // horizontal window bands on the +y (face "x") or +x (face "y") face
  const out = [];
  for (let z = z0 + 1.6; z + 2.2 < z1; z += floor) {
    const fy = VY > 0 ? y1 : y0, fx = VX > 0 ? x1 : x0;
    if (face === "x") out.push(pane([[x0 + 1.4, fy, z], [x1 - 1.4, fy, z], [x1 - 1.4, fy, z + 2.2], [x0 + 1.4, fy, z + 2.2]]));
    else out.push(pane([[fx, y0 + 1.4, z], [fx, y1 - 1.4, z], [fx, y1 - 1.4, z + 2.2], [fx, y0 + 1.4, z + 2.2]]));
  }
  return out.join("");
}
function tier(p, z0, z1, style, tone = "hi") {
  const out = [S(slab(p, z0, z1 - z0, 3, 0.5), { tone, crease: "lo" })];
  const x1 = p.x + p.w, y1 = p.y + p.d, hgt = z1 - z0;
  if (style === "ribbon") { out.push(ribbons(p.x, x1, p.y, y1, z0 + 2, z1 - 2, "x")); out.push(ribbons(p.x, x1, p.y, y1, z0 + 2, z1 - 2, "y")); }
  else if (hgt > 8) {
    out.push(winX(p.x + 1, x1 - 1, nearY(p), z0 + 2, z1 - 2, Math.max(2, Math.round(p.w / 6)), Math.max(1, Math.round(hgt / 6))));
    out.push(winY(nearX(p), p.y + 1, y1 - 1, z0 + 2, z1 - 2, Math.max(1, Math.round(p.d / 6)), Math.max(1, Math.round(hgt / 6))));
  }
  out.push(S(slab(k.insetPlan(p, -0.6), z1, 1.2, 3, 0.3), { tone: "mid" }));
  return out.join("");
}
function antenna(x, y, z, len, on) {
  const out = [S(k.cylinder(x, y, 0.8, z, len, P, 10), { tone: "mid", crease: "none" })];
  out.push(L([0.45, 0.7].map((f) => path3([[x - 2.6, y, z + len * f], [x + 2.6, y, z + len * f]])).join(""), { tone: "mid" }));
  out.push(Dt([at([x, y, z + len + 0.8])], { size: on ? 1.2 : 0.7, tone: on ? "hi" : "lo", pulse: on }));
  return out.join("");
}
function acUnit(x, y, z) {
  const p = { x, y, w: 6, d: 5, r: 0.5 };
  return S(slab(p, z, 3.4, 2, 0.3), { tone: "mid" }) + L(k.ring(x + 3, y + 2.5, 1.6, z + 3.4, P, 14), { tone: "lo" });
}
function dish(x, y, z) {
  const [tx, ty] = k.towardViewer(P), a = [tx * 0.55 / 0.7071, ty * 0.55 / 0.7071, 0.63], n = Math.hypot(...a);
  const F = G.frameOf([x, y, z + 3], a.map((v) => v / n), [ty, -tx, 0], [-tx * 0.39 / 0.7071, -ty * 0.39 / 0.7071, 0.84]);
  return S(k.cylinder(x, y, 0.6, z, 3, P, 8), { tone: "mid" }) + S(G.solidOf([[0, 4], [1, 2.6, 1], [1.5, 0.6]], F, P), { tone: "hi", crease: "lo" });
}
function blade(x, y, z, hgt, d = 8) { // a sign blade standing off the near x face, brackets back to the wall
  const p = { x, y, w: 1.4, d, r: 0.2 }, out = [];
  const bx = VX > 0 ? x - 3 : x + 1.4, br = (zz) => S(slab({ x: bx, y: y + d / 2 - 0.6, w: 3, d: 1.2, r: 0.1 }, zz, 1, 2, 0), { tone: "mid" });
  out.push(br(z + hgt * 0.3), br(z + hgt * 0.75));
  out.push(S(slab(p, z, hgt, 2, 0), { tone: "hi", crease: "lo" }));
  const fx = nearX(p), marks = []; for (let zz = z + 2; zz < z + hgt - 1.5; zz += 3) marks.push(path3([[fx, y + 1.6, zz], [fx, y + d - 1.6, zz]]));
  out.push(L(marks.join(""), { tone: "mid" }));
  return out.join("");
}
// a stepped tower: podium, setback tiers, terrace clutter, sign blade and a roof mast
function tower(plan, h, opts = {}) {
  const out = [`<path class="iso-halo" d="${k.haloOf(plan, 0, h, P)}"/>`];
  out.push(S(slab(plan, 0, 5, 3, 0.5), { tone: "mid" }));
  const n = h > 70 ? 3 : h > 36 ? 2 : 1;
  const cuts = n === 3 ? [5, h * 0.52, h * 0.8, h] : n === 2 ? [5, h * 0.64, h] : [5, h];
  const tiers = [];
  const w0 = plan.w - (opts.blade ? 8 : 3);
  let p = { x: VX > 0 ? plan.x + 1.5 : plan.x + plan.w - 1.5 - w0, y: plan.y + 1.5, w: w0, d: plan.d - 3, r: 1 };
  for (let t = 0; t < n; t++) {
    tiers.push({ p, z0: cuts[t], z1: cuts[t + 1] });
    const w = Math.max(8, p.w * 0.68), d = Math.max(8, p.d * 0.72);
    p = { x: backX(p, 0.5, w), y: backY(p, 0.5, d), w, d, r: 1 };
  }
  tiers.forEach((t, i) => out.push(tier(t.p, t.z0, t.z1, (i + (opts.flip ? 1 : 0)) % 2 ? "grid" : "ribbon", opts.tone)));
  // terraces: units on each setback, in front of the tier above
  for (let i = 0; i < tiers.length - 1; i++) {
    const t = tiers[i], up = tiers[i + 1], z = t.z1 + 1.2;
    const gx = Math.abs(nearX(t.p) - nearX(up.p)), gy = Math.abs(nearY(t.p) - nearY(up.p));
    const ax = VX > 0 ? nearX(up.p) + 1 : nearX(up.p) - 7, ay = VY > 0 ? nearY(up.p) + 1 : nearY(up.p) - 6;
    if (gx > 7) out.push(acUnit(ax, backY(t.p, 2, 5), z));
    if (gy > 6) out.push(acUnit(backX(t.p, 2, 6), ay, z));
    if (gx > 7 && gy > 6) out.push(dish(ax + 3, ay + 3, z));
  }
  const top = tiers[tiers.length - 1], tz = top.z1 + 1.2;
  if (top.p.w > 12) out.push(acUnit(backX(top.p, 1.5, 6), backY(top.p, 1.5, 5), tz));
  const t0 = tiers[0].p;
  if (opts.blade) out.push(blade(VX > 0 ? nearX(t0) + 3 : nearX(t0) - 4.4, inY(t0, 4, 8), Math.max(8, h * 0.18), Math.min(30, h * 0.42)));
  out.push(antenna(inX(top.p, 3), inY(top.p, 3), tz, opts.mast ?? Math.min(22, 6 + h * 0.18), !!opts.on));
  if (opts.sign) { const d = readDir("x")[0]; out.push(sign(opts.sign, [d > 0 ? t0.x + 2 : t0.x + t0.w - 2, nearY(t0) + 0.2 * VY], Math.min(tiers[0].z1 - 3, 16), "left", "c", 5.5)); }
  return { svg: out.join(""), top: tz + (opts.mast ?? Math.min(22, 6 + h * 0.18)) + 2 };
}
const ROOF = {};
function shop(id, plan, opts = {}) {
  if (!id) return 0;
  const h = H(life(id));
  ROOF[id] = [plan.x + plan.w / 2, plan.y + plan.d / 2, PZ + h];
  const t = withOn(c7(id) > 0, () => tower(plan, h, { blade: plan.w > 30, sign: opts.sign, on: c7(id) > 0, tone: opts.tone, flip: opts.flip }));
  onDeck(fpOf(plan), t.top, `<g data-station="${id}">${t.svg}</g>`);
  return h;
}


// ======== the new city: more kinds of building ========
function cylBand(cx, cy, r, z0, z1, cls = "ow-win", trim = 0.12) { // a window band wrapped round the visible half of a cylinder
  const [vx, vy] = k.towardViewer(P), f = Math.atan2(vy, vx), n = 18, a0 = f - Math.PI / 2 + trim, a1 = f + Math.PI / 2 - trim;
  const lo = [], hi = [];
  for (let s = 0; s <= n; s++) { const a = a0 + ((a1 - a0) * s) / n; lo.push([cx + r * Math.cos(a), cy + r * Math.sin(a), z0]); hi.push([cx + r * Math.cos(a), cy + r * Math.sin(a), z1]); }
  return `<path class="${cls}" data-hue="${hueAt(cx, cy, z0)}"${ON ? ' data-on=""' : ""}${flick(cx, cy, z0)} d="${path3(lo.concat(hi.reverse()), true)}"/>`;
}
function flick(x, y, z) { const v = hash(x, y, z); return v < 0.07 ? ` data-flick="${Math.floor(v * 100) % 4}"` : ""; }
function steam(x, y, z, n = 3, size = 3) { // a plume that drifts up in screen space
  if (MODE3D) return `<path class="ow-steam3" data-size="${size}" d="${k.pathOf([[x, y, z]])}"/>`;
  const [sx, sy] = at([x, y, z]);
  let o = `<g class="ow-steam" aria-hidden="true">`;
  for (let i = 0; i < n; i++) o += `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${(size * (0.8 + 0.3 * i)).toFixed(1)}" style="animation-delay:${(-i * 1.4 - hash(x, y) * 3).toFixed(2)}s"/>`;
  return o + `</g>`;
}
function warn(x, y, z) { return Dt([at([x, y, z])], { size: 1, tone: "hi", pulse: true }); }
// a round tower: stacked drums with wrap-round window bands, a crown and a mast
function rotunda(cx, cy, r, h, opts = {}) {
  const out = [`<path class="iso-halo" d="${k.haloOf({ x: cx - r - 2, y: cy - r - 2, w: 2 * r + 4, d: 2 * r + 4, r: r + 2 }, 0, h, P)}"/>`];
  out.push(S(k.cylinder(cx, cy, r + 2, 0, 5, P, 36), { tone: "mid" }));
  const drums = h > 80 ? [[5, h * 0.46, r], [h * 0.46, h * 0.8, r * 0.78], [h * 0.8, h, r * 0.56]] : h > 40 ? [[5, h * 0.66, r], [h * 0.66, h, r * 0.7]] : [[5, h, r]];
  drums.forEach(([z0, z1, rr], i) => {
    out.push(S(k.cylinder(cx, cy, rr, z0, z1 - z0, P, 36), { tone: opts.tone || "hi", crease: "lo" }));
    for (let z = z0 + 2.4; z + 2.2 < z1 - 1; z += 4.6) out.push(cylBand(cx, cy, rr, z, z + 2.2));
    out.push(S(k.cylinder(cx, cy, rr + 0.8, z1, 1.2, P, 36), { tone: "mid" })); // ring balcony
    if (opts.crown && i === drums.length - 1) { // the crown deck: a wide glazed disc at the top of the spire, with a neon rim and lamps
      out.push(S(k.cylinder(cx, cy, rr * 1.55, z1 + 1.2, 2.6, P, 48), { tone: "hi", crease: "lo" }));
      out.push(cylBand(cx, cy, rr * 1.55, z1 + 1.7, z1 + 3.3, "ow-win", 0.05));
      out.push(N(k.sideArc(cx, cy, rr * 1.55, z1 + 3.8, P, 40), "c", 0.8));
      out.push(Dt([0, 1, 2, 3, 4, 5, 6, 7].map((q) => at([cx + Math.cos(q * 0.785) * rr * 1.42, cy + Math.sin(q * 0.785) * rr * 1.42, z1 + 4])), { size: 0.7, tone: "hi", pulse: true }));
    }
    if (i < drums.length - 1) {
      if (opts.deck && i === 0) { // a sky deck: a wide disc with a glazed rim and a neon edge
        out.push(S(k.cylinder(cx, cy, rr * 1.75, z1 + 1.2, 3.2, P, 48), { tone: "hi", crease: "lo" }));
        out.push(cylBand(cx, cy, rr * 1.75, z1 + 1.8, z1 + 3.8, "ow-win", 0.05));
        out.push(N(k.sideArc(cx, cy, rr * 1.75, z1 + 4.4, P, 40), "c", 0.8));
        out.push(Dt([0, 1, 2, 3, 4, 5].map((q) => at([cx + Math.cos(q * 1.047) * rr * 1.6, cy + Math.sin(q * 1.047) * rr * 1.6, z1 + 4.6])), { size: 0.7, tone: "hi", pulse: true }));
      } else { const [tx, ty] = k.towardViewer(P); out.push(acUnit(cx + tx * (rr * 0.8) - 3, cy + ty * (rr * 0.8) - 2.5, z1 + 1.2)); }
    }
  });
  const top = drums[drums.length - 1], tz = top[1] + 1.2;
  out.push(S(G.solidOf([[0, top[2] * 0.7], [2, top[2] * 0.62, 1], [4.5, top[2] * 0.3, 1], [6, 0.6]], G.frameOf([cx, cy, tz], [0, 0, 1], [1, 0, 0], [0, 1, 0]), P), { tone: "mid", crease: "lo" }));
  const mast = opts.mast ?? Math.min(30, 8 + h * 0.15);
  out.push(antenna(cx, cy, tz + 5.5, mast, !!opts.on));
  if (h > 60) out.push(warn(cx, cy, tz + 5.5 + mast + 1.5));
  return { svg: out.join(""), top: tz + 6 + mast + 2, crown: [cx, cy, tz + 6 + mast] };
}
// a jenga tower: floors shifted back and forth, each one a cantilever
function jenga(plan, h, opts = {}) {
  const out = [`<path class="iso-halo" d="${k.haloOf(plan, 0, h, P)}"/>`];
  out.push(S(slab(plan, 0, 4, 3, 0.5), { tone: "mid" }));
  const fh = 7, n = Math.max(3, Math.floor((h - 4) / fh));
  for (let i = 0; i < n; i++) {
    const z = 4 + i * fh, s = (i % 2 ? 1 : -1) * 3, alongX = (i >> 1) % 2 === 0;
    const p = { x: plan.x + 3 + (alongX ? s : 0), y: plan.y + 3 + (alongX ? 0 : s), w: plan.w - 6, d: plan.d - 6, r: 0.6 };
    out.push(S(slab(p, z, fh - 0.6, 3, 0.4), { tone: i % 3 === 2 ? "mid" : opts.tone || "hi", crease: "lo" }));
    out.push(ribbons(p.x, p.x + p.w, p.y, p.y + p.d, z + 0.4, z + fh - 0.6, i % 2 ? "x" : "y", 6));
    out.push(ribbons(p.x, p.x + p.w, p.y, p.y + p.d, z + 0.4, z + fh - 0.6, i % 2 ? "y" : "x", 6));
  }
  const tz = 4 + n * fh, tp = { x: plan.x + 6, y: plan.y + 6, w: plan.w - 12, d: plan.d - 12, r: 0.6 };
  out.push(acUnit(backX(tp, 1, 6), backY(tp, 1, 5), tz), acUnit(inX(tp, 2, 6), backY(tp, 1, 5), tz));
  if (opts.pad) out.push(pad(plan.x + plan.w / 2, plan.y + plan.d / 2, tz, Math.min(plan.w, plan.d) * 0.32));
  else out.push(antenna(inX(tp, 3), inY(tp, 3), tz, 14, !!opts.on));
  return { svg: out.join(""), top: tz + 16, roof: [plan.x + plan.w / 2, plan.y + plan.d / 2, tz] };
}
// a landing pad for drones
function pad(cx, cy, z, r) {
  const out = [S(k.cylinder(cx, cy, r, z, 1.4, P, 28), { tone: "mid" })];
  out.push(L(k.ring(cx, cy, r - 1.4, z + 1.4, P, 28), { tone: "lo" }));
  out.push(L(k.lineOnTop([cx - r * 0.35, cy - r * 0.4], [cx - r * 0.35, cy + r * 0.4], z + 1.4, P) + k.lineOnTop([cx + r * 0.35, cy - r * 0.4], [cx + r * 0.35, cy + r * 0.4], z + 1.4, P) + k.lineOnTop([cx - r * 0.35, cy], [cx + r * 0.35, cy], z + 1.4, P), { tone: "mid" }));
  out.push(Dt([0, 1, 2, 3].map((q) => at([cx + Math.cos(q * Math.PI / 2 + 0.785) * (r - 0.6), cy + Math.sin(q * Math.PI / 2 + 0.785) * (r - 0.6), z + 1.6])), { size: 0.6, tone: "hi", pulse: true }));
  return out.join("");
}
// a megablock: a dense grid of shafts at different heights, capsules bolted to the faces that show
function megablock(plan, h, opts = {}) {
  const out = [`<path class="iso-halo" d="${k.haloOf(plan, 0, h, P)}"/>`];
  out.push(S(slab(plan, 0, 4, 3, 0.5), { tone: "mid" }));
  const cols = 3, rows = 3, cw = (plan.w - 4) / cols, cd = (plan.d - 4) / rows, cells = [];
  for (let a = 0; a < cols; a++) for (let b = 0; b < rows; b++) {
    const ch = 4 + (h - 4) * (0.45 + 0.55 * hash(plan.x + a, plan.y + b, h));
    cells.push({ p: { x: plan.x + 2 + a * cw, y: plan.y + 2 + b * cd, w: cw - 0.6, d: cd - 0.6, r: 0.4 }, h: ch });
  }
  let roof = null;
  for (const c of byDepth(cells, (c) => [c.p.x + c.p.w / 2, c.p.y + c.p.d / 2])) {
    out.push(S(slab(c.p, 4, c.h - 4, 3, 0.4), { tone: opts.tone || "hi", crease: "lo" }));
    out.push(winX(c.p.x + 0.6, c.p.x + c.p.w - 0.6, nearY(c.p), 6, c.h - 2, Math.max(2, Math.round(c.p.w / 4)), Math.max(1, Math.round((c.h - 8) / 4))));
    out.push(winY(nearX(c.p), c.p.y + 0.6, c.p.y + c.p.d - 0.6, 6, c.h - 2, Math.max(2, Math.round(c.p.d / 4)), Math.max(1, Math.round((c.h - 8) / 4))));
    // capsules bolted on the near faces
    for (let z = 10; z < c.h - 6; z += 9) {
      if (hash(c.p.x, z, 1) < 0.35) { const bx = VX > 0 ? nearX(c.p) : nearX(c.p) - 3.4; out.push(S(slab({ x: bx, y: c.p.y + 1 + hash(z, c.p.y) * (c.p.d - 7), w: 3.4, d: 5, r: 0.4 }, z, 4, 2, 0.3), { tone: "mid", crease: "lo" })); }
      if (hash(c.p.y, z, 2) < 0.35) { const by = VY > 0 ? nearY(c.p) : nearY(c.p) - 3.4; out.push(S(slab({ x: c.p.x + 1 + hash(z, c.p.x) * (c.p.w - 7), y: by, w: 5, d: 3.4, r: 0.4 }, z, 4, 2, 0.3), { tone: "mid", crease: "lo" })); }
    }
    if (c.p.w > 7) out.push(acUnit(c.p.x + c.p.w / 2 - 3, c.p.y + c.p.d / 2 - 2.5, c.h));
    if (!roof || c.h > roof[2]) roof = [c.p.x + c.p.w / 2, c.p.y + c.p.d / 2, c.h];
  }
  out.push(antenna(roof[0] + 2, roof[1] + 2, roof[2] + 3.4, 16, !!opts.on));
  return { svg: out.join(""), top: h + 22, roof };
}
// a cooling tower: a lathed hyperboloid with a plume
function cooler(...a) { return withMaterial("concrete", () => coolerNow(...a)); } // concrete, in the light theme's colour
function coolerNow(cx, cy, r, h) {
  const F = G.frameOf([cx, cy, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  const out = [`<path class="iso-halo" d="${k.haloOf({ x: cx - r, y: cy - r, w: 2 * r, d: 2 * r, r }, 0, h, P)}"/>`];
  out.push(S(G.solidOf([[0, r], [h * 0.3, r * 0.82, 1], [h * 0.62, r * 0.66, 1], [h * 0.86, r * 0.7, 1], [h, r * 0.76]], F, P), { tone: "hi", crease: "lo" }));
  out.push(L(k.sideArc(cx, cy, r * 0.98, 3, P, 24) + k.sideArc(cx, cy, r * 0.8, h * 0.32, P, 24), { tone: "lo" }));
  out.push(`<path class="ow-mouth" d="${k.pathOf(Array.from({ length: 28 }, (_, s) => at([cx + Math.cos(s / 28 * Math.PI * 2) * r * 0.7, cy + Math.sin(s / 28 * Math.PI * 2) * r * 0.7, h])), true)}"/>`);
  out.push(steam(cx, cy, h + 2, 4, r * 0.45));
  return { svg: out.join(""), top: h + 30 };
}
// a billboard spire: a thin shaft carrying a tall holo panel that faces the camera (the scenery form, no patrons)
function boardTower(...a) { return withMaterial("steel", () => boardTowerNow(...a)); } // steel, in the light theme's colour
function boardTowerNow(plan, h, text, ticker = true) {
  const out = [`<path class="iso-halo" d="${k.haloOf(plan, 0, h, P)}"/>`];
  const core = { x: plan.x + plan.w / 2 - 4, y: plan.y + plan.d / 2 - 4, w: 8, d: 8, r: 0.6 };
  out.push(S(slab(plan, 0, 6, 3, 0.5), { tone: "mid" }));
  out.push(S(slab(core, 6, h - 6, 3, 0.4), { tone: "hi", crease: "lo" }));
  out.push(ribbons(core.x, core.x + core.w, core.y, core.y + core.d, 8, h - 2, "x", 6), ribbons(core.x, core.x + core.w, core.y, core.y + core.d, 8, h - 2, "y", 6));
  // the panel hangs on the face nearest the camera, on whichever axis reads better
  const [tx, ty] = k.towardViewer(P), onY = Math.abs(ty) >= Math.abs(tx);
  const z0 = h * 0.5, z1 = h - 4, half = 22;
  const pts = onY ? [[core.x + 4 - half, nearY(core) + VY * 3, z0], [core.x + 4 + half, nearY(core) + VY * 3, z0], [core.x + 4 + half, nearY(core) + VY * 3, z1], [core.x + 4 - half, nearY(core) + VY * 3, z1]]
    : [[nearX(core) + VX * 3, core.y + 4 - half, z0], [nearX(core) + VX * 3, core.y + 4 + half, z0], [nearX(core) + VX * 3, core.y + 4 + half, z1], [nearX(core) + VX * 3, core.y + 4 - half, z1]];
  const glow = glowOf(text || "board"); // the board's hue, fixed by its words
  out.push(S(slab(onY ? { x: core.x + 4 - half - 0.8, y: VY > 0 ? nearY(core) + VY * 3 - 1.1 : nearY(core) + VY * 3 + 0.1, w: 2 * half + 1.6, d: 1, r: 0.2 } : { x: VX > 0 ? nearX(core) + VX * 3 - 1.1 : nearX(core) + VX * 3 + 0.1, y: core.y + 4 - half - 0.8, w: 1, d: 2 * half + 1.6, r: 0.2 }, z0 - 0.8, z1 - z0 + 1.6, 1, 0.1), { tone: "lo", crease: "none" })); // the bezel behind the screen
  out.push(`<path class="ow-holo" data-glow="${glow}" d="${path3(pts, true)}"/>`, N(path3(pts, true), "c", 0.8, glow));
  const d = readDir(onY ? "x" : "y"), ax = onY ? "x" : "y";
  const lines = text.split("\n");
  lines.forEach((t, i) => {
    const zz = z1 - 6 - i * ((z1 - z0 - 6) / lines.length);
    const s0 = onY ? [d[0] > 0 ? core.x + 4 - half + 2 : core.x + 4 + half - 2, nearY(core) + VY * 3.1] : [nearX(core) + VX * 3.1, d[1] > 0 ? core.y + 4 - half + 2 : core.y + 4 + half - 2];
    out.push(sign(t, s0, zz, ax === "x" ? "left" : "right", "c", ticker ? (i === 0 ? 6 : 4) : 4.4, glow).replace('<g class="ow-sign"', `<g class="ow-sign" data-screen=""${ticker && i === 1 ? ' data-ticker="board"' : ""}`));
  });
  out.push(warn(core.x + 4, core.y + 4, h + 1));
  return { svg: out.join(""), top: h + 4 };
}
// A patron megaboard, after Blade Runner's facade screens: a ribbed shaft with three screens bolted on the faces
// that show, one patron each. A wide screen high up with the patron's emblem and name, a tall portrait screen
// with the name stacked letter by letter, and a small screen low down. Every screen has a bezel, scanlines, a
// bracket rig back to the shaft and a neon edge in that patron's hue. The emblem is a plain geometric mark fixed
// by the name (the city has names, not logos), drawn in the same neon.
function emblemPts(name, cx, cz, r) { // the mark, in screen coordinates (u along the screen, v up)
  const kind = Math.floor(hash(name.length, name.charCodeAt(0), 7) * 5), n = [0, 3, 4, 6, 8][kind] || 0;
  if (!n) return [Array.from({ length: 25 }, (_, i) => [cx + Math.cos(i / 24 * Math.PI * 2) * r, cz + Math.sin(i / 24 * Math.PI * 2) * r])];
  const rot = kind === 2 ? Math.PI / 4 : Math.PI / 2, ring = Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos(rot + i / n * Math.PI * 2) * r, cz + Math.sin(rot + i / n * Math.PI * 2) * r]);
  const inner = Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos(rot + Math.PI / n + i / n * Math.PI * 2) * r * 0.45, cz + Math.sin(rot + Math.PI / n + i / n * Math.PI * 2) * r * 0.45]);
  return [ring, inner];
}
function patronBoard(...a) { return withMaterial("steel", () => patronBoardNow(...a)); } // steel, in the light theme's colour
function patronBoardNow(plan, h, names) {
  const out = [`<path class="iso-halo" d="${k.haloOf(plan, 0, h, P)}"/>`];
  const core = { x: plan.x + plan.w / 2 - 5, y: plan.y + plan.d / 2 - 5, w: 10, d: 10, r: 0.6 };
  out.push(S(slab(plan, 0, 6, 3, 0.5), { tone: "mid" }));
  out.push(S(slab(core, 6, h - 6, 3, 0.4), { tone: "hi", crease: "lo" }));
  const fins = []; for (let z = 10; z < h - 4; z += 3.2) fins.push(path3([[farX(core), nearY(core), z], [nearX(core), nearY(core), z], [nearX(core), farY(core), z]]));
  out.push(L(fins.join(""), { tone: "faint" }));
  out.push(S(slab(k.insetPlan(core, 1.5), h, 4, 2, 0.3), { tone: "mid", crease: "lo" }), antenna(core.x + 5, core.y + 5, h + 4, 16, true));
  // screens: [face, along-centre, width, z0, z1]; the wide and the small one on one face, the portrait on the other
  const fy = nearY(core) + VY * 2.6, fx = nearX(core) + VX * 2.6, ccx = core.x + 5, ccy = core.y + 5;
  { // the ticker band under the cap: the latest commits crawl across it (map3d.js redraws data-ticker signs)
    const bw = 40, bu0 = ccx - bw / 2, bu1 = ccx + bw / 2, bz0 = h - 4.6, bz1 = h - 1.2, rectY = (a, b, z, zz) => path3([[a, fy, z], [b, fy, z], [b, fy, zz], [a, fy, zz]], true);
    out.push(S(slab({ x: bu0 - 0.6, y: VY > 0 ? fy - 1.1 : fy + 0.1, w: bw + 1.2, d: 1, r: 0.2 }, bz0 - 0.6, bz1 - bz0 + 1.2, 1, 0.1), { tone: "lo", crease: "none" }));
    out.push(`<path class="ow-holo" data-glow="c" d="${rectY(bu0, bu1, bz0, bz1)}"/>`, N(rectY(bu0, bu1, bz0, bz1), "c", 0.6, "c"));
    const sgn = readDir("x")[0] > 0 ? 1 : -1;
    out.push(sign("·".repeat(17), [sgn > 0 ? bu0 + 1.5 : bu1 - 1.5, fy + VY * 0.1], bz0 + 0.8, "left", "c", 2.3).replace('<g class="ow-sign"', '<g class="ow-sign" data-ticker="wide" data-screen=""'));
  }
  // screens: [face, along-centre, width, z0, z1]; the wide and the small one on one face, the portrait on the other
  const screens = [["y", ccx, 40, h * 0.56, h - 6], ["x", ccy, 16, h * 0.16, h * 0.52], ["y", ccx, 30, h * 0.24, h * 0.47]];
  screens.forEach(([face, c, w, z0, z1], si) => {
    const name = names[si]; if (!name) return;
    drawing(patronId(name), () => {
    const start = out.length; // everything this screen draws goes into its own station group (below)
    const glow = glowOf(name), on = face === "y";
    const P3 = (u, v) => (on ? [u, fy, v] : [fx, u, v]), u0 = c - w / 2, u1 = c + w / 2;
    const rect = (a, b, z, zz) => path3([P3(a, z), P3(b, z), P3(b, zz), P3(a, zz)], true);
    // the rig: two brackets back to the shaft, top and bottom
    for (const zz of [z0 + 1.5, z1 - 1.5]) for (const uu of [u0 + 3, u1 - 3]) {
      const p = on ? { x: uu - 0.5, y: VY > 0 ? nearY(core) : fy, w: 1, d: 2.6, r: 0 } : { x: VX > 0 ? nearX(core) : fx, y: uu - 0.5, w: 2.6, d: 1, r: 0 };
      out.push(S(slab(p, zz - 0.5, 1, 1, 0), { tone: "mid", crease: "none" }));
    }
    out.push(S(slab(on ? { x: u0 - 0.8, y: VY > 0 ? fy - 1.1 : fy + 0.1, w: u1 - u0 + 1.6, d: 1, r: 0.2 } : { x: VX > 0 ? fx - 1.1 : fx + 0.1, y: u0 - 0.8, w: 1, d: u1 - u0 + 1.6, r: 0.2 }, z0 - 0.8, z1 - z0 + 1.6, 1, 0.1), { tone: "lo", crease: "none" })); // the bezel: a dark frame behind the screen
    out.push(`<path class="ow-holo" data-glow="${glow}" d="${rect(u0, u1, z0, z1)}"/>`);
    const scan = []; for (let z = z0 + 1.2; z < z1 - 0.6; z += 1.4) scan.push(path3([P3(u0 + 0.6, z), P3(u1 - 0.6, z)]));
    out.push(L(scan.join(""), { tone: "faint" }));
    out.push(L(rect(u0 - 0.6, u1 + 0.6, z0 - 0.6, z1 + 0.6), { tone: "mid" }), N(rect(u0, u1, z0, z1), "c", 0.8, glow));
    const up = name.toUpperCase();
    const dir = readDir(on ? "x" : "y"), sgn = (on ? dir[0] : dir[1]) > 0 ? 1 : -1, faceName = on ? "left" : "right";
    const startU = (pad) => (sgn > 0 ? u0 + pad : u1 - pad);
    if (si === 1) { // the portrait: the logo on top, then the name stacked letter by letter, like a vertical street sign
      const lg = logoOf(name), ls = Math.min(w - 3, 9), zt = lg ? z1 - ls - 2.5 : z1;
      if (lg) out.push(logo(lg, P3(c - sgn * ls / 2, z1 - 1.5), P3(c + sgn * ls / 2, z1 - 1.5), P3(c - sgn * ls / 2, z1 - 1.5 - ls), glow, true));
      const letters = up.replace(/[^A-Z0-9]/g, "").slice(0, Math.max(3, Math.floor((zt - z0 - 4) / 4.2))), size = Math.min(4.2, (zt - z0 - 4) / Math.max(1, letters.length));
      [...letters].forEach((ch, i) => { const at2 = on ? [c - sgn * size * 0.31, fy + VY * 0.1] : [fx + VX * 0.1, c - sgn * size * 0.31]; out.push(sign(ch, at2, zt - 2 - (i + 1) * size, faceName, "c", size, glow).replace('<g class="ow-sign"', '<g class="ow-sign" data-screen=""')); });
    } else {
      const er = Math.min(si === 0 ? 7 : 4, (z1 - z0) * 0.3), ec = startU(er + 2.4), zc = (z0 + z1) / 2, lg = logoOf(name); // the wide screen's mark is big
      if (lg) out.push(logo(lg, P3(ec - sgn * er, zc + er), P3(ec + sgn * er, zc + er), P3(ec - sgn * er, zc - er), glow, true)); // the logo, or without one an emblem fixed by the name
      else for (const ring of emblemPts(name, ec, zc, er)) out.push(N(path3(ring.map(([u, v]) => P3(u, v))), "c", 0.9, glow));
      const room = w - 2 * er - 6, size = Math.min(si === 0 ? 5.5 : 3.6, room / Math.max(4, up.length * 0.64));
      const at2 = on ? [startU(2 * er + 4.4), fy + VY * 0.1] : [fx + VX * 0.1, startU(2 * er + 4.4)];
      out.push(sign(up.slice(0, 22), at2, (z0 + z1) / 2 + (si === 0 ? 0.6 : -size * 0.35), faceName, "c", size, glow).replace('<g class="ow-sign"', '<g class="ow-sign" data-screen=""'));
      if (si === 0) { // the wide screen's second line crawls: the tier, the name and the link (map3d.js redraws data-ticker signs; data-crawl is its text)
        const m = (DATA.patrons ?? []).flatMap((t) => t.members ?? []).find((x) => x.name === name), link = (m?.href || PATRON_PAGE).replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
        const crawl = `${(PATRONS.boards?.label ?? "distinguished patron").toUpperCase()} · ${up}${link ? ` · ${link.toUpperCase()}` : ""}`.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
        const cs = Math.min(2.4, size * 0.46), n = Math.max(8, Math.floor(room / (cs * 0.64)));
        out.push(sign("·".repeat(n), at2, (z0 + z1) / 2 - size * 0.9, faceName, "c", cs, glow).replace('<g class="ow-sign"', `<g class="ow-sign" data-screen="" data-ticker="own" data-crawl="${crawl}"`));
      }
    }
    out.splice(start, out.length - start, `<g data-station="${patronId(name)}">${out.slice(start).join("")}</g>`);
    PATRON_AT[name] = on ? [c, fy, (z0 + z1) / 2] : [fx, c, (z0 + z1) / 2]; // the caller adds the board's ground level
    });
  });
  out.push(warn(core.x + 5, core.y + 5, h + 21));
  return { svg: out.join(""), top: h + 24 };
}
// a billboard gantry across the ring road: four pylons on the kerbs, a truss, and up to three screens in a row on
// the face toward the camera, one distinguished corporate patron each (the billboard row, past the towers' nine)
function gantryBoard(...a) { return withMaterial("steel", () => gantryBoardNow(...a)); } // steel, in the light theme's colour
function gantryBoardNow(plan, h, names) {
  const out = [`<path class="iso-halo" d="${k.haloOf(plan, 0, h + 18, P)}"/>`];
  const legs = byDepth(k.corners({ ...plan, r: 0 }, 0).map(([x, y]) => [Math.min(x, plan.x + plan.w - 2), Math.min(y, plan.y + plan.d - 2)]));
  for (const [x, y] of legs) out.push(S(slab({ x, y, w: 2, d: 2, r: 0.3 }, 0, h, 2, 0.2), { tone: "mid", crease: "none" }));
  out.push(S(slab({ x: plan.x, y: plan.y, w: plan.w, d: plan.d, r: 0.4 }, h, 2, 2, 0.3), { tone: "hi", crease: "lo" }));
  const diag = []; for (let x = plan.x; x < plan.x + plan.w - 4; x += 6) diag.push(path3([[x, nearY(plan), h], [x + 6, nearY(plan), h + 2]]));
  out.push(L(diag.join(""), { tone: "faint" }));
  const fy = nearY(plan) + VY * 0.6, w = (plan.w - 4) / 3, z0 = h + 2.5, z1 = h + 17;
  names.forEach((name, i) => drawing(patronId(name), () => {
    const start = out.length, glow = glowOf(name), u0 = plan.x + 2 + i * w + 1, u1 = u0 + w - 2;
    const rect = (a, b2, z, zz) => path3([[a, fy, z], [b2, fy, z], [b2, fy, zz], [a, fy, zz]], true);
    out.push(S(slab({ x: u0 - 0.8, y: VY > 0 ? fy - 1.1 : fy + 0.1, w: u1 - u0 + 1.6, d: 1, r: 0.2 }, z0 - 0.8, z1 - z0 + 1.6, 1, 0.1), { tone: "lo", crease: "none" })); // the bezel
    out.push(`<path class="ow-holo" data-glow="${glow}" d="${rect(u0, u1, z0, z1)}"/>`);
    const scan = []; for (let z = z0 + 1.2; z < z1 - 0.6; z += 1.4) scan.push(path3([[u0 + 0.6, fy, z], [u1 - 0.6, fy, z]]));
    out.push(L(scan.join(""), { tone: "faint" }), L(rect(u0 - 0.6, u1 + 0.6, z0 - 0.6, z1 + 0.6), { tone: "mid" }), N(rect(u0, u1, z0, z1), "c", 0.8, glow));
    const sgn = readDir("x")[0] > 0 ? 1 : -1, er = Math.min(3, (z1 - z0) * 0.28), ec = sgn > 0 ? u0 + er + 2 : u1 - er - 2;
    const lg = logoOf(name), zc = (z0 + z1) / 2;
    if (lg) out.push(logo(lg, [ec - sgn * er, fy, zc + er], [ec + sgn * er, fy, zc + er], [ec - sgn * er, fy, zc - er], glow, true));
    else for (const ring of emblemPts(name, ec, zc, er)) out.push(N(path3(ring.map(([u, v]) => [u, fy, v])), "c", 0.9, glow));
    const up = name.toUpperCase(), size = Math.min(3.4, (w - 2 * er - 8) / Math.max(4, up.length * 0.64)), su = sgn > 0 ? u0 + 2 * er + 3.6 : u1 - 2 * er - 3.6;
    out.push(sign(up.slice(0, 22), [su, fy + VY * 0.1], (z0 + z1) / 2 - size * 0.35, "left", "c", size, glow).replace('<g class="ow-sign"', '<g class="ow-sign" data-screen=""'));
    out.splice(start, out.length - start, `<g data-station="${patronId(name)}">${out.slice(start).join("")}</g>`);
    PATRON_AT[name] = [(u0 + u1) / 2, fy, (z0 + z1) / 2];
  }));
  return { svg: out.join(""), fp: fpOf(plan), top: z1 + 1 };
}
// a sky bridge between two buildings across a gap (its own painter item)
function skyBridge(x0, x1, y0, y1, z, axis) {
  const bp = axis === "x" ? { x: x0, y: y0, w: x1 - x0, d: y1 - y0, r: 0.3 } : { x: x0, y: y0, w: x1 - x0, d: y1 - y0, r: 0.3 };
  const out = [S(slab(bp, z, 5, 2, 0.3), { tone: "hi", crease: "lo" })];
  out.push(ribbons(bp.x, bp.x + bp.w, bp.y, bp.y + bp.d, z + 0.2, z + 5, axis === "x" ? "x" : "y", 3));
  out.push(N(axis === "x" ? k.lineOnTop([bp.x + 1, (bp.y + bp.y + bp.d) / 2], [bp.x + bp.w - 1, (bp.y + bp.y + bp.d) / 2], z + 5, P) : k.lineOnTop([(bp.x + bp.x + bp.w) / 2, bp.y + 1], [(bp.x + bp.x + bp.w) / 2, bp.y + bp.d - 1], z + 5, P), "c", 0.5));
  return { svg: out.join(""), fp: fpOf(bp), h: z + 5 };
}
// pick a building for a scenery lot
const PADS = [], LIGHTS = [];
function scenery(...a) { return withMaterial("concrete", () => sceneryNow(...a)); } // concrete, in the light theme's colour
function sceneryNow(lotX, lotY, n, maxH = SCENERY_MAX) {
  const { v, h: hgt, top } = sceneryPick(lotX, lotY, n, maxH); // grid.js: the layout reads the same pick
  const p = { x: lotX + 5, y: lotY + 5, w: 35, d: 35, r: 1 };
  let t;
  if (v < 0.22) { t = rotunda(p.x + 17.5, p.y + 17.5, 13, hgt, { tone: "mid" }); if (hgt > 50) LIGHTS.push(t.crown); }
  else if (v < 0.42) { const pd = hash(n, 3) < 0.5; t = jenga(p, hgt, { tone: "mid", pad: pd }); if (pd) PADS.push(t.roof); }
  else if (v < 0.62) t = megablock(p, hgt, { tone: "mid" });
  else if (v < 0.72) t = cooler(p.x + 17.5, p.y + 17.5, 15, top);
  else t = tower(p, hgt, { blade: hash(n, 7) < 0.5, flip: n % 2 === 1, tone: "mid" });
  return { ...t, fp: fpOf(p), h: hgt };
}

function pod(id, plan) {
  if (!id) return;
  const h = H(life(id)), out = [`<path class="iso-halo" d="${k.haloOf(plan, 0, h, P)}"/>`];
  ROOF[id] = [plan.x + plan.w / 2, plan.y + plan.d / 2, PZ + h];
  ON = c7(id) > 0;
  out.push(S(slab(plan, 0, 4, 3, 0.5), { tone: "mid" }));
  const n = Math.max(2, Math.round((h - 4) / 9)), ch = (h - 4) / n;
  for (let i = 0; i < n; i++) {
    const shift = i % 2 ? 3 : 0, z = 4 + i * ch;
    const p = { x: plan.x + 1 + shift, y: plan.y + 2 + (i % 3 === 2 ? 2 : 0), w: plan.w - 5, d: plan.d - 5, r: 1.5 };
    out.push(S(slab(p, z, ch - 0.8, 4, 0.6), { tone: "hi", crease: "lo" }));
    const y1 = nearY(p);
    out.push(pane([[p.x + 3, y1, z + 2], [p.x + p.w * 0.62, y1, z + 2], [p.x + p.w * 0.62, y1, z + ch - 2.6], [p.x + 3, y1, z + ch - 2.6]]));
    out.push(L(path3([[p.x + p.w * 0.7, y1, z + 2], [p.x + p.w * 0.7, y1, z + ch - 2.6]]) + path3([[p.x + p.w * 0.8, y1, z + 2], [p.x + p.w * 0.8, y1, z + ch - 2.6]]), { tone: "lo" }));
    out.push(S(slab({ x: VX > 0 ? p.x + p.w : p.x - 1.2, y: p.y + 3, w: 1.2, d: p.d - 6, r: 0.2 }, z + 1, ch - 3, 2, 0), { tone: "mid" }));
  }
  out.push(antenna(plan.x + plan.w - 6, plan.y + 6, h, 12, c7(id) > 0));
  ON = false;
  onDeck(fpOf(plan), h + 16, `<g data-station="${id}">${out.join("")}</g>`);
}

// ======== parcels: one repository, one building ========
// A repository's parcel holds everything about it, and nothing about it stands anywhere else: its building
// (height = lifetime commits on the one scale, the kind fixed by its district), and on the dock strip in front
// of it its pallet of open pull requests, its plug-in capsules (commits still only on branches: bolted on, not
// yet built in), its workers and its name with the open count, stencilled on the ground.
const prCrates = (n) => (n > 0 ? Math.min(24, Math.max(1, Math.round(2 * Math.log2(1 + n)))) : 0);
const branchPods = (n) => (n > 0 ? Math.min(12, Math.max(1, Math.round(1.4 * Math.log2(1 + n)))) : 0);
function pallet(x, y, n, s) { // n crates on a pallet of side s, four to a layer
  const out = [S(slab({ x, y, w: s, d: s, r: 0.3 }, 0, 1.2, 2, 0), { tone: "lo", crease: "none" })];
  const c = (s - 1) / 2, ch = c * 0.82, boxes = [];
  for (let i = 0; i < n; i++) boxes.push({ x: x + 0.5 + (i % 2) * c, y: y + 0.5 + Math.floor((i % 4) / 2) * c, z: 1.2 + Math.floor(i / 4) * ch });
  boxes.sort((p, q) => p.z - q.z || dep(p.x, p.y) - dep(q.x, q.y));
  for (const b of boxes) out.push(crate(b.x, b.y, b.z, c - 0.3, ch - 0.25, "hi"));
  return { svg: out.join(""), h: 1.2 + Math.ceil(n / 4) * ch };
}
function capsules(x, y, n, s) { // a spine with n capsules plugged on, alternating sides
  const step = s * 0.84, out = [S(k.cylinder(x + s / 2, y + s / 2, 0.55, 0, n * step + 2.4, P, 8), { tone: "mid", crease: "none" })];
  for (let i = 0; i < n; i++) {
    const z = 0.8 + i * step, o = i % 2 ? 0.7 : -0.7, p = { x: x + o, y: y - o, w: s, d: s, r: s * 0.18 };
    out.push(S(slab(p, z, s * 0.74, 2, 0.4), { tone: i % 2 ? "mid" : "hi", crease: "lo" }));
    const fy = nearY(p), cx = p.x + s / 2;
    out.push(pane([[cx - s * 0.22, fy, z + s * 0.2], [cx + s * 0.22, fy, z + s * 0.2], [cx + s * 0.22, fy, z + s * 0.54], [cx - s * 0.22, fy, z + s * 0.54]]));
  }
  out.push(Dt([at([x + s / 2, y + s / 2, n * step + 2.8])], { size: 0.5, tone: "lo" }));
  return { svg: out.join(""), h: n * step + 3 };
}
// the dock: pallet at one end, capsules at the other, workers between, the stencil along the front edge
function dock(id, d, put, name = true) {
  const r = RP[id]; if (!r) return;
  const along = d.w >= d.d ? "x" : "y", len = along === "x" ? d.w : d.d, deep = along === "x" ? d.d : d.w;
  const s = Math.min(deep - 1, len > 30 ? 13 : 8), cs = Math.min(5.5, Math.max(3.6, s * 0.5));
  const nPr = prCrates(r.pr), nBr = branchPods(r.unmerged);
  const pos = (u, v, w) => (along === "x" ? [d.x + u, d.y + v] : [d.x + v, d.y + u]); // u along the dock, v across
  if (nPr) { const [x, y] = pos(0.5, (deep - s) / 2 - 0.6), p = pallet(x, y, nPr, s); put({ x0: x, x1: x + s, y0: y, y1: y + s }, p.h, `<g data-station="${id}" data-pallet>${p.svg}</g>`); }
  if (nBr) { const [x, y] = pos(len - cs - 1.2, (deep - cs) / 2 - 0.6), c = capsules(x, y, nBr, cs); put({ x0: x - 0.8, x1: x + cs + 0.8, y0: y - 0.8, y1: y + cs + 0.8 }, c.h, `<g data-station="${id}" data-rack>${c.svg}</g>`); }
  // plaques: one plate per release, on a log scale, on a post at the dock's corner
  const plates = r.releases > 0 ? Math.min(8, Math.max(1, Math.round(1.5 * Math.log2(1 + r.releases)))) : 0;
  if (plates) {
    const [x, y] = pos(s + 1.2, deep - 2.4), post = { x, y, w: 1.4, d: 1.4, r: 0.2 }, ph = 1.4 + plates * 1.2, marks = [];
    for (let q = 0; q < plates; q++) marks.push(path3([[nearX(post), y + 0.2, 1 + q * 1.2], [nearX(post), y + 1.2, 1 + q * 1.2]]) + path3([[x + 0.2, nearY(post), 1 + q * 1.2], [x + 1.2, nearY(post), 1 + q * 1.2]]));
    put({ x0: x, x1: x + 1.4, y0: y, y1: y + 1.4 }, ph, `<g data-station="${id}" data-label>${S(slab(post, 0, ph, 1, 0.1), { tone: "hi", crease: "lo" })}${L(marks.join(""), { tone: "mid" })}</g>`);
  }
  const room = Math.max(0, Math.floor((len - s - cs - 4 - (plates ? 3 : 0)) / 5)), n = Math.min(8, room, crew7(id));
  for (let i = 0; i < n; i++) { const [x, y] = pos(s + 3.5 + (plates ? 3 : 0) + i * 5, deep / 2 - 0.6); put({ x0: x - 2.3, x1: x + 2.3, y0: y - 2.3, y1: y + 2.3 }, 11, `<g data-station="${id}" data-worker>${worker(x, y)}</g>`); }
  if (name) {
    const size = deep > 9 ? 2.6 : 2.2, max = Math.floor(len / (size * 0.64));
    let text = (r.private ? "◆ " : "") + id.toUpperCase() + (r.pr ? ` · ${r.pr.toLocaleString("en-US")} OPEN` : ""); // ◆: a private repository (the members' city only)
    if (text.length > max) text = text.slice(0, Math.max(4, max - 1)) + "…";
    const [x, y] = along === "x" ? [d.x + 0.4, d.y + d.d - 0.3] : [d.x + d.w - 0.3, d.y + 0.4];
    put({ x0: x, x1: x + 1, y0: y - 1, y1: y }, 0.1, `<g data-station="${id}" data-label>${topText([x, y], 0, text, along, size, "lo")}</g>`); // part of the station, so it is redrawn with it
  }
}

// ---- the kinds of building, one per district; each takes the building's plan and its height ----
// apps: a workshop tower with a sawtooth roof, set back once when it is tall
function workshop(id, b, h, on) {
  const v = hash(id.length, id.charCodeAt(0), id.charCodeAt(id.length - 1)), out = [`<path class="iso-halo" d="${k.haloOf(b, 0, h, P)}"/>`];
  out.push(S(slab(b, 0, 3, 3, 0.5), { tone: "mid" }));
  const roofZ = Math.max(7, h - 6.2), cut = h > 52 ? roofZ * (0.48 + v * 0.2) : roofZ;
  const p1 = k.insetPlan(b, 1); let top = p1;
  out.push(tier(p1, 3, cut, v < 0.5 ? "ribbon" : "grid"));
  if (cut < roofZ) { top = { x: backX(p1, 0.5, p1.w * 0.7), y: backY(p1, 0.5, p1.d * 0.72), w: p1.w * 0.7, d: p1.d * 0.72, r: 0.8 }; out.push(tier(top, cut + 1.2, roofZ, v < 0.5 ? "grid" : "ribbon")); out.push(acUnit(inX(p1, 1, 6), inY(p1, 1, 5), cut + 1.2)); }
  const teeth = Math.max(2, Math.round(top.w / 5)), tw = (top.w - 1) / teeth, z = roofZ + 1.2;
  for (let t = 0; t < teeth; t++) {
    const F = G.frameOf([top.x + 0.5 + t * tw, top.y + 0.5, z], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
    out.push(S(G.prismOf(F, [[0, 0], [tw, 0], [tw, 5]], 0, top.d - 1, P), { tone: "mid", crease: "lo" }));
  }
  out.push(antenna(inX(top, 1.2), inY(top, 1.2), z, 5 + h * 0.08, on));
  return { svg: out.join(""), top: z + 12 + h * 0.08, roof: [b.x + b.w / 2, b.y + b.d / 2, z + 5] };
}
// themes and plugins: a cabinet tower, one drawer per floor; drawers stand out by this week's commits
function drawerTower(id, b, h, on) {
  const out = [`<path class="iso-halo" d="${k.haloOf(b, 0, h, P)}"/>`], body = k.insetPlan(b, 1);
  out.push(S(slab(b, 0, 3, 3, 0.5), { tone: "mid" }));
  out.push(S(slab(body, 3, h - 4.2, 3, 0.4), { tone: "mid", crease: "lo" }));
  const fh = 5, floors = Math.max(1, Math.floor((h - 7) / fh)), fx = nearX(body), fy = nearY(body), fronts = [];
  const out7 = c7(id) ? Math.min(floors, Math.round(1 + 1.5 * Math.log2(1 + c7(id)))) : 0;
  const order = Array.from({ length: floors }, (_, i) => i).sort((a, c) => hash(a, id.length, 3) - hash(c, id.length, 3)); // which drawers stand out first: fixed per repository
  const pulled = new Set(order.slice(0, out7));
  for (let i = 0; i < floors; i++) {
    const z = 3.6 + i * fh;
    fronts.push(path3([[body.x + 1, fy, z], [body.x + body.w - 1, fy, z], [body.x + body.w - 1, fy, z + fh - 1], [body.x + 1, fy, z + fh - 1]], true));
    if (!pulled.has(i)) fronts.push(path3([[fx, body.y + 1, z], [fx, body.y + body.d - 1, z], [fx, body.y + body.d - 1, z + fh - 1], [fx, body.y + 1, z + fh - 1]], true));
  }
  out.push(L(fronts.join(""), { tone: "lo" }));
  for (const i of [...pulled].sort((a, c) => a - c)) {
    const z = 3.6 + i * fh, p = { x: VX > 0 ? body.x + body.w - 1 : body.x - 2.6, y: body.y + 1, w: 3.6, d: body.d - 2, r: 0.3 };
    out.push(S(slab(p, z, fh - 1, 2, 0.2), { tone: "hi", crease: "lo" }));
    out.push(L(path3([[nearX(p), p.y + p.d / 2 - 1.6, z + (fh - 1) / 2], [nearX(p), p.y + p.d / 2 + 1.6, z + (fh - 1) / 2]]), { tone: "mid" }));
  }
  out.push(S(slab(k.insetPlan(b, 0.4), h - 1.2, 1.2, 3, 0.3), { tone: "mid" }));
  out.push(lamp(inX(body, 2.5), inY(body, 2.5), h, on));
  return { svg: out.join(""), top: h + 6, roof: [b.x + b.w / 2, b.y + b.d / 2, h] };
}
// sites: a lattice mast carrying a sphere, the city's broadcast towers
function latticeMast(id, b, h, on) {
  const out = [`<path class="iso-halo" d="${k.haloOf(b, 0, 6, P)}"/>`], c = [b.x + b.w / 2, b.y + b.d / 2];
  out.push(S(slab(b, 0, 3, 3, 0.5), { tone: "mid" }), screws(b, 3, 2.4));
  const rs = Math.min(7, 2.4 + h * 0.035), hl = Math.max(6, h - 2 * rs - 4), w0 = Math.min(b.w, b.d) / 2 - 1.5, half = (z) => w0 - (w0 - 1.6) * ((z - 3) / hl);
  const corner = [[-1, -1], [1, -1], [-1, 1], [1, 1]].sort((a, q) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([q[0], q[1], 0], P));
  const leg = ([sx, sy]) => path3([[c[0] + sx * half(3), c[1] + sy * half(3), 3], [c[0] + sx * half(3 + hl), c[1] + sy * half(3 + hl), 3 + hl]]);
  const lattice = [];
  for (let z = 3; z < 3 + hl - 1; z += 7) {
    const z2 = Math.min(3 + hl, z + 7);
    for (const [ax, ay, bx, by] of [[-1, 1, 1, 1], [1, -1, 1, 1], [-1, -1, -1, 1], [-1, -1, 1, -1]]) {
      lattice.push(path3([[c[0] + ax * half(z), c[1] + ay * half(z), z], [c[0] + bx * half(z2), c[1] + by * half(z2), z2]]));
      lattice.push(path3([[c[0] + ax * half(z2), c[1] + ay * half(z2), z2], [c[0] + bx * half(z2), c[1] + by * half(z2), z2]]));
    }
  }
  out.push(L(corner.slice(0, 2).map(leg).join(""), { tone: "mid" }), L(lattice.join(""), { tone: "lo" }), L(corner.slice(2).map(leg).join(""), { tone: "hi" }));
  const tz = 3 + hl;
  out.push(S(slab({ x: c[0] - 3, y: c[1] - 3, w: 6, d: 6, r: 0.5 }, tz, 1.6, 2, 0.3), { tone: "mid" }));
  out.push(S(G.sphereOf([c[0], c[1], tz + 2 + rs], rs, P), { tone: "hi", crease: "none" }));
  const eq = G.arcOf(G.frameOf([c[0], c[1], tz + 2 + rs], [0, 0, 1], [1, 0, 0], [0, 1, 0]), 0, rs, P);
  out.push(!DRAW ? "" : on ? N(L(eq, { tone: "lo" }).match(/ d="([^"]+)"/)[1], "c", 0.9) : L(eq, { tone: "lo" }));
  out.push(lamp(c[0] + w0 - 1, c[1] - w0 + 1, 3, on));
  return { svg: out.join(""), top: tz + 2 * rs + 6, roof: [c[0], c[1], tz + 2 * rs + 2] };
}
// upstream: a silo, a fork's own work stacked on top of what it carries from upstream
function silo(id, b, h, on) {
  const r = Math.min(b.w, b.d) / 2 - 0.6, cx = b.x + b.w / 2, cy = b.y + b.d / 2, F = G.frameOf([cx, cy, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  const out = [`<path class="iso-halo" d="${k.haloOf({ x: cx - r, y: cy - r, w: 2 * r, d: 2 * r, r }, 0, h, P)}"/>`];
  const body = Math.max(4, h - r * 0.7);
  out.push(S(G.solidOf([[0, r * 0.92], [1.6, r, 1], [body, r], [body + r * 0.3, r * 0.82, 1], [h, r * 0.22]], F, P), { tone: life(id) ? "hi" : "mid", crease: "lo" }));
  const bands = []; for (let z = 8; z < body - 2; z += 9) bands.push(k.sideArc(cx, cy, r, z, P, 24));
  out.push(L(bands.join(""), { tone: "faint" }));
  const lx = cx + VX * r * 0.72, ly = cy + VY * r * 0.72; // a ladder up the side that shows
  out.push(L(path3([[lx, ly, 1.6], [lx, ly, body]]) + path3([[lx - VX * 1.2, ly + VY * 0.6, 1.6], [lx - VX * 1.2, ly + VY * 0.6, body]]), { tone: "lo" }));
  out.push(lamp(cx, cy, h, on));
  return { svg: out.join(""), top: h + 6, roof: [cx, cy, h] };
}
// the archive: an archived repository keeps its height as a ghost, outlines only, so it hides nothing behind it
function ghost(id, b, h) {
  const g = k.insetPlan(b, 1.5), out = [S(slab(b, 0, 1, 2, 0), { tone: "lo", crease: "none" })];
  const floors = []; for (let z = 12; z < h - 4; z += 12) floors.push(k.planOutline(g, z, P, 0.5));
  out.push(L(floors.join(""), { tone: "faint" }));
  out.push(L(k.planOutline(g, 1, P, 0.5) + k.planOutline(g, h, P, 0.5) + k.corners(g, 0).map(([x, y]) => path3([[x, y, 1], [x, y, h]])).join(""), { tone: "lo" }));
  return { svg: out.join(""), top: h + 2, roof: [b.x + b.w / 2, b.y + b.d / 2, h] };
}
// a repository with no district: one of four towers, fixed by its name
function towerKit(id, b, h, on, building) {
  const v = hash(id.length, id.charCodeAt(0), id.charCodeAt(id.length - 1)), m = Math.min(b.w, b.d);
  if (v < 0.3) return rotunda(b.x + b.w / 2, b.y + b.d / 2, m / 2 - 2.5, h, { on });
  if (v < 0.55) return jenga(b, h, { on, pad: !building });
  if (v < 0.75) return megablock(b, h, { on });
  return tower(b, h, { on, blade: b.w > 30 });
}
const KITS = { apps: workshop, catalog: drawerTower, sites: latticeMast, upstream: silo, retired: ghost, tower: towerKit };
const KIND_MATERIAL = { apps: "brick", catalog: "concrete", sites: "steel", upstream: "zinc", retired: "", tower: "plaster" }; // what each district builds in
// plugin kits (city/plugins/): a repository takes one with config.layout.kits; it keeps its parcel, its dock and the one scale
const KIT_API = { S, L, slab, path3, k, G, P, Dt, at, lamp, byDepth, hash, nearX, nearY, inX, inY, VX, VY };
for (const pl of KIT_PLUGINS) if (!KITS[pl.id]) KITS[pl.id] = (id, plan, h, on, building) => pl.draw({ id, plan, h, on, building, repo: RP[id], kit: KIT_API });
if (probe) { // the kit alone, and the screen outline of its plan's prism (what it must stay inside)
  const { plan: q, h: ph } = probe, t = KITS[probe.kit](probe.id, q, ph, probe.on, false);
  return { ...t, frame: MODE3D ? null : [0, ph].flatMap((z) => [[q.x, q.y], [q.x + q.w, q.y], [q.x, q.y + q.d], [q.x + q.w, q.y + q.d]].map(([x, y]) => k.iso([x, y, z], P))) };
}
const KIND_NAME = { apps: DISTRICT.apps?.name ?? "Apps", catalog: DISTRICT.catalog?.name ?? "Themes and plugins", sites: DISTRICT.sites?.name ?? "Sites", upstream: DISTRICT.upstream?.name ?? "Upstream", retired: DISTRICT.retired?.name ?? "Archive", tower: CONFIG.layout?.newcomers?.name ?? "Tower" };
for (const pl of KIT_PLUGINS) KIND_NAME[pl.id] ??= pl.name;

// one parcel: the building (in scaffolding under a crane for its first days, rising day by day) and its dock
function parcel(id, p, kind, ground = false) {
  if (kind !== "retired" && KIT_PLUGINS.some((pl) => pl.id === CONFIG.layout?.kits?.[id])) kind = CONFIG.layout.kits[id]; // an archived repository stays a ghost
  if (ground) plinth({ ...p, r: 1 }, RP[id] ? id : null); // a lot off the strokes stands on a plinth, so its tower starts at deck level too
  const put = ground ? onPlinth : onDeck, z0 = PZ;
  const b = { x: p.x + 1.5, y: p.y + 1.5, w: p.w - 3, d: p.d - 1.5 - DOCK, r: 1 };
  const nameAt = [p.x + 1.9, p.y + p.d - 0.8];
  if (!RP[id]) { put({ x0: nameAt[0], x1: nameAt[0] + 1, y0: nameAt[1] - 1, y1: nameAt[1] }, 0.1, topText(nameAt, 0, `${id.toUpperCase().slice(0, 14)} · VACANT`, "x", 2.2, "lo")); return; }
  const full = H(life(id)), born = LAYOUT.born?.[id] ?? 0, age = (DATA.now - born) / 86400, building = kind !== "retired" && born > 0 && age < BUILD_DAYS;
  const h = building ? Math.max(14, full * Math.max(0.22, age / BUILD_DAYS)) : full, on = c7(id) > 0;
  const t = withOn(on, () => withMaterial(KIND_MATERIAL[kind] ?? "plaster", () => KITS[kind](id, b, h, on, building))), out = [t.svg];
  if (building) {
    out.unshift(L(k.planOutline(k.insetPlan(b, -1), full, P, 1) + k.corners(k.insetPlan(b, -1), 0).map(([x, y]) => path3([[x, y, 0], [x, y, full]])).join(""), { tone: "faint" }));
    const cx = inX(b, -3, 0), cy = inY(b, -3, 0), ch = full + 14, jx = VX > 0 ? -1 : 1;
    out.push(S(slab({ x: cx - 1.2, y: cy - 1.2, w: 2.4, d: 2.4, r: 0.2 }, 0, ch, 2, 0), { tone: "mid", crease: "none" }));
    const jib = [[cx + jx * Math.min(30, b.w + 6), cy, ch], [cx - jx * 9, cy, ch]];
    out.push(L(path3(jib) + path3([[cx, cy, ch + 5], jib[0]]) + path3([[cx, cy, ch + 5], jib[1]]) + path3([[cx, cy, ch], [cx, cy, ch + 5]]), { tone: "mid" }));
    out.push(warn(cx, cy, ch + 6));
  }
  put(fpOf(b), Math.max(t.top, building ? full + 22 : 0), `<g data-station="${id}">${out.join("")}</g>`);
  ROOF[id] = [t.roof?.[0] ?? b.x + b.w / 2, t.roof?.[1] ?? b.y + b.d / 2, z0 + (t.roof ? t.roof[2] : h) + 2];
  if (kind !== "retired") dock(id, { x: p.x + 1.5, y: p.y + p.d - DOCK + 0.4, w: p.w - 3, d: DOCK - 1.2 }, put);
  else put({ x0: nameAt[0], x1: nameAt[0] + 1, y0: nameAt[1] - 1, y1: nameAt[1] }, 0.1, topText(nameAt, 0, id.toUpperCase().slice(0, 13), "x", 2.2, "lo"));
  station(id, { kind: building ? "Under construction" : KIND_NAME[kind], what: RP[id].desc || "" });
}
const APPS = (LAYOUT.districts?.apps ?? []).filter((n) => n && RP[n]), DRAWERS = (LAYOUT.districts?.catalog ?? []).filter((n) => n && RP[n]);
const SITES = (LAYOUT.districts?.sites ?? []).filter((n) => n && RP[n]), SILOS = (LAYOUT.districts?.upstream ?? []).filter((n) => n && RP[n]);
const RETIRED = (LAYOUT.districts?.retired ?? []).filter((n) => n && RP[n]);
// a district's unclaimed parcels are drawn as outlines on the deck: room to grow, already surveyed
function district(id) {
  const slots = LAYOUT.districts?.[id] ?? [];
  (PARCELS[id] ?? []).forEach((p, i) => {
    if (slots[i]) return drawing(slots[i], () => parcel(slots[i], p, id));
    const b = { x: p.x + 1.5, y: p.y + 1.5, w: p.w - 3, d: p.d - 1.5 - (id === "retired" ? 0 : DOCK), r: 1 };
    CELL = `${id}:${i}`;
    onDeck({ x0: b.x, x1: b.x + b.w, y0: b.y, y1: b.y + b.d }, 0.2, L(k.planOutline(b, 0.15, P, 1) + k.planOutline(k.insetPlan(b, 2), 0.15, P, 0.5), { tone: "faint" }));
    CELL = null;
  });
}

// ---------- assemble the plant on the mark ----------
const mid = (i) => X(i) + C / 2, midY = (j) => Y(j) + C / 2;
const BACK = Y(0) + C - 9; // belt line along the outer north stroke
const EAST = X(14) + 9; // belt line along the outer east stroke

// Outer north stroke: the works (four) and the pods (two), belts toward the north bridge; each dock in front
const NDOCK = (plan) => ({ x: plan.x, y: Y(0) + 22, w: plan.w, d: 7.6 });
for (const [slot, plan, opts] of [["works-1", { x: X(0) + 4, y: Y(0) + 3, w: 60, d: 18, r: 1.5 }, { sign: SIGN["works-1"] }], ["works-2", { x: X(1) + 26, y: Y(0) + 3, w: 40, d: 18, r: 1.5 }, { sign: SIGN["works-2"], flip: true }], ["works-3", { x: X(3) + 24, y: Y(0) + 3, w: 30, d: 18, r: 1.5 }, {}], ["works-4", { x: X(4) + 18, y: Y(0) + 3, w: 22, d: 18, r: 1 }, { tone: "mid" }]]) {
  drawing(SLOT[slot], () => withMaterial("render", () => { shop(SLOT[slot], plan, opts); dock(SLOT[slot], NDOCK(plan), onDeck); }));
}
for (const slot of ["works-1", "works-2", "works-3", "works-4"]) landmark(slot, "One of the works on the north stroke.");
for (const [slot, plan] of [["pod-1", { x: X(9) + 4, y: Y(0) + 3, w: 32, d: 18, r: 2 }], ["pod-2", { x: X(10) + 18, y: Y(0) + 3, w: 30, d: 18, r: 2 }]]) drawing(SLOT[slot], () => withMaterial("render", () => { pod(SLOT[slot], plan); dock(SLOT[slot], NDOCK(plan), onDeck); }));
landmark("pod-1", "One of the pods on the north stroke."); landmark("pod-2", "One of the pods on the north stroke.");

// Outer west stroke: upstream silos either side of the west bridge, the sites' masts toward the front
district("upstream");
label(X(0) + 4, Y(7) + 4, "UPSTREAM");
{ // a duct from the silos across the west bridge (scenery: it carries no count)
  const duct = { x: X(0) + 40, y: midY(7) - 5, w: X(2) + 3 - (X(0) + 40), d: 10, r: 1 }, out = [];
  for (const x of [duct.x + 6, duct.x + duct.w - 6]) out.push(S(slab({ x: x - 1.5, y: duct.y + 2.5, w: 3, d: 3, r: 0.3 }, 0, 26, 2, 0.2), { tone: "lo" }));
  out.push(S(slab(duct, 26, 7, 2, 0.5), { tone: "mid" }));
  const bands = []; for (let x = duct.x + 5; x < duct.x + duct.w; x += 7) bands.push(path3([[x, nearY(duct), 26], [x, nearY(duct), 33]]));
  out.push(L(bands.join(""), { tone: "lo" }));
  onDeck(fpOf(duct), 33, out.join(""));
}
district("sites");
label(X(0) + 4, Y(10) + 1, "SITES");

// Outer east stroke: the app workshops along the east belt; inner east stroke: the themes and plugins cabinets
district("apps");
label(X(14) + 18, Y(0) + 8, "APPS", "y");
district("catalog");
label(X(11) + 4, Y(2) + 12, "THEMES · PLUGINS");

// Outer south stroke: the archive's ghosts, the dispatch rack at the bridge, the truck in the gap
district("retired");
label(X(6) + 33, Y(14) + 6, "ARCHIVE", "y");
drawing(SLOT.dispatch, () => withMaterial("steel", () => rack(X(7) + 3, Y(14) + 3)));
truck(X(8) + 9, Y(14) + 4);
drawing(SLOT.dispatch, () => dock(SLOT.dispatch, { x: X(9) + 3, y: Y(14) + 6, w: 2 * C - 6, d: 12 }, onDeck));
if (SIGN.dispatch) label(X(9) + 4, Y(14) + C - 6, SIGN.dispatch);

// Inner ring: the main line
drawing(SLOT.hall, () => hall(X(2) + 3, Y(3) + 4, C - 6, 5 * C - 8));
if (SIGN.hall) label(X(2) + 6, Y(2) + 10, SIGN.hall);
drawing(SLOT.hall, () => dock(SLOT.hall, { x: X(2) + 3, y: Y(8) + 2, w: 13, d: 3 * C + 34 }, onDeck));
drawing(SLOT.press, () => withMaterial("steel", () => press(mid(4), midY(12))));
drawing(SLOT.disc, () => withMaterial("steel", () => discPress(mid(6), midY(12))));
drawing(SLOT.press, () => dock(SLOT.press, { x: X(5) - 1, y: Y(12) + 3, w: 25, d: 11 }, onDeck));
drawing(SLOT.disc, () => dock(SLOT.disc, { x: X(5) + 26, y: Y(12) + 3, w: 24, d: 11 }, onDeck));
label(X(3) + 4, Y(12) + C - 3, "PKGS · ISO");

// ---------- ground-level fill ----------
function onGround(fp, z1, svg) { item(fp, z1, svg, { ground: true }); }
const groundLabel = (x, y, text, along = "x") => onGround({ x0: x, x1: x + 1, y0: y - 1, y1: y }, 0.1, topText([x, y], 0, text, along));
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// a forklift working the yard
function forklift(...a) { return withMaterial("safety", () => forkliftNow(...a)); } // safety, in the light theme's colour
function forkliftNow(x, y, along = "x") {
  const out = [];
  const body = along === "x" ? { x, y, w: 12, d: 8, r: 1 } : { x, y, w: 8, d: 12, r: 1 };
  const wheels = along === "x" ? [[x + 2.5, y - 0.3], [x + 9.5, y - 0.3], [x + 2.5, y + 8.3], [x + 9.5, y + 8.3]] : [[x - 0.3, y + 2.5], [x - 0.3, y + 9.5], [x + 8.3, y + 2.5], [x + 8.3, y + 9.5]];
  const disc = ([wx, wy]) => S(G.disc(-0.8, 0.8, 2.2, G.frameOf([wx, wy, 2.2], along === "x" ? [0, 1, 0] : [1, 0, 0], along === "x" ? [1, 0, 0] : [0, 1, 0], [0, 0, 1]), P), { tone: "lo" });
  out.push(`<path class="iso-halo" d="${k.haloOf(body, 0, 6, P)}" style="filter:blur(3px)"/>`);
  const wh = byDepth(wheels);
  for (const w of wh.slice(0, 2)) out.push(disc(w));
  out.push(S(slab(body, 2, 5, 2, 0.4), { tone: "mid" }));
  const seat = along === "x" ? { x: x + 1.5, y: y + 1.5, w: 5, d: 5, r: 0.5 } : { x: x + 1.5, y: y + 1.5, w: 5, d: 5, r: 0.5 };
  out.push(S(slab(seat, 7, 2.4, 2, 0.3), { tone: "lo" }));
  const mast = along === "x" ? [[x + 11, y + 1.2], [x + 11, y + 5.8]] : [[x + 1.2, y + 11], [x + 5.8, y + 11]];
  for (const [mx, my] of mast) out.push(S(slab({ x: mx, y: my, w: 1, d: 1, r: 0.2 }, 2, 15, 2, 0), { tone: "mid" }));
  const fork = along === "x" ? { x: x + 12, y: y + 1, w: 8, d: 6, r: 0.2 } : { x: x + 1, y: y + 12, w: 6, d: 8, r: 0.2 };
  out.push(S(slab(fork, 2.4, 0.8, 2, 0), { tone: "mid" }));
  out.push(S(slab(along === "x" ? { x: x + 1, y: y + 1, w: 7, d: 6, r: 0.4 } : { x: x + 1, y: y + 1, w: 6, d: 7, r: 0.4 }, 14, 0.8, 2, 0.2), { tone: "mid" }));
  for (const w of wh.slice(2)) out.push(disc(w));
  return { svg: out.join(""), fp: along === "x" ? { x0: x, x1: x + 20, y0: y - 1, y1: y + 9.5 } : { x0: x - 1, x1: x + 9.5, y0: y, y1: y + 20 } };
}
{ // a long low warehouse beside the yard
  const plan = { x: X(8) + 18, y: Y(9) + 6, w: 4 * C - 26, d: 3 * C - 14, r: 1.5 }, h = 22, out = [`<path class="iso-halo" d="${k.haloOf(plan, 0, h, P)}"/>`];
  out.push(S(slab(plan, 0, 3, 3, 0.5), { tone: "mid" }));
  const body = k.insetPlan(plan, 1);
  out.push(S(slab(body, 3, h - 3, 3, 0.6), { tone: "hi", crease: "lo", inner: L(k.sideSeam(body, h - 4, P, 3), { tone: "lo" }) }));
  const y1 = nearY(body), x1 = nearX(body);
  for (let x = plan.x + 10; x < plan.x + plan.w - 20; x += 30) out.push(L(doorX(x, 16, y1, 13), { tone: "mid" }));
  out.push(L(winY(x1, plan.y + 6, plan.y + plan.d - 6, 8, h - 4, 6, 1), { tone: "lo" }));
  const teeth = 6, tw = (plan.w - 4) / teeth;
  for (let t = 0; t < teeth; t++) {
    const F = G.frameOf([plan.x + 2 + t * tw, plan.y + 2, h], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
    out.push(S(G.prismOf(F, [[0, 0], [tw, 0], [tw, 7]], 0, plan.d - 4, P), { tone: "mid" }));
  }
  out.push(N(path3([[plan.x + 1, y1, 3], [x1, y1, 3], [x1, plan.y + 1, 3]]), "m", 0.8));
  // billboard: two masts and a glowing panel facing the street
  const bx = plan.x + 40, by = plan.y + 30, bw = 80, bh = 30, bz = h + 14;
  for (const x of [bx + 8, bx + bw - 8]) out.push(S(slab({ x: x - 1, y: by - 1, w: 2, d: 2, r: 0.2 }, h + 7, 8, 2, 0), { tone: "mid" }));
  out.push(`<path class="ow-holo" d="${path3([[bx, by, bz], [bx + bw, by, bz], [bx + bw, by, bz + bh], [bx, by, bz + bh]], true)}"/>`);
  out.push(N(path3([[bx, by, bz], [bx + bw, by, bz], [bx + bw, by, bz + bh], [bx, by, bz + bh]], true), "m", 0.8));
  const bstart = readDir("x")[0] > 0 ? bx + 8 : bx + bw - 8;
  if (SIGN.billboard) out.push(sign(SIGN.billboard, [bstart, by], bz + 19, "left", "c", 15));
  out.push(sign("4,148 COMMITS · 30 DAYS".replace("4,148", (DATA.days.reduce((t, d) => t + d.n, 0)).toLocaleString("en-US")), [bstart, by], bz + 7, "left", "m", 5).replace('<g class="ow-sign"', '<g class="ow-sign" data-ticker="wide"'));
  onGround(fpOf(plan), bz + bh + 4, out.join(""));
  const f = forklift(X(8) + 30, Y(11) + 34, "x"); onGround(f.fp, 17, f.svg);
}

// Output: one column of crates per calendar day of the window, on a fixed scale so days compare across runs
const DAYS = DATA.days, PER_CRATE = CONFIG.layout?.output?.perCrate ?? 25, MAX_CRATES = 24;
const OX = X(3) + 10, OY = Y(6) + 20, OSTEP = (9 * C - 20) / Math.max(30, DAYS.length);
const strip = { x: OX - 4, y: OY - 4, w: DAYS.length * OSTEP + 4, d: 16, r: 1 };
onGround(fpOf({ x: strip.x, y: strip.y, w: 1, d: 1, r: 0 }), 0.1, S(slab(strip, 0, 1, 3, 0.2), { tone: "lo", crease: "none" }) + L(k.topTicks(OX, OX + DAYS.length * OSTEP - 4, OSTEP, 7, strip.y + strip.d - 3.4, 1, [1.4, 2.8], P).major, { tone: "mid" }));
DAYS.forEach((d, i) => drawing(`day-${i}`, () => {
  const n = Math.min(MAX_CRATES, Math.ceil(d.n / PER_CRATE)), x = OX + i * OSTEP, out = [];
  out.push(S(slab({ x, y: OY, w: 7.4, d: 7.4, r: 0.3 }, 1, 0.6, 2, 0), { tone: "lo", crease: "none" })); // the day's plate, empty when nothing landed
  for (let c = 0; c < n; c++) out.push(crate(x, OY, 1.6 + c * 5, 7.4, 5, i === DAYS.length - 1 ? "hi" : c === n - 1 ? "hi" : "mid"));
  onGround({ x0: x, x1: x + 7.4, y0: OY, y1: OY + 7.4 }, 1.6 + n * 5, `<g data-station="day-${i}">${out.join("")}</g>`);
}));
groundLabel(OX - 2, OY + 26, `OUTPUT · ONE COLUMN PER DAY · ONE CRATE PER ${PER_CRATE} COMMITS · ${stamp(DAYS[0].at)} – ${stamp(DAYS[DAYS.length - 1].at)}`);

// Service props in the ground channels between the rings and in the gaps
function crateStack(x, y) {
  const out = [], layers = 1 + Math.floor(rnd() * 3), boxes = [];
  for (let l = 0; l < layers; l++) for (let c = 0; c < 4 - l; c++) boxes.push({ x: x + (c % 2) * 8.4, y: y + Math.floor(c / 2) * 8.4, z: l * 7 });
  boxes.sort((p, q) => p.z - q.z || k.depthOf([p.x, p.y, 0], P) - k.depthOf([q.x, q.y, 0], P));
  for (const b of boxes) out.push(crate(b.x, b.y, b.z, 8, 7, "mid"));
  return { svg: out.join(""), fp: { x0: x, x1: x + 16.4, y0: y, y1: y + 16.4 }, h: layers * 7 };
}
function barrels(...a) { return withMaterial("steel", () => barrelsNow(...a)); } // steel, in the light theme's colour
function barrelsNow(x, y) {
  const spots = [[4, 4], [11, 4], [4, 11], [11, 11], [7.5, 17]].slice(0, 3 + Math.floor(rnd() * 3)).map(([dx, dy]) => [x + dx, y + dy]);
  spots.sort((p, q) => k.depthOf([...p, 0], P) - k.depthOf([...q, 0], P));
  const out = spots.map(([bx, by]) => S(k.cylinder(bx, by, 3.2, 0, 9, P, 20), { tone: "mid" }) + L(k.sideArc(bx, by, 3.2, 3, P, 14) + k.sideArc(bx, by, 3.2, 6, P, 14), { tone: "lo" }) + L(k.ring(bx, by, 1.2, 9, P, 10), { tone: "lo" }));
  return { svg: out.join(""), fp: { x0: x, x1: x + 15, y0: y, y1: y + 21 }, h: 9 };
}
function tank(...a) { return withMaterial("steel", () => tankNow(...a)); } // steel, in the light theme's colour
function tankNow(x, y) {
  const cx = x + 11, cy = y + 11, F = G.frameOf([cx, cy, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  const out = [`<path class="iso-halo" d="${k.haloOf({ x, y, w: 22, d: 22, r: 11 }, 0, 20, P)}"/>`];
  out.push(S(G.solidOf([[0, 10], [18, 10], [20, 9, 1], [23, 6, 1], [25, 2]], F, P), { tone: "mid", crease: "lo" }));
  out.push(L(k.sideArc(cx, cy, 10, 6, P, 24) + k.sideArc(cx, cy, 10, 12, P, 24), { tone: "faint" }));
  return { svg: out.join(""), fp: { x0: x, x1: x + 22, y0: y, y1: y + 22 }, h: 26 };
}
// the relay's water tower (observability, not the org's data): the water is the snapshot's freshness, full while
// full while the last scan is within one scan interval (an hour by default) and empty two intervals later; the lamp is the live stream, steady while it is
// connected, pulsing while it reconnects, dark without a relay. The page sets data.health and redraws this station.
function waterTower(...a) { return withMaterial("steel", () => waterTowerNow(...a)); } // steel, in the light theme's colour
function waterTowerNow(x, y) {
  const cx = x + 13, cy = y + 13, R = 10, Z0 = 28, ZT = 44, F = G.frameOf([cx, cy, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  const hl = DATA.health ?? {}, level = Math.max(0, Math.min(1, hl.level ?? 1)), zw = Z0 + (ZT - Z0) * level;
  const out = [`<path class="iso-halo" d="${k.haloOf({ x: cx - R, y: cy - R, w: 2 * R, d: 2 * R, r: R }, 0, ZT + 8, P)}"/>`];
  const legs = byDepth([[cx - 7, cy - 7], [cx + 5, cy - 7], [cx - 7, cy + 5], [cx + 5, cy + 5]]);
  for (const [lx, ly] of legs) out.push(S(slab({ x: lx, y: ly, w: 2, d: 2, r: 0.3 }, 0, Z0, 2, 0.2), { tone: "lo" }));
  const braces = []; for (const z of [9, 19]) braces.push(path3([[cx - 6, cy - 6, z], [cx + 6, cy - 6, z + 8]]), path3([[cx - 6, cy + 6, z], [cx + 6, cy + 6, z + 8]]), path3([[cx - 6, cy - 6, z], [cx - 6, cy + 6, z + 8]]), path3([[cx + 6, cy - 6, z], [cx + 6, cy + 6, z + 8]]));
  out.push(L(braces.join(""), { tone: "faint" }));
  if (zw > Z0 + 0.3) out.push(S(G.solidOf([[Z0, R], [zw, R]], F, P), { tone: "lo", crease: "lo" })); // the water
  out.push(S(G.solidOf([[zw, R], [ZT, R], [ZT + 2, R - 2, 1], [ZT + 6, 2]], F, P), { tone: "hi", crease: "lo" })); // the empty part and the roof
  const marks = []; for (let z = Z0 + 4; z < ZT; z += 4) marks.push(k.sideArc(cx, cy, R, z, P, 24));
  out.push(L(marks.join(""), { tone: "faint" }));
  const lit = hl.lamp === "ok" || hl.lamp === "down";
  out.push(S(k.cylinder(cx, cy, 1.2, ZT + 6, 2, P, 10), { tone: "mid" }) + Dt([at([cx, cy, ZT + 9.4])], { size: lit ? 1.3 : 0.7, tone: lit ? "hi" : "lo", pulse: hl.lamp === "down" }));
  return { svg: out.join(""), fp: { x0: cx - R, x1: cx + R, y0: cy - R, y1: cy + R }, h: ZT + 10 };
}
function shed(...a) { return withMaterial("zinc", () => shedNow(...a)); } // zinc, in the light theme's colour
function shedNow(x, y, w, d) {
  const plan = { x, y, w, d, r: 1 }, out = [`<path class="iso-halo" d="${k.haloOf(plan, 0, 20, P)}"/>`];
  const n = 2 + ((x + y) % 2 === 0 ? 1 : 0);
  let z = 0;
  for (let i = 0; i < n; i++) {
    const p = { x: x + (i % 2) * 3, y: y + (i === 2 ? 3 : 0), w: w - 4 - (i === 2 ? 6 : 0), d: d - 3, r: 1 }, hh = 7;
    out.push(S(slab(p, z, hh, 3, 0.4), { tone: "mid", crease: "lo" }));
    const fy = nearY(p);
    out.push(pane([[p.x + 2, fy, z + 2], [p.x + p.w * 0.45, fy, z + 2], [p.x + p.w * 0.45, fy, z + hh - 2], [p.x + 2, fy, z + hh - 2]]));
    out.push(pane([[p.x + p.w * 0.55, fy, z + 2], [p.x + p.w - 2, fy, z + 2], [p.x + p.w - 2, fy, z + hh - 2], [p.x + p.w * 0.55, fy, z + hh - 2]]));
    z += hh;
  }
  out.push(antenna(x + 4, y + 4, z, 7, false));
  return { svg: out.join(""), fp: fpOf(plan), h: z + 10 };
}
const channel = CHANNEL; // the ground between and around the rings, but the truck's cell (grid.js)
const PROPS = [crateStack, barrels, tank, crateStack, shed, barrels, crateStack];
const SKY = {}; // scenery high-rises by lot, for the bridges between them
const NEWC = CONFIG.layout?.newcomers ?? {};
// a repository's lot: a parcel like any other (its building, its dock, its name), kept even when the repository
// is gone from the data (a vacant lot, never a reshuffle). A repository whose district was full when it arrived
// keeps its district's kind of building here (layout.kinds).
function drawLot(repo, i, j) {
  drawing(repo, () => parcel(repo, { x: X(i) + 4, y: Y(j) + 2, w: C - 8, d: C - 3 }, LAYOUT.kinds?.[repo] ?? "tower", true));
  if (RP[repo]) SKY[i + "," + j] = { h: PZ + H(life(repo)) };
}
const lotAt = (i, j) => LAYOUT.lots?.[i + "," + j];
channel.forEach(([i, j], n) => {
  const key = i + "," + j;
  CELL = lotAt(i, j) ? null : key;
  seed = 1000 + i * 97 + j * 7919; // per-lot randomness, so a new tower never reshuffles its neighbours
  const repo = lotAt(i, j);
  if (repo) { drawLot(repo, i, j); return; } // a repository that claimed this lot
  if (BOARDS.includes(key)) { // a billboard tower: the distinguished corporate patrons, three to a board; without patron data, the old scenery text and the ticker
    const b = BOARDS.indexOf(key), names = DIST_CORP.slice(b * 3, b * 3 + 3);
    const bh = names.length ? 96 + (n % 3) * 14 : SCENERY_MAX - 4; // a patron board stands tall; without patrons it is scenery, and scenery stays low
    const p = { x: X(i) + 6, y: Y(j) + 6, w: 34, d: 34, r: 1 }, t = names.length ? patronBoard(p, bh, names) : boardTower(p, bh, (CONFIG.layout?.boards ?? [])[b] ?? "", true);
    onGround(fpOf(p), t.top, t.svg); SKY[key] = { h: bh, core: true };
    names.forEach((nm) => patronStation(nm, "boards", "on a billboard tower"));
    return;
  }
  if (SKYLINE(i, j)) { // the skyline at the back and the corners
    const t = scenery(X(i), Y(j), n, j === 1 || i === 1 ? 150 : 110);
    onGround(t.fp, t.top, t.svg);
    SKY[key] = { h: t.h };
    return;
  }
  const kind = PROPS[(n * 5 + i * 3 + j) % PROPS.length];
  if (kind === shed) { const p = shed(X(i) + 6, Y(j) + 8, 32, 26); onGround(p.fp, p.h, p.svg); return; }
  const a = kind(X(i) + 4 + Math.floor(rnd() * 6), Y(j) + 4 + Math.floor(rnd() * 4));
  onGround(a.fp, a.h, a.svg);
  if (kind !== tank) { const b = (rnd() < 0.5 ? crateStack : barrels)(X(i) + 25, Y(j) + 22); if (b.fp.x1 < X(i + 1) - 1 && b.fp.y1 < Y(j + 1) - 1) onGround(b.fp, b.h, b.svg); }
});
CELL = null;
for (const [key, a] of Object.entries(SKY)) {
  const [i, j] = key.split(",").map(Number);
  const east = SKY[(i + 1) + "," + j], south = SKY[i + "," + (j + 1)];
  if (east && Math.min(a.h, east.h) > 40 && hash(i, j, 5) < 0.75) { const z = 18 + hash(i, j) * (Math.min(a.h, east.h) - 30); const b = skyBridge(X(i) + 40, X(i + 1) + 5, Y(j) + 18, Y(j) + 26, z, "x"); onGround(b.fp, b.h, b.svg); }
  if (south && Math.min(a.h, south.h) > 40 && hash(j, i, 6) < 0.75) { const z = 18 + hash(j, i) * (Math.min(a.h, south.h) - 30); const b = skyBridge(X(i) + 18, X(i) + 26, Y(j) + 40, Y(j + 1) + 5, z, "y"); onGround(b.fp, b.h, b.svg); }
}
// The courtyard: its back row, its prop rows (4, 5, 7, 8) and the west of rows 9 to 11 hold scenery until a
// repository claims the cell as a lot. Each cell seeds its own props, so a claimed cell never reshuffles the rest.
CELL = null;
const cellSeed = (i, j) => { seed = 4242 + i * 97 + j * 7919; CELL = `${i},${j}`; };
for (let i = 3; i <= 11; i++) {
  cellSeed(i, 3);
  if (i % 2 === 1) { const t = scenery(X(i) - 1, Y(3) - 1, i + 40); onGround(t.fp, t.top, t.svg); continue; }
  if (i % 4 === 0) { const t = cooler(X(i) + 22, Y(3) + 22, 14, 34 + (i % 3) * 6); onGround({ x0: X(i) + 8, x1: X(i) + 36, y0: Y(3) + 8, y1: Y(3) + 36 }, t.top, t.svg); continue; }
  if (i === 6) { // the relay's water tower stands in the service yard, where a tank stood
    CELL = null; drawing("relay", () => { const w = waterTower(X(i) + 8, Y(3) + 10); onGround(w.fp, w.h, `<g data-station="relay">${w.svg}</g>`); });
    station("relay", { kind: "Water tower", title: "The relay", what: "The city's own health, not the org's: the water is how fresh the snapshot is (full within one scan interval of the last scan, an hour by default, and empty two intervals later), the lamp is the live stream (steady when connected, pulsing while it reconnects, dark without a relay)." });
    continue;
  }
  const a = (i % 3 === 0 ? tank : crateStack)(X(i) + 8, Y(3) + 14);
  onGround(a.fp, a.h, a.svg);
  if (i % 2 && !lotAt(i, 4)) { const b = barrels(X(i) + 12, Y(4) + 18); onGround(b.fp, b.h, b.svg); }
}
for (const [i, j] of [[5, 5], [9, 8]]) if (!lotAt(i, j)) { CELL = `${i},${j}`; const f = forklift(X(i) + 10 + (j === 8 ? 6 : 0), Y(j) + (j === 8 ? 6 : 18), "x"); onGround(f.fp, 17, f.svg); }
for (let i = 3; i <= 11; i++) {
  cellSeed(i, 5); if (i !== 5 && i !== 6 && !lotAt(i, 5)) { const a = crateStack(X(i) + 22, Y(5) + 4); onGround(a.fp, a.h, a.svg); const b = (i % 2 ? barrels : tank)(X(i) + 4, Y(5) + 22); if (b.fp.x1 < X(i + 1) - 1 && b.fp.y1 < Y(6) - 1) onGround(b.fp, b.h, b.svg); }
  cellSeed(i, 7); if (!lotAt(i, 7)) {
    const b = [crateStack, barrels, tank][i % 3](X(i) + 6, Y(7) + 4); onGround(b.fp, b.h, b.svg);
    const c = [barrels, crateStack, crateStack][i % 3](X(i) + 26, Y(7) + 24); if (c.fp.x1 < X(i + 1) - 1 && c.fp.y1 < Y(8) - 1) onGround(c.fp, c.h, c.svg);
  }
  cellSeed(i, 8); if (i % 2 === 0 && i !== 10 && !lotAt(i, 8)) { const c = crateStack(X(i) + 8, Y(8) + 8); onGround(c.fp, c.h, c.svg); }
}
for (let i = 3; i <= 11; i += 2) { if (lotAt(i, 8)) continue; cellSeed(i, 8); const p = shed(X(i) + 4, Y(8) + 4, 30, 22); if (i !== 9) onGround(p.fp, p.h, p.svg); }
for (const j of [9, 10, 11]) for (let i = 3; i <= 7; i++) { // west of the warehouse: a low service quarter
  if (lotAt(i, j)) continue;
  cellSeed(i, j);
  const v = hash(i, j, 11);
  if (v < 0.3) { const t = scenery(X(i), Y(j), i * 7 + j, 44); onGround(t.fp, t.top, t.svg); }
  else if (v < 0.55) { const p = shed(X(i) + 6, Y(j) + 8, 32, 26); onGround(p.fp, p.h, p.svg); }
  else if (v < 0.75) { const a = tank(X(i) + 4, Y(j) + 4), b = barrels(X(i) + 27, Y(j) + 20); onGround(a.fp, a.h, a.svg); onGround(b.fp, b.h, b.svg); }
  else { const a = crateStack(X(i) + 5, Y(j) + 5), b = crateStack(X(i) + 25, Y(j) + 24); onGround(a.fp, a.h, a.svg); onGround(b.fp, b.h, b.svg); }
}
// Row 6, under the arcology: the courtyard's boulevard. Civic scenery on every cell (plazas, parks, monuments and a
// transit station, as in the quarter), a lit kerb along both sides and a lamp post at each corner. Never a lot:
// the overflow rows are 7, 8, 4, 5 and the west of 9 to 11. Scenery: no count, each under SCENERY_MAX.
const BOULEVARD = [plaza, park, monument, transit, park, plaza, monument, park, plaza];
const streetLamp = (x, y) => S(k.cylinder(x, y, 0.45, 0, 8, P, 6), { tone: "mid", crease: "none" }) + `<g data-glow="a">${Dt([at([x, y, 8.6])], { size: 0.8, tone: "hi" })}</g>`;
for (let i = 3; i <= 11; i++) {
  CELL = null; seed = 6060 + i * 97;
  const blk = { x: X(i) + 3, y: Y(6) + 6, w: C - 6, d: C - 12, r: 0.6 }, t = BOULEVARD[i - 3](blk, i * 13 + 5, 6 * 17 + 3);
  onGround({ x0: X(i) + 0.5, x1: X(i + 1) - 0.5, y0: Y(6) + 3.6, y1: Y(7) - 3.6 }, 0.3, `<path class="ow-road" d="${path3([[X(i) + 0.5, Y(6) + 3.6, 0.25], [X(i + 1) - 0.5, Y(6) + 3.6, 0.25], [X(i + 1) - 0.5, Y(7) - 3.6, 0.25], [X(i) + 0.5, Y(7) - 3.6, 0.25]], true)}"/>`); // the roadway, kerb to kerb
  onGround({ x0: blk.x, x1: blk.x + blk.w, y0: blk.y, y1: blk.y + blk.d }, t.top, t.svg);
  for (const y of [Y(6) + 3, Y(7) - 3]) { // the kerbs: street light along the boulevard, a lamp post at each end
    onGround({ x0: X(i) + 1, x1: X(i + 1) - 1, y0: y - 0.6, y1: y + 0.6 }, 0.6, N(k.lineOnTop([X(i) + 1, y], [X(i + 1) - 1, y], 0.3, P), "c", 0.5, "a"));
    for (const x of [X(i) + 2.5, X(i + 1) - 2.5]) onGround({ x0: x - 0.6, x1: x + 0.6, y0: y - 0.6, y1: y + 0.6 }, 9, streetLamp(x, y));
  }
}
CELL = null;
for (const j of [4, 5, 7, 8, 9, 10, 11]) for (let i = 3; i <= 11; i++) { const repo = lotAt(i, j); if (repo) drawLot(repo, i, j); }
// lots in the rings around the mark, once the mark was full: a parcel among the contributors' blocks
for (const [key, repo] of Object.entries(LAYOUT.lots ?? {})) if (ringOf(key) > 0) { const [i, j] = key.split(",").map(Number); seed = 1000 + i * 97 + j * 7919; drawLot(repo, i, j); }

// ---------- the contributors' quarter: one tower per person ----------
// Nine towers to a cell on a 14-unit pitch, in rings around the mark where the layout put them. Height is the
// one building scale (a 1,000-commit contributor stands as tall as a 1,000-commit repository); the kind is fixed
// by the login; the lamp is lit by a commit in the last 7 days. No name on the ground: the tooltip and the card name the tower, and 750 stencils would be noise.
// Thirteen kinds, fixed by the login so a building never changes shape. A person with a few commits builds a
// low-rise: a block with a roof tank, a capsule, two blocks side by side, an L around a roof terrace, a dome or
// a plant room with fans. More commits build a tower: a slab, a setback, a stepped tower, twin slabs with a bridge, a capsule
// stack, a blade tower or a round tower. All in one material, panes on one face only, so the quarter stays a
// white model and the SVG stays light. Low-rises carry their lamp on the roof; towers on a mast.
function contributorTower(login, x, y, n, f = 1) { // f scales the footprint (12 units at 1); heights never scale
  const c = CONTRIB[login], p = PERSON[login], total = c ? c.total : 0, on = (p ? p.c7 : 0) > 0;
  const h = H(total), v = hash(login.length, login.charCodeAt(0), n), plan = { x, y, w: 12 * f, d: 12 * f, r: 0.6 }, tone = on ? "hi" : "mid";
  // a first few commits build a low-rise of one of six kinds; more build one of seven towers
  const kind = h < 26 ? ["tank", "capsule", "duo", "court", "dome", "vents"][Math.floor(v * 6)]
    : v < 0.2 ? "slab" : v < 0.36 ? "setback" : v < 0.5 ? "stepped" : v < 0.62 ? "twin" : v < 0.76 ? "capsules" : v < 0.88 ? "blade" : "round";
  if (kind === "round") { const t = rotunda(x + 6 * f, y + 6 * f, 5 * f, h, { on, mast: 6, tone }); return { svg: t.svg, top: t.top }; }
  const out = [`<path class="iso-halo" d="${k.haloOf(plan, 0, h, P)}"/>`];
  const box = (p, z0, z1, face = "x", t = tone) => S(slab(p, z0, z1 - z0, 1, 0.3), { tone: t, crease: "lo" }) + (z1 - z0 > 8 ? ribbons(p.x, p.x + p.w, p.y, p.y + p.d, z0 + 2, z1 - 2, face, 7) : "");
  let topZ = h, mast = true;
  if (kind === "tank") { // a block with a water tank on legs on the roof
    out.push(box(plan, 0, h - 5));
    const tx = backX(plan, 2.5 * f, 5 * f) + 2.5, ty = backY(plan, 2.5 * f, 5 * f) + 2.5, z = h - 5;
    for (const [dx, dy] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) out.push(L(path3([[tx + dx, ty + dy, z], [tx + dx, ty + dy, z + 2]]), { tone: "mid" }));
    out.push(S(k.cylinder(tx, ty, 2.6, z + 2, 3, P, 12), { tone: "mid", crease: "lo" }), S(G.solidOf([[0, 2.7], [0.8, 1.2, 1], [1, 0.2]], G.frameOf([tx, ty, z + 5], [0, 0, 1], [1, 0, 0], [0, 1, 0]), P, { steps: 12 }), { tone: "mid" }));
    out.push(lamp(inX(plan, 2 * f), inY(plan, 2 * f), z, on)); topZ = h; mast = false;
  } else if (kind === "capsule") { // a block with one capsule cantilevered off the face that shows
    out.push(box(plan, 0, h));
    const cz = h * 0.45, cp = { x: VX > 0 ? x + 12 * f : x - 4, y: y + 3.5 * f, w: 4 * f, d: 5 * f, r: 1.2 };
    out.push(S(slab(cp, cz, 5, 2, 0.5), { tone: "hi", crease: "lo" }), L(k.ring(cp.x + 2 * f, cp.y + 2.5 * f, 1.2 * f, cz + 5, P, 12), { tone: "lo" }));
    out.push(pane([[nearX(cp), cp.y + 1.2 * f, cz + 1.4], [nearX(cp), cp.y + 3.8 * f, cz + 1.4], [nearX(cp), cp.y + 3.8 * f, cz + 3.4], [nearX(cp), cp.y + 1.2 * f, cz + 3.4]]));
    out.push(lamp(backX(plan, 2 * f), backY(plan, 2 * f), h, on)); mast = false;
  } else if (kind === "duo") { // two blocks of different heights, side by side
    const a = { x, y, w: 12 * f, d: 7 * f, r: 0.5 }, b = { x, y: y + 7 * f, w: 12 * f, d: 5 * f, r: 0.5 }, hb = Math.max(9, h * 0.62);
    const [far, near] = VY > 0 ? [[a, h], [b, hb]] : [[b, hb], [a, h]];
    out.push(box(far[0], 0, far[1]), box(near[0], 0, near[1]), acUnit(x + 3 * f, VY > 0 ? y + 7.2 * f : y + 0.2 * f, hb));
    out.push(lamp(x + 2 * f, y + 2 * f, h, on)); mast = false;
  } else if (kind === "court") { // an L of two wings around a roof terrace
    const wa = { x: backX(plan, 0 * f, 6 * f), y, w: 6 * f, d: 12 * f, r: 0.5 }, wb = { x, y: backY(plan, 0 * f, 6 * f), w: 12 * f, d: 6 * f, r: 0.5 };
    out.push(box(wb, 0, h, "x"), box(wa, 0, h * 0.8, "y"));
    out.push(S(slab({ x: inX(plan, 0.5 * f, 6 * f), y: inY(plan, 0.5 * f, 6 * f), w: 6 * f, d: 6 * f, r: 0.4 }, 0, 4, 2, 0.3), { tone: "mid" }));
    out.push(Dt([[inX(plan, 2 * f), inY(plan, 2 * f)], [inX(plan, 4 * f), inY(plan, 3.2 * f)], [inX(plan, 3 * f), inY(plan, 4.6 * f)]].map(([px, py]) => at([px, py, 4.4])), { size: 0.9, tone: "lo" }));
    out.push(lamp(backX(plan, 2 * f), backY(plan, 2 * f), h, on)); mast = false;
  } else if (kind === "dome") { // a block crowned with a small dome, like an observatory
    out.push(box(plan, 0, h - 4));
    out.push(S(G.solidOf([[0, 4.2], [2, 3.8, 1], [3.4, 2.6, 1], [4.4, 0.4]], G.frameOf([x + 6 * f, y + 6 * f, h - 4], [0, 0, 1], [1, 0, 0], [0, 1, 0]), P, { steps: 16 }), { tone: "hi", crease: "lo" }));
    out.push(lamp(inX(plan, 1.6 * f), inY(plan, 1.6 * f), h - 4, on)); mast = false;
  } else if (kind === "vents") { // a block with a plant room and two fans on the roof
    out.push(box(plan, 0, h - 2), S(slab({ x: backX(plan, 1 * f, 5 * f), y: backY(plan, 1 * f, 10 * f), w: 5 * f, d: 10 * f, r: 0.3 }, h - 2, 3, 2, 0.3), { tone: "mid", crease: "lo" }));
    for (const f of [3, 8]) out.push(L(k.ring(inX(plan, 3 * f), y + f + 0.5, 1.6, h - 2, P, 10), { tone: "lo" }));
    out.push(lamp(inX(plan, 1.4 * f), backY(plan, 1.4 * f), h - 2, on)); mast = false;
  } else if (kind === "slab") out.push(box(plan, 0, h));
  else if (kind === "setback") { // a podium and a thinner shaft set back
    const cut = h * 0.42, p2 = { x: backX(plan, 1.5 * f, 9 * f), y: backY(plan, 1.5 * f, 9 * f), w: 9 * f, d: 9 * f, r: 0.5 };
    out.push(box(plan, 0, cut), box(p2, cut, h, "y"), acUnit(backX(plan, 1 * f, 6 * f), inY(plan, 1 * f, 5 * f), cut));
  } else if (kind === "stepped") { // three tiers, each set back toward the far corner
    const c1 = h * 0.4, c2 = h * 0.72, p2 = { x: backX(plan, 1 * f, 10 * f), y: backY(plan, 1 * f, 10 * f), w: 10 * f, d: 10 * f, r: 0.5 }, p3 = { x: backX(plan, 2 * f, 7 * f), y: backY(plan, 2 * f, 7 * f), w: 7 * f, d: 7 * f, r: 0.5 };
    out.push(box(plan, 0, c1), box(p2, c1, c2, "y"), box(p3, c2, h));
    out.push(acUnit(inX(plan, 1 * f, 6 * f), backY(plan, 1 * f, 5 * f), c1 + 0.2));
  } else if (kind === "twin") { // two slabs with a bridge between them
    const a = { x, y, w: 5 * f, d: 12 * f, r: 0.5 }, b = { x: x + 7 * f, y, w: 5 * f, d: 12 * f, r: 0.5 }, hb = h * 0.82;
    const [far, near] = VX > 0 ? [a, b] : [b, a];
    out.push(box(far, 0, far === a ? h : hb, "y"), S(slab({ x: x + 4.5 * f, y: y + 4 * f, w: 3 * f, d: 4 * f, r: 0.2 }, h * 0.6, 3, 2, 0.2), { tone: "hi", crease: "lo" }), box(near, 0, near === a ? h : hb, "y"));
  } else if (kind === "capsules") { // floors shifted back and forth, each a cantilever
    const fh = 6, floors = Math.max(3, Math.floor((h - 3) / fh));
    out.push(S(slab(plan, 0, 3, 2, 0.4), { tone: "mid" }));
    for (let i = 0; i < floors; i++) {
      const s = (i % 2 ? 1 : -1) * 1.5, alongX = (i >> 1) % 2 === 0, z = 3 + i * fh;
      const p = { x: x + 1.5 * f + (alongX ? s : 0), y: y + 1.5 * f + (alongX ? 0 : s), w: 9 * f, d: 9 * f, r: 0.5 };
      out.push(S(slab(p, z, fh - 0.6, 2, 0.3), { tone: i % 3 === 2 ? "mid" : tone, crease: "lo" }));
      if (i % 2 === 0) out.push(ribbons(p.x, p.x + p.w, p.y, p.y + p.d, z + 0.5, z + fh - 0.8, "x", 6));
    }
    topZ = 3 + floors * fh;
  } else if (kind === "blade") { // a slab with a sign blade standing off its near face
    const p = { x: VX > 0 ? x : x + 3 * f, y, w: 9 * f, d: 12 * f, r: 0.5 };
    out.push(box(p, 0, h, "y"), blade(VX > 0 ? nearX(p) + 1.6 : nearX(p) - 3, inY(p, 2 * f, 7 * f), Math.max(4, h * 0.2), Math.min(22, h * 0.45), 7));
  }
  if (mast) out.push(antenna(inX(plan, 2.5 * f), inY(plan, 2.5 * f), topZ, Math.min(12, 4 + h * 0.08), on));
  if (c?.first) { // the plaque: a small plate at the door, for the date of the first contribution (the card says which)
    const pl = { x: inX(plan, 1 * f, 3 * f), y: inY(plan, -0.6, 0.6), w: 3 * f, d: 0.6, r: 0.1 };
    out.push(S(slab(pl, 1.2, 2.2, 1, 0.1), { tone: "hi", crease: "lo" }));
  }
  return { svg: out.join(""), top: topZ + (mast ? 14 : 8) };
}
// ---- the quarter's street plan: blocks, streets, civic cells ----
const STREETS = []; // road strips, drawn into the ground layer under everything
const blockOf = (i, j) => { // the part of a ring cell the streets leave for buildings
  const st = streetsOf(i, j), x0 = X(i) + (st.w ? STREET : 1), x1 = X(i) + C - (st.e ? STREET : 1), y0 = Y(j) + (st.n ? STREET : 1), y1 = Y(j) + C - (st.s ? STREET : 1);
  return { x: x0, y: y0, w: x1 - x0, d: y1 - y0, st };
};
function streetStrips(i, j) {
  const st = streetsOf(i, j), out = [], lamps = [];
  const road = (x0, y0, x1, y1, along) => {
    const p = { x: x0, y: y0, w: x1 - x0, d: y1 - y0, r: 0 };
    out.push(`<path class="ow-road" d="${path3([[x0, y0, 0.05], [x1, y0, 0.05], [x1, y1, 0.05], [x0, y1, 0.05]], true)}"/>`);
    const dash = [], kerb = [];
    if (along === "y") { const cx = (x0 + x1) / 2; for (let y = y0 + 1; y < y1 - 1; y += 5) dash.push(k.lineOnTop([cx, y], [cx, Math.min(y1 - 0.5, y + 2.4)], 0.08, P)); kerb.push(k.lineOnTop([x0 + 1.2, y0], [x0 + 1.2, y1], 0.08, P), k.lineOnTop([x1 - 1.2, y0], [x1 - 1.2, y1], 0.08, P)); }
    else { const cy = (y0 + y1) / 2; for (let x = x0 + 1; x < x1 - 1; x += 5) dash.push(k.lineOnTop([x, cy], [Math.min(x1 - 0.5, x + 2.4), cy], 0.08, P)); kerb.push(k.lineOnTop([x0, y0 + 1.2], [x1, y0 + 1.2], 0.08, P), k.lineOnTop([x0, y1 - 1.2], [x1, y1 - 1.2], 0.08, P)); }
    out.push(L(dash.join(""), { tone: "lo" }), L(kerb.join(""), { tone: "faint" }));
  };
  if (st.w) { road(X(i), Y(j), X(i) + STREET, Y(j) + C, "y"); lamps.push([X(i) + STREET - 0.8, Y(j) + 12], [X(i) + STREET - 0.8, Y(j) + 35]); }
  if (st.e) { road(X(i) + C - STREET, Y(j), X(i) + C, Y(j) + C, "y"); lamps.push([X(i) + C - STREET + 0.8, Y(j) + 23]); }
  if (st.n) { road(X(i), Y(j), X(i) + C, Y(j) + STREET, "x"); lamps.push([X(i) + 23, Y(j) + STREET - 0.8]); }
  if (st.s) { road(X(i), Y(j) + C - STREET, X(i) + C, Y(j) + C, "x"); lamps.push([X(i) + 23, Y(j) + C - STREET + 0.8]); }
  STREETS.push(out.join(""));
  // street lamps: a pole, an arm over the road and a sodium-amber light (scenery)
  for (const [lx, ly] of lamps) {
    const svg = S(k.cylinder(lx, ly, 0.35, 0, 7, P, 6), { tone: "mid", crease: "none" }) + `<g data-glow="a">${Dt([at([lx, ly, 7.4])], { size: 0.8, tone: "hi" })}</g>`;
    onGround({ x0: lx - 0.5, x1: lx + 0.5, y0: ly - 0.5, y1: ly + 0.5 }, 8, svg);
  }
}
// ---- civic cells: scenery that makes the quarter a city (each under SCENERY_MAX, no data) ----
function stadium(...a) { return withMaterial("concrete", () => stadiumNow(...a)); } // concrete, in the light theme's colour
function stadiumNow(b) {
  const cx = b.x + b.w / 2, cy = b.y + b.d / 2, r = Math.min(b.w, b.d) / 2 - 2.5, out = [`<path class="iso-halo" d="${k.haloOf({ x: cx - r - 2, y: cy - r - 2, w: 2 * r + 4, d: 2 * r + 4, r: r + 2 }, 0, 12, P)}"/>`];
  const masts = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => [cx + sx * (r + 0.4) * 0.74, cy + sy * (r + 0.4) * 0.74]).sort((p, q) => dep(...p) - dep(...q));
  const mast = ([mx, my]) => S(k.cylinder(mx, my, 0.5, 0, 26, P, 6), { tone: "mid", crease: "none" }) + S(slab({ x: mx - 1.8, y: my - 1.8, w: 3.6, d: 3.6, r: 0.3 }, 26, 1.6, 1, 0), { tone: "hi", crease: "lo" }) + `<g data-glow="c">${Dt([at([mx, my, 28])], { size: 1, tone: "hi" })}</g>`;
  out.push(mast(masts[0]), mast(masts[1]));
  out.push(S(k.cylinder(cx, cy, r, 0, 9, P, 40), { tone: "mid", crease: "lo" }), cylBand(cx, cy, r, 2.6, 4.4), cylBand(cx, cy, r, 5.6, 7.4));
  out.push(S(k.cylinder(cx, cy, r + 1.4, 9, 2, P, 40), { tone: "hi", crease: "lo" }));
  const ring = (rr, z) => Array.from({ length: 36 }, (_, q) => at([cx + Math.cos(q / 36 * Math.PI * 2) * rr, cy + Math.sin(q / 36 * Math.PI * 2) * rr, z]));
  out.push(`<path class="ow-mouth" d="${k.pathOf(ring(r * 0.8, 11.05), true)}"/>`);
  const pw = r * 0.62, pd = r * 0.38;
  out.push(`<path class="ow-ground" d="${path3([[cx - pw, cy - pd, 11.1], [cx + pw, cy - pd, 11.1], [cx + pw, cy + pd, 11.1], [cx - pw, cy + pd, 11.1]], true)}"/>`);
  out.push(L(path3([[cx - pw, cy - pd, 11.15], [cx + pw, cy - pd, 11.15], [cx + pw, cy + pd, 11.15], [cx - pw, cy + pd, 11.15]], true) + path3([[cx, cy - pd, 11.15], [cx, cy + pd, 11.15]]) + k.ring(cx, cy, pd * 0.4, 11.15, P, 16), { tone: "lo" }));
  out.push(mast(masts[2]), mast(masts[3]));
  return { svg: out.join(""), top: 30 };
}
function monument(b) {
  const cx = b.x + b.w / 2, cy = b.y + b.d / 2, plaza = k.insetPlan({ ...b, r: 0.6 }, 1.5), out = [];
  out.push(S(slab(plaza, 0, 0.8, 1, 0), { tone: "mid", crease: "none" }), L(k.planOutline(k.insetPlan(plaza, 3), 0.85, P, 0.4), { tone: "faint" }));
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) out.push(S(k.cylinder(cx + sx * 9, cy + sy * 9, 0.7, 0.8, 3, P, 8), { tone: "mid", crease: "none" }));
  out.push(S(slab({ x: cx - 5, y: cy - 5, w: 10, d: 10, r: 0.3 }, 0.8, 3, 1, 0.3), { tone: "mid", crease: "lo" }));
  out.push(S(G.solidOf([[0, 4.2], [46, 2.2], [52, 0.2]], G.frameOf([cx, cy, 3.8], [0, 0, 1], [1, 0, 0], [0, 1, 0]), P, { steps: 4 }), { tone: "hi", crease: "lo" }));
  const glow = GLOWS[Math.floor(hash(b.x, b.y, 3) * 4)];
  out.push(N(k.ring(cx, cy, 7, 30, P, 32), "c", 0.9, glow), N(k.ring(cx, cy, 5.2, 33, P, 28), "c", 0.6, glow));
  return { svg: out.join(""), top: 58 };
}
function park(b, seedX, seedY) {
  const out = [], p = k.insetPlan({ ...b, r: 1 }, 1), cx = p.x + p.w / 2, cy = p.y + p.d / 2;
  out.push(S(slab(p, 0, 0.6, 1, 0), { tone: "lo", crease: "none", className: "ow-mat ow-lawn" })); // the lawn
  out.push(L(k.lineOnTop([p.x + 1, cy], [p.x + p.w - 1, cy], 0.65, P) + k.lineOnTop([cx, p.y + 1], [cx, p.y + p.d - 1], 0.65, P) + k.ring(cx, cy, 4, 0.65, P, 18), { tone: "mid" }));
  const trees = [];
  for (let n = 0; n < 16; n++) {
    const tx = p.x + 3 + hash(seedX, n, 1) * (p.w - 6), ty = p.y + 3 + hash(seedY, n, 2) * (p.d - 6);
    if (Math.abs(tx - cx) < 3 || Math.abs(ty - cy) < 3 || Math.hypot(tx - cx, ty - cy) < 6) continue;
    trees.push([tx, ty, 2 + hash(n, seedX) * 1.4]);
  }
  for (const [tx, ty, r] of byDepth(trees)) out.push(L(path3([[tx, ty, 0.6], [tx, ty, 3.2]]), { tone: "mid" }), S(G.sphereOf([tx, ty, 3.2 + r], r, P, { steps: 12 }), { tone: "hi", crease: "none", className: "ow-mat ow-leaf" }));
  out.push(S(k.cylinder(cx, cy, 2.4, 0.6, 3.4, P, 10), { tone: "mid", crease: "lo" }), S(k.cylinder(cx, cy, 3.4, 4, 0.8, P, 12), { tone: "hi", crease: "lo" }));
  return { svg: out.join(""), top: 10 };
}
function plaza(...a) { return withMaterial("concrete", () => plazaNow(...a)); } // concrete, in the light theme's colour
function plazaNow(b) {
  const out = [], p = k.insetPlan({ ...b, r: 0.6 }, 1), cx = p.x + p.w / 2, cy = p.y + p.d / 2;
  out.push(S(slab(p, 0, 0.5, 1, 0), { tone: "mid", crease: "none" }));
  const grid = []; for (let x = p.x + 4; x < p.x + p.w; x += 4) grid.push(k.lineOnTop([x, p.y + 0.5], [x, p.y + p.d - 0.5], 0.55, P)); for (let y = p.y + 4; y < p.y + p.d; y += 4) grid.push(k.lineOnTop([p.x + 0.5, y], [p.x + p.w - 0.5, y], 0.55, P));
  out.push(L(grid.join(""), { tone: "faint" }));
  out.push(S(k.cylinder(cx, cy, 6, 0.5, 1.2, P, 24), { tone: "hi", crease: "lo" }), `<path class="ow-mouth" d="${k.pathOf(Array.from({ length: 24 }, (_, q) => at([cx + Math.cos(q / 24 * Math.PI * 2) * 5, cy + Math.sin(q / 24 * Math.PI * 2) * 5, 1.75])), true)}"/>`);
  // a statue on a pedestal in the fountain, and a holo column on one corner
  out.push(S(slab({ x: cx - 1.6, y: cy - 1.6, w: 3.2, d: 3.2, r: 0.2 }, 0.5, 4, 1, 0.2), { tone: "mid", crease: "lo" }), S(k.cylinder(cx, cy, 0.9, 4.5, 7, P, 8), { tone: "hi", crease: "none" }), S(G.sphereOf([cx, cy, 12.6], 1.2, P, { steps: 10 }), { tone: "hi", crease: "none" }));
  const hx = inX(p, 4), hy = inY(p, 4), glow = GLOWS[Math.floor(hash(b.x, b.y, 9) * 4)];
  out.push(S(k.cylinder(hx, hy, 1.4, 0.5, 2, P, 10), { tone: "mid" }), `<path class="ow-holo" data-glow="${glow}" d="${path3([[hx - 1.4, hy, 2.5], [hx + 1.4, hy, 2.5], [hx + 1.4, hy, 16], [hx - 1.4, hy, 16]], true)}"/>`, N(path3([[hx - 1.4, hy, 2.5], [hx + 1.4, hy, 2.5], [hx + 1.4, hy, 16], [hx - 1.4, hy, 16]], true), "c", 0.6, glow));
  for (const [bx, by] of [[p.x + 4, p.y + 4], [p.x + p.w - 8, p.y + p.d - 6]]) out.push(S(slab({ x: bx, y: by, w: 4, d: 1.4, r: 0.2 }, 0.5, 1, 1, 0), { tone: "mid", crease: "none" }));
  return { svg: out.join(""), top: 18 };
}
function transit(...a) { return withMaterial("steel", () => transitNow(...a)); } // steel, in the light theme's colour
function transitNow(b) { // an elevated monorail station; the beam runs across the cell
  const out = [], cx = b.x + b.w / 2, cy = b.y + b.d / 2, deck = { x: cx - 7, y: b.y + 3, w: 14, d: b.d - 6, r: 0.6 }, z = 15;
  const pillars = [[deck.x + 2, deck.y + 3], [deck.x + deck.w - 3.5, deck.y + 3], [deck.x + 2, deck.y + deck.d - 4.5], [deck.x + deck.w - 3.5, deck.y + deck.d - 4.5]].sort((p, q) => dep(...p) - dep(...q));
  const pil = ([px, py]) => S(slab({ x: px, y: py, w: 1.5, d: 1.5, r: 0.2 }, 0, z, 1, 0), { tone: "mid", crease: "none" });
  out.push(pil(pillars[0]), pil(pillars[1]), pil(pillars[2]));
  out.push(S(slab({ x: deck.x - 3, y: deck.y + 2, w: 5, d: 5, r: 0.3 }, 0, z + 2, 1, 0.2), { tone: "mid", crease: "lo" })); // the stair tower
  out.push(S(slab(deck, z, 1.6, 2, 0.3), { tone: "hi", crease: "lo" }));
  out.push(S(slab({ x: cx - 1, y: Y(Math.round((b.y - Y0) / C)) - 0, w: 2, d: C, r: 0 }, z - 2.4, 1.6, 1, 0), { tone: "mid", crease: "lo" })); // the beam, edge to edge
  const F = G.frameOf([deck.x, deck.y, z + 1.6], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  out.push(S(G.prismOf(F, [[0, 0], [2, 3.4], [5, 5], [9, 5], [12, 3.4], [14, 0]], 0, deck.d, P), { tone: "mid", crease: "lo" }));
  out.push(ribbons(deck.x, deck.x + deck.w, deck.y, deck.y + deck.d, z + 1.8, z + 4.6, "y", 3));
  out.push(pil(pillars[3]));
  out.push(signCentered("TRANSIT", [nearX(deck) + VX * 0.2, cy], z + 0.4, "right", "c", 2.4, "c"));
  return { svg: out.join(""), top: z + 8 };
}
const CIVIC = { stadium, monument, park, plaza, station: transit };

// ---- Basecamp wards: one per project, on a civic cell (layout.wards) ----
// The members' city draws what the project is doing; the public city the same hall and mast, dark and unlabelled.
// Nothing here has a height scale: a ward's form is fixed and stays under SCENERY_MAX, only its parts carry data.
//   hall and plaza (windows lit by this week's events), a broadcast mast (its lamp lit by a message this week),
//   a terraced hill with a lantern per tracked list at its hill position (0 at the left foot, 50 the top, 100 the
//   right foot), a rail yard with a track per card-table column and a car per card, a scaffold per to-do list under
//   way, and the archive where done work goes
const WARD_AT = {}; // project id → the hall's roof, where its live effects play
function ward(id, b) {
  const w = DATA.wards?.[id] ?? {}, members = !!w.name, out = [], lit = members && (w.events7 ?? 0) > 0;
  const plaza0 = k.insetPlan({ ...b, r: 0.6 }, 0.6);
  out.push(S(slab(plaza0, 0, 0.6, 1, 0), { tone: "mid", crease: "none" }));
  const grid = []; for (let x = plaza0.x + 4; x < plaza0.x + plaza0.w - 1; x += 4) grid.push(k.lineOnTop([x, plaza0.y + 1], [x, plaza0.y + plaza0.d - 1], 0.65, P));
  out.push(L(grid.join(""), { tone: "faint" }));
  const hw = b.w * 0.52, hd = b.d * 0.42, hall = { x: b.x + 1.5, y: b.y + 1.5, w: hw, d: hd, r: 0.8 }, hh = 16;
  const hill = { x: b.x + hw + 3, y: b.y + 1.5, w: b.w - hw - 4.5, d: hd };
  const yard = { x: b.x + 1.5, y: b.y + hd + 4, w: hw, d: b.d - hd - 5.5 }, site = { x: b.x + hw + 3, y: b.y + hd + 4, w: b.w - hw - 4.5, d: b.d - hd - 5.5 };
  const parts = [];
  // the hill (members only): contour terraces, then the lanterns on its crest line
  if (members) parts.push([hill, () => {
    const o = [], cx = hill.x + hill.w / 2, cy = hill.y + hill.d / 2, HH = 9;
    for (let s = 0; s < 5; s++) { const f = 1 - s / 5.2, p = { x: cx - (hill.w / 2) * f, y: cy - (hill.d / 2) * f, w: hill.w * f, d: hill.d * f, r: Math.min(hill.w, hill.d) * f * 0.45 }; o.push(S(slab(p, s * (HH / 5), HH / 5, 2, 0.2), { tone: s % 2 ? "hi" : "mid", crease: "lo" })); }
    const at2 = (pos) => { const u = pos / 100, x = hill.x + 1 + u * (hill.w - 2), z = HH * Math.sin(Math.PI * u) * 0.96 + 0.4; return [x, cy, z]; };
    const lan = (w.hill ?? []).map(([, pos]) => at2(pos));
    if (lan.length) o.push(L(lan.map(([x, y, z]) => path3([[x, y, z], [x, y, z + 1.6]])).join(""), { tone: "mid" }), `<g data-glow="a">${Dt(lan.map(([x, y, z]) => at([x, y, z + 1.9])), { size: 0.9, tone: "hi" })}</g>`);
    return { svg: o.join(""), top: HH + 3 };
  }]);
  // the hall, with the mast at its back corner
  parts.push([hall, () => {
    const o = [`<path class="iso-halo" d="${k.haloOf(hall, 0, hh, P)}"/>`];
    o.push(S(slab(hall, 0, hh, 3, 0.5), { tone: "mid", inner: L(k.sideSeam(hall, hh - 3, P, 3), { tone: "lo" }) }));
    const teeth = []; for (let x = hall.x + 2; x < hall.x + hall.w - 3; x += 4) teeth.push(path3([[x, hall.y + 1, hh], [x + 3, hall.y + 1, hh + 2.4], [x + 3, hall.y + hall.d - 1, hh + 2.4], [x, hall.y + hall.d - 1, hh]]));
    o.push(L(teeth.join(""), { tone: "lo" }));
    if (lit) o.push(withOn(true, () => winX(hall.x + 2, hall.x + hall.w - 2, nearY(hall), 4, hh - 4, Math.max(2, Math.floor(hall.w / 4)), 2)));
    const mx = VX > 0 ? hall.x + 2 : hall.x + hall.w - 2, my = VY > 0 ? hall.y + 2 : hall.y + hall.d - 2;
    o.push(S(k.cylinder(mx, my, 0.5, hh, 22, P, 6), { tone: "mid", crease: "none" }), L(k.ring(mx, my, 1.8, hh + 14, P, 12) + k.ring(mx, my, 1.4, hh + 18, P, 12), { tone: "lo" }));
    o.push(Dt([at([mx, my, hh + 22.6])], { size: members && (w.messages7 ?? 0) > 0 ? 1.2 : 0.6, tone: members && (w.messages7 ?? 0) > 0 ? "hi" : "lo", pulse: members && (w.messages7 ?? 0) > 0 }));
    if (members) { const d = readDir("x")[0] > 0 ? 1 : -1; o.push(sign(w.name.toUpperCase().slice(0, 18), [d > 0 ? hall.x + 2 : hall.x + hall.w - 2, nearY(hall) + VY * 0.2], hh - 3.2, "left", "c", Math.min(2.6, (hall.w - 4) / Math.max(4, Math.min(18, w.name.length) * 0.64)), glowOf(w.name))); }
    if (String(id) === String(CONFIG.basecamp?.central ?? "")) { // the central ward's clock tower, on the hall's near corner
      const t = { x: VX > 0 ? hall.x + hall.w - 5 : hall.x + 1, y: VY > 0 ? hall.y + hall.d - 5 : hall.y + 1, w: 4, d: 4, r: 0.3 }, th = 38;
      o.push(S(slab(t, hh, th - hh, 2, 0.3), { tone: "hi", crease: "lo" }), S(slab(k.insetPlan(t, -0.5), th, 1.2, 1, 0.2), { tone: "mid" }));
      const fx = nearX(t) + VX * 0.1, fy = nearY(t) + VY * 0.1, cz = th - 3.5, face = (pts) => path3(pts, true);
      const round = (f) => Array.from({ length: 16 }, (_, q) => f(Math.cos((q / 16) * Math.PI * 2) * 1.5, Math.sin((q / 16) * Math.PI * 2) * 1.5));
      o.push(L(face(round((u, v) => [fx, t.y + 2 + u, cz + v])) + face(round((u, v) => [t.x + 2 + u, fy, cz + v])) + path3([[fx, t.y + 2, cz], [fx, t.y + 2, cz + 1.1]]) + path3([[t.x + 2, fy, cz], [t.x + 2.8, fy, cz]]), { tone: "mid" }));
    }
    WARD_AT[id] = [hall.x + hall.w / 2, hall.y + hall.d / 2, PZ + hh + 3];
    return { svg: o.join(""), top: hh + 24 };
  }]);
  if (members) {
    // the rail yard: one track per column (at most five), a car per card, done cars at the last
    parts.push([yard, () => {
      const o = [], cols = (w.columns ?? []).slice(0, 5), n = Math.max(1, cols.length), gap = yard.d / n, rails = [], cars = [];
      cols.forEach(([, count], t) => {
        const y = yard.y + gap * (t + 0.5);
        rails.push(k.lineOnTop([yard.x, y - 0.6], [yard.x + yard.w, y - 0.6], 0.7, P), k.lineOnTop([yard.x, y + 0.6], [yard.x + yard.w, y + 0.6], 0.7, P));
        const fit = Math.floor((yard.w - 1) / 3.2);
        for (let c = 0; c < Math.min(count, fit); c++) cars.push({ x: yard.x + 0.6 + c * 3.2, y: y - 0.9, w: 2.6, d: 1.8, r: 0.3 });
      });
      o.push(L(rails.join(""), { tone: "lo" }));
      for (const c of byDepth(cars, (q) => [q.x + q.w / 2, q.y + q.d / 2])) o.push(S(slab(c, 0.7, 1.5, 1, 0.2), { tone: "hi", crease: "lo" }));
      return { svg: o.join(""), top: 3 };
    }]);
    // construction sites and the archive
    parts.push([site, () => {
      const o = [], arch = { x: site.x + site.w - 9, y: site.y + site.d - 8, w: 8, d: 7, r: 0.4 }, sites = Math.min(4, w.building ?? 0);
      for (let s = 0; s < sites; s++) {
        const p = { x: site.x + (s % 2) * 6.5, y: site.y + Math.floor(s / 2) * 6, w: 5, d: 4.5, r: 0.2 }, h = 5 + (hash(+id || 1, s, 9) * 5) | 0;
        o.push(L(k.planOutline(p, h, P, 0.2) + k.planOutline(p, h / 2, P, 0.2) + k.corners(p, 0).map(([x, y]) => path3([[x, y, 0.6], [x, y, h]])).join(""), { tone: "mid" }));
      }
      o.push(S(slab(arch, 0.6, 6, 2, 0.3), { tone: "lo", crease: "lo" }), L(k.planOutline(k.insetPlan(arch, 1), 6.6, P, 0.2), { tone: "faint" }));
      return { svg: o.join(""), top: 10 };
    }]);
  }
  for (const [p, f] of byDepth(parts, ([q]) => [q.x + q.w / 2, q.y + q.d / 2])) out.push(f().svg);
  station(`ward:${id}`, members
    ? { kind: "Basecamp ward", title: w.name, href: w.url || "", link: "Open in Basecamp", what: `${w.people ?? 0} people. ${w.open ?? 0} to-dos open, ${w.done ?? 0} done${w.building ? `, ${w.building} lists under way` : ""}. ${w.events7 ?? 0} events this week.${w.repos?.length ? ` Steers ${w.repos.join(", ")}.` : ""}`,
      list: [...(w.hill ?? []).map(([t, pos]) => `${t} · ${pos < 50 ? "figuring it out" : pos > 50 ? "making it happen" : "at the top"} (${pos})`), ...(w.columns ?? []).map(([t, n]) => `${t} · ${n} cards`), ...(w.subjects ?? []).map(([, s]) => s)] }
    : { kind: "Basecamp ward", title: "A Basecamp project", what: "Its work is in the members' city: sign in to see it." });
  return { svg: `<g data-station="ward:${id}">${out.join("")}</g>`, top: 42 };
}

// ---------- the contributors' quarter ----------
const QUARTER = {}, HOMES = {}; // HOMES: login → the roof of their house, where live effects for that person play
for (const [login, where] of Object.entries(HOUSES)) { const [cellKey, s] = where.split(":"); (QUARTER[cellKey] ??= []).push({ login, s: +s }); }
for (let r = 1; r <= RINGS; r++) for (const cellKey of ringCells(r)) {
  const [i, j] = cellKey.split(",").map(Number), list = QUARTER[cellKey], blk = blockOf(i, j), civic = civicAt(cellKey);
  streetStrips(i, j);
  if (LAYOUT.lots?.[cellKey]) continue; // a repository's lot out here draws itself
  const wardId = Object.keys(LAYOUT.wards ?? {}).find((id) => LAYOUT.wards[id] === cellKey);
  if (wardId) { drawing("ward:" + wardId, () => { const t = ward(wardId, blk); plinth({ ...blk, r: 1 }); onPlinth({ x0: blk.x, x1: blk.x + blk.w, y0: blk.y, y1: blk.y + blk.d }, t.top, t.svg); }); continue; }
  if (civic) { const t = CIVIC[civic](blk, i * 13 + 5, j * 17 + 3); plinth({ ...blk, r: 1 }); onPlinth({ x0: blk.x, x1: blk.x + blk.w, y0: blk.y, y1: blk.y + blk.d }, t.top, t.svg); continue; }
  const fpB = { x0: blk.x, x1: blk.x + blk.w, y0: blk.y, y1: blk.y + blk.d };
  if (!list) { // a block with no house yet: low scenery until the quarter reaches it (no data, under SCENERY_MAX)
    seed = 7000 + i * 97 + j * 7919; CELL = cellKey;
    const v = hash(i, j, 21);
    plinth({ ...blk, r: 1 }); // every block stands at deck level; the streets run between them below
    if (v < 0.55) { const t = scenery(blk.x - 4 + (blk.w - 35) / 2, blk.y - 4 + (blk.d - 35) / 2, i * 7 + j, 40); onPlinth(fpB, t.top, t.svg); }
    else if (v < 0.8) { const a = shed(blk.x + 2, blk.y + 2, Math.min(32, blk.w - 4), Math.min(24, blk.d - 4)), b = tank(blk.x + blk.w - 24, blk.y + blk.d - 24); onPlinth(fpB, Math.max(a.h, b.h), a.svg + b.svg); }
    else { const t = park(blk, i * 13 + 5, j * 17 + 3); onPlinth(fpB, t.top, t.svg); }
    CELL = null;
    continue;
  }
  // nine plots on a 3 × 3 grid over the block; each house sits a little off its plot (seeded by its login)
  const fs = Math.min(1, (Math.min(blk.w, blk.d) / 3 - 1.2) / 12), sz = 12 * fs, px = (blk.w - sz) / 2, py = (blk.d - sz) / 2, jit = Math.min(1, Math.max(0, Math.min(px, py) - sz - 0.4));
  const spots = list.map((hh) => ({ ...hh, x: blk.x + (hh.s % 3) * px + (hash(hh.login.length, hh.login.charCodeAt(0), i) - 0.5) * 2 * jit, y: blk.y + Math.floor(hh.s / 3) * py + (hash(hh.login.charCodeAt(hh.login.length - 1), j, hh.s) - 0.5) * 2 * jit }));
  const out = []; let top = 3;
  for (const hh of byDepth(spots, (q) => [q.x + sz / 2, q.y + sz / 2])) {
    drawing("person:" + hh.login, () => {
    const stucco = ["plaster", "stucco-b", "stucco-c", "stucco-d"][Math.floor(hash(hh.login.length, hh.login.charCodeAt(0), 5) * 4)]; // a house's render, fixed by its login
    const t = withOn((PERSON[hh.login]?.c7 ?? 0) > 0, () => withMaterial(stucco, () => contributorTower(hh.login, hh.x, hh.y, i * 31 + j, fs))); top = Math.max(top, t.top);
    let svg = t.svg;
    const built = LAYOUT.houseBorn?.[hh.login], age = built ? (DATA.now - built) / 86400 : 9;
    if (age < 1) { // a house in its first day stands in scaffolding under a small crane (contributor.new)
      const p = { x: hh.x - 0.8, y: hh.y - 0.8, w: sz + 1.6, d: sz + 1.6, r: 0.3 }, ch = t.top + 6, cx = inX(p, 0), cy = inY(p, 0);
      svg = L(k.planOutline(p, t.top - 8, P, 0.5) + k.corners(p, 0).map(([x, y]) => path3([[x, y, 0], [x, y, t.top - 8]])).join(""), { tone: "faint" }) + svg
        + L(path3([[cx, cy, 0], [cx, cy, ch]]) + path3([[cx - VX * 14, cy, ch], [cx + VX * 4, cy, ch]]), { tone: "mid" }) + warn(cx, cy, ch + 1);
    }
    HOMES[hh.login] = [Math.round((hh.x + sz / 2) * 10) / 10, Math.round((hh.y + sz / 2) * 10) / 10, Math.round(PZ + t.top - 4)];
    out.push(lift(`<g data-station="person:${hh.login}">${svg}</g>`)); // each house carries its own lift, so it can be redrawn alone
    });
    const c = CONTRIB[hh.login];
    station(`person:${hh.login}`, { kind: "Contributor", what: c ? `${c.total.toLocaleString("en-US")} lifetime ${c.total === 1 ? "commit" : "commits"} across ${c.repos.length} ${c.repos.length === 1 ? "repository" : "repositories"}${c.repos[0] ? `, most in ${c.repos[0][0]}` : ""}.` : "" });
  }
  // the block stands on a plinth as tall as the deck, so a person's tower and a repository's share one scale from one level
  plinth({ ...blk, r: 1 }); item({ x0: blk.x, x1: blk.x + blk.w, y0: blk.y, y1: blk.y + blk.d }, top + 2, out.join(""));
}
if (RINGS) groundLabel(X(-RINGS) + 4, Y(15 + RINGS) + 8, "CONTRIBUTORS' QUARTER · ONE TOWER PER PERSON · HEIGHT = LIFETIME COMMITS · LAMP = THIS WEEK");
// the billboard row: distinguished corporate patrons beyond the three billboard towers' nine screens stand on
// gantries across the ring road along the mark's front edge, three screens to a gantry, in the page's order
{
  const extra = DIST_CORP.slice(9);
  for (let g = 0; g * 3 < extra.length; g++) {
    const names = extra.slice(g * 3, g * 3 + 3), x0 = X(1) + g * 2 * C, y0 = Y(15) + 1, hgt = 34;
    CELL = null; const t = gantryBoard({ x: x0, y: y0, w: 2 * C - 8, d: STREET - 2, r: 0.5 }, hgt, names);
    onGround(t.fp, t.top, t.svg);
    names.forEach((nm) => patronStation(nm, "boards", "on the billboard row across the ring road"));
  }
}

// Belts: each run carries only the flow that actually passes through it
const worksFeed = ["works-1", "works-2", "works-3", "works-4"].map((s) => SLOT[s]).filter(Boolean);
const eastFeed = APPS; // the themes and plugins cabinets on the inner east stroke ship by drone
const podFeed = ["pod-1", "pod-2"].map((s) => SLOT[s]).filter(Boolean);
const inFeed = [...worksFeed, ...eastFeed, ...podFeed]; // everything the outer ring sends to the hall
const mainFeed = [...inFeed, SLOT.hall].filter((n) => RP[n]); // plus the hall's own work
const lineFeed = [...mainFeed, SLOT.press, SLOT.disc].filter((n) => RP[n]); // plus the presses, out to dispatch
belt(makeRun("north-w", SLOT["works-1"], worksFeed, "x", BACK, 1), X(0) + 4, mid(7) - 6.5, 36);
belt(makeRun("east", null, eastFeed, "y", EAST, -1), Y(0) + C - 2.5, Y(13) + 30, 36);
belt(makeRun("north-e", SLOT["pod-1"], [...eastFeed, ...podFeed], "x", BACK, -1), mid(7) + 6.5, X(14) + 15.5, 36);
belt(makeRun("bridge-n", null, inFeed, "y", mid(7), 1), Y(0) + C - 2.5, midY(2) - 6.5, 30);
belt(makeRun("inner-n", null, inFeed, "x", midY(2), -1), mid(2) - 6.5, mid(7) + 6.5, 36);
const mainRun = makeRun("main", null, mainFeed, "y", mid(2), 1);
belt(mainRun, midY(2) + 6.5, Y(3) + 4);
const lineOut = makeRun("line", null, lineFeed, "x", midY(12), 1);
belt(makeRun("hall-out", null, mainFeed, "y", mid(2), 1), Y(8) - 4, midY(12) + 6.5, 30);
belt(lineOut, mid(2) + 6.5, mid(4) - 20);
belt(lineOut, mid(4) + 20, mid(6) - 18);
belt(lineOut, mid(6) + 18, mid(7) + 6.5);
belt(makeRun("bridge-s", null, lineFeed, "y", mid(7), 1), midY(12) + 6.5, Y(14) + 3, 30);

withMaterial("concrete", platforms); // the mark's decks are concrete
const painted = ordered().map((it) => it.svg); // in only mode too: a station's groups come out in the full build's order (the projection stays real, only the drawing is quiet)
const groundSvg = ground();
const fb = screenBox({ fp: fpOf(FLOOR), z1: 0, platform: true }), low = at([FLOOR.x + FLOOR.w, FLOOR.y + FLOOR.d, -FLOOR_H - 4]);
const boxes = items.map(screenBox).concat([[fb[0], fb[1], fb[2], low[1]]]);
const VB = [Math.min(...boxes.map((b) => b[0])) - 10, Math.min(...boxes.map((b) => b[2])) - 10];
VB.push(Math.max(...boxes.map((b) => b[1])) + 10 - VB[0], Math.max(...boxes.map((b) => b[3])) + 24 - VB[1]);

const svg = k.figureSvg({
  width: WIDTH, height: HEIGHT,
  label: `The ${CONFIG.name || CONFIG.org || "org"} drawn as a city, built on raised platforms in the shape of the Omarchy mark: an outer ring open at the south, an inner ring open at the north, and three bridges between them. On the outer ring stand the ${KIND.works.toLowerCase()} and the ${KIND.pod.toLowerCase()} to the north, the districts' buildings to the east and west, and the archive and the ${KIND.dispatch.toLowerCase()} to the south, with a truck in the gap. Belts carry crates from the outer ring across the north bridge to the ${KIND.hall.toLowerCase()} on the inner ring, then through the ${KIND.press.toLowerCase()} and the ${KIND.disc.toLowerCase()} and across the south bridge to dispatch. Pallets on the inner ring hold open pull requests.`,
  body: [groundSvg, ...painted],
}).replace(`viewBox="0 0 ${WIDTH} ${HEIGHT}"`, `viewBox="${VB.map((v) => v.toFixed(1)).join(" ")}"`);
if (!MODE3D && !svg.includes(VB[0].toFixed(1))) throw new Error("viewBox not set");


if (SLOT.press) ROOF[SLOT.press] = [mid(4), midY(12), PZ + Math.max(20, H(life(SLOT.press))) + 7];
if (SLOT.disc) ROOF[SLOT.disc] = [mid(6), midY(12), PZ + H(life(SLOT.disc)) + 2];
const droneSrc = Object.keys(ROOF).filter((id) => id !== SLOT.hall)
  .map((id) => ({ id, from: ROOF[id], rate: c7(id) }))
  .filter((d) => d.from && d.rate > 0).sort((a, b) => b.rate - a.rate);
const ticker = Object.entries(RP).flatMap(([id, r]) => (r.latest || []).map((l) => [l[0], id, l[2]])).sort((a, b) => b[0] - a[0]).slice(0, 24).map((l) => [l[1], l[2]]);
const lotRepos = Object.values(LAYOUT.lots ?? {}).filter((n) => RP[n]);
const landmarkOrder = ["hall", "press", "disc", "dispatch", "works-1", "works-2", "works-3", "pod-1", "pod-2"].map((s) => SLOT[s]).filter((id) => RP[id]);
const model = {
  P, vb: VB, az: AZ, views: VIEWS, now: DATA.now, generatedAt: DATA.generatedAt, window: DATA.window,
  org: CONFIG.org ?? DATA.org ?? "", name: CONFIG.name || CONFIG.org || DATA.org || "",
  repos: RP, groups: { apps: APPS, catalog: DRAWERS, sites: SITES, upstream: SILOS, retired: RETIRED }, stations: STATIONS,
  people: DATA.people, platter: PLATTER, days: DATA.days,
  groupNames: Object.fromEntries(["apps", "catalog", "sites", "upstream", "retired"].map((id) => [id, DISTRICT[id]?.name ?? id[0].toUpperCase() + id.slice(1)])), // the districts' names, from the config
  contributors: DATA.contributors ?? [], patrons: DATA.patrons ?? [], patronAt: PATRON_AT,
  sky: { x0: X(0) - 60, x1: X(15) + 60, y0: Y(0) - 60, y1: Y(15) + 60, lanes: [[Y(4), 128, 1], [Y(9), 112, -1], [Y(13), 120, 1]], cross: [[X(5), 136, 1], [X(10), 104, -1]] },
  drones: droneSrc, hub: HALL.pad, crown: HALL.crown, homes: HOMES, wardAt: WARD_AT, archive: PARCELS.retired?.length ? [PARCELS.retired.reduce((t, p) => t + p.x + p.w / 2, 0) / PARCELS.retired.length, PARCELS.retired.reduce((t, p) => t + p.y + p.d / 2, 0) / PARCELS.retired.length, PZ + 4] : null, roofs: Object.fromEntries(Object.entries(ROOF).filter(([id]) => RP[id]).map(([id, r]) => [id, r.map((v) => Math.round(v * 10) / 10)])), // where live effects play
  lights: LIGHTS.slice(0, 3).concat(HALL.crown ? [HALL.crown] : []), pads: PADS, ticker,
  runs: RUNS.map((r) => ({ id: r.id, rate: r.rate + r.bots.length, events: r.events, ...(r.bots.length ? { bots: r.bots } : {}), axis: r.axis, dir: r.dir, c: r.c, segments: r.segments })),
  tour: Object.keys(STATIONS).filter((id) => RP[id] && RP[id].c7 > 0).sort((a, b) => RP[b].c7 - RP[a].c7).slice(0, 10),
  order: [...landmarkOrder, ...APPS.filter((a) => c30(a)), ...DRAWERS.filter((a) => c30(a)), ...SITES.filter((a) => c30(a)), ...lotRepos],
  slots: SLOT,
};
return { svg, P, vb: VB, model, inner: svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, ""), items: items.length };
}
