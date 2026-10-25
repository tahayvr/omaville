// The 3D map: a three.js view of the city with free orbit, picking, lighting of stations,
// and everything that moves (belts, the press, sky traffic, drones, searchlights, steam, billboards).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { buildScene, retheme } from "./scene3d.js";
import { SMALL_PARTS, edgeAlpha } from "../city/lod.js";
import { createFx3d } from "./fx3d.js";

const PZ = 12; // deck height of the raised platforms
const deg = Math.PI / 180;
// the home view: from azimuth 72 and a low eye, the direction the billboards' and patrons' screens are drawn to face
// (the first recording, city.js), so every screen faces the viewer; framed on the mark (model.sky, less its
// margin), the quarter's rings run off the edges
const HOME_AZ = 72 * deg, HOME_EL = 24 * deg, SKY_MARGIN = 60;
let PUFF = null; // the steam's sprite texture: one for the page
const puffTex = () => PUFF ??= (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"); const gr = x.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();

export function createMap({ container, recA, recB, model, theme = "light", still = false, timeZone = "UTC" }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "ow-gl";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const world = new THREE.Group(); // city coordinates; mirrored in y so the image matches the 2D drawing
  world.scale.y = -1;
  scene.add(world);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9a9a94, 1.1); // a white model: the sky from above, a darker board below, so the side faces fall into shade
  hemi.position.set(0, 0, 1);
  const sun = new THREE.DirectionalLight(0xffffff, 1.35);
  sun.position.set(-0.35, 0.55, 1);
  scene.add(hemi, sun);

  let city = null, themeName = theme;
  // the clock: the sun follows the real hour in the org's timezone (or a moment the scrubber sets); at night the
  // faces dim so the lit panes read as night, within the monochrome palette
  let clockAt = null, daylight = 1;
  const hourOf = (d) => { const p = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(d); return +p.find((x) => x.type === "hour").value + +p.find((x) => x.type === "minute").value / 60; };
  function applyClock() {
    const h = hourOf(clockAt ?? new Date()), a = ((h - 6) / 12) * Math.PI; // 6 h sunrise in the east, 12 h overhead, 18 h sunset in the west
    const el = Math.sin(a); daylight = Math.max(0, Math.min(1, el * 1.6 + 0.25));
    // the light theme keeps its sun low, as a model is lit on the table: tops brightest, one side face lit, the other in shade
    sun.position.set(-Math.cos(a), 0.55, themeName === "dark" ? Math.max(0.15, el + 0.2) : Math.max(0.2, 0.2 + 0.45 * el)).normalize();
    const day = themeName === "dark" ? [1.6, 0.9] : [1.5, 2.6], night = themeName === "dark" ? [0.75, 0.15] : [1.25, 1.9]; // the model on the table stays lit after dark; only the dark theme goes to night
    hemi.intensity = night[0] + (day[0] - night[0]) * daylight; sun.intensity = night[1] + (day[1] - night[1]) * daylight;
  }
  const morphs = []; // stations growing into their new drawing (replaceStations)
  let trailObj = null; // a selected person's trail
  const frameTaps = new Set();
  const fx = createFx3d({ group: world, palette: () => city.pal, pulse: () => city?.pulsePts }); // live effects: short-lived, never part of the city
  function mount(t) {
    if (city) { world.remove(city.root); city.root.traverse((o) => { o.geometry?.dispose(); if (o.material?.map) o.material.map.dispose(); }); }
    city = buildScene(recA, recB, t, { onAsset: () => touch() });
    world.add(city.root);
    scene.background = new THREE.Color(city.pal.bg);
    scene.fog = new THREE.Fog(city.pal.bg, 1800 - 250, 1800 + (t === "dark" ? 1100 : 1300)); // the far rings fade into the page: depth, and the camera keeps its distance from the target
    hemi.groundColor.set(t === "dark" ? 0x101010 : 0x9a9a94);
    applyClock();
    lit = new Set();
    world.updateMatrixWorld(true);
    bounds = new THREE.Box3().setFromObject(city.root);
    // a thinned cloud of the city's vertices: fitting the view to it hugs the real silhouette
    const cloud = [];
    city.root.traverse((o) => {
      if (!o.isMesh || !o.geometry || o.material?.map) return;
      const a = o.geometry.attributes.position, step = Math.max(1, Math.floor(a.count / 1500));
      for (let i = 0; i < a.count; i += step) cloud.push(new THREE.Vector3(a.getX(i), a.getY(i), a.getZ(i)).applyMatrix4(o.matrixWorld));
    });
    parts = [{ points: cloud }];
    buildMovers();
  }

  // ---- camera ----
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);
  camera.up.set(0, 0, 1);
  // Light is now. In the dark theme the lit panes, the neon, the lamps, the signs and the effects bloom: a second render of
  // the scene with everything else black feeds the bloom pass, and the final pass adds it over the plain render. Both
  // composers draw through the one canvas; the final target carries the multisampling the edge lines need.
  const size = () => [container.clientWidth || 1, container.clientHeight || 1];
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(...size()), 0.55, 0.45, 0.3);
  const bloomComposer = new EffectComposer(renderer); bloomComposer.renderToScreen = false;
  bloomComposer.addPass(new RenderPass(scene, camera)); bloomComposer.addPass(bloomPass);
  const finalComposer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(...size(), { type: THREE.HalfFloatType, samples: 4 }));
  const mixPass = new ShaderPass(new THREE.ShaderMaterial({
    uniforms: { baseTexture: { value: null }, bloomTexture: { value: bloomComposer.renderTarget2.texture } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform sampler2D baseTexture; uniform sampler2D bloomTexture; varying vec2 vUv; void main() { gl_FragColor = texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv); }",
  }), "baseTexture"); mixPass.needsSwap = true;
  finalComposer.addPass(new RenderPass(scene, camera)); finalComposer.addPass(mixPass); finalComposer.addPass(new OutputPass());
  const black = new THREE.MeshBasicMaterial({ color: 0 });
  const swapped = [], blackBg = new THREE.Color(0);
  function darken() { // everything that does not bloom goes black (opaque solids) or away (the transparent, the textured, the sprites)
    scene.traverse((o) => {
      if (!o.material || o.userData.bloom || !o.visible) return;
      const m = o.material;
      if (o.isSprite || o.isLine || o.isPoints || m.transparent || m.map) { swapped.push([o, null]); o.visible = false; return; } // lines and dots occlude nothing worth a draw call
      swapped.push([o, m]); o.material = black;
    });
  }
  function restoreAll() { for (const [o, m] of swapped) { if (m) o.material = m; else o.visible = true; } swapped.length = 0; }
  function render() {
    if (themeName !== "dark") { renderer.render(scene, camera); return; }
    const bg = scene.background, fog = scene.fog;
    scene.background = blackBg; scene.fog = null; darken();
    bloomComposer.render();
    restoreAll(); scene.background = bg; scene.fog = fog;
    finalComposer.render();
  }
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.09;
  controls.screenSpacePanning = false;
  controls.minPolarAngle = 6 * deg; controls.maxPolarAngle = 84 * deg;
  controls.minZoom = 0.35; controls.maxZoom = 14;
  controls.zoomToCursor = true;
  controls.rotateSpeed = 0.7;
  controls.keys = {};
  const toWorld = (v) => new THREE.Vector3(v[0], -v[1], v[2]); // city → scene
  let bounds = new THREE.Box3(), parts = [];

  function setFrustum() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    pixelBudget(); renderer.setSize(w, h, false); finalComposer.setSize(w, h); bloomComposer.setSize(w, h);
    camera.left = -w / 2; camera.right = w / 2; camera.top = h / 2; camera.bottom = -h / 2;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(() => { setFrustum(); touch(); }).observe(container);

  // the 2D drawing looks from azimuth 72°, elevation 33° (EL in city.js); start there
  function directionFor(az, el) { return new THREE.Vector3(Math.cos(az) * Math.cos(el), -Math.sin(az) * Math.cos(el), Math.sin(el)); }
  function place(target, az, el, zoom) {
    controls.target.copy(target);
    camera.position.copy(target).addScaledVector(directionFor(az, el), 1800);
    camera.zoom = zoom; camera.updateProjectionMatrix(); controls.update();
  }
  function view() { // the current azimuth and elevation
    const d = camera.position.clone().sub(controls.target).normalize();
    return { az: Math.atan2(-d.y, d.x), el: Math.asin(d.z), target: controls.target.clone(), zoom: camera.zoom };
  }
  // the zoom that fits a box (in scene space) into the free area between the cards
  // the screen rectangle (camera units) that a set of boxes covers from the current direction
  function extent(boxes) {
    camera.updateMatrixWorld();
    const inv = camera.matrixWorldInverse, v = new THREE.Vector3();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const add = (p) => { v.copy(p).applyMatrix4(inv); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); };
    for (const b of boxes) {
      if (b.points) { for (const p of b.points) add(p); continue; }
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) add(new THREE.Vector3(x, y, z));
    }
    return { x0, x1, y0, y1 };
  }
  function zoomFor(boxes, pads) {
    const w = container.clientWidth, h = container.clientHeight;
    const fw = Math.max(80, w - pads.l - pads.r), fh = Math.max(80, h - pads.t - pads.b);
    const e = extent(boxes);
    return Math.min(fw / Math.max(e.x1 - e.x0, 1), fh / Math.max(e.y1 - e.y0, 1));
  }
  // a target that puts the boxes' screen centre in the middle of the free area, not the middle of the screen
  function targetFor(boxes, pads, zoom) {
    const e = extent(boxes), right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const cam = new THREE.Vector3((e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2, 0);
    // back from camera space to a point on the plane through the current target
    const c = controls.target.clone().addScaledVector(right, cam.x - new THREE.Vector3().copy(controls.target).applyMatrix4(camera.matrixWorldInverse).x).addScaledVector(up, cam.y - new THREE.Vector3().copy(controls.target).applyMatrix4(camera.matrixWorldInverse).y);
    const dx = ((pads.l - pads.r) / 2) / zoom, dy = ((pads.b - pads.t) / 2) / zoom;
    return c.addScaledVector(right, -dx).addScaledVector(up, -dy);
  }
  // the home view's target and zoom, measured with the camera at the home angle (the extent depends on the direction), then put back
  function homeView(pads) {
    const v = view(), s = model.sky;
    place(v.target, HOME_AZ, HOME_EL, v.zoom);
    const mark = s ? [new THREE.Box3().setFromPoints([toWorld([s.x0 + SKY_MARGIN, s.y0 + SKY_MARGIN, 0]), toWorld([s.x1 - SKY_MARGIN, s.y1 - SKY_MARGIN, 170])])] : parts;
    const z = zoomFor(mark, pads) * 0.98, target = targetFor(mark, pads, z);
    controls.minZoom = Math.min(0.35, zoomFor(parts, pads) * 0.8); // the whole plate, rings and all, is still a zoom out away
    place(v.target, v.az, v.el, v.zoom);
    return { target, zoom: z, az: HOME_AZ, el: HOME_EL };
  }
  let fly = null;
  function flyTo({ target, zoom, az, el }, ms = 700) {
    const v = view();
    const to = { target: target ?? v.target, zoom: zoom ?? v.zoom, az: az ?? v.az, el: el ?? v.el };
    let daz = to.az - v.az; while (daz > Math.PI) daz -= 2 * Math.PI; while (daz < -Math.PI) daz += 2 * Math.PI;
    if (still || ms === 0) { place(to.target, v.az + daz, to.el, to.zoom); touch(); return; }
    fly = { from: v, to, daz, t0: performance.now(), ms }; touch();
  }
  function stepFly(now) {
    if (!fly) return false;
    const t = Math.min(1, (now - fly.t0) / fly.ms), e = 1 - Math.pow(1 - t, 3);
    const target = fly.from.target.clone().lerp(fly.to.target, e);
    const zoom = fly.from.zoom * Math.pow(fly.to.zoom / fly.from.zoom, e);
    place(target, fly.from.az + fly.daz * e, fly.from.el + (fly.to.el - fly.from.el) * e, zoom);
    if (t >= 1) fly = null;
    return true;
  }
  controls.addEventListener("start", () => { fly = null; api.onUser?.(); });
  controls.addEventListener("change", () => { touch(); });

  // ---- stations: bounds, lighting, picking ----
  function boxesOf(ids) {
    const out = [];
    for (const id of ids) { const s = city.stations.get(id); const b = s && (!s.box.isEmpty() ? s.box : s.boxAll); if (b && !b.isEmpty()) out.push(new THREE.Box3(toWorld([b.min.x, b.max.y, b.min.z]), toWorld([b.max.x, b.min.y, b.max.z]))); }
    return out;
  }
  let lit = new Set();
  const litFace = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x000000, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  function setLit(ids) {
    const next = new Set(ids);
    for (const id of lit) if (!next.has(id)) paint(id, false);
    for (const id of next) if (!lit.has(id)) paint(id, true);
    lit = next; touch();
  }
  function paint(id, on) {
    const s = city.stations.get(id); if (!s) return;
    const pal = city.pal, accent = new THREE.Color(pal.accent);
    for (const m of s.faces) {
      if (m.userData.kind === "screen") continue; // a screen keeps its picture; its frame and lines light up
      if (on) { m.userData.base ??= m.material; const mat = litFace.clone(); mat.color.copy(m.userData.base.color).lerp(accent, themeName === "dark" ? 0.18 : 0.12); mat.emissive.copy(accent).multiplyScalar(themeName === "dark" ? 0.12 : 0.03); m.material = mat; }
      else if (m.userData.base) { m.material.dispose(); m.material = m.userData.base; }
    }
    for (const e of s.edges) e.material = on ? city.mats.litEdge : city.mats.edge;
    for (const l of s.lines) l.material = on ? city.mats.litEdge : l.userData.bloom ? city.mats.neon : city.mats.line;
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let pickables = [];
  let lodZoom = 0, lodList = null; // level of detail (below): what to show at this zoom, and the objects that care
  function refreshPickables() { lodList = null; pickables = []; for (const [id, s] of city.stations) if (!id.startsWith("cell:")) pickables.push(...s.faces); } // a cell's scenery is not a station
  function pick(clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    if (!hit) return null;
    const { station, role } = hit.object.userData;
    if (!station) return null;
    if (/^day-\d+$/.test(station)) return { kind: "day", id: +station.slice(4) };
    return { kind: "station", id: station, role: role || "station" };
  }

  // ---- things that move ----
  let movers = null;
  const unit = new THREE.BoxGeometry(1, 1, 1);
  function buildMovers(force = false) { // the movers follow the model's runs, drones, lights and sky, and the theme: the same again is kept
    const key = JSON.stringify([model.runs, model.drones, model.lights, model.sky, model.hub, city.steam, themeName]);
    if (!force && movers?.g?.parent === city.root && movers.key === key) return;
    if (movers?.g?.parent === city.root) { city.root.remove(movers.g); movers.g.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); } // new data: the old movers go, their materials with them (the textures are the page's)
    const pal = city.pal, g = new THREE.Group(); city.root.add(g);
    const mat = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });
    const basic = (c, extra = {}) => new THREE.MeshBasicMaterial({ color: c, ...extra });
    // belts: one crate per commit this week rides each run, placed by the day it landed; a fixed start per run.
    // A bot's or routine commit rides as a low dark tote: it moves the belt, it builds nothing
    const SP = 8, CR = 6, TOTE = 2.4;
    const seedOf = (s) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 1000003; return h / 1000003; };
    const runs = (model.runs || []).map((r) => {
      const lo = Math.min(...r.segments.map((s) => s.from)), hi = Math.max(...r.segments.map((s) => s.to)), span = hi - lo;
      const all = (r.events || []).map((f) => [f, 0]).concat((r.bots || []).map((f) => [f, 1])).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cap = Math.max(1, Math.floor(span / SP)), step = Math.max(1, Math.ceil(all.length / cap));
      return { ...r, lo, hi, span, events: all.filter((_, i) => i % step === 0), speed: r.rate > 0 ? 4 + 1.6 * Math.log2(1 + r.rate) : 0, offset: seedOf(r.id) * span };
    });
    const count = (b) => runs.reduce((t, r) => t + (r.speed ? r.events.filter((e) => e[1] === b).length : 0), 0);
    const crateCount = count(0), toteCount = count(1);
    const crates = new THREE.InstancedMesh(unit, mat(pal.face.hi), Math.max(1, crateCount));
    const crateEdges = new THREE.InstancedMesh(new THREE.BoxGeometry(1.04, 1.04, 0.25), basic(pal.edge), Math.max(1, crateCount));
    const totes = new THREE.InstancedMesh(unit, mat(pal.face.lo), Math.max(1, toteCount));
    const toteEdges = new THREE.InstancedMesh(new THREE.BoxGeometry(1.04, 1.04, 0.25), basic(pal.edge), Math.max(1, toteCount));
    crates.userData.cap = crateCount; totes.userData.cap = toteCount;
    for (const m of [crates, crateEdges, totes, toteEdges]) m.userData.minZoom = SMALL_PARTS;
    g.add(crates, crateEdges, totes, toteEdges);
    // the press ram and the ISO platter
    const platter = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: pal.accent })); platter.userData.bloom = true;
    g.add(platter);
    // sky traffic
    const cars = [];
    const carGeo = new THREE.BoxGeometry(18, 7, 3);
    const lane = (c, z, dir, along, s, speed) => {
      const o = new THREE.Group();
      const body = new THREE.Mesh(carGeo, mat(pal.face.hi)); o.add(body);
      o.add(new THREE.LineSegments(new THREE.EdgesGeometry(carGeo), new THREE.LineBasicMaterial({ color: pal.edge })));
      const head = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 6), basic(pal.accent)); head.position.x = 9 * dir;
      const tail = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), basic(pal.live)); tail.position.x = -9 * dir;
      head.userData.bloom = tail.userData.bloom = true;
      o.add(head, tail);
      if (along === "y") o.rotation.z = Math.PI / 2;
      o.position.z = z; g.add(o);
      cars.push({ o, c, dir, along, s, speed });
    };
    const sky = model.sky;
    if (sky) {
      sky.lanes.forEach((l, i) => { for (let n = 0; n < 2; n++) lane(l[0], l[1], l[2], "x", (i * 170 + n * 380) % (sky.x1 - sky.x0), 46 + i * 9); });
      sky.cross.forEach((l, i) => lane(l[0], l[1], l[2], "y", (i * 260) % (sky.y1 - sky.y0), 38 + i * 7));
    }
    // drones between the workshops and the landing pad on the arcology
    const drones = (model.drones || []).slice(0, 14).map((d, i) => {
      const o = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(6.4, 6.4, 1.4), mat(pal.face.hi)); o.add(body);
      o.add(new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineBasicMaterial({ color: pal.line.hi })));
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const r = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.18, 4, 18), basic(pal.line.mid)); r.position.set(u * 4.8, v * 4.8, 0.8); o.add(r); }
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), basic(pal.live)); lamp.position.z = 1.2; lamp.userData.bloom = true; o.add(lamp);
      const crate = new THREE.Mesh(new THREE.BoxGeometry(4.4, 4.4, 4.4), mat(pal.face.hi)); crate.position.z = -5; o.add(crate);
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 3), basic(pal.line.mid)); line.position.z = -2; o.add(line);
      o.userData = { station: d.id };
      g.add(o);
      const period = Math.max(9, 22 - 2.2 * Math.log2(1 + d.rate));
      return { d, o, body, lamp, crate, line, period, t: (i * 0.37) % 1, cruise: Math.max(d.from[2], model.hub[2]) + 34 + (i % 5) * 7 };
    });
    // searchlights: soft cones from the tallest roofs
    const beams = (model.lights || []).map((l, i) => {
      const geo = new THREE.ConeGeometry(16, 1, 24, 1, true); geo.translate(0, -0.5, 0);
      const m = new THREE.Mesh(geo, basic(themeName === "dark" ? 0xffffff : 0x9a9a96, { transparent: true, opacity: themeName === "dark" ? 0.07 : 0.06, depthWrite: false, side: THREE.DoubleSide, blending: themeName === "dark" ? THREE.AdditiveBlending : THREE.NormalBlending }));
      g.add(m);
      return { l, m, phase: i * 1.9, speed: 0.16 + 0.05 * (i % 3), reach: 110 + 30 * (i % 2) };
    });
    // steam from the cooling towers
    const puff = puffTex();
    const steam = [];
    for (const s of city.steam) for (let i = 0; i < 5; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: pal.steam, transparent: true, depthWrite: false, opacity: 0 }));
      g.add(sp); steam.push({ sp, at: s.at, size: s.size, t: i / 5 });
    }
    movers = { key, g, runs, crates, crateEdges, totes, toteEdges, TOTE, platter, cars, drones, beams, steam, SP, CR };
    refreshPickables();
  }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  const ease = (u) => u * u * (3 - 2 * u);
  function droneAt(o, u) {
    const a = o.d.from, b = model.hub, z = o.cruise;
    const seg = [[0, 0.07, "up", a], [0.07, 0.44, "go", a, b], [0.44, 0.5, "down", b], [0.5, 0.57, "up", b], [0.57, 0.93, "go", b, a], [0.93, 1, "down", a]];
    for (const [s0, s1, kind, p, q2] of seg) if (u < s1 || s1 === 1) {
      const f = ease(Math.min(1, Math.max(0, (u - s0) / (s1 - s0)))), loaded = u < 0.5;
      if (kind === "up") return { p: [p[0], p[1], p[2] + 4 + (z - p[2] - 4) * f], loaded };
      if (kind === "down") return { p: [p[0], p[1], z - (z - p[2] - 4) * f], loaded };
      return { p: [p[0] + (q2[0] - p[0]) * f, p[1] + (q2[1] - p[1]) * f, z + Math.sin(f * Math.PI) * 10], loaded, dir: Math.atan2(q2[1] - p[1], q2[0] - p[0]) };
    }
  }
  let clock = 0, pressPhase = 0, angle = 0.6, tickPos = 0, tickIdx = 0, tickClock = 0, ownPos = 0;
  const TICK = (model.ticker || []).map(([id, s]) => `${id} · ${s}`.toUpperCase().replace(/\s+/g, " "));
  const pressRate = 0.25 + 0.12 * Math.log2(1 + (model.repos?.[model.slots?.press]?.c7 || 0)), spinRate = 0.2 + 0.18 * Math.log2(1 + (model.repos?.[model.slots?.disc]?.c7 || 0));
  function animate(dt) {
    city.mats.screenUniforms.uTime.value += dt; // the screens' sweep and flicker
    if (!movers) return;
    clock += dt;
    const M = movers;
    // belts
    const n = [0, 0], mesh = [[M.crates, M.crateEdges, 5], [M.totes, M.toteEdges, M.TOTE]];
    for (const r of M.runs) {
      if (!r.speed || !r.events.length) continue;
      r.offset += r.speed * dt;
      for (const [f, b] of r.events) {
        const [body, edges, h] = mesh[b];
        if (n[b] >= body.userData.cap) continue;
        const s = (((f * r.span + r.offset) % r.span) + r.span) % r.span;
        const p = r.dir > 0 ? r.lo + s : r.hi - s - M.CR;
        if (!r.segments.some((sg) => p >= sg.from && p + M.CR <= sg.to + 0.01)) continue;
        const x = r.axis === "x" ? p + M.CR / 2 : r.c, y = r.axis === "x" ? r.c : p + M.CR / 2;
        pos.set(x, y, PZ + 7.2 + h / 2); scl.set(M.CR, M.CR, h); m4.compose(pos, q.identity(), scl);
        body.setMatrixAt(n[b], m4);
        pos.z = PZ + 7.2 + h + 0.1; scl.set(M.CR, M.CR, 1); m4.compose(pos, q, scl); edges.setMatrixAt(n[b], m4);
        n[b]++;
      }
    }
    mesh.forEach(([body, edges], b) => { body.count = edges.count = n[b]; body.instanceMatrix.needsUpdate = edges.instanceMatrix.needsUpdate = true; });
    // the press and the platter
    pressPhase += pressRate * dt; angle += spinRate * dt;
    const s = 0.5 - 0.5 * Math.cos(pressPhase * Math.PI * 2);
    city.ram.position.z = -5.4 * Math.pow(s, 3);
    if (model.platter) {
      const [x, y, z] = model.platter, a = M.platter.geometry.attributes.position;
      a.setXYZ(0, x + Math.sin(angle) * 4.6, y - Math.cos(angle) * 4.6, z + PZ + 0.2); a.setXYZ(1, x + Math.sin(angle) * 11.6, y - Math.cos(angle) * 11.6, z + PZ + 0.2); a.needsUpdate = true;
    }
    // cars
    const sky = model.sky;
    for (const c of M.cars) {
      const [a0, a1] = c.along === "x" ? [sky.x0, sky.x1] : [sky.y0, sky.y1], L = a1 - a0;
      c.s = (c.s + c.speed * dt) % L;
      const p = c.dir > 0 ? a0 + c.s : a1 - c.s;
      if (c.along === "x") c.o.position.set(p, c.c, c.o.position.z); else c.o.position.set(c.c, p, c.o.position.z);
      c.o.visible = c.s > 40 && L - c.s > 40;
    }
    // drones
    for (const o of M.drones) {
      o.t = (o.t + dt / o.period) % 1;
      const { p, loaded, dir } = droneAt(o, o.t);
      o.o.position.set(...p); if (dir !== undefined) o.o.rotation.z = dir;
      o.crate.visible = o.line.visible = loaded;
      o.lamp.visible = (clock * 2 + o.t * 7) % 1 < 0.5;
      const on = lit.has(o.d.id); if (on !== o.on) { o.on = on; o.o.children[1].material.color.set(on ? city.pal.accent : city.pal.line.hi); }
    }
    // searchlights
    for (const b of M.beams) {
      const a = b.phase + clock * b.speed, [lx, ly, lz] = b.l;
      const tx = lx + Math.cos(a) * b.reach, ty = ly + Math.sin(a * 1.3) * b.reach * 0.8;
      const from = new THREE.Vector3(lx, ly, lz), to = new THREE.Vector3(tx, ty, PZ), d = to.clone().sub(from), len = d.length();
      b.m.position.copy(from); b.m.scale.set(1, len, 1);
      b.m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), d.normalize());
    }
    // steam
    for (const p of M.steam) {
      p.t = (p.t + dt / 5.6) % 1;
      p.sp.position.set(p.at[0] + p.t * 6, p.at[1], p.at[2] + p.t * 40);
      const sz = p.size * (1 + p.t * 3); p.sp.scale.set(sz, sz, 1);
      p.sp.material.opacity = (p.t < 0.12 ? p.t / 0.12 : 1 - (p.t - 0.12) / 0.88) * (themeName === "dark" ? 0.35 : 0.8);
    }
    // pulsing lamps
    if (city.pulsePts) city.pulsePts.material.opacity = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(clock * 4));
    // billboards
    tickClock += dt;
    if (TICK.length && tickClock > 0.22) {
      tickClock = 0;
      const str = TICK[tickIdx % TICK.length] + "   ·   ";
      for (const t of city.texts) if (t.userData.ticker) {
        const own = t.userData.ticker === "own" ? (t.userData.crawl || t.userData.text) + "   ·   " : null; // a screen's own line crawls its own words
        const src = own ?? str, pos = (own ? ownPos : tickPos) % src.length, w = t.userData.ticker === "wide" ? 17 : own ? t.userData.text.length : 13, win = (src + src).slice(pos, pos + w);
        t.userData.redraw(win.padEnd(t.userData.text.length).slice(0, t.userData.text.length), t.userData.color);
      }
      tickPos++; ownPos++; if (tickPos >= str.length) { tickPos = 0; tickIdx++; }
    }
  }

  // ---- level of detail ----
  // anything with userData.minZoom shows only from that zoom on (scene3d.js); rechecked when the zoom moves 4% or the
  // scene changes. The pixel ratio keeps a 4K wall near 8 million pixels so it draws as smoothly as a laptop.
  function applyLod(force = false) {
    const z = camera.zoom;
    if (!force && lodList && Math.abs(z / lodZoom - 1) < 0.04) return;
    if (!lodList || force) { lodList = []; city.root.traverse((o) => { if (o.userData?.minZoom) lodList.push(o); }); }
    lodZoom = z;
    for (const o of lodList) o.visible = z >= o.userData.minZoom;
    // the edge lines fade toward the far view in the dark theme (city/lod.js): the city reads by its faces and its lights
    const a = themeName === "dark" ? edgeAlpha(z) : 0.45 + 0.55 * edgeAlpha(z); // light: the plate keeps a floor of line, the model reads by shade from afar
    for (const m of [city.mats.edge, city.mats.line]) { m.opacity = a; m.transparent = a < 1; m.visible = a > 0.02; }
    // lamps shrink with the far view, so a phone's whole city is not a field of dots
    const f = Math.max(0.55, Math.min(1, z / 0.7));
    city.mats.dot.size = 2.5 * f; city.mats.pulse.size = 4 * f;
  }
  function pixelBudget() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    const pr = Math.max(1, Math.min(2, window.devicePixelRatio || 1, Math.sqrt(8.3e6 / (w * h))));
    renderer.setPixelRatio(pr); finalComposer.setPixelRatio(pr); bloomComposer.setPixelRatio(pr);
  }

  // ---- loop ----
  // the idle loop: with motion on, the city animates every frame; with reduced motion nothing moves on its own, so
  // the loop sleeps until something changes (the camera, an effect, a morph, a highlight) and touch() wakes it
  let dirty = true, raf = 0, last = 0, running = false;
  function touch() { dirty = true; if (running && !raf) { last = 0; raf = requestAnimationFrame(frame); } }
  function frame(now) {
    const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60; last = now;
    const flying = stepFly(now);
    const moved = controls.update(dt);
    if (!still) animate(dt);
    fx.step(dt);
    for (let i = morphs.length - 1; i >= 0; i--) { const m = morphs[i]; m.t = Math.min(1, m.t + dt / 0.7); const t = Math.max(0, m.t), u = t * t * (3 - 2 * t); m.o.scale.z = m.from + (1 - m.from) * u; if (m.t >= 1) morphs.splice(i, 1); } // a negative t is a delay
    applyLod();
    render();
    api.onFrame?.(dt);
    for (const f of frameTaps) f(); // a clip copies the frame right after it rendered
    const keep = !still || flying || moved || fx.busy || morphs.length > 0 || dirty;
    dirty = false;
    raf = keep ? requestAnimationFrame(frame) : 0;
  }

  // ---- public ----
  const api = {
    renderer, camera, controls, scene,
    // home and reset lower the zoom floor when the whole city fits only below it (a phone)
    home(pads, ms = 700) { const h = homeView(pads); flyTo(h, ms); },
    reset(pads) { const h = homeView(pads); place(h.target, h.az, h.el, h.zoom); touch(); },
    focus(ids, pads, ms = 700, span = 70) { // span: never closer than this many city units
      const list = boxesOf(ids); if (!list.length) return;
      const u = list.reduce((a, b) => a.union(b), new THREE.Box3()), c = u.getCenter(new THREE.Vector3());
      list.push(new THREE.Box3().setFromCenterAndSize(c, new THREE.Vector3(span, span, 10)));
      const z = Math.min(controls.maxZoom, zoomFor(list, pads) * 0.8);
      flyTo({ target: targetFor(list, pads, z), zoom: z }, ms);
    },
    zoom(f) { flyTo({ zoom: Math.min(controls.maxZoom, Math.max(controls.minZoom, camera.zoom / f)) }, 260); },
    flying() { return !!fly; },
    orbit(stepDeg) { const v = view(); flyTo({ az: v.az + stepDeg * deg }, 650); },
    tilt(el) { flyTo({ el: el * deg }, 500); },
    setLit, pick, boxesOf,
    // in place: swap these stations for their new drawing (fragments of the two 3D records, city/stations.js);
    // the rest of the city, the camera and the movers stay as they are
    replaceStations(fragsA, fragsB, cells = []) { // cells: the claimed cells ("cell:i,j", "cell:apps:5") whose stand-ins go
      const fresh = new Set(Object.keys(fragsA).filter((id) => !city.stations.has(id)));
      const ids = new Set([...Object.keys(fragsA), ...cells]), keepLit = [...lit].filter((id) => ids.has(id));
      keepLit.forEach((id) => paint(id, false));
      const gone = [];
      city.root.traverse((o) => { if (o !== city.root && ids.has(o.userData?.station)) gone.push(o); });
      for (const o of gone) { o.parent?.remove(o); o.geometry?.dispose(); if (o.material?.map) { o.material.map.dispose(); o.material.dispose(); } }
      for (const id of ids) city.stations.delete(id);
      city.texts = city.texts.filter((t) => !ids.has(t.userData.station));
      const wrap = (f) => Object.values(f).flat().join("");
      const part = buildScene(wrap(fragsA), wrap(fragsB), themeName, { mats: city.mats, onAsset: () => touch() });
      const added = [];
      for (const child of [...part.root.children]) { if (child === part.ram) continue; city.root.add(child); added.push(child); }
      // the morph: a redrawn station settles into its new height; a new one rises from the ground
      if (!still) for (const o of added) { const id = o.userData?.station; morphs.push({ o, t: 0, from: fresh.has(id) ? 0.04 : 0.94 }); o.scale.z = fresh.has(id) ? 0.04 : 0.94; }
      if (part.ram.children.length) { city.root.remove(city.ram); city.ram = part.ram; city.root.add(part.ram); }
      for (const [id, st] of part.stations) city.stations.set(id, st);
      city.texts.push(...part.texts);
      if (!city.pulsePts && part.pulsePts) city.pulsePts = part.pulsePts;
      world.updateMatrixWorld(true);
      refreshPickables(); keepLit.forEach((id) => { lit.delete(id); }); setLit([...lit, ...keepLit]);
      touch();
    },
    // the arrival: every object starts flat and rises; stations at their delay in the order (0..1 of the span),
    // the mark and scenery first
    arrive(order, ms = 3000) {
      if (still) return;
      city.root.traverse((o) => {
        if (o === city.root || o.parent !== city.root) return;
        const id = o.userData?.station, d = id && order.has(id) ? order.get(id) : id?.startsWith("cell:") ? 0.08 : 0.02;
        o.scale.z = 0.02; morphs.push({ o, t: -(d * ms) / 700, from: 0.02 });
      });
      touch();
    },
    // clips: run f after each frame renders; returns the way to stop (keeps the loop awake meanwhile)
    tap(f) { frameTaps.add(f); const keep = setInterval(touch, 30); touch(); return () => { frameTaps.delete(f); clearInterval(keep); }; },
    // new data for what moves: belts, drones, ticker
    setModel(next) { Object.assign(model, next); buildMovers(); },
    fx(prims) { fx.play(prims); touch(); },
    // a person's trail: their house, then the repositories they worked on, joined by a raised accent line
    trail(points) {
      if (trailObj) { world.remove(trailObj); trailObj.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); trailObj = null; }
      if (points?.length > 1) {
        const pal = city.pal, g = new THREE.Group(), lift = (p) => new THREE.Vector3(p[0], p[1], p[2] + 6);
        const pts = []; points.forEach((p, i) => { if (i) { const a = points[i - 1], mid = [(a[0] + p[0]) / 2, (a[1] + p[1]) / 2, Math.max(a[2], p[2]) + 26]; for (let k = 1; k <= 12; k++) { const u = k / 12, q = [0, 1, 2].map((d) => (1 - u) * (1 - u) * a[d] + 2 * (1 - u) * u * mid[d] + u * u * p[d]); pts.push(lift(q)); } } else pts.push(lift(p)); });
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: pal.accent })));
        points.forEach((p, i) => { const d = new THREE.Mesh(new THREE.SphereGeometry(i ? 1.6 : 2.4, 10, 8), new THREE.MeshBasicMaterial({ color: i ? pal.accent : pal.live })); d.position.copy(lift(p)); g.add(d); });
        world.add(g); trailObj = g;
      }
      touch();
    },
    // a live commit subject goes to the front of the billboard crawl
    tick(line) { TICK.splice(tickIdx % Math.max(1, TICK.length), 0, String(line).toUpperCase().replace(/\s+/g, " ")); if (TICK.length > 40) TICK.pop(); tickPos = 0; },
    heading() { return (((view().az / deg) % 360) + 360) % 360; },
    state() { const v = view(); return { az: v.az, el: v.el, zoom: v.zoom, target: v.target.toArray() }; },
    restore(s) { if (s && s.target) { place(new THREE.Vector3(...s.target), s.az, s.el, s.zoom); touch(); } },
    setTheme(t) { // in place: the scene's materials, vertex colours, signs and stencils are recoloured (scene3d.js), the movers rebuilt
      if (t === themeName) return; themeName = t;
      const keep = [...lit]; setLit([]);
      retheme(city, t, { onAsset: () => touch() });
      scene.background.set(city.pal.bg); scene.fog.color.set(city.pal.bg); scene.fog.far = 1800 + (t === "dark" ? 1100 : 1300);
      hemi.groundColor.set(t === "dark" ? 0x101010 : 0x9a9a94); applyClock();
      buildMovers(true); applyLod(true); setLit(keep); touch();
    },
    setStill(v) { still = v; touch(); },
    // the clock: null follows the real time; a Date sets the sun to that moment (the scrubber)
    setClock(d) { clockAt = d; applyClock(); touch(); },
    get daylight() { return daylight; },
    start() { running = true; if (!raf) raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); raf = 0; last = 0; },
  };
  mount(theme);
  setInterval(() => { if (!clockAt) { applyClock(); touch(); } }, 60000); // the sun moves on
  setFrustum();
  return api;
}
