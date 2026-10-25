// Effects in 3D: the primitives of city/effects.js as short-lived three.js objects in the city group (city units,
// z up). Each one runs for a few seconds, then removes itself and frees its geometry; nothing persists.
import * as THREE from "three";

export function createFx3d({ group, palette, pulse }) {
  const live = [];
  const col = (hue) => { const p = palette(); return hue === "accent" ? p.accent : hue === "live" ? p.live : hue === "lo" ? p.line.mid : p.glow?.[hue] ?? p.accent; };
  const basic = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, transparent: true, depthWrite: false, ...o });
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c, transparent: true });
  const add = (obj, dur, step, delay = 0) => { obj.visible = false; obj.traverse((o) => { o.userData.bloom = true; }); group.add(obj); live.push({ obj, dur, step, t: -delay }); }; // an effect is light: it blooms (map3d.js)
  const ease = (u) => u * u * (3 - 2 * u);
  let puff = null;
  const puffTex = () => puff ??= (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"); const g = x.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const fade = (obj, a) => obj.traverse((o) => { if (o.material) o.material.opacity = a; });

  const make = {
    // a delivery drone from a roof to the arcology's pad, its crates hanging under it
    drone({ from, to, crates = 1 }) {
      const p = palette(), o = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(7, 7, 1.6), lam(p.face.hi)); o.add(body, new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineBasicMaterial({ color: p.line.hi, transparent: true })));
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const r = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.2, 4, 16), basic(p.line.mid)); r.position.set(u * 5, v * 5, 0.9); o.add(r); }
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), basic(p.live)); lamp.position.z = 1.4; o.add(lamp);
      for (let i = 0; i < crates; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(4.2, 4.2, 3.6), lam(p.face.hi)); c.position.set(((i % 2) - 0.5) * 4.6 * (crates > 1 ? 1 : 0), 0, -4.5 - Math.floor(i / 2) * 3.9); o.add(c); }
      const cruise = Math.max(from[2], to[2]) + 30;
      return [o, 4.2, (u) => {
        let x, y, z;
        if (u < 0.15) { const f = ease(u / 0.15); [x, y, z] = [from[0], from[1], from[2] + 6 + (cruise - from[2] - 6) * f]; }
        else if (u < 0.85) { const f = ease((u - 0.15) / 0.7); [x, y, z] = [from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f, cruise + Math.sin(f * Math.PI) * 14]; o.rotation.z = Math.atan2(to[1] - from[1], to[0] - from[0]); }
        else { const f = ease((u - 0.85) / 0.15); [x, y, z] = [to[0], to[1], cruise - (cruise - to[2] - 6) * f]; }
        o.position.set(x, y, z); lamp.visible = (u * 18) % 1 < 0.5; fade(o, u > 0.92 ? (1 - u) / 0.08 : 1);
      }];
    },
    // a ring that opens and fades on the ground of a roof
    ring({ at, hue = "accent", r = 12 }) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 4, 48), basic(col(hue))); m.position.set(at[0], at[1], at[2] + 1.5);
      return [m, 1.8, (u) => { const s = 0.15 * r + 0.85 * r * ease(u); m.scale.set(s, s, s); m.material.opacity = 1 - u; }];
    },
    // a beam that draws from a roof to the arcology's crown, then fades
    beam({ from, to, hue = "accent" }) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...from), new THREE.Vector3(to[0], to[1], to[2])]);
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: col(hue), transparent: true }));
      const dot = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), basic(col(hue))); const o = new THREE.Group(); o.add(line, dot);
      return [o, 2.2, (u) => {
        const f = Math.min(1, u / 0.5), p = from.map((v, i) => v + (to[i] - v) * ease(f));
        g.attributes.position.setXYZ(1, ...p); g.attributes.position.needsUpdate = true; dot.position.set(...p);
        fade(o, u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4);
      }];
    },
    // a crate dropped onto a roof (a pull request arrives, a branch is pushed)
    drop({ at, hue = "c" }) {
      const p = palette(), o = new THREE.Group();
      const c = new THREE.Mesh(new THREE.BoxGeometry(4.6, 4.6, 4), lam(p.face.hi)); o.add(c, new THREE.LineSegments(new THREE.EdgesGeometry(c.geometry), new THREE.LineBasicMaterial({ color: col(hue), transparent: true })));
      return [o, 1.6, (u) => { const f = Math.min(1, u / 0.45); o.position.set(at[0], at[1], at[2] + 2 + 40 * (1 - f * f)); fade(o, u > 0.75 ? (1 - u) / 0.25 : 1); }];
    },
    // smoke in the alert colour from a roof: a failed build
    smoke({ at, hue = "live" }) {
      const o = new THREE.Group(), puffs = [];
      for (let i = 0; i < 7; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex(), color: col(hue), transparent: true, depthWrite: false, opacity: 0 })); o.add(s); puffs.push(s); }
      return [o, 4.5, (u) => puffs.forEach((s, i) => {
        const t = Math.min(1, Math.max(0, u * 1.4 - i * 0.06)), sz = 5 + t * 16;
        s.position.set(at[0] + t * 6 + Math.sin(i) * 2, at[1], at[2] + 3 + t * 46); s.scale.set(sz, sz, 1);
        s.material.opacity = t <= 0 ? 0 : (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85) * 0.7;
      })];
    },
    // a launch from the arcology's pad: a release
    launch({ at }) {
      const p = palette(), o = new THREE.Group();
      const ship = new THREE.Mesh(new THREE.ConeGeometry(2.2, 8, 12), lam(p.face.hi)); ship.rotation.x = Math.PI / 2; o.add(ship);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), basic(p.glow?.a ?? p.live)); flame.position.z = -5; o.add(flame);
      const tg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...at), new THREE.Vector3(...at)]);
      const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: p.glow?.a ?? p.live, transparent: true })); group.add(trail);
      return [o, 3, (u) => {
        const z = at[2] + 4 + 190 * u * u; o.position.set(at[0], at[1], z);
        tg.attributes.position.setXYZ(1, at[0], at[1], z - 5); tg.attributes.position.needsUpdate = true;
        const a = u > 0.7 ? (1 - u) / 0.3 : 1; fade(o, a); trail.material.opacity = a * 0.8; trail.visible = u > 0;
        if (u >= 1) { group.remove(trail); tg.dispose(); trail.material.dispose(); }
      }];
    },
    // a flag rises on a roof and flutters for a while: a first contribution shipped in a release
    flag({ at }) {
      const p = palette(), o = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 9, 6), lam(p.face.hi)); pole.rotation.x = Math.PI / 2; pole.position.z = 4.5; o.add(pole);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 2.6), basic(p.glow?.a ?? p.accent, { side: THREE.DoubleSide })); cloth.rotation.x = Math.PI / 2; cloth.position.set(2.3, 0, 7.6); o.add(cloth);
      o.position.set(at[0], at[1], at[2]);
      return [o, 9, (u) => { const up = Math.min(1, u / 0.12); o.scale.set(1, 1, up); cloth.rotation.z = Math.sin(u * 40) * 0.25; fade(o, u > 0.85 ? (1 - u) / 0.15 : 1); }];
    },
    // every lamp in town blinks once, together
    blink() {
      const o = new THREE.Group();
      return [o, 1.2, (u) => { const m = pulse()?.material; if (m) { m.opacity = Math.sin(u * Math.PI * 3) > 0 ? 1 : 0.15; m.size = 4 + 4 * Math.sin(u * Math.PI); } }];
    },
  };

  return {
    play(prims) { for (const p of prims) { const f = make[p.t]; if (!f) continue; const [obj, dur, step] = f(p); add(obj, dur, step, p.delay || 0); } },
    step(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const x = live[i]; x.t += dt; if (x.t < 0) continue;
        const u = Math.min(1, x.t / x.dur); x.obj.visible = true; x.step(u);
        if (u >= 1) { group.remove(x.obj); x.obj.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); live.splice(i, 1); }
      }
      return live.length > 0;
    },
    get busy() { return live.length > 0; },
  };
}
