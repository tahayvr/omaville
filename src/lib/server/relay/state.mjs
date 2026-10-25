// The state object's fold: the latest snapshot (data.json, the collector's scan) is the base, and every event in
// the log that is newer than the snapshot is folded onto it, so the city is current between snapshots. Newer means
// past the base's log watermark (snapshot.seq: the log's top sequence number when its scan began), so a push whose
// commit was authored hours before it landed still counts; a base without a watermark (a posted snapshot, an old
// checkpoint) falls back to the event's time against the snapshot's `now`. Each fold
// returns a delta, the signals that changed per repository, which the stream carries to open pages; they rebuild
// those stations in place. A new snapshot replaces the base and the newer events are folded again, so the scan
// and the stream can never disagree for long (law 4: an effect, then a fact).
//
// What an event changes (the rest waits for the next snapshot):
//   commit      total, c30, c7 and the day's count (by people, bots apart), last, latest subjects, at7, the org's day
//   branch      unmerged
//   pr.open     pr + 1          pr.merge, pr.close   pr − 1
//   repo.new    a new repository, placed by the layout engine (layout/engine.mjs, the same rules the scan runs), so
//               it gets its lot or district slot live; the delta carries the new layout and where it landed
import { layoutCity } from "../engine.mjs";
import { foldWard } from "./basecamp.mjs";
const DAY = 86400;

// includePrivate: the members' state (private repositories and their events count); layoutSource: where a new
// repository's place comes from (the public state takes it from the members' master layout, so both agree)
export function createState(log, { config = {}, includePrivate = false, layoutSource = null } = {}) {
  let base = null, cur = null, layout = null;
  const clone = (x) => (typeof structuredClone === "function" ? structuredClone(x) : JSON.parse(JSON.stringify(x)));

  function place(e) { // repo.new: the repository exists from now on, and the layout gives it a place
    if (!layout || (e.private && !includePrivate) || cur.repos[e.repo]) return null;
    const W = cur.days?.length ?? 30;
    const rec = { desc: e.desc ?? "", lang: e.lang ?? "", flag: e.flag ?? "", created: e.time, total: 0, c30: 0, c7: 0, unmerged: 0, people: 0, people7: 0, top: [], pr: 0, last: e.time, latest: [], days: Array(W).fill(0) };
    cur.repos[e.repo] = rec;
    if (e.private) rec.private = true;
    const next = layoutSource ? layoutSource() : layoutCity({ ...cur, now: e.time }, config, layout);
    if (!next || !Object.values(next.lots ?? {}).includes(e.repo) && !Object.values(next.districts ?? {}).flat().includes(e.repo) && !next.landmarks?.[e.repo]) { delete cur.repos[e.repo]; return null; }
    const lot = Object.entries(next.lots).find(([, n]) => n === e.repo)?.[0];
    const slot = Object.entries(next.districts).flatMap(([d, list]) => list.map((n, i) => [d, i, n])).find(([, , n]) => n === e.repo);
    const where = lot ?? (slot ? `${slot[0]}:${slot[1]}` : null);
    layout = next;
    return { repos: { [e.repo]: rec }, layout: next, placed: { repo: e.repo, at: where, landmark: !!next.landmarks[e.repo] } };
  }
  // a push to a public repository: its authors' houses grow (lifetime commits), and an author with no house gets
  // one, placed by the layout engine (contributor.new), built over its first day
  const bot = new RegExp(config.bots ?? "\\[bot\\]$", "i");
  function people(e) {
    const known = new Map(cur.contributors.map((c) => [c.login, c])), grown = {}, added = [];
    for (const [login, k] of e.authors) {
      if (bot.test(login)) continue;
      let c = known.get(login);
      if (!c) { c = { login, total: 0, repos: [] }; cur.contributors.push(c); known.set(login, c); added.push(login); }
      c.total += k;
      const rr = c.repos.find((x) => x[0] === e.repo); if (rr) rr[1] += k; else c.repos.push([e.repo, k]);
      c.repos.sort((a, b) => b[1] - a[1]);
      grown[login] = { total: c.total, repos: c.repos.slice(0, 8) };
    }
    const out = Object.keys(grown).length ? { contributors: grown } : {};
    if (added.length && layout) {
      const next = layoutSource ? layoutSource() : layoutCity({ ...cur, now: e.time }, config, layout);
      layout = next;
      const houses = added.map((login) => ({ login, at: next.houses?.[login]?.split(":")[0] })).filter((h) => h.at);
      if (houses.length) Object.assign(out, { layout: next, houses });
    }
    return out;
  }
  // newer than the base: past its log watermark when it has one, else past its clock (an event without a sequence number, never from the log, counts as new)
  const fresh = (e) => (Number.isFinite(cur?.seq) ? (e.seq ?? Infinity) > cur.seq : e.time > cur.now);
  function fold(e) {
    if (cur && e.kind === "repo.new" && fresh(e)) return place(e);
    if (e.private && !includePrivate) return null;
    if (e.ward != null) { const w = cur?.wards?.[e.ward]; return w && w.name && fresh(e) ? { wards: { [e.ward]: foldWard(w, e) } } : null; } // Basecamp: the members' city only
    if (!cur || !e.repo || !cur.repos[e.repo] || !fresh(e)) return null; // a repository the layout has not placed yet waits for the snapshot
    const r = cur.repos[e.repo], patch = {}, days = {};
    if (e.kind === "commit" && (e.n || 0) > 0) {
      const n = e.n, from = cur.window?.from ?? cur.days?.[0]?.at ?? cur.now - 29 * DAY, W = cur.days?.length ?? 30;
      const i = Math.min(W - 1, Math.max(0, Math.floor((e.time - from) / DAY))); // a commit after midnight counts on the last day until the next snapshot moves the window
      r.total = (r.total || 0) + n; r.c30 = (r.c30 || 0) + n; r.c7 = (r.c7 || 0) + n;
      if (r.days) { r.days[i] = (r.days[i] || 0) + n; patch.days = r.days; }
      if (cur.days?.[i]) { cur.days[i].n += n; days[i] = cur.days[i].n; }
      r.last = Math.max(r.last || 0, e.time);
      r.latest = [[e.time, e.actor, e.title ?? ""], ...(r.latest ?? [])].slice(0, 5);
      const weekStart = from + (W - 7) * DAY, pos = Math.round(Math.min(1, Math.max(0, (e.time - weekStart) / (7 * DAY))) * 1000) / 1000;
      r.at7 = [...(r.at7 ?? []), ...Array(n).fill(pos)].sort((a, b) => a - b);
      Object.assign(patch, { total: r.total, c30: r.c30, c7: r.c7, last: r.last, latest: r.latest, at7: r.at7 });
    } else if (e.kind === "branch" && (e.n || 0) > 0) { r.unmerged = (r.unmerged || 0) + e.n; patch.unmerged = r.unmerged; }
    else if (e.kind === "pr.open") { r.pr = (r.pr || 0) + 1; patch.pr = r.pr; }
    else if (e.kind === "pr.merge" || e.kind === "pr.close") { r.pr = Math.max(0, (r.pr || 0) - 1); patch.pr = r.pr; }
    else return null;
    const delta = { repos: { [e.repo]: patch }, ...(Object.keys(days).length ? { days } : {}) };
    if (e.kind === "commit" && !e.private && e.authors?.length && cur.contributors) Object.assign(delta, people(e));
    return delta;
  }

  return {
    // a new snapshot: the base, with every logged event newer than it folded on again
    // until: fold only up to that moment (the city at a past time: a checkpoint and the events after it)
    // In two steps: prepare reads the newer events from the database; commit swaps the base and folds them, at once
    // and without waiting, so two states commit together and nothing lands between a read and a swap (the relay
    // runs its folds one at a time). setBase is both.
    async prepare(snapshot, baseLayout = layout, { until = 2 ** 31 - 1 } = {}) {
      const later = Number.isFinite(snapshot.seq) // past the watermark (and, for the city at a past moment, no later than it), else past the clock
        ? (await log.since(snapshot.seq, { limit: 100000, publicOnly: !includePrivate })).filter((e) => e.time <= until)
        : await log.between((snapshot.now | 0) + 1, Math.min(until + 1, 2 ** 31 - 1), { limit: 100000, publicOnly: !includePrivate }); // the log takes 32-bit times
      return { commit() { base = snapshot; cur = clone(snapshot); layout = baseLayout ? clone(baseLayout) : null; for (const e of later) fold(e); return { now: base.now, generatedAt: base.generatedAt }; } };
    },
    async setBase(...a) { return (await this.prepare(...a)).commit(); },
    fold,
    current: () => cur,
    layout: () => layout,
    base: () => (base ? { now: base.now, generatedAt: base.generatedAt, digest: base.digest } : null),
  };
}

// merge a delta into a data.json-shaped object in place (the page does the same with what the stream sends)
export function applyDelta(data, delta) {
  for (const [name, patch] of Object.entries(delta.repos ?? {})) if (data.repos[name]) Object.assign(data.repos[name], patch);
  for (const [i, n] of Object.entries(delta.days ?? {})) if (data.days?.[i]) data.days[i].n = n;
  for (const [id, w] of Object.entries(delta.wards ?? {})) if (data.wards) data.wards[id] = w;
  if (delta.placed) data.repos[delta.placed.repo] ??= delta.repos[delta.placed.repo];
  return Object.keys(delta.repos ?? {});
}
