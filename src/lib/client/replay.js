// The scrubber: drag through the last 30 days, or press play and watch them pass (a week in 20 seconds). The
// city rewinds to each moment (city/history.js) and redraws in place the stations that changed; in 3D the sun moves
// with the clock; with a relay, the logged events of that span play as effects as the clock passes them. Leaving
// the scrubber puts the city back to now. Shared by both views; client/runtime.js wires it.
import { dataAt, changedBetween } from "../city/history.js";
import { primitivesFor } from "../city/effects.js";

const DAY = 86400;
const fmt = (t, tz) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(t * 1000)).toUpperCase();

// onChange({ open, playing, value, label, speed }): the scrubber's state for the page's card (ui/Replay.svelte);
// value runs 0 to 1000 across the window
export function createReplay({ getData, patch, setClock = () => {}, fx = () => {}, modelOf = () => ({}), eventsBetween = null, stationsFor, timeZone = "UTC", onState = () => {}, onChange = () => {} }) {
  let open = false, playing = false, at = 0, shown = null, events = [], evIdx = 0, raf = 0, last = 0, busy = false, want = null;
  const speeds = [["WEEK / 20 S", (7 * DAY) / 20], ["MONTH / 20 S", (30 * DAY) / 20], ["DAY / 20 S", DAY / 20]];
  let speed = 0, label = "";
  const span = () => { const d = getData(), from = d.window?.from ?? d.days?.[0]?.at ?? d.now - 29 * DAY; return [from, d.now]; };
  const toT = (v) => { const [a, b] = span(); return a + (b - a) * (v / 1000); };
  const toV = (t) => { const [a, b] = span(); return Math.round(((t - a) / (b - a)) * 1000); };
  const tell = () => onChange({ open, playing, value: toV(at), label, speed: speeds[speed][0] });

  // one redraw at a time, at most four a second (a station that changes in consecutive moments is drawn once); while
  // one runs or waits, only the latest wanted moment is kept. The clock and the label follow every frame.
  const GAP = 250;
  let drawnAt = 0;
  async function show(t) {
    want = t; label = fmt(t, timeZone); tell(); setClock(new Date(t * 1000));
    if (busy) return;
    busy = true;
    while (want !== null) {
      const wait = drawnAt + GAP - performance.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (want === null) break; // stopped while waiting
      const target = want; want = null;
      const next = dataAt(getData(), target), prev = shown ?? getData(), ch = changedBetween(prev, next);
      shown = next; drawnAt = performance.now();
      if (ch.repos.length || ch.days.length) await patch(next, stationsFor(ch.repos, ch.days));
    }
    busy = false;
  }
  function frame(now) {
    const dt = last ? (now - last) / 1000 : 0; last = now;
    const [, end] = span(), prevAt = at;
    at = Math.min(end, at + dt * speeds[speed][1]);
    // the logged events this stretch of the clock passed play as effects, a few at a time
    let played = 0;
    while (evIdx < events.length && events[evIdx].time <= at) { const e = events[evIdx++]; if (e.time > prevAt && played < 3) { fx(primitivesFor(e, modelOf())); played++; } }
    show(at);
    if (at >= end) return pause();
    raf = requestAnimationFrame(frame);
  }
  function play() { if (!open) start(); playing = true; last = 0; if (at >= span()[1] - 60) { at = span()[0]; evIdx = 0; } evIdx = events.findIndex((e) => e.time > at); if (evIdx < 0) evIdx = events.length; tell(); raf = requestAnimationFrame(frame); }
  function pause() { playing = false; cancelAnimationFrame(raf); tell(); }
  async function start() {
    open = true; at = span()[1]; label = fmt(at, timeZone); onState(true); tell(); // the page shows the card in the days card's place
    if (eventsBetween) try { events = (await eventsBetween(span()[0], span()[1])).filter((e) => e.kind !== "commit.seen").sort((a, b) => a.time - b.time); } catch { events = []; }
  }
  async function stop() {
    pause(); open = false; tell();
    want = null; while (busy) await new Promise((r) => setTimeout(r, 50));
    const now = getData(), ch = shown ? changedBetween(shown, now) : { repos: [], days: [] };
    shown = null; setClock(null); onState(false);
    if (ch.repos.length || ch.days.length) await patch(now, stationsFor(ch.repos, ch.days));
  }
  addEventListener("keydown", (e) => {
    if (e.target.closest?.("input:not([type=range]), textarea")) return;
    if (e.key === "r" || e.key === "R") { e.preventDefault(); open ? stop() : start(); }
    else if (open && e.key === "Escape") stop();
    else if (open && e.key === " ") { e.preventDefault(); playing ? pause() : play(); }
  });
  return {
    start, stop, play, pause, get open() { return open; },
    toggle: () => (open ? stop() : start()),
    seek(v) { if (!open) start(); pause(); at = toT(v); show(at); }, // v: 0 to 1000 across the window
    nextSpeed() { speed = (speed + 1) % speeds.length; tell(); },
  };
}
