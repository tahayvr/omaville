// The city as it stood at a moment of its window: a snapshot rewound to time t from its own per-day series, so
// replay needs nothing the snapshot does not carry. What it can rewind: commits (lifetime, 30-day, 7-day, the days,
// the latest subjects), the org's days, and the clock (now, so buildings under construction stand as they did).
// What it cannot (no history in a snapshot): open pull requests, branch work and contributors stay as they are now;
// the scrubber says so. Pure: runs in the page and in Node.
const DAY = 86400;

export function dataAt(data, t) {
  const W = data.days?.length ?? 30, from = data.window?.from ?? data.days?.[0]?.at ?? data.now - (W - 1) * DAY;
  const i = Math.max(-1, Math.min(W - 1, Math.floor((t - from) / DAY))); // the day t falls in (-1: before the window)
  const start = from + i * DAY, span = Math.max(1, Math.min(DAY, data.now - start)); // today has only happened up to now
  const frac = i >= 0 && i < W ? Math.min(1, Math.max(0, (t - start) / span)) : 1; // how much of that day had happened by t
  const cut = (days) => days.map((n, k) => (k < i ? n : k === i ? Math.round(n * frac) : 0));
  const repos = {};
  for (const [name, r] of Object.entries(data.repos)) {
    const days = r.days ? cut(r.days) : null, after = r.days ? r.days.reduce((s, n, k) => s + n - (days[k] ?? 0), 0) : 0;
    repos[name] = {
      ...r, ...(days ? { days } : {}),
      total: Math.max(0, (r.total ?? 0) - after),
      c30: days ? days.reduce((s, n) => s + n, 0) : r.c30,
      c7: days ? days.slice(Math.max(0, i - 6), i + 1).reduce((s, n) => s + n, 0) : r.c7,
      latest: (r.latest ?? []).filter(([at]) => at <= t),
      last: Math.min(r.last ?? 0, t),
      ...(r.at7 ? { at7: undefined } : {}), // belts fall back to the day series
    };
  }
  const days = (data.days ?? []).map((d, k) => ({ ...d, n: k < i ? d.n : k === i ? Math.round(d.n * frac) : 0 }));
  return { ...data, now: Math.min(t, data.now), repos, days, replay: { at: t } };
}

// the stations whose drawing differs between two moments (for in-place patches while scrubbing)
export function changedBetween(a, b) {
  const repos = Object.keys(b.repos).filter((n) => { const x = a.repos[n], y = b.repos[n]; return !x || x.total !== y.total || x.c7 !== y.c7 || x.c30 !== y.c30; });
  const days = b.days.map((d, k) => (d.n !== a.days[k]?.n ? k : -1)).filter((k) => k >= 0);
  return { repos, days };
}
