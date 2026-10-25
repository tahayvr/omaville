// Live: the page's end of the event stream. Opens the relay's Server-Sent Events stream, turns each city event
// into effects (city/effects.js) and hands them to the view. Rate-limited: a burst on one repository is one effect
// (a push of 40 commits is one drone with its crates), a few play at once, the rest wait or are dropped. While the
// tab is hidden nothing plays; on return the city says what happened ("while you were away: 3 merges, 1 release").
// An event that changed signals carries a delta; onDelta folds it into the page's data and redraws those stations.
// The stream's address: the app's /events (or /members/events); ?live= overrides it. A `snapshot` message (a new
// scan) calls onSnapshot, and the page redraws in place what changed.
import { primitivesFor } from "../city/effects.js";

const NOUN = { commit: ["push", "pushes"], "pr.merge": ["merge", "merges"], "pr.open": ["pull request", "pull requests"], release: ["release", "releases"], "ci.fail": ["failed build", "failed builds"], "issue.open": ["issue", "issues"], "repo.new": ["new repository", "new repositories"] };

export function startLive({ url = null, config = {}, model, modelOf = () => model, play, onDelta = () => {}, onSnapshot = () => {}, generatedAt = () => null, say = () => {}, announce = () => {} }) {
  url = new URLSearchParams(location.search).get("live") ?? url;
  if (!url || typeof EventSource === "undefined") return null;
  const queue = [], MAX_QUEUE = 40, AT_ONCE = 4, GAP = 450; // ms between two effects starting
  let playing = 0, lastStart = 0, away = {}, awayN = 0, timer = 0;
  // the stream: reopened after a close the browser gives up on (a 401 once the session is gone, an error page), with a
  // growing wait; a plain drop is the browser's own retry (the relay sends retry: and id:, so it catches up)
  let es = null, closed = false, wait = 3000;
  const handlers = [], on = (name, f) => handlers.push([name, f]);
  function open() {
    es = new EventSource(url);
    for (const [name, f] of handlers) es.addEventListener(name, f);
    es.addEventListener("open", () => { wait = 3000; });
    es.addEventListener("error", () => { if (closed || es.readyState !== 2) return; setTimeout(() => { if (!closed) open(); }, wait); wait = Math.min(60000, wait * 2); });
  }
  on("snapshot", () => onSnapshot()); // the relay finished a scan with something new
  on("resync", () => onSnapshot()); // the catch-up was cut short: the city is fetched afresh instead
  on("hello", (m) => { let h; try { h = JSON.parse(m.data); } catch { return; } if (h.generatedAt && generatedAt() && h.generatedAt !== generatedAt()) onSnapshot(); }); // a scan landed while the page was away
  on("city", (m) => {
    let e; try { e = JSON.parse(m.data); } catch { return; }
    if (e.delta) onDelta(e.delta); // the fact: the stations it changed are redrawn in place, hidden tab or not
    if (document.hidden) { away[e.kind] = (away[e.kind] || 0) + 1; awayN++; return; }
    // a burst on one repository is one effect: fold into the queued one of the same kind
    const same = queue.find((q) => q.kind === e.kind && q.repo === e.repo);
    if (same) { same.n = (same.n || 0) + (e.n || 0); same.bots = (same.bots || 0) + (e.bots || 0); return; }
    queue.push(e); if (queue.length > MAX_QUEUE) queue.shift();
    pump();
  });
  function pump() {
    clearTimeout(timer);
    if (!queue.length || document.hidden) return;
    const wait = GAP - (performance.now() - lastStart);
    if (playing >= AT_ONCE || wait > 0) { timer = setTimeout(pump, Math.max(60, wait)); return; }
    const e = queue.shift(), prims = primitivesFor(e, modelOf()); // the view's model now: new houses and stations included
    lastStart = performance.now(); playing++;
    setTimeout(() => { playing--; pump(); }, 2600);
    if (prims.length) play(prims, e);
    if (e.summary) announce(e.summary);
    if (queue.length) timer = setTimeout(pump, GAP);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !awayN) return;
    const parts = Object.entries(away).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${n} ${(NOUN[k] ?? [k, k])[n === 1 ? 0 : 1]}`);
    say(`While you were away: ${parts.join(", ")}`, 7000);
    away = {}; awayN = 0;
  });
  open();
  return { close: () => { closed = true; es.close(); }, state: () => es.readyState }; // 0 connecting, 1 open, 2 closed
}
