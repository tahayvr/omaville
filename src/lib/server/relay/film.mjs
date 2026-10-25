// The year film's frames: one sweep of the log (the commits the scans and the backfill saw, one per sha, bots left
// out as in the snapshot's totals, and the
// merges and releases) into monthly frames. Each frame is the end of a month: every repository's and contributor's
// commits logged up to then, the month's and the last week's commits per repository, the 30 daily totals before
// it, and the month's releases, merges and first commits of new repositories. The page rewinds today's city by
// what the log says came later (heights end exactly on today's), so a frame never invents a count.
const DAY = 86400;
export function filmFrames(events, { from, to, frames = 12 }) {
  const ts = Array.from({ length: frames }, (_, k) => Math.round(from + ((k + 1) * (to - from)) / frames));
  const cum = {}, people = {}, born = {}, out = [];
  const commits = events.filter((e) => e.kind === "commit.seen").sort((a, b) => a.time - b.time);
  const other = events.filter((e) => e.kind === "release" || e.kind === "pr.merge").sort((a, b) => a.time - b.time);
  let i = 0, j = 0;
  for (const [k, t] of ts.entries()) {
    const t0 = k ? ts[k - 1] : from, month = {}, week = {}, days = Array(30).fill(0), releases = [], newRepos = [];
    let merges = 0;
    for (; i < commits.length && commits[i].time <= t; i++) {
      const e = commits[i];
      if (!(e.repo in born)) { born[e.repo] = e.time; if (e.time > t0) newRepos.push([e.time, e.repo]); }
      if (e.bot) continue; // bot and routine commits build nothing (as in the snapshot's totals)
      cum[e.repo] = (cum[e.repo] ?? 0) + 1;
      if (e.actor) people[e.actor] = (people[e.actor] ?? 0) + 1;
    }
    // the windows that end at t: a second, short pass over the tail (cheap: at most a month of commits)
    for (let b = i - 1; b >= 0 && commits[b].time > t - 30 * DAY; b--) {
      const e = commits[b]; if (e.bot) continue;
      month[e.repo] = (month[e.repo] ?? 0) + 1;
      if (e.time > t - 7 * DAY) week[e.repo] = (week[e.repo] ?? 0) + 1;
      days[29 - Math.min(29, Math.floor((t - e.time) / DAY))]++;
    }
    for (; j < other.length && other[j].time <= t; j++) {
      const e = other[j]; if (e.time <= t0) continue;
      if (e.kind === "release") releases.push([e.time, e.repo, e.ref ?? ""]); else merges++;
    }
    out.push({ t, repos: { ...cum }, people: { ...people }, month, week, days, releases, newRepos, merges });
  }
  // what the log holds up to now, for the rewind
  for (; i < commits.length; i++) { const e = commits[i]; if (e.bot) continue; cum[e.repo] = (cum[e.repo] ?? 0) + 1; if (e.actor) people[e.actor] = (people[e.actor] ?? 0) + 1; }
  return { from, to, frames: out, now: { repos: cum, people } };
}
