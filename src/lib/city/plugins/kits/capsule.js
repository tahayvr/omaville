// A Metabolist capsule tower (after Kurokawa's Nakagin): two service cores with capsules bolted on, one capsule
// every 4.4 units of height, each with a round window that is lit while the repository had a commit this week.
export default {
  id: "capsule",
  name: "Capsule tower",
  legend: {
    signal: "a repository's lifetime commits, and whether it had a commit in the last 7 days",
    formula: "the city's one height scale; capsules bolted to two cores up to that height, their windows lit by this week's commits",
    window: "lifetime; lights, the last 7 days",
  },
  draw({ id, plan, h, on, kit }) {
    const { S, L, slab, path3, k, P, byDepth, hash, VX, VY } = kit;
    const seed = [...id].reduce((t, c) => t + c.charCodeAt(0), 0);
    const cw = Math.max(3, Math.min(6, plan.w * 0.18)), gap = Math.max(cw + 2, plan.w * 0.42);
    const cx = plan.x + plan.w / 2, cy = plan.y + plan.d / 2;
    const cores = [[cx - gap / 2, cy], [cx + gap / 2 - cw, cy]].map(([x, y]) => ({ x, y: y - cw / 2, w: cw, d: cw, r: 0.4 }));
    const out = [`<path class="iso-halo" d="${k.haloOf({ ...plan, r: 1 }, 0, h, P)}"/>`];
    // capsules around the cores, fixed per repository; each a box with a round-ish window on its outward face
    const caps = [], cs = Math.min(5.2, (plan.w - gap - cw) / 2 + 1, plan.d / 2 - cw / 2);
    for (let z = 1.2, n = 0; z + 4 <= h - 2; z += 4.4, n++) for (const [ci, c] of cores.entries()) for (const side of [-1, 1]) {
      if (hash(seed, n, ci * 2 + (side > 0 ? 1 : 0)) < 0.3) continue;
      const along = hash(seed, n + 9, ci) < 0.5; // out along x, or out along y
      const box = along
        ? { x: side < 0 ? c.x - cs : c.x + c.w, y: c.y + (c.d - cs) / 2, w: cs, d: cs, r: 0.5 }
        : { x: c.x + (c.w - cs) / 2, y: side < 0 ? c.y - cs : c.y + c.d, w: cs, d: cs, r: 0.5 };
      box.x = Math.max(plan.x, Math.min(plan.x + plan.w - box.w, box.x)); box.y = Math.max(plan.y, Math.min(plan.y + plan.d - box.d, box.y));
      caps.push({ box, z, along, side });
    }
    // cores and capsules in one painter's order: far to near, low to high
    const parts = [...cores.map((box) => ({ box, core: true, z: 0 })), ...caps];
    const centre = (q) => [q.box.x + q.box.w / 2, q.box.y + q.box.d / 2];
    const order = byDepth(parts, centre), rank = new Map(order.map((q, i) => [q, i]));
    for (const c of parts.slice().sort((a, b) => rank.get(a) - rank.get(b) || a.z - b.z)) {
      if (c.core) { out.push(S(slab(c.box, 0, h, 2, 0.3), { tone: "mid", crease: "lo" })); continue; }
      out.push(S(slab(c.box, c.z, 4, 2, 0.4), { tone: "hi", crease: "lo" }));
      const fx = VX > 0 ? c.box.x + c.box.w : c.box.x, fy = VY > 0 ? c.box.y + c.box.d : c.box.y, m = c.box.w / 2, wz = c.z + 2, r = 1.1;
      const ring = (pts) => path3(pts, true);
      const win = [];
      for (let a = 0; a < 8; a++) { const t = (a / 8) * Math.PI * 2; win.push(c.along ? [fx, c.box.y + m + Math.cos(t) * r, wz + Math.sin(t) * r] : [c.box.x + m + Math.cos(t) * r, fy, wz + Math.sin(t) * r]); }
      out.push(L(ring(win), { tone: on ? "hi" : "lo" }));
    }
    return { svg: out.join(""), top: h + 1, roof: [cx, cy, h] };
  },
};
