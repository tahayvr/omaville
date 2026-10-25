// Draws the city off the main thread. Messages: {type:"data", data, layout, config}, and {type:"three", id, data?,
// layout?, ids?}: the city's two 3D records (azimuths 72 and 252), cut down to those stations when ids are given, and
// prepared into geometry (view/scene3d.js prepare()), so the page only has to put the arrays in place.
import { buildCity } from "../city/city.js";
import { stationFragments } from "../city/stations.js";
import { prepare, transfers } from "../view/scene3d.js";

let input = null;
// shared with the page's fallback (client/runtime.js) when there is no worker
export function three(input, ids = null) {
  const only = ids ?? undefined;
  const a = buildCity({ ...input, az: 72, three: true, only }), b = buildCity({ ...input, az: 252, three: true, only }); // only those stations are drawn; the model is the whole city's
  let recA = a.svg, recB = b.svg, drawn = null;
  if (ids) {
    const fa = stationFragments(a.svg, ids), fb = stationFragments(b.svg, ids), join = (f) => Object.values(f).flat().join("");
    drawn = Object.keys(fa); recA = join(fa); recB = join(fb);
  }
  return { model: a.model, prep: prepare(recA, recB), ids: drawn };
}
if (typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope) self.onmessage = (e) => {
  const m = e.data;
  if (m.type === "data") { input = { data: m.data, layout: m.layout, config: m.config }; return; }
  if (m.type === "three") {
    try {
      if (m.data) input = { ...input, data: m.data, ...(m.layout ? { layout: m.layout } : {}) }; // a repository placed live brings the new layout
      const city = three(input, m.ids ?? null);
      self.postMessage({ id: m.id, ok: true, city }, transfers(city.prep));
    } catch (err) { self.postMessage({ id: m.id, ok: false, error: String(err && err.stack || err) }); }
  }
};
