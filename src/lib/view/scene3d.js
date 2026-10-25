// Turns the 3D record from city.js (three: true) into a three.js scene: the stations' parts batched in layers
// (batch3d.js), crisp edge lines, window panes, signs as text planes, plus handles for everything that moves.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { roundedPlan } from "../city/kit/iso-kit.mjs";
import { SMALL_PARTS, SIGN_PX, PLATE_PX } from "../city/lod.js";
import { Layer, withRise } from "./batch3d.js";


const RE = /<g\b([^>]*)>|<\/g>|<path\b([^>]*?)\/?>|<text\b([^>]*)>([^<]*)<\/text>|<image\b([^>]*?)\/?>/g;
const ATTR = /([\w-]+)="([^"]*)"/g;
const TOK = /⟦([^⟧]*)⟧/g;
const attrs = (s) => { const o = {}; if (s) for (const m of s.matchAll(ATTR)) o[m[1]] = m[2]; return o; };
const toks = (s) => (s ? [...s.matchAll(TOK)].map((m) => JSON.parse(decodeURIComponent(m[1]))) : []);

// Two palettes: the light theme is a model in colour (plaster and concrete faces, sand and asphalt, blue glass, green
// parks, saturated signage); the dark theme is the monochrome white model, where colour means life or a sign.
export const PALETTE = {
  light: {
    bg: 0xf2f2ef, face: { hi: 0xf5efe3, mid: 0xe3dccd, lo: 0xcbc2b3, faint: 0xb9b0a1 }, edge: 0x6e655b,
    line: { hi: 0x4a433b, mid: 0x857b70, lo: 0xb0a799, faint: 0xd1c9bd, neon: 0x8aa3b8 },
    materials: { board: 0x4a403a, leaf: 0x6c9d57, lawn: 0x8fb36c, plaster: 0xf5efe3, render: 0xebe5da, concrete: 0xcfccc4, brick: 0xb07a68, steel: 0x8e98a2, zinc: 0xb8bcc0, timber: 0xc9a470, safety: 0xe0b43a, "stucco-b": 0xe6cfa6, "stucco-c": 0xe8cfc4, "stucco-d": 0xd8dccb },
    pane: { c: 0x8c9aa8, m: 0x7f8d9b, a: 0x97a3ae, off: 0xa3adb7, v: 0x8794a3 }, paneOn: { c: 0xb9dcf2, m: 0xcde6f6, a: 0xf2e0b3, off: 0xd7e4ee, v: 0xc3d6f0 }, ground: 0xc6c0b3, road: 0x8d8984, text: 0x4f473e, // dark glass when quiet, sky glass (or warm, lit from inside) when busy; paving and asphalt on a dark board
    accent: 0x0e8fa3, live: 0xd6338a, holo: 0x8fb8d6, mouth: 0x7fa6bd, steam: 0xffffff,
    glow: { c: 0x2f74d0, m: 0xd63d95, a: 0xe39a2a, v: 0x8a5fd6 },
  },
  dark: {
    bg: 0x0b0b0b, face: { hi: 0x2b2b2b, mid: 0x242424, lo: 0x1e1e1e, faint: 0x191919 }, edge: 0x6e6e6e,
    materials: {}, // monochrome: a material is a face tone here (buildScene falls back to the tone)
    line: { hi: 0xd4d4d4, mid: 0x6a6a6a, lo: 0x3e3e3e, faint: 0x2a2a2a, neon: 0xb4b4b4 },
    pane: { c: 0x1a1a1a, m: 0x202020, a: 0x171717, off: 0x141414, v: 0x1c1c1c }, paneOn: { c: 0xb4b4b2, m: 0xc8c8c6, a: 0xa6a49c, off: 0x7a7a78, v: 0xaeaeb2 }, ground: 0x0f0f0f, road: 0x070707, text: 0x9a9a9a,
    accent: 0x3fe0e8, live: 0xff4fc8, holo: 0x262626, mouth: 0x050505, steam: 0x5a5a5a,
    glow: { c: 0x6f97dc, m: 0xd46aaa, a: 0xd7a45a, v: 0x9a86dc },
  },
};

// ---------- geometry for one recorded solid ----------
function shapeOf(points) { const s = new THREE.Shape(); points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); return s; }
function basis(F, local) { // local axes → frame axes, right-handed
  const u = new THREE.Vector3(...F.u), a = new THREE.Vector3(...F.a), v = new THREE.Vector3(...F.v);
  const m = new THREE.Matrix4();
  if (local === "lathe") m.makeBasis(u, a, new THREE.Vector3().crossVectors(u, a));
  else m.makeBasis(u, v, a);
  m.setPosition(...F.o);
  return m;
}
export function solidGeometry(s) {
  let g;
  switch (s.t) {
    case "slab": {
      const p = s.plan;
      if (!p.r || p.r < 0.35) { g = new THREE.BoxGeometry(Math.max(p.w, 0.01), Math.max(p.d, 0.01), Math.max(s.h, 0.01)); g.translate(p.x + p.w / 2, p.y + p.d / 2, s.z + s.h / 2); }
      else { g = new THREE.ExtrudeGeometry(shapeOf(roundedPlan(p, 3)), { depth: Math.max(s.h, 0.01), bevelEnabled: false }); g.translate(0, 0, s.z); }
      break;
    }
    case "poly": g = new THREE.ExtrudeGeometry(shapeOf(s.ring), { depth: Math.max(s.h, 0.01), bevelEnabled: false }); g.translate(0, 0, s.z); break;
    case "cyl": g = new THREE.CylinderGeometry(s.r, s.r, Math.max(s.h, 0.01), Math.min(28, s.n), 1); g.rotateX(Math.PI / 2); g.translate(s.c[0], s.c[1], s.z + s.h / 2); break;
    case "sphere": g = new THREE.SphereGeometry(s.r, 16, 10); g.translate(...s.c); break;
    case "lathe": {
      const pts = s.prof.map(([h, r]) => new THREE.Vector2(Math.max(r, 0), h));
      g = new THREE.LatheGeometry(pts, 24);
      g.applyMatrix4(basis(s.F, "lathe"));
      break;
    }
    case "prism": {
      const u = new THREE.Vector3(...s.F.u), v = new THREE.Vector3(...s.F.v), a = new THREE.Vector3(...s.F.a);
      const flip = new THREE.Vector3().crossVectors(u, v).dot(a) < 0;
      g = new THREE.ExtrudeGeometry(shapeOf(flip ? s.poly.map(([x, y]) => [x, -y]) : s.poly), { depth: Math.max(s.s1 - s.s0, 0.01), bevelEnabled: false });
      g.translate(0, 0, s.s0);
      const m = new THREE.Matrix4().makeBasis(u, flip ? v.negate() : v, a); m.setPosition(...s.F.o);
      g.applyMatrix4(m);
      break;
    }
    default: return null;
  }
  g.deleteAttribute("uv");
  return g.index ? g.toNonIndexed() : g;
}

// ---------- text on a face ----------
const FONT = '600 64px ui-monospace, "SFMono-Regular", Menlo, monospace';
function textPlane(text, tm, size, anchor, color, spacing = 0.12) {
  const c = document.createElement("canvas"), ctx = c.getContext("2d");
  ctx.font = FONT;
  const chars = [...text], adv = ctx.measureText("M").width * (1 + spacing);
  const wpx = Math.ceil(adv * chars.length) + 8, hpx = 88;
  c.width = wpx; c.height = hpx;
  const draw = (str, col) => {
    ctx.clearRect(0, 0, wpx, hpx); ctx.font = FONT; ctx.fillStyle = col; ctx.textBaseline = "alphabetic";
    [...str].forEach((ch, i) => ctx.fillText(ch, 4 + i * adv, 66));
  };
  draw(text, color);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4; tex.colorSpace = THREE.SRGBColorSpace;
  // the city sits in a y-mirrored group (map3d.js), so the glyphs are drawn mirrored to read right way round
  tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = -1; tex.offset.x = 1;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const scale = size / 64, w = wpx * scale, h = hpx * scale;
  const geo = new THREE.PlaneGeometry(w, h);
  // the text box in its own plane: u along the reading direction, v up the glyphs
  const d = new THREE.Vector3(tm.d[0], tm.d[1], 0), n = new THREE.Vector3(...tm.n);
  let up = tm.v ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(-tm.d[1], tm.d[0], 0);
  // world space is mirrored in y on screen (see map3d.js), so read the handedness in mirrored space
  const M = (v) => new THREE.Vector3(v.x, -v.y, v.z);
  let u = d.clone();
  if (new THREE.Vector3().crossVectors(M(u), M(up)).dot(M(n)) > 0) { if (tm.v) u.negate(); else up.negate(); }
  // the baseline starts at `at` and runs along d (anchor start) or ends there (anchor end), as in the SVG
  const len = (chars.length * adv) * scale, along = anchor === "end" ? -len / 2 : len / 2;
  const centre = new THREE.Vector3(tm.at[0] + d.x * along, tm.at[1] + d.y * along, tm.at[2]).addScaledVector(up, size * 0.3).addScaledVector(n, 0.15);
  const mesh = new THREE.Mesh(geo, mat);
  const m = new THREE.Matrix4().makeBasis(u, up, new THREE.Vector3().crossVectors(u, up));
  mesh.quaternion.setFromRotationMatrix(m);
  mesh.position.copy(centre);
  mesh.userData.redraw = (str, col) => { draw(str, col); tex.needsUpdate = true; };
  mesh.userData.color = color;
  return mesh;
}

let dotTex = null;
function roundDot() {
  if (dotTex) return dotTex;
  const c = document.createElement("canvas"); c.width = c.height = 32;
  const x = c.getContext("2d"); x.fillStyle = "#fff"; x.beginPath(); x.arc(16, 16, 14, 0, Math.PI * 2); x.fill();
  return (dotTex = new THREE.CanvasTexture(c));
}
// a logo as a single-tone stencil: alpha = 2 × (opacity − luminance × opacity), so white and transparent drop out,
// in one colour. The image comes through the page's relay when it has one (same origin, so WebGL may read it).
const STENCILS = new Map();
function stencil(href, color) {
  const key = href + "|" + color;
  if (!STENCILS.has(key)) STENCILS.set(key, new Promise((ok, no) => {
    const img = new Image(); img.crossOrigin = "anonymous"; img.decoding = "async";
    img.onload = () => {
      const s = Math.min(256, Math.max(img.naturalWidth, img.naturalHeight) || 256), w = Math.round(s * (img.naturalWidth || 1) / Math.max(img.naturalWidth, img.naturalHeight, 1)), h = Math.round(s * (img.naturalHeight || 1) / Math.max(img.naturalWidth, img.naturalHeight, 1));
      const c = document.createElement("canvas"); c.width = c.height = s; const ctx = c.getContext("2d");
      ctx.drawImage(img, (s - w) / 2, (s - h) / 2, w, h); // fitted and centred, like preserveAspectRatio meet
      let px; try { px = ctx.getImageData(0, 0, s, s); } catch (e) { return no(e); }
      const col = new THREE.Color(color), d = px.data;
      for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] / 255, lum = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; d[i + 3] = Math.max(0, Math.min(255, 2 * (a - lum * a) * 255)); d[i] = col.r * 255; d[i + 1] = col.g * 255; d[i + 2] = col.b * 255; }
      ctx.putImageData(px, 0, 0);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; ok(tex);
    };
    img.onerror = no;
    img.src = /^https?:/.test(href) && !href.startsWith(location.origin) ? "/logos/" + href.split("/").pop() : href; // through the app's proxy of the patrons' image folder (same origin), so WebGL may read it
  }));
  return STENCILS.get(key);
}
// ---------- the screens: a billboard is a lit screen, after Blade Runner's facades ----------
// an emissive shader in the screen's hue: fine scanlines, a bright band that sweeps up every few seconds (each screen
// on its own phase, aSeed), a rare flicker. Time is one uniform the map advances (mats.screenUniforms).
const SCREEN_VERT = "attribute float aSeed; varying vec3 vPos; varying float vSeed; void main() { vPos = position; vSeed = aSeed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
const SCREEN_FRAG = `uniform vec3 uColor; uniform float uTime; uniform float uBright; varying vec3 vPos; varying float vSeed;
void main() {
  float scan = 0.84 + 0.16 * step(0.5, fract(vPos.z * 1.7));
  float band = fract(vPos.z / 70.0 - uTime * 0.09 - vSeed);
  float sweep = pow(smoothstep(0.0, 1.0, 1.0 - abs(band - 0.5) * 2.0), 14.0);
  float f = fract(sin((floor(uTime * 6.0) + vSeed * 97.0) * 12.9898) * 43758.5453);
  float flick = f > 0.94 ? 0.6 : 1.0;
  float ev = fract(uTime / 23.0 + vSeed * 7.3), burst = step(ev, 0.018); // a signal loss: static for a moment, every so often, each screen on its own
  float n = fract(sin(dot(vec2(floor(vPos.x * 2.0 + vPos.y * 2.0), floor(vPos.z * 2.0) + floor(uTime * 40.0)), vec2(12.9898, 78.233))) * 43758.5453);
  vec3 c = mix(uColor * (0.62 + 0.5 * sweep) * scan * flick, vec3(0.35 + 0.65 * n) * 0.9, burst) * uBright;
  gl_FragColor = vec4(c, 0.94);
  #include <colorspace_fragment>
}`;
const screenMaterial = (color, uniforms, bright) => new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color(color) }, uBright: { value: bright }, uTime: uniforms.uTime }, vertexShader: SCREEN_VERT, fragmentShader: SCREEN_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide });
const SCREEN_BRIGHT = { light: 1.15, dark: 1 }, SPILL = { light: 220, dark: 520 }; // the wide screens' spill light (point lights, physical units)

// ---------- the record → buckets ----------
export function parseRecord(svg, { panesOnly = false } = {}) {
  const out = { solids: [], lines: [], dots: [], panes: [], polys: [], texts: [], steam: [], images: [] };
  const stack = [{ station: null, role: "", tr: [0, 0, 0], part: "", cls: "", ticker: "", hue: "", glow: "" }];
  for (const m of svg.matchAll(RE)) {
    const top = stack[stack.length - 1];
    if (m[0] === "</g>") { if (stack.length > 1) stack.pop(); continue; }
    if (m[1] !== undefined && m[0].startsWith("<g")) {
      const a = attrs(m[1]), tr = toks(a.transform).find((t) => t.t === "tr");
      stack.push({
        station: a["data-station"] ?? (a["data-cell"] ? "cell:" + a["data-cell"] : top.station), // a claimable cell's stand-in, removable when a repository takes it
        role: /\bdata-worker\b/.test(m[1]) ? "worker" : /\bdata-pallet\b/.test(m[1]) ? "pallet" : /\bdata-rack\b/.test(m[1]) ? "rack" : /\bdata-label\b/.test(m[1]) || /\bdata-plinth\b/.test(m[1]) ? "label" : /\bdata-belt-of\b/.test(m[1]) ? "belt" : a["data-station"] ? "" : top.role,
        tr: tr ? [top.tr[0] + tr.v[0], top.tr[1] + tr.v[1], top.tr[2] + tr.v[2]] : top.tr,
        part: a["data-part"] ?? top.part, cls: a.class ?? top.cls, ticker: a["data-ticker"] ?? top.ticker, hue: a["data-hue"] ?? top.hue, glow: a["data-glow"] ?? top.glow,
      });
      continue;
    }
    if (m[2] !== undefined) {
      const a = attrs(m[2]), cls = a.class || "", key = { station: top.station, role: top.role, tr: top.tr, part: a["data-part"] || top.part, glow: a["data-glow"] || top.glow };
      if (cls === "ow-win") { for (const t of toks(a.d)) out.panes.push({ ...key, pts: t.p, hue: a["data-hue"] || "c", on: a["data-on"] !== undefined, flick: a["data-flick"] }); continue; }
      if (panesOnly) continue;
      if (cls === "iso-solid") for (const t of toks(a.d)) out.solids.push({ ...key, s: t, tone: a["data-tone"] || "hi", material: a["data-material"] || "" });
      else if (cls === "iso-line" || cls === "ow-core") for (const t of toks(a.d)) out.lines.push({ ...key, pts: t.p, closed: t.c, tone: cls === "ow-core" ? "neon" : a["data-tone"] || "lo" });
      else if (cls === "iso-dots") for (const t of toks(a.d)) out.dots.push({ ...key, pts: t.p, size: +a["data-size"] || 0.5, tone: a["data-tone"] || "mid", pulse: /\bdata-pulse\b/.test(m[2]) });
      else if (cls === "ow-holo" || cls === "ow-mouth" || cls === "ow-ground" || cls === "ow-road") for (const t of toks(a.d)) out.polys.push({ ...key, pts: t.p, kind: cls.slice(3) });
      else if (cls === "ow-steam3") for (const t of toks(a.d)) out.steam.push({ ...key, at: t.p[0], size: +a["data-size"] || 3 });
      continue;
    }
    if (m[5] !== undefined) { // a corporate patron's logo: a stencil on its screen
      const a = attrs(m[5]), q = (a["data-quad"] ?? "").split(" ").map((p) => p.split(",").map(Number));
      if (!panesOnly && q.length === 3 && q.every((p) => p.length === 3 && p.every(Number.isFinite))) out.images.push({ station: top.station, glow: a["data-glow"] || top.glow, screen: a["data-screen"] !== undefined, href: (a.href ?? "").replace(/&amp;/g, "&").replace(/&quot;/g, '"'), quad: q.map((p) => [p[0] + top.tr[0], p[1] + top.tr[1], p[2] + top.tr[2]]) });
      continue;
    }
    if (m[3] !== undefined) {
      const a = attrs(m[3]), cls = a.class || "";
      if (cls === "ow-sign-bloom") continue;
      if (panesOnly && cls !== "ow-sign-core") continue;
      const tm = toks(a.transform).find((t) => t.t === "tm");
      if (!tm) continue;
      tm.at = [tm.at[0] + top.tr[0], tm.at[1] + top.tr[1], tm.at[2] + top.tr[2]];
      out.texts.push({ station: top.station, glow: top.glow, screen: a["data-screen"] !== undefined, crawl: (a["data-crawl"] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&"), tm, text: m[4].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"), size: +a["font-size"] || 6, anchor: a["text-anchor"] || "start", sign: cls === "ow-sign-core", ticker: top.ticker });
    }
  }
  return out;
}

// ---------- build ----------
// The station parts go into batched layers (view/batch3d.js): faces, small parts, edges, lines, neon, panes, lamps and
// pulsing lamps, a few draw calls each however many stations there are. Signs, screens, logos, the press's ram and the
// ground's polygons stay objects of their own.
const SMALL = new Set(["worker", "pallet", "rack", "belt"]); // small parts: shown once they are a few pixels tall (lod.js)
export const LAYERS = ["faces", "facesSmall", "edges", "edgesSmall", "lines", "neon", "panes", "dots", "pulse"];

// the colour a layer's piece takes from a palette: "face:<tone>", "mat:<material>:<tone>", "edge", "pulse", or tintOf's keys
function colorFor(pal, key) {
  const [kind, a, b] = key.split(":");
  if (kind === "face") return pal.face[a] ?? pal.face.hi;
  if (kind === "mat") return pal.materials?.[a] ?? pal.face[b] ?? pal.face.hi; // a palette that does not name the material (dark): the face tone
  if (kind === "edge") return pal.edge;
  if (kind === "pulse") return pal.live;
  return tintOf(pal, key);
}

function makeMaterials(pal) {
  return {
    face: Object.fromEntries(Object.entries(pal.face).map(([k, c]) => [k, new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })])), // the ram's own meshes
    material: {},
    faces: withRise(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })),
    edge: withRise(new THREE.LineBasicMaterial({ vertexColors: true })),
    line: withRise(new THREE.LineBasicMaterial({ vertexColors: true })),
    neon: withRise(new THREE.LineBasicMaterial({ vertexColors: true })), // the neon lines, apart: they bloom and never fade with the edges
    pane: withRise(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })),
    dot: withRise(new THREE.PointsMaterial({ vertexColors: true, size: 2.5, sizeAttenuation: false, map: roundDot(), alphaTest: 0.5 })),
    pulse: withRise(new THREE.PointsMaterial({ color: pal.live, size: 4, sizeAttenuation: false, transparent: true, map: roundDot(), depthWrite: false })),
    plainEdge: new THREE.LineBasicMaterial({ color: pal.edge }), // the ram's edges
    litFace: new THREE.MeshLambertMaterial({ color: pal.accent, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    litEdge: new THREE.LineBasicMaterial({ color: pal.accent }),
    holo: new THREE.MeshBasicMaterial({ color: pal.holo, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
    mouth: new THREE.MeshBasicMaterial({ color: pal.mouth, side: THREE.DoubleSide }),
    ground: new THREE.MeshBasicMaterial({ color: pal.ground, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }),
    road: new THREE.MeshBasicMaterial({ color: pal.road, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    screenUniforms: { uTime: { value: 0 } }, // the screens' clock (map3d.js advances it)
  };
}

function makeLayers(root, mats, pal) {
  const colorOf = (key) => colorFor(pal, key);
  const L = (name, kind, material, extra = {}) => new Layer(name, { kind, material, parent: root, colorOf, ...extra });
  return {
    faces: L("faces", "mesh", mats.faces, { normals: true }),
    facesSmall: L("facesSmall", "mesh", mats.faces, { normals: true, userData: { minZoom: SMALL_PARTS } }),
    edges: L("edges", "lines", mats.edge),
    edgesSmall: L("edgesSmall", "lines", mats.edge, { userData: { minZoom: SMALL_PARTS } }),
    lines: L("lines", "lines", mats.line),
    neon: L("neon", "lines", mats.neon, { userData: { bloom: true } }),
    panes: L("panes", "mesh", mats.pane, { userData: { bloom: true } }),
    dots: L("dots", "points", mats.dot),
    pulse: L("pulse", "points", mats.pulse, { userData: { bloom: true } }),
  };
}

// The build runs in two steps. prepare() turns the two records into geometry: every station's faces, edges, lines,
// panes and lamps as one packed array per layer, its bounds, and the raw parts of the objects of its own. It has no
// theme and no DOM, so the builder worker runs it (client/worker.js) and only typed arrays cross to the page.
// assemble() makes the objects of their own on the page (signs need a canvas, screens and logos a theme).
const box6 = () => [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
const grow = (b, bb) => { b[0] = Math.min(b[0], bb.min.x); b[1] = Math.min(b[1], bb.min.y); b[2] = Math.min(b[2], bb.min.z); b[3] = Math.max(b[3], bb.max.x); b[4] = Math.max(b[4], bb.max.y); b[5] = Math.max(b[5], bb.max.z); };
const flatPos = (pts) => { const pos = []; for (let i = 1; i < pts.length - 1; i++) pos.push(...pts[0], ...pts[i], ...pts[i + 1]); return new Float32Array(pos); };

export function prepare(recA, recB) {
  const A = parseRecord(recA), B = recB ? parseRecord(recB, { panesOnly: true }) : { panes: [], texts: [], images: [] };
  const lists = Object.fromEntries(LAYERS.map((l) => [l, new Map()]));
  const bounds = new Map(); // id → { box, all }: [minx, miny, minz, maxx, maxy, maxz]; box leaves out the small parts
  const st = (id) => { if (!bounds.has(id)) bounds.set(id, { box: box6(), all: box6() }); return bounds.get(id); };
  const put = (layer, id, piece) => { const m = lists[layer], k = id ?? ""; if (!m.has(k)) m.set(k, []); m.get(k).push(piece); if (id) st(id); };
  const ram = [], polys = [], flat = new Map();
  const moved = (pts, tr) => pts.map((p) => [p[0] + tr[0], p[1] + tr[1], p[2] + tr[2]]);

  // solids, merged per station + role + tone + material; their edges from the same geometry
  const buckets = new Map();
  for (const x of A.solids) {
    const g = solidGeometry(x.s); if (!g) continue;
    if (x.tr[0] || x.tr[1] || x.tr[2]) g.translate(...x.tr);
    const k = `${x.station ?? ""}|${x.role}|${x.tone}|${x.part === "ram" ? "ram" : ""}|${x.material}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(g);
  }
  for (const [k, list] of buckets) {
    const [id, role, tone, part, material] = k.split("|");
    const geo = list.length === 1 ? list[0] : mergeGeometries(list, false); if (list.length > 1) list.forEach((g) => g.dispose());
    geo.computeBoundingBox();
    if (id) { const s = st(id); grow(s.all, geo.boundingBox); if (!role) grow(s.box, geo.boundingBox); } // pallets, racks and workers elsewhere do not pull the camera
    const eg = new THREE.EdgesGeometry(geo, 28), edges = eg.attributes.position.array;
    if (part) ram.push({ id: id || null, role, tone, material, pos: geo.attributes.position.array, nor: geo.attributes.normal.array, edges }); // the press's ram moves on its own
    else {
      const small = SMALL.has(role);
      put(small ? "facesSmall" : "faces", id, { pos: geo.attributes.position.array, nor: geo.attributes.normal.array, key: material ? `mat:${material}:${tone}` : `face:${tone}`, role });
      put(small ? "edgesSmall" : "edges", id, { pos: edges, key: "edge" });
    }
    eg.dispose(); geo.dispose();
  }
  // lines, colour per piece; the neon apart
  for (const x of A.lines) {
    const pts = moved(x.pts, x.tr), pos = new Float32Array(Math.max(0, pts.length - 1) * 6);
    for (let i = 0; i < pts.length - 1; i++) pos.set([...pts[i], ...pts[i + 1]], i * 6);
    if (pos.length) put(x.tone === "neon" ? "neon" : "lines", x.station, { pos, key: x.glow && x.tone === "neon" ? `glow:${x.glow}` : `line:${x.tone}` });
  }
  // window panes from both recordings (each lights the faces its camera saw)
  for (const x of A.panes.concat(B.panes)) {
    const pts = moved(x.pts, x.tr), pos = new Float32Array(Math.max(0, pts.length - 2) * 9);
    for (let i = 1; i < pts.length - 1; i++) pos.set([...pts[0], ...pts[i], ...pts[i + 1]], (i - 1) * 9);
    if (pos.length) put("panes", x.station, { pos, key: `pane:${x.on ? "on" : "off"}:${x.hue}` });
  }
  // dots: steady ones, and pulsing lamps (every pulsing lamp blinks with the one material)
  for (const x of A.dots) {
    const pos = new Float32Array(moved(x.pts, x.tr).flat());
    if (pos.length) put(x.pulse ? "pulse" : "dots", x.station, { pos, key: x.pulse ? "pulse" : x.glow ? `glow:${x.glow}` : `dot:${x.tone}` });
  }
  // flat polygons: a station's (a patron's screen) are objects of their own; the rest, merged per kind
  for (const x of A.polys) {
    const pts = moved(x.pts, x.tr), screen = x.kind === "holo" && !!x.glow;
    if (!x.station && !screen) { const m = flat.get(x.kind) ?? []; for (let i = 1; i < pts.length - 1; i++) m.push(...pts[0], ...pts[i], ...pts[i + 1]); flat.set(x.kind, m); continue; }
    polys.push({ station: x.station ?? null, kind: x.kind, glow: x.glow, pts, pos: flatPos(pts) });
  }
  // each station's pieces in a layer, packed into one array: a few large arrays cross from the worker, not thousands
  const pieces = {};
  for (const [layer, m] of Object.entries(lists)) {
    const out = new Map(), normals = layer === "faces" || layer === "facesSmall";
    for (const [id, list] of m) {
      let n = 0; for (const p of list) n += p.pos.length;
      const pos = new Float32Array(n), nor = normals ? new Float32Array(n) : null, runs = [], subs = [];
      let at = 0;
      for (const p of list) { pos.set(p.pos, at); if (nor) nor.set(p.nor, at); runs.push([p.key, p.pos.length / 3]); subs.push([p.role ?? "", p.pos.length / 3]); at += p.pos.length; }
      out.set(id, { pos, nor, runs, subs });
    }
    pieces[layer] = out;
  }
  return { pieces, bounds, ram, polys, flat: [...flat].map(([kind, pos]) => [kind, new Float32Array(pos)]), texts: A.texts.concat(B.texts), images: A.images, steam: A.steam };
}
// the buffers a prepared record can hand over instead of copying (postMessage's transfer list)
export function transfers(prep) {
  const out = new Set();
  for (const m of Object.values(prep.pieces)) for (const p of m.values()) { out.add(p.pos.buffer); if (p.nor) out.add(p.nor.buffer); }
  for (const r of prep.ram) { out.add(r.pos.buffer); out.add(r.nor.buffer); out.add(r.edges.buffer); }
  for (const p of prep.polys) out.add(p.pos.buffer);
  for (const [, pos] of prep.flat) out.add(pos.buffer);
  return [...out];
}

// the objects of their own, on the page: the ram, screens and ground polygons, signs and labels, logos. reuse: a
// redrawn station's signs by what they say and where (textKey), kept when the new drawing has the same one (a sign's
// canvas is the costly part of a redraw to make and to upload)
const textKey = (x) => JSON.stringify([x.text, x.tm, x.size, x.anchor, x.sign, x.screen, x.ticker, x.crawl, x.glow]);
function assemble(prep, theme, mats, onAsset, reuse = null) {
  const pal = PALETTE[theme], plain = [], texts = [], kept = new Set();
  const info = new Map(); // id → { box, boxAll, meshes }: bounds for the camera, objects of its own for lighting and picking
  const box3 = (b) => (b[0] === Infinity ? new THREE.Box3() : new THREE.Box3(new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(b[3], b[4], b[5])));
  for (const [id, b] of prep.bounds) info.set(id, { box: box3(b.box), boxAll: box3(b.all), meshes: [] });
  const st = (id) => { if (!info.has(id)) info.set(id, { box: new THREE.Box3(), boxAll: new THREE.Box3(), meshes: [] }); return info.get(id); };
  const ram = new THREE.Group(); ram.name = "ram";
  for (const r of prep.ram) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(r.pos, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(r.nor, 3));
    const named = r.material && pal.materials?.[r.material] != null;
    if (named && !mats.material[r.material]) mats.material[r.material] = new THREE.MeshLambertMaterial({ color: pal.materials[r.material], side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const mesh = new THREE.Mesh(geo, named ? mats.material[r.material] : mats.face[r.tone] || mats.face.hi);
    mesh.userData = { station: r.id, role: r.role, tone: r.tone, material: r.material };
    const eg = new THREE.BufferGeometry(); eg.setAttribute("position", new THREE.BufferAttribute(r.edges, 3));
    const edges = new THREE.LineSegments(eg, mats.plainEdge); edges.userData = { station: r.id };
    ram.add(mesh, edges);
    if (r.id) st(r.id).meshes.push(mesh);
  }
  for (const x of prep.polys) {
    const { pts } = x, screen = x.kind === "holo" && !!x.glow;
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(x.pos, 3));
    let mat = mats[x.kind] || mats.holo;
    if (screen) { // a lit screen: its own phase, the shader in its hue
      const cx = pts.reduce((t, p) => t + p[0], 0) / pts.length, cy = pts.reduce((t, p) => t + p[1], 0) / pts.length, seed = Math.abs(Math.sin(cx * 12.9898 + cy * 78.233) * 43758.5453) % 1;
      geo.setAttribute("aSeed", new THREE.Float32BufferAttribute(new Float32Array(x.pos.length / 3).fill(seed), 1));
      mat = mats["holo-" + x.glow] ??= screenMaterial(pal.glow[x.glow], mats.screenUniforms, SCREEN_BRIGHT[theme] ?? 1);
    }
    const mesh = new THREE.Mesh(geo, mat); mesh.userData = { bloom: screen, kind: screen ? "screen" : "poly", station: x.station }; if (screen) mesh.renderOrder = 1; // a screen draws before the words and marks on it (renderOrder 2)
    plain.push(mesh);
    if (x.station && x.kind === "holo") { // a screen that is a station (a patron's board): pickable, lit and framed like a solid
      geo.computeBoundingBox(); mesh.userData.role = "";
      if (screen && pts.length === 4) { // a wide screen spills its light on the shaft and the ground before it
        const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), area = d(pts[0], pts[1]) * d(pts[0], pts[3]);
        if (area > 1000) {
          const u = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]], v = [pts[3][0] - pts[0][0], pts[3][1] - pts[0][1], pts[3][2] - pts[0][2]];
          const nn = new THREE.Vector3(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]).normalize(), c = new THREE.Vector3((pts[0][0] + pts[2][0]) / 2, (pts[0][1] + pts[2][1]) / 2, (pts[0][2] + pts[2][2]) / 2);
          if (nn.dot(c) < 0) nn.negate(); // out, away from the city's middle
          const light = new THREE.PointLight(pal.glow[x.glow], SPILL[theme] ?? 400, 120, 2); light.position.copy(c).addScaledVector(nn, 7); light.userData = { station: x.station, kind: "spill", glow: x.glow }; plain.push(light);
        }
      }
      const s = st(x.station); s.meshes.push(mesh); s.box.union(geo.boundingBox); s.boxAll.union(geo.boundingBox);
    }
  }
  for (const [kind, pos] of prep.flat) {
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mesh = new THREE.Mesh(geo, mats[kind] || mats.holo); mesh.userData = { kind: "poly" }; plain.push(mesh);
  }
  // signs and labels
  const css = (c) => "#" + new THREE.Color(c).getHexString();
  for (const x of prep.texts) {
    const key = textKey(x), old = reuse?.get(key)?.pop();
    if (old) { plain.push(old); texts.push(old); kept.add(old); continue; }
    const colorOf = (p) => (x.screen ? "#f6f6f4" : x.ticker ? css(p.accent) : x.glow && x.sign ? css(p.glow[x.glow]) : css(x.sign ? p.line.mid : p.text)); // on a screen: white
    const mesh = textPlane(x.text, x.tm, x.size, x.anchor, colorOf(pal));
    mesh.userData.ticker = x.ticker; mesh.userData.crawl = x.crawl || ""; mesh.userData.text = x.text; mesh.userData.station = x.station ?? null; mesh.userData.bloom = !!(x.sign || x.ticker) && !x.screen; mesh.userData.colorOf = colorOf; // on a screen the screen blooms, the words stay crisp
    mesh.renderOrder = 2; // over a screen
    mesh.userData.minZoom = (x.sign || x.ticker ? SIGN_PX : PLATE_PX) / x.size; // a sign shows from 3 px tall, a plate or plaque from 5
    mesh.userData.textKey = key;
    plain.push(mesh); texts.push(mesh);
  }
  // logos: one textured quad each, its texture a single-tone stencil in the screen's sign hue once the image loads
  const seenQuad = new Set();
  for (const x of prep.images) { // the first recording only: its holo screens are the ones drawn (double-sided)
    const k = x.quad.flat().map((v) => v.toFixed(1)).join(","); if (seenQuad.has(k)) continue; seenQuad.add(k);
    const [tl, tr, bl] = x.quad, br = [tr[0] + bl[0] - tl[0], tr[1] + bl[1] - tl[1], tr[2] + bl[2] - tl[2]];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([...tl, ...tr, ...bl, ...br], 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2)); geo.setIndex([0, 2, 1, 1, 2, 3]);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    const mesh = new THREE.Mesh(geo, mat); mesh.userData = { station: x.station ?? null, kind: "logo", bloom: !x.screen }; mesh.renderOrder = 2; plain.push(mesh); // over a screen, where the screen blooms and the mark stays crisp
    const restencil = (p, done) => stencil(x.href, x.screen ? 0xf6f6f4 : x.glow && p.glow[x.glow] ? p.glow[x.glow] : p.line.hi).then((tex) => { mat.map = tex; mat.opacity = 0.85; mat.needsUpdate = true; done(); }, () => {});
    mesh.userData.restencil = restencil; restencil(pal, onAsset);
  }
  return { pieces: prep.pieces, info, plain, texts, ram, steam: prep.steam, kept };
}

// prep: prepare(recA, recB), done in the worker; without it the page prepares the records itself
export function buildScene(recA, recB, theme = "light", { onAsset = () => {}, prep = null } = {}) { // onAsset: an image arrived (redraw)
  const pal = PALETTE[theme], mats = makeMaterials(pal);
  const root = new THREE.Group(); root.name = "city";
  const layers = makeLayers(root, mats, pal);
  const c = assemble(prep ?? prepare(recA, recB), theme, mats, onAsset);
  for (const name of LAYERS) layers[name].build(c.pieces[name]);
  for (const o of c.plain) root.add(o);
  root.add(c.ram);
  // every pulsing lamp shares mats.pulse, so the effects (a blink) and the loop animate the one material
  return { root, stations: c.info, layers, mats, ram: c.ram, pulsePts: { material: mats.pulse }, texts: c.texts, steam: c.steam, pal };
}

// in place: these stations' drawings swapped for new ones (prep: the prepared fragments of the two records); returns
// the objects of their own that were added, for the morph
export function replaceIn(scene, prep, ids, theme, { onAsset = () => {} } = {}) {
  const reuse = new Map();
  for (const o of scene.root.children) { const k = o.userData?.textKey; if (k && ids.has(o.userData.station)) { if (!reuse.has(k)) reuse.set(k, []); reuse.get(k).push(o); } }
  const c = assemble(prep, theme, scene.mats, onAsset, reuse);
  for (const o of scene.root.children.filter((o) => ids.has(o.userData?.station) && !c.kept.has(o))) {
    scene.root.remove(o); o.geometry?.dispose(); if (o.material?.map) { o.material.map.dispose(); o.material.dispose(); }
  }
  for (const name of LAYERS) scene.layers[name].replace(ids, c.pieces[name]);
  if (c.ram.children.length) { scene.root.remove(scene.ram); scene.ram = c.ram; scene.root.add(c.ram); }
  for (const id of ids) scene.stations.delete(id);
  for (const [id, s] of c.info) scene.stations.set(id, s);
  scene.texts = scene.texts.filter((t) => !ids.has(t.userData.station)).concat(c.texts);
  for (const o of c.plain) if (!c.kept.has(o)) scene.root.add(o);
  return { added: c.plain };
}

// the colour a vertex-coloured run takes from a palette: "line:<tone>", "dot:<tone>", "glow:<hue>", "pane:on|off:<hue>"
function tintOf(pal, key) {
  const [kind, a, b] = key.split(":");
  if (kind === "glow") return pal.glow[a];
  if (kind === "pane") { const set = a === "on" ? pal.paneOn : pal.pane; return set[b] ?? set.c; }
  return pal.line[a] ?? (kind === "dot" ? pal.line.mid : pal.line.lo);
}
// recolour an existing scene for the other theme, in place: the shared materials, every vertex-coloured run (lines,
// panes, dots: userData.tint), the signs' canvases and the logos' stencils; the movers are the map's (map3d.js rebuilds them)
export function retheme(scene, theme, { onAsset = () => {} } = {}) {
  const pal = PALETTE[theme], m = scene.mats;
  for (const L of Object.values(scene.layers)) L.recolor((key) => colorFor(pal, key));
  for (const [k, mat] of Object.entries(m.face)) mat.color.set(pal.face[k]);
  for (const [k, mat] of Object.entries(m.material)) mat.color.set(pal.materials?.[k] ?? pal.face.hi);
  // the ram's meshes: a theme that names a material gives it its own; one that does not puts the face tone back
  scene.ram.traverse((o) => { const mt = o.userData?.material; if (!mt || !o.isMesh) return; if (pal.materials?.[mt] != null) { m.material[mt] ??= new THREE.MeshLambertMaterial({ color: pal.materials[mt], side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }); o.material = m.material[mt]; } else o.material = m.face[o.userData.tone] || m.face.hi; if (o.userData.base) o.userData.base = o.material; });
  m.plainEdge.color.set(pal.edge); m.litFace.color.set(pal.accent); m.litEdge.color.set(pal.accent);
  m.holo.color.set(pal.holo); m.mouth.color.set(pal.mouth); m.ground.color.set(pal.ground); m.road.color.set(pal.road); m.pulse.color.set(pal.live);
  for (const [k, mat] of Object.entries(m)) if (k.startsWith("holo-")) { mat.uniforms.uColor.value.set(pal.glow[k.slice(5)]); mat.uniforms.uBright.value = SCREEN_BRIGHT[theme] ?? 1; }
  for (const o of scene.root.children) {
    if (o.userData?.colorOf) { const c = o.userData.colorOf(pal); o.userData.color = c; o.userData.redraw(o.userData.shown ?? o.userData.text, c); }
    if (o.userData?.restencil) o.userData.restencil(pal, onAsset);
    if (o.isPointLight && o.userData?.kind === "spill") { o.color.set(pal.glow[o.userData.glow]); o.intensity = SPILL[theme] ?? 400; }
  }
  scene.pal = pal;
}
