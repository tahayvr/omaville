// The board: the org's work as a diagram, beside the city. People on the left, the repositories that had work in
// the span on the right (busiest first, each with what shipped, merged and waits in review), and one string per
// person and repository between them. Pure: the snapshot's `work` (collector/aggregate.mjs) goes in, positions,
// paths and lists come out; ui/Board.svelte draws them. Same data, same board: nothing here is random, and a
// person's colour is seeded by their name, so it never moves when the ranking does.

export const COL = { people: 40, peopleW: 230, repos: 520, reposW: 520, wards: 1100, wardsW: 300, top: 24, pad: 40 };
const PERSON_H = 48, WARD_H = 150, TOP_PEOPLE = 15;
const TIER = [{ rows: 3, h: 118, gap: 8 }, { rows: 2, h: 100, gap: 8 }, { rows: 0, h: 34, gap: 0 }]; // the first 4, the next 6, the rest

const f = (v) => Math.round(v * 10) / 10;
// a string: a ribbon of thickness t from (x0, y0) to (x1, y1)
const ribbon = (x0, y0, x1, y1, t) => {
  const m = (x0 + x1) / 2, a = t / 2;
  return `M${x0} ${f(y0 - a)}C${m} ${f(y0 - a)} ${m} ${f(y1 - a)} ${x1} ${f(y1 - a)}L${x1} ${f(y1 + a)}C${m} ${f(y1 + a)} ${m} ${f(y0 + a)} ${x0} ${f(y0 + a)}Z`;
};
// n ports spread about a centre, at most `max` either side
const spread = (n, max, step) => { const s = Math.min(max, (step * (n - 1)) / 2); return (i) => (n < 2 ? 0 : -s + (2 * s * i) / (n - 1)); };
export const width = (k) => Math.max(1.5, Math.min(14, Math.sqrt(k) * 0.85)); // a string's width: the square root of its commits
// a person's hue, green to red, from their name alone
export function hueOf(name) { let h = 2166136261; for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 136; }
export const initials = (n) => { const w = n.split(/[\s._-]+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[1][0] : n.slice(0, 2)).toUpperCase(); };
// how busy a repository was: its commits, two for each merged pull request, three for each release
export const busy = (r) => r.c + 2 * r.m + 3 * r.rl;

// what a repository says about itself: releases, merged pull requests, the ones in review
export function itemsOf(r) {
  return {
    R: r.R.map(([tag, at]) => ({ k: "r", tag, text: `Released ${tag}`, at })),
    M: r.M.map(([n, t, who, at]) => ({ k: "m", n, text: t, who, at })),
    O: r.O.map(([n, t, who, at]) => ({ k: "o", n, text: t, who, at })),
  };
}
// a card's few lines: a release first, a pull request in review last, merged ones between
function choose(r, rows) {
  const it = itemsOf(r), out = [], last = rows > 1 && it.O[0] ? it.O[0] : null, fill = it.M.slice();
  if (it.R[0]) out.push(it.R[0]);
  while (out.length < rows - (last ? 1 : 0) && fill.length) out.push(fill.shift());
  if (last) out.push(last);
  return out;
}

export function buildBoard(data, { span = "week" } = {}) {
  const w = data?.work?.[span];
  if (!w) return null;
  // ---- the repositories, busiest first ----
  const names = Object.keys(w.repos).sort((a, b) => busy(w.repos[b]) - busy(w.repos[a]) || a.localeCompare(b));
  let y = COL.top;
  const repos = names.map((n, i) => {
    const r = w.repos[n], tier = i < 4 ? 0 : i < 10 ? 1 : 2, T = TIER[tier], top = y;
    y += T.h + T.gap;
    const one = choose(r, 1)[0];
    return { key: `r:${n}`, name: n, tier, top, h: T.h, cy: top + T.h / 2, c: r.c, p: r.p, m: r.m, o: r.o, rl: r.rl, d: r.d,
      isNew: (data.repos?.[n]?.created ?? 0) >= w.from, isPrivate: !!data.repos?.[n]?.private,
      items: T.rows ? choose(r, T.rows) : [], inline: T.rows ? null : one ?? null };
  });
  const yEnd = Math.max(y, COL.top + (TOP_PEOPLE + 1) * (PERSON_H + 8));
  const repoAt = Object.fromEntries(repos.map((r) => [r.name, r]));

  // ---- the people: the ones with the most commits, then everyone else as one row ----
  const committers = w.list.filter((p) => p.c > 0), shown = committers.slice(0, TOP_PEOPLE), rest = committers.slice(TOP_PEOPLE);
  const rows = shown.map((p) => ({ key: `p:${p.n}`, name: p.n, initial: initials(p.n), hue: hueOf(p.n), c: p.c, m: p.m, o: p.o, d: p.d, r: p.r }));
  if (rest.length) {
    const sum = new Map();
    for (const p of rest) for (const [r, k] of p.r) sum.set(r, (sum.get(r) || 0) + k);
    rows.push({ key: "p:+", name: `${rest.length} more ${rest.length === 1 ? "person" : "people"}`, initial: "+", hue: 190, tail: true, c: rest.reduce((s, p) => s + p.c, 0), m: rest.reduce((s, p) => s + p.m, 0), o: 0, d: null, r: [...sum].sort((a, b) => b[1] - a[1]) });
  }
  const pitch = rows.length ? (yEnd - COL.top) / rows.length : 0;
  rows.forEach((p, i) => { p.top = Math.round(COL.top + i * pitch + (pitch - PERSON_H) / 2); p.cy = p.top + PERSON_H / 2; });

  // ---- the strings, with a port at each end ----
  const links = [];
  for (const p of rows) for (const [r, k] of p.r) if (repoAt[r]) links.push({ p: p.key, r: `r:${r}`, k, hue: p.hue, py: p.cy, ry: repoAt[r].cy, rh: repoAt[r].h });
  for (const p of rows) {
    const mine = links.filter((l) => l.p === p.key).sort((a, b) => a.ry - b.ry), at = spread(mine.length, 18, 5);
    mine.forEach((l, i) => { l.y0 = p.cy + at(i); });
  }
  for (const r of repos) {
    const mine = links.filter((l) => l.r === r.key).sort((a, b) => a.py - b.py), at = spread(mine.length, r.h / 2 - 8, 4);
    mine.forEach((l, i) => { l.y1 = r.cy + at(i); });
  }
  const x0 = COL.people + COL.peopleW, x1 = COL.repos;
  for (const l of links) l.d = ribbon(x0, l.y0, x1, l.y1, width(l.k));

  // ---- the members' city: the Basecamp projects, each near the repositories it steers ----
  const wards = [], wardLinks = [];
  const named = Object.entries(data.wards ?? {}).filter(([, v]) => v.name && !v.archived);
  if (named.length) {
    const want = named.map(([id, v]) => {
      const on = (v.repos ?? []).filter((r) => repoAt[r]), ys = on.map((r) => repoAt[r].cy);
      return { id, v, on, t: ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length - WARD_H / 2 : Infinity };
    }).sort((a, b) => a.t - b.t || a.v.name.localeCompare(b.v.name));
    let wy = COL.top;
    for (const { id, v, on, t } of want) {
      const top = Math.round(Math.max(wy, Number.isFinite(t) ? t : wy)); wy = top + WARD_H + 16;
      const total = (v.done ?? 0) + (v.open ?? 0);
      wards.push({ key: `w:${id}`, name: v.name, top, h: WARD_H, repos: on.map((r) => `r:${r}`), hill: v.hill ?? [], done: v.done ?? 0, total, pct: total ? Math.round(((v.done ?? 0) / total) * 100) : 0, building: v.building ?? 0, events: v.events7 ?? 0, people: v.people ?? 0 });
      const at = spread(on.length, 40, 24);
      on.slice().sort((a, b) => repoAt[a].cy - repoAt[b].cy).forEach((r, i) => wardLinks.push({ w: `w:${id}`, r: `r:${r}`, d: ribbon(COL.repos + COL.reposW, repoAt[r].cy, COL.wards, top + WARD_H / 2 + at(i), 1.5) }));
    }
    y = Math.max(y, wy);
  }

  // ---- the digest: what shipped, the newest merge and the newest review of each repository, what is new ----
  const newest = (key, n) => repos.filter((r) => w.repos[r.name][key][0]).sort((a, b) => w.repos[b.name][key][0][3] - w.repos[a.name][key][0][3]).slice(0, n).map((r) => { const [num, text, who, at] = w.repos[r.name][key][0]; return { k: key === "M" ? "m" : "o", n: num, text, who, at, repo: r.name }; });
  const shipped = repos.filter((r) => r.rl).sort((a, b) => w.repos[b.name].R[0][1] - w.repos[a.name].R[0][1]).map((r) => { const x = w.repos[r.name]; return { k: "r", repo: r.name, tag: x.R[0][0], text: `${r.name} ${x.R[0][0]}`, from: x.r0 ?? null, count: x.rl, at: x.R[0][1] }; });
  const digest = { shipped, merged: newest("M", 5), review: newest("O", 5), fresh: repos.filter((r) => r.isNew).map((r) => r.name), busiest: repos.slice().sort((a, b) => b.o - a.o)[0] ?? null };

  return {
    span, days: w.days, from: w.from, now: data.now,
    W: wards.length ? COL.wards + COL.wardsW + COL.pad : COL.repos + COL.reposW + COL.pad, H: Math.max(yEnd, y) + COL.top,
    totals: { commits: w.commits, people: w.people, merged: w.merged, routine: w.routine, opened: w.opened, releases: w.releases, shippedRepos: shipped.length, d: w.d },
    people: rows, repos, links, wards, wardLinks, digest,
  };
}

// what lights when a row is pointed at or selected: the row, what its strings reach, and the strings themselves
export function litBy(board, key) {
  const on = new Set();
  if (!board || !key) return on;
  const kind = key[0];
  on.add(key);
  if (kind === "w") for (const w of board.wards) if (w.key === key) for (const r of w.repos) on.add(r);
  for (const l of board.links) if (kind === "p" ? l.p === key : on.has(l.r)) { on.add(l.p); on.add(l.r); on.add(l); }
  for (const l of board.wardLinks) if (kind === "w" ? l.w === key : kind === "r" && l.r === key) { on.add(l.w); on.add(l); }
  return on;
}

// a bar chart as one path: `values` scaled to their own peak, in a w by h box
export function barsPath(values, w, h) {
  if (!values?.length) return "";
  const mx = Math.max(...values) || 1, pitch = w / values.length, bw = Math.max(1, pitch - 1);
  let d = "";
  values.forEach((k, i) => { if (!k) return; const bh = Math.max(1, Math.round((k / mx) * h)); d += `M${f(i * pitch)} ${h - bh}h${f(bw)}v${bh}h-${f(bw)}z`; });
  return d;
}
// a Basecamp hill, 196 by 40: the curve, and one dot per scope at its position (0 to 100)
const hillY = (t) => 36 - 30 * (0.5 - 0.5 * Math.cos(2 * Math.PI * t));
export const HILL = (() => { let d = "M0 36"; for (let i = 1; i <= 28; i++) d += `L${f((i / 28) * 196)} ${f(hillY(i / 28))}`; return d + "M0 38.5H196M98 4V38"; })();
export const hillDots = (hill) => hill.map(([, pos]) => { const cx = f((pos / 100) * 196), cy = f(hillY(pos / 100)); return `M${f(cx - 3.5)} ${cy}a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0z`; }).join("");
