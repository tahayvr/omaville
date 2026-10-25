// A stand-in for the isometric drawing kit that records 3D primitives instead of projecting them.
// city.js runs unchanged on top of it (with `at` as the identity); scene3d.js turns the record into a three.js scene.
// Every primitive is written as a token ⟦…⟧ holding URI-encoded JSON, so it can sit inside the
// same markup the SVG build produces (groups keep station ids, transforms, classes).
import * as K from "./kit/iso-kit.mjs";
import * as GL from "./kit/lathe.mjs";

const TAU = Math.PI * 2;
export const tok = (o) => `⟦${encodeURIComponent(JSON.stringify(o))}⟧`;
const r3 = (v) => Math.round(v * 100) / 100;
const pt = (p) => p.map(r3);
const circle = (cx, cy, r, z, n = 24) => Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos((i / n) * TAU), cy + r * Math.sin((i / n) * TAU), z]);
const loop = (plan, z, steps = 8) => { const ring = K.roundedPlan(plan, steps).map(([x, y]) => [x, y, z]); return ring.concat([ring[0]]); };

// ---- pure helpers: the real ones ----
export const { AZIMUTH, ELEVATION, fitProjection, iso, depthOf, towardViewer, axisVector, insetPlan, corners, boxCorners, ringOf, roundedPlan, cameraOf } = K;
export const ISO_CSS = "";

// ---- lines and points ----
export const pathOf = (points, closed = false) => (points.length ? tok({ t: "p", p: points.map(pt), c: closed ? 1 : 0 }) : "");
export const joinPaths = (paths) => paths.filter(Boolean).join("");
export const lineOnTop = (a, b, z) => pathOf([[a[0], a[1], z], [b[0], b[1], z]]);
export const segment = (a, b) => pathOf([a, b]);
export const onTop = (points, z, _p, closed = false) => pathOf(points.map(([x, y]) => [x, y, z]), closed);
export const planOutline = (plan, z, _p, steps = 8) => pathOf(loop(plan, z, steps));
export const sideSeam = (plan, z, _p, steps = 8) => pathOf(loop(plan, z, steps));
export const ring = (cx, cy, r, z, _p, steps = 40) => pathOf(circle(cx, cy, r, z, Math.max(12, Math.min(48, steps))));
export const sideArc = (cx, cy, r, z, _p, steps = 24) => pathOf(circle(cx, cy, r, z, Math.max(16, steps * 2)));
export function knurl(cx, cy, r, z0, z1, count, _p, inset = 0.4) {
  let out = "";
  for (let i = 0; i < count; i++) { const a = (i / count) * TAU, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a); out += pathOf([[x, y, z0 + inset], [x, y, z1 - inset]]); }
  return out;
}
export function topTicks(from, to, step, every, edge, z, lengths, _p, axis = "x") {
  const minor = [], major = [];
  const first = Math.ceil(from / step) * step;
  for (let a = first, i = Math.round(first / step); a <= to + 1e-9; a += step, i++) {
    const big = i % every === 0, len = big ? lengths[1] : lengths[0];
    const p = axis === "x" ? [[a, edge, z], [a, edge + len, z]] : [[edge, a, z], [edge + len, a, z]];
    (big ? major : minor).push(pathOf(p));
  }
  return { minor: minor.join(""), major: major.join("") };
}
export function radialTicks(cx, cy, radius, count, every, z, lengths, _p, from = 0, span = TAU) {
  const minor = [], major = [];
  const closed = Math.abs(span - TAU) < 1e-9, steps = closed ? count : count + 1;
  for (let i = 0; i < steps; i++) {
    const a = from + (i / count) * span, big = i % every === 0, inner = radius - (big ? lengths[1] : lengths[0]);
    (big ? major : minor).push(pathOf([[cx + inner * Math.sin(a), cy - inner * Math.cos(a), z], [cx + radius * Math.sin(a), cy - radius * Math.cos(a), z]]));
  }
  return { minor: minor.join(""), major: major.join("") };
}
export const lineSvg = (d, { tone = "lo" } = {}) => (d ? `<path class="iso-line" data-tone="${tone}" d="${d}"/>` : "");
export const dotsSvg = (points, { size = 0.5, tone = "mid", pulse = false } = {}) => `<path class="iso-dots" data-tone="${tone}" data-size="${size}"${pulse ? ' data-pulse=""' : ""} d="${pathOf(points)}"/>`;

// ---- solids ----
export const slabOf = (plan, z, h) => ({ t: "slab", plan: { x: r3(plan.x), y: r3(plan.y), w: r3(plan.w), d: r3(plan.d), r: r3(plan.r || 0) }, z: r3(z), h: r3(h) });
export const extrude = (ring2, z, h) => ({ t: "poly", ring: ring2.map(([x, y]) => [r3(x), r3(y)]), z: r3(z), h: r3(h) });
export const cylinder = (cx, cy, r, z, h, _p, steps = 32) => ({ t: "cyl", c: [r3(cx), r3(cy)], r: r3(r), z: r3(z), h: r3(h), n: Math.max(10, Math.min(40, steps)) });
export const haloOf = () => "";
export const solidSvg = (s, { tone = "hi", crease = "faint", inner = "", className = "" } = {}) => `<path class="iso-solid" data-tone="${tone}" data-crease="${crease}"${className ? ` data-material="${className.split(" ").pop().replace(/^ow-/, "")}"` : ""} d="${tok(s)}"/>${inner}`; // className (the plate's class, e.g. ow-leaf) names a material

// ---- text and transforms ----
export const faceTextSvg = (m, text, { size = 3, tone = "mid", anchor = "start" } = {}) => `<text class="iso-face-text" data-tone="${tone}" transform="${m}" font-size="${size}" text-anchor="${anchor}">${text}</text>`;
export const translateAlong = (_p, v) => tok({ t: "tr", v: pt(v) });
export const figureSvg = ({ body }) => `<svg viewBox="0 0 1 1">${Array.isArray(body) ? body.join("") : body}</svg>`;

// ---- lathe kit ----
export const G = {
  ...GL,
  frameOf: GL.frameOf,
  solidOf: (profile, F) => ({ t: "lathe", prof: [[profile[0][0], 0], ...profile.map(([s, r]) => [s, r]), [profile[profile.length - 1][0], 0]].map(pt), F: frameJ(F) }),
  bandOfProfile: (profile, F) => ({ t: "lathe", prof: profile.map(([s, r]) => [r3(s), r3(r)]), F: frameJ(F) }),
  disc: (s0, s1, r, F) => ({ t: "lathe", prof: [[s0, 0], [s0, r], [s1, r], [s1, 0]].map(pt), F: frameJ(F) }),
  prismOf: (F, polygon, s0, s1) => ({ t: "prism", poly: polygon.map(pt), s0, s1, F: frameJ(F) }),
  sphereOf: (c, r) => ({ t: "sphere", c: pt(c), r: r3(r) }),
  arcOf: (F, s, r) => pathOf(Array.from({ length: 33 }, (_, i) => GL.pointOf(F, s, r, (i / 32) * TAU))),
};
function frameJ(F) { return { o: pt(F.o), a: F.a.map((v) => Math.round(v * 1e4) / 1e4), u: F.u.map((v) => Math.round(v * 1e4) / 1e4), v: F.v.map((v) => Math.round(v * 1e4) / 1e4) }; }
