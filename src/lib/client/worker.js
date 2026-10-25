// Draws the city off the main thread. Messages: {type:"data", data, layout, config}, {type:"build", id, az},
// and {type:"stations", id, data, layout?, az, three, ids}: a build with new data cut down to those stations' groups.
import { buildCity } from "../city/city.js";
import { stationFragments } from "../city/stations.js";

let input = null;
self.onmessage = (e) => {
  const m = e.data;
  if (m.type === "data") { input = { data: m.data, layout: m.layout, config: m.config }; return; }
  if (m.type === "stations") {
    try {
      input = { ...input, data: m.data, ...(m.layout ? { layout: m.layout } : {}) }; // a repository placed live brings the new layout
      const c = buildCity({ ...input, az: m.az, three: !!m.three, only: m.ids }); // only those stations are drawn; the model is the whole city's
      self.postMessage({ id: m.id, ok: true, city: { fragments: stationFragments(c.svg, m.ids), model: c.model } });
    } catch (err) { self.postMessage({ id: m.id, ok: false, error: String(err && err.stack || err) }); }
    return;
  }
  if (m.type === "build") {
    try {
      const c = buildCity({ ...input, az: m.az, three: !!m.three });
      self.postMessage({ id: m.id, ok: true, city: m.three ? { svg: c.svg, model: c.model } : { svg: c.svg, inner: c.inner, P: c.P, vb: c.vb, model: c.model } });
    } catch (err) {
      self.postMessage({ id: m.id, ok: false, error: String(err && err.stack || err) });
    }
  }
};
