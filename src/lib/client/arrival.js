// The arrival: a first visit (or ?arrive) opens on bare ground and the city builds itself in about three seconds,
// in the order the foundation was built: the scenery and the mark first, then every repository by the date it was
// born (layout.born), then the contributors' quarter filling, ring by ring. A returning visitor gets one line
// instead: what happened since they were last here, from the relay's log when there is one, else from the days.
const DAY = 86400;

// the order things rise in: [station id, delay 0..1]
export function arrivalOrder(layout, data) {
  const born = layout.born ?? {}, repos = Object.keys(data.repos).sort((a, b) => (born[a] ?? 0) - (born[b] ?? 0) || a.localeCompare(b));
  const out = new Map();
  repos.forEach((id, i) => out.set(id, 0.2 + 0.45 * (i / Math.max(1, repos.length - 1))));
  const houses = Object.entries(layout.houses ?? {}).map(([login, w]) => { const [cell, s] = w.split(":"), [i, j] = cell.split(",").map(Number); return [login, Math.max(Math.abs(i - 7), Math.abs(j - 7)) * 100 + (+s)]; }).sort((a, b) => a[1] - b[1]);
  houses.forEach(([login], k) => out.set("person:" + login, 0.55 + 0.4 * (k / Math.max(1, houses.length - 1))));
  return out;
}

export async function catchUp({ data, last, eventsBetween = null }) {
  if (!last || data.now - last < 3600) return "";
  let commits = 0, merges = 0, releases = 0, repos = 0;
  if (eventsBetween) {
    try { for (const e of await eventsBetween(last, data.now + 60)) { if (e.kind === "commit") commits += e.n || 0; else if (e.kind === "pr.merge") merges++; else if (e.kind === "release") releases++; else if (e.kind === "repo.new") repos++; } } catch {}
  }
  { // the day series too (days that ended after the last visit): the log only knows what happened while the relay ran
    const from = data.window?.from ?? data.days?.[0]?.at ?? data.now - 29 * DAY;
    let fromDays = 0; data.days?.forEach((d, i) => { if (from + (i + 1) * DAY > last) fromDays += d.n; });
    commits = Math.max(commits, fromDays);
  }
  const span = data.now - last < 2 * DAY ? "yesterday" : data.now - last < 8 * DAY ? "your last visit" : "you were last here";
  const parts = [commits && `${commits.toLocaleString("en-US")} commit${commits === 1 ? "" : "s"}`, merges && `${merges} merge${merges === 1 ? "" : "s"}`, releases && `${releases} release${releases === 1 ? "" : "s"}`, repos && `${repos} new repositor${repos === 1 ? "y" : "ies"}`].filter(Boolean);
  return parts.length ? `Since ${span}: ${parts.join(", ")}` : "";
}
