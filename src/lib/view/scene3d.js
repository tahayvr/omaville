// Turns the 3D record from city.js (three: true) into a three.js scene: merged meshes per station,
// crisp edge lines, window panes, signs as text planes, plus handles for everything that moves.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { roundedPlan } from "../city/kit/iso-kit.mjs";
import { SMALL_PARTS, SIGN_PX, PLATE_PX } from "../city/lod.js";


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
export function buildScene(recA, recB, theme = "light", { mats: shared = null, onAsset = () => {} } = {}) { // onAsset: an image arrived (redraw) // shared: a partial rebuild reuses the scene's materials
  const pal = PALETTE[theme];
  const A = parseRecord(recA), B = recB ? parseRecord(recB, { panesOnly: true }) : { panes: [], texts: [], images: [] };
  const root = new THREE.Group(); root.name = "city";
  const stations = new Map(); // id → { faces: Mesh[], edges: LineSegments[], lines: LineSegments[], box: Box3 }
  const st = (id) => { if (!stations.has(id)) stations.set(id, { faces: [], edges: [], lines: [], box: new THREE.Box3(), boxAll: new THREE.Box3() }); return stations.get(id); };
  const mats = shared ?? {
    face: Object.fromEntries(Object.entries(pal.face).map(([k, c]) => [k, new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })])),
    material: {}, // named materials, made as the record asks for them
    edge: new THREE.LineBasicMaterial({ color: pal.edge }),
    line: new THREE.LineBasicMaterial({ vertexColors: true }),
    neon: new THREE.LineBasicMaterial({ vertexColors: true }), // the neon lines, apart: they bloom and never fade with the edges
    pane: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    litFace: new THREE.MeshLambertMaterial({ color: pal.accent, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    litEdge: new THREE.LineBasicMaterial({ color: pal.accent }),
    holo: new THREE.MeshBasicMaterial({ color: pal.holo, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
    mouth: new THREE.MeshBasicMaterial({ color: pal.mouth, side: THREE.DoubleSide }),
    ground: new THREE.MeshBasicMaterial({ color: pal.ground, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }),
    road: new THREE.MeshBasicMaterial({ color: pal.road, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    dot: new THREE.PointsMaterial({ vertexColors: true, size: 2.5, sizeAttenuation: false, map: roundDot(), alphaTest: 0.5 }),
    pulse: new THREE.PointsMaterial({ color: pal.live, size: 4, sizeAttenuation: false, transparent: true, map: roundDot(), depthWrite: false }),
    screenUniforms: { uTime: { value: 0 } }, // the screens' clock (map3d.js advances it)
  };
  const col = new THREE.Color();
  const moved = (pts, tr) => pts.map((p) => [p[0] + tr[0], p[1] + tr[1], p[2] + tr[2]]);
  const ram = new THREE.Group(); ram.name = "ram";

  // solids, grouped by station + role + tone; edges from the same geometry
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
    const geo = mergeGeometries(list, false); list.forEach((g) => g.dispose());
    geo.computeBoundingBox();
    // a named material (brick, steel, leaf…) has its own colour where the palette names it; elsewhere (the dark theme) the face tone stands
    const named = material && pal.materials?.[material] != null;
    if (named && !mats.material[material]) mats.material[material] = new THREE.MeshLambertMaterial({ color: pal.materials[material], side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const mesh = new THREE.Mesh(geo, named ? mats.material[material] : mats.face[tone] || mats.face.hi);
    mesh.userData.material = material; mesh.userData.tone = tone;
    // level of detail (map3d applies it): workers, pallets, racks and belts appear once they are a few pixels tall
    const lod = role === "worker" || role === "pallet" || role === "rack" || role === "belt" ? { minZoom: SMALL_PARTS } : {};
    mesh.userData = { station: id || null, role, tone, ...lod };
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 28), mats.edge);
    edges.userData = { station: id || null, ...lod };
    (part ? ram : root).add(mesh, edges);
    if (id) { const s = st(id); s.faces.push(mesh); s.edges.push(edges); s.boxAll.union(geo.boundingBox); if (!role) s.box.union(geo.boundingBox); } // pallets, racks and workers elsewhere do not pull the camera
  }
  // lines: per station, colour per vertex
  const lineBuckets = new Map();
  for (const x of A.lines) {
    const k = (x.station ?? "") + (x.tone === "neon" ? "|neon" : ""); if (!lineBuckets.has(k)) lineBuckets.set(k, { pos: [], col: [] });
    const b = lineBuckets.get(k), pts = moved(x.pts, x.tr), key = x.glow && x.tone === "neon" ? `glow:${x.glow}` : `line:${x.tone}`, c = col.set(tintOf(pal, key));
    for (let i = 0; i < pts.length - 1; i++) { b.pos.push(...pts[i], ...pts[i + 1]); b.col.push(c.r, c.g, c.b, c.r, c.g, c.b); (b.runs ??= []).push([key, 2]); }
  }
  for (const [k, b] of lineBuckets) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3));
    const [sid, neon] = k.split("|");
    const ls = new THREE.LineSegments(geo, neon ? mats.neon : mats.line); ls.userData = { station: sid || null, bloom: !!neon, tint: b.runs };
    root.add(ls);
    if (sid) st(sid).lines.push(ls);
  }
  // window panes from both builds (each lights the faces its camera saw); a station's panes are its own mesh, so
  // the station can be rebuilt in place (a house's too: its panes light with its week)
  const own = (id) => !!id;
  const paneBuckets = new Map();
  for (const x of A.panes.concat(B.panes)) {
    const k = own(x.station) ? x.station : "";
    if (!paneBuckets.has(k)) paneBuckets.set(k, { pos: [], col: [] });
    const pane = paneBuckets.get(k), pts = moved(x.pts, x.tr), key = `pane:${x.on ? "on" : "off"}:${x.hue}`, c = col.set(tintOf(pal, key));
    for (let i = 1; i < pts.length - 1; i++) for (const p of [pts[0], pts[i], pts[i + 1]]) { pane.pos.push(...p); pane.col.push(c.r, c.g, c.b); }
    (pane.runs ??= []).push([key, 3 * (pts.length - 2)]);
  }
  for (const [k, pane] of paneBuckets) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pane.pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(pane.col, 3));
    const m = new THREE.Mesh(geo, mats.pane); m.userData = { station: k || null, kind: "panes", bloom: true, tint: pane.runs }; root.add(m);
  }
  // flat polygons: the ground, holo boards, cooling tower mouths
  for (const x of A.polys) {
    const pts = moved(x.pts, x.tr), pos = [];
    for (let i = 1; i < pts.length - 1; i++) pos.push(...pts[0], ...pts[i], ...pts[i + 1]);
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    let mat = mats[x.kind] || mats.holo;
    const screen = x.kind === "holo" && !!x.glow;
    if (screen) { // a lit screen: its own phase, the shader in its hue
      const cx = pts.reduce((t, p) => t + p[0], 0) / pts.length, cy = pts.reduce((t, p) => t + p[1], 0) / pts.length, seed = Math.abs(Math.sin(cx * 12.9898 + cy * 78.233) * 43758.5453) % 1;
      geo.setAttribute("aSeed", new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(seed), 1));
      mat = mats["holo-" + x.glow] ??= screenMaterial(pal.glow[x.glow], mats.screenUniforms, SCREEN_BRIGHT[theme] ?? 1);
    }
    const mesh = new THREE.Mesh(geo, mat); mesh.userData = { bloom: screen, kind: screen ? "screen" : "poly" }; if (screen) mesh.renderOrder = 1; root.add(mesh); // a screen draws before the words and marks on it (renderOrder 2)
    if (x.station && x.kind === "holo") { // a screen that is a station (a patron's board): pickable, lit and framed like a solid
      geo.computeBoundingBox(); Object.assign(mesh.userData, { station: x.station, role: "" });
      if (screen && pts.length === 4) { // a wide screen spills its light on the shaft and the ground before it
        const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), area = d(pts[0], pts[1]) * d(pts[0], pts[3]);
        if (area > 1000) {
          const u = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]], v = [pts[3][0] - pts[0][0], pts[3][1] - pts[0][1], pts[3][2] - pts[0][2]];
          const nn = new THREE.Vector3(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]).normalize(), c = new THREE.Vector3((pts[0][0] + pts[2][0]) / 2, (pts[0][1] + pts[2][1]) / 2, (pts[0][2] + pts[2][2]) / 2);
          if (nn.dot(c) < 0) nn.negate(); // out, away from the city's middle
          const light = new THREE.PointLight(pal.glow[x.glow], SPILL[theme] ?? 400, 120, 2); light.position.copy(c).addScaledVector(nn, 7); light.userData = { station: x.station, kind: "spill", glow: x.glow }; root.add(light);
        }
      }
      const s = st(x.station); s.faces.push(mesh); s.box.union(geo.boundingBox); s.boxAll.union(geo.boundingBox);
    }
  }
  // dots: steady ones and pulsing lamps, per repository (rebuilt in place when its lamp turns on or off) and one
  // shared cloud for the rest; every pulsing cloud blinks with the one material
  const dotBuckets = new Map();
  for (const x of A.dots) {
    const k = own(x.station) ? x.station : "";
    if (!dotBuckets.has(k)) dotBuckets.set(k, { pos: [], col: [], pulse: [] });
    const b = dotBuckets.get(k);
    for (const p of moved(x.pts, x.tr)) {
      if (x.pulse) b.pulse.push(...p);
      else { const key = x.glow ? `glow:${x.glow}` : `dot:${x.tone}`, c = col.set(tintOf(pal, key)); b.pos.push(...p); b.col.push(c.r, c.g, c.b); (b.runs ??= []).push([key, 1]); }
    }
  }
  const pulseList = [];
  for (const [k, b] of dotBuckets) {
    if (b.pos.length) { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3)); const pts = new THREE.Points(g, mats.dot); pts.userData = { station: k || null, kind: "dots", tint: b.runs }; root.add(pts); }
    if (b.pulse.length) { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(b.pulse, 3)); const pts = new THREE.Points(g, mats.pulse); pts.userData = { station: k || null, kind: "pulse", bloom: true }; root.add(pts); pulseList.push(pts); }
  }
  const pulsePts = pulseList[0] ?? null; // every pulsing cloud shares mats.pulse, so animating one material blinks them all
  // signs and labels
  const css = (c) => "#" + new THREE.Color(c).getHexString();
  const texts = [];
  for (const x of A.texts.concat(B.texts)) {
    const colorOf = (p) => (x.screen ? "#f6f6f4" : x.ticker ? css(p.accent) : x.glow && x.sign ? css(p.glow[x.glow]) : css(x.sign ? p.line.mid : p.text)); // on a screen: white
    const mesh = textPlane(x.text, x.tm, x.size, x.anchor, colorOf(pal));
    mesh.userData.ticker = x.ticker; mesh.userData.crawl = x.crawl || ""; mesh.userData.text = x.text; mesh.userData.station = x.station ?? null; mesh.userData.bloom = !!(x.sign || x.ticker) && !x.screen; mesh.userData.colorOf = colorOf; // on a screen the screen blooms, the words stay crisp
    mesh.renderOrder = 2; // over a screen
    mesh.userData.minZoom = (x.sign || x.ticker ? SIGN_PX : PLATE_PX) / x.size; // a sign shows from 3 px tall, a plate or plaque from 5
    root.add(mesh); texts.push(mesh);
  }
  // logos: one textured quad each, its texture a single-tone stencil in the screen's sign hue once the image loads
  const seenQuad = new Set();
  for (const x of A.images) { // the first recording only: its holo screens are the ones drawn (double-sided)
    const k = x.quad.flat().map((v) => v.toFixed(1)).join(","); if (seenQuad.has(k)) continue; seenQuad.add(k);
    const [tl, tr, bl] = x.quad, br = [tr[0] + bl[0] - tl[0], tr[1] + bl[1] - tl[1], tr[2] + bl[2] - tl[2]];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([...tl, ...tr, ...bl, ...br], 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2)); geo.setIndex([0, 2, 1, 1, 2, 3]);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    const mesh = new THREE.Mesh(geo, mat); mesh.userData = { station: x.station ?? null, kind: "logo", bloom: !x.screen }; mesh.renderOrder = 2; root.add(mesh); // over a screen, where the screen blooms and the mark stays crisp
    const restencil = (p, done) => stencil(x.href, x.screen ? 0xf6f6f4 : x.glow && p.glow[x.glow] ? p.glow[x.glow] : p.line.hi).then((tex) => { mat.map = tex; mat.opacity = 0.85; mat.needsUpdate = true; done(); }, () => {});
    mesh.userData.restencil = restencil; restencil(pal, onAsset);
  }
  root.add(ram);
  return { root, stations, mats, ram, pulsePts, pulseList, texts, steam: A.steam, pal };
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
  const pal = PALETTE[theme], m = scene.mats, col = new THREE.Color();
  for (const [k, mat] of Object.entries(m.face)) mat.color.set(pal.face[k]);
  for (const [k, mat] of Object.entries(m.material)) mat.color.set(pal.materials?.[k] ?? pal.face.hi);
  // a theme that names a material gives it its own; one that does not puts the face tone back (dark is monochrome)
  scene.root.traverse((o) => { const mt = o.userData?.material; if (!mt || !o.isMesh) return; let target; if (pal.materials?.[mt] != null) { if (!m.material[mt]) m.material[mt] = new THREE.MeshLambertMaterial({ color: pal.materials[mt], side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }); target = m.material[mt]; } else target = m.face[o.userData.tone] || m.face.hi; if (o.userData.base) o.userData.base = target; o.material = target; }); // (the map unlights everything before a retheme, so the lit clone is gone)
  m.edge.color.set(pal.edge); m.litFace.color.set(pal.accent); m.litEdge.color.set(pal.accent);
  m.holo.color.set(pal.holo); m.mouth.color.set(pal.mouth); m.ground.color.set(pal.ground); m.road.color.set(pal.road); m.pulse.color.set(pal.live);
  for (const [k, mat] of Object.entries(m)) if (k.startsWith("holo-")) { mat.uniforms.uColor.value.set(pal.glow[k.slice(5)]); mat.uniforms.uBright.value = SCREEN_BRIGHT[theme] ?? 1; }
  scene.root.traverse((o) => {
    const runs = o.userData?.tint, attr = o.geometry?.attributes?.color;
    if (runs && attr) { let i = 0; for (const [key, n] of runs) { col.set(tintOf(pal, key)); for (let v = 0; v < n; v++, i++) attr.setXYZ(i, col.r, col.g, col.b); } attr.needsUpdate = true; }
    if (o.userData?.colorOf) { const c = o.userData.colorOf(pal); o.userData.color = c; o.userData.redraw(o.userData.shown ?? o.userData.text, c); }
    if (o.userData?.restencil) o.userData.restencil(pal, onAsset);
    if (o.isPointLight && o.userData?.kind === "spill") { o.color.set(pal.glow[o.userData.glow]); o.intensity = SPILL[theme] ?? 400; }
  });
  scene.pal = pal;
}
