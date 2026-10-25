// The chrome's state: what is selected and hovered, which cards are folded, the tooltip, the status line. The
// city's model is kept raw (it is large and merged in place); `rev` moves whenever it changes, and everything
// derived from it reads `rev` first.
import { toast } from "svelte-sonner";
import { lens } from "../client/model.js";

const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) ?? "null"); return v ?? d; } catch { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export class CityUI {
  model = $state.raw(null);
  rev = $state(0);
  selected = $state(null); // { kind: "station" | "person" | "day" | "team", id }
  hovered = $state(null); // the same, plus key (what is pointing: the map, a list, the strip)
  folded = $state({ crew: false, detail: false, days: false, hud: false });
  wantOverview = $state(false); // on a phone the overview shows only when asked for
  crewSort = $state("c30");
  crewTeam = $state(null);
  legend = $state(false);
  touring = $state(false);
  replaying = $state(false);
  replay = $state({ open: false, playing: false, value: 1000, label: "", speed: "WEEK / 20 S" }); // the scrubber (client/replay.js)
  tip = $state(null); // { target, x, y }
  live = $state(""); // the screen reader's line for live events
  heading = $state(72);
  narrow = $state(false);
  theme = $state("light");
  lastEvent = "";
  fresh = false; // a new plan waits for a reload (the toast with Refresh)
  onRefresh = () => {};
  L = null;

  constructor({ me = null, mode = "3d" } = {}) {
    this.me = me; this.mode = mode;
    // a first visit opens on the city alone, the side cards folded into their buttons; after that the viewer's own folds
    const f = load("ow-folded", null); this.foldsKept = !!f;
    if (f) { for (const k of Object.keys(this.folded)) if (k in f) this.folded[k] = !!f[k]; }
    else if (!load("ow-last-visit", null)) { this.folded.crew = true; this.folded.detail = true; }
    const s = load("ow-crew-sort", "c30"); if (["c30", "c7", "name"].includes(s)) this.crewSort = s;
  }
  setModel(M) { this.model = M; this.L = lens(M); this.rev++; }
  changed() { this.rev++; } // the model was merged in place
  fold(name, on) {
    this.folded[name] = on; if (name === "detail" && on) this.wantOverview = false;
    keep("ow-folded", $state.snapshot(this.folded));
  }
  sort(by) { this.crewSort = by; keep("ow-crew-sort", by); }
  // the status line, as toasts (shadcn-svelte's Sonner): drawing, an error, new data (with Refresh), a notice
  say(text, cls = "") {
    if (!text) return void toast.dismiss("status");
    if (cls === "ow-fresh") { this.fresh = true; return void toast(text.replace(/ · refresh$/, ""), { id: "status", duration: Infinity, action: { label: "Refresh", onClick: () => this.onRefresh() } }); }
    if (cls === "ow-error") return void toast.error(text, { id: "status", duration: Infinity });
    if (text.endsWith("…")) return void toast.loading(text, { id: "status" });
    toast(text, { id: "status" });
  }
  sayFor(text, ms) { if (!this.fresh) toast(text, { duration: ms }); }
  announce(t) { this.live = t; }
}
