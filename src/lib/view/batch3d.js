// Batching for the 3D map. The city has about 860 stations, and drawing each one's faces, edges, lines, panes and
// lamps as objects of their own cost some 6,000 draw calls a frame. Here each kind of part is a layer, and a layer is a
// few chunks, one draw call each. A station lands in the chunk its id hashes to and its slice of that chunk is
// remembered, so it can still be lit (its colours rewritten), redrawn (its chunk rebuilt without its old drawing, the
// new one appended) and raised (the arrival, a redraw: a start time per vertex that the shader reads) on its own.
import * as THREE from "three";

export const CHUNKS = 16;
const NONE = CHUNKS; // what belongs to no station (the mark, the ground's props): one chunk of its own, built once

export function chunkOf(id) {
  if (!id) return NONE;
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % CHUNKS;
}

// The rise: z scaled from `from` to 1 over 0.7 s after `start` (seconds on the map's clock, riseNow). A vertex that is
// not rising has a start far in the past. withRise teaches a material to read it.
export const riseNow = { value: 0 };
export const RISE = 0.7;
export function withRise(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRiseNow = riseNow;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aRise;\nuniform float uRiseNow;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n{ float k = clamp((uRiseNow - aRise.x) / ${RISE.toFixed(2)}, 0.0, 1.0); k = k * k * (3.0 - 2.0 * k); transformed.z *= mix(aRise.y, 1.0, k); }`);
  };
  material.customProgramCacheKey = () => "rise";
  return material;
}
const STILL = -1e6; // a start long past: no rise

// A layer: kind "mesh" | "lines" | "points"; pieces come as Map(station id or "" → { pos, nor?, runs, subs }): a
// station's vertices packed in one array (view/scene3d.js prepare()), runs as [key, vertices] (key names a run's
// colour; colorOf turns it into one) and subs as [role, vertices] (the part a solid is, for picking).
//
// A chunk's buffers keep room to spare, so a redraw is written in place and only its vertices go to the GPU: a station
// whose new drawing fits its old slot is rewritten there, one that does not moves to the chunk's free end, and a chunk
// rebuilds (compacted, with fresh room) only when it runs out of room or is mostly holes. A hole's vertices sit far
// below the deck (HOLE), outside the camera's depth range: drawn as nothing, never hit.
const HOLE = -1e7;
const SLACK = (n) => Math.ceil(n * 1.25) + 2048;
export class Layer {
  constructor(name, { kind, material, normals = false, userData = {}, colorOf, parent }) {
    Object.assign(this, { name, kind, material, normals, userData, colorOf, parent });
    this.chunks = Array.from({ length: CHUNKS + 1 }, () => ({ obj: null, geo: null, ranges: new Map(), used: 0, cap: 0, waste: 0 }));
  }
  build(pieces) {
    const by = Array.from({ length: CHUNKS + 1 }, () => new Map());
    for (const [id, list] of pieces) by[chunkOf(id)].set(id, list);
    by.forEach((fresh, ci) => this.#write(ci, [], fresh));
  }
  // take these stations out and put in the new pieces (a station in both is redrawn); in place where there is room
  replace(ids, pieces) {
    const dirty = new Map();
    for (const id of ids) if (!dirty.has(chunkOf(id))) dirty.set(chunkOf(id), new Map());
    for (const [id, list] of pieces) { const ci = chunkOf(id); if (!dirty.has(ci)) dirty.set(ci, new Map()); dirty.get(ci).set(id, list); }
    for (const [ci, fresh] of dirty) if (!this.#patch(ci, ids, fresh)) {
      const keep = [...this.chunks[ci].ranges.keys()].filter((id) => !ids.has(id) && !fresh.has(id));
      this.#write(ci, keep, fresh);
    }
  }
  #patch(ci, ids, fresh) { // false: no room, rebuild
    const c = this.chunks[ci];
    if (!c.geo) return false;
    // plan first, so a chunk that cannot take it all is rebuilt untouched
    let end = c.used, waste = c.waste;
    const plan = [];
    for (const id of ids) if (!fresh.has(id) && c.ranges.has(id)) { plan.push(["free", id]); waste += c.ranges.get(id).cap; }
    for (const [id, p] of fresh) {
      const n = p.pos.length / 3, r = c.ranges.get(id);
      if (r && n <= r.cap) plan.push(["in", id, p, r.start, r.cap]);
      else { if (r) { plan.push(["free", id]); waste += r.cap; } plan.push(["in", id, p, end, n]); end += n; }
    }
    if (end > c.cap || waste > c.cap * 0.5) return false;
    const a = c.geo.attributes, box = new THREE.Box3(), v = new THREE.Vector3();
    for (const [what, id, p, start, cap] of plan) {
      if (what === "free") { const r = c.ranges.get(id); this.#hole(c, r.start, r.cap); c.ranges.delete(id); continue; }
      const r = this.#fill(c, id, p, start, cap);
      if (r.count < cap) this.#hole(c, start + r.count, cap - r.count);
      for (const name of ["position", "color", "aRise", "normal"]) { const at = a[name]; if (at) { at.addUpdateRange(start * at.itemSize, cap * at.itemSize); at.needsUpdate = true; } }
      const P = a.position.array; for (let i = start; i < start + r.count; i++) box.expandByPoint(v.fromArray(P, i * 3));
    }
    c.used = end; c.waste = waste; c.geo.setDrawRange(0, end);
    if (!box.isEmpty()) c.geo.boundingSphere.union(box.getBoundingSphere(new THREE.Sphere())); // grows only: a culling and picking bound
    return true;
  }
  // write a station's packed vertices at start (its slot holds cap vertices); returns its range
  #fill(c, id, p, start, cap) {
    const a = c.geo.attributes, pos = a.position.array, col = a.color.array, rs = a.aRise.array, nor = a.normal?.array, color = new THREE.Color();
    pos.set(p.pos, start * 3); if (nor) nor.set(p.nor, start * 3);
    let at = start;
    for (const [key, k] of p.runs) {
      color.set(this.colorOf(key));
      for (let i = at; i < at + k; i++) { col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b; rs[i * 2] = STILL; rs[i * 2 + 1] = 1; }
      at += k;
    }
    const r = { start, count: at - start, cap, runs: p.runs, subs: p.subs };
    c.ranges.set(id, r);
    return r;
  }
  #hole(c, start, n) {
    const a = c.geo.attributes, pos = a.position.array;
    for (let i = start; i < start + n; i++) { pos[i * 3] = 0; pos[i * 3 + 1] = 0; pos[i * 3 + 2] = HOLE; }
    a.position.addUpdateRange(start * 3, n * 3); a.position.needsUpdate = true;
  }
  #write(ci, keep, fresh) {
    const c = this.chunks[ci], old = c.geo;
    let n = 0;
    for (const id of keep) n += c.ranges.get(id).count;
    for (const p of fresh.values()) n += p.pos.length / 3;
    if (c.obj) { this.parent.remove(c.obj); c.obj = null; c.geo = null; }
    if (!n) { c.ranges = new Map(); c.used = c.cap = c.waste = 0; old?.dispose(); return; }
    const cap = ci === NONE ? n : SLACK(n); // what belongs to no station is built once
    const pos = new Float32Array(cap * 3), col = new Float32Array(cap * 3), rs = new Float32Array(cap * 2), nor = this.normals ? new Float32Array(cap * 3) : null;
    const ranges = new Map();
    let at = 0;
    if (old) {
      const oP = old.attributes.position.array, oC = old.attributes.color.array, oR = old.attributes.aRise.array, oN = old.attributes.normal?.array;
      for (const id of keep) {
        const r = c.ranges.get(id), s = r.start, k = r.count;
        pos.set(oP.subarray(s * 3, (s + k) * 3), at * 3); col.set(oC.subarray(s * 3, (s + k) * 3), at * 3); rs.set(oR.subarray(s * 2, (s + k) * 2), at * 2);
        if (nor) nor.set(oN.subarray(s * 3, (s + k) * 3), at * 3);
        ranges.set(id, { ...r, start: at, cap: k }); at += k;
      }
      old.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    if (nor) geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aRise", new THREE.BufferAttribute(rs, 2));
    Object.assign(c, { geo, ranges, used: 0, cap, waste: 0 });
    for (const [id, p] of fresh) { const k = p.pos.length / 3; this.#fill(c, id, p, at, k); at += k; }
    for (let i = at; i < cap; i++) pos[i * 3 + 2] = HOLE;
    c.used = at; geo.setDrawRange(0, at);
    geo.computeBoundingSphere(); // the holes are far below: bound what is drawn
    { const b = new THREE.Box3(), v = new THREE.Vector3(); for (let i = 0; i < at; i++) b.expandByPoint(v.fromArray(pos, i * 3)); b.getBoundingSphere(geo.boundingSphere); }
    for (const a of Object.values(geo.attributes)) a.setUsage(THREE.DynamicDrawUsage);
    const obj = this.kind === "lines" ? new THREE.LineSegments(geo, this.material) : this.kind === "points" ? new THREE.Points(geo, this.material) : new THREE.Mesh(geo, this.material);
    obj.userData = { ...this.userData, layer: this.name };
    obj.matrixAutoUpdate = false;
    this.parent.add(obj);
    c.obj = obj;
  }
  range(id) { const c = this.chunks[chunkOf(id)], r = c.ranges.get(id); return r ? { ...r, obj: c.obj, geo: c.geo } : null; }
  // the ray against one station's part of its chunk (picking)
  raycast(id, raycaster, out) {
    const c = this.chunks[chunkOf(id)], r = c.ranges.get(id); if (!r) return null;
    c.geo.setDrawRange(r.start, r.count); c.obj.raycast(raycaster, out); c.geo.setDrawRange(0, c.used);
    return r;
  }
  // a station's colours: tinted (fn changes each base colour in place), or back to its own
  tint(id, fn = null) {
    const r = this.range(id); if (!r) return;
    const a = r.geo.attributes.color, c = new THREE.Color();
    let i = r.start;
    for (const [key, k] of r.runs) { c.set(this.colorOf(key)); if (fn) fn(c); for (const end = i + k; i < end; i++) a.setXYZ(i, c.r, c.g, c.b); }
    a.addUpdateRange(r.start * 3, r.count * 3); a.needsUpdate = true;
  }
  // every colour again, from a new palette (a theme change)
  recolor(colorOf) {
    this.colorOf = colorOf;
    const c = new THREE.Color();
    for (const ch of this.chunks) {
      if (!ch.geo) continue;
      const a = ch.geo.attributes.color;
      for (const r of ch.ranges.values()) { let i = r.start; for (const [key, k] of r.runs) { c.set(colorOf(key)); for (const end = i + k; i < end; i++) a.setXYZ(i, c.r, c.g, c.b); } }
      a.clearUpdateRanges(); a.needsUpdate = true;
    }
  }
  rise(id, start, from) {
    const r = this.range(id); if (!r) return;
    const a = r.geo.attributes.aRise;
    for (let i = r.start; i < r.start + r.count; i++) a.setXY(i, start, from);
    a.addUpdateRange(r.start * 2, r.count * 2); a.needsUpdate = true;
  }
  riseAll(fn) { // fn(station id or "") → [start, from]
    for (const ch of this.chunks) {
      if (!ch.geo) continue;
      const a = ch.geo.attributes.aRise;
      for (const [id, r] of ch.ranges) { const [s, f] = fn(id); for (let i = r.start; i < r.start + r.count; i++) a.setXY(i, s, f); }
      a.clearUpdateRanges(); a.needsUpdate = true;
    }
  }
  // a copy of a station's vertices (the lit station's crisp edges are drawn from it)
  positions(id) { const r = this.range(id); return r ? r.geo.attributes.position.array.slice(r.start * 3, (r.start + r.count) * 3) : null; }
  // the role of the solid a station's vertex i belongs to (picking)
  roleAt(r, i) { let o = i - r.start; for (const [role, k] of r.subs) { if (o < k) return role; o -= k; } return ""; }
  objects() { return this.chunks.map((c) => c.obj).filter(Boolean); }
  dispose() { for (const c of this.chunks) { if (c.obj) this.parent.remove(c.obj); c.geo?.dispose(); Object.assign(c, { obj: null, geo: null, ranges: new Map(), used: 0, cap: 0, waste: 0 }); } }
}
