// The year film: the last twelve months of the city in about forty seconds, made from the relay's log (GET /film,
// or /members/film for the members' cut). Each month the city rewinds to that month's end: heights are today's
// minus what the log says came later, lamps and belts follow that month's last week, repositories not yet born
// are not there, houses rise as their people arrive, and the month's releases and new repositories play as
// effects. Open pull requests and branch work are left out (the log does not know them for the past). The film
// ends on today's city; the 3D view records it with a burned-in caption (client/clip.js).
import { primitivesFor } from "../city/effects.js";

const DAY = 86400;
const sum = (o) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);

// the city at the end of one frame, from today's data and the film
export function filmData(base, f, film) {
  const repos = {}, W = base.days?.length ?? 30;
  for (const [name, r] of Object.entries(base.repos)) {
    const seen = f.repos[name] ?? 0, later = (film.now.repos[name] ?? 0) - seen;
    if (!seen && (r.created ?? 0) > f.t) continue; // not born yet
    const c7 = f.week[name] ?? 0, days = Array(W).fill(0);
    for (let k = 0; k < 7; k++) days[W - 1 - k] = Math.floor(c7 / 7) + (k < c7 % 7 ? 1 : 0);
    repos[name] = { ...r, total: Math.max(0, (r.total ?? 0) - later), c7, c30: f.month[name] ?? 0, days, pr: 0, unmerged: 0, bots: 0, people7: 0,
      latest: (r.latest ?? []).filter(([at]) => at <= f.t), last: Math.min(r.last ?? 0, f.t), at7: undefined, botAt7: undefined };
  }
  const contributors = (base.contributors ?? []).flatMap((c) => {
    const seen = f.people[c.login] ?? 0, later = (film.now.people[c.login] ?? 0) - seen;
    if (c.first ? c.first[0] > f.t : !seen && film.now.people[c.login]) return []; // has not arrived yet
    return [{ ...c, total: Math.max(1, c.total - later) }];
  });
  const days = (base.days ?? []).map((d, k) => ({ ...d, at: f.t - (W - 1 - k) * DAY, n: f.days[k - (W - 30)] ?? 0 }));
  return { ...base, now: f.t, repos, contributors, days, window: { ...(base.window ?? {}), from: f.t - (W - 1) * DAY }, replay: { at: f.t } };
}

// the stations whose drawing differs between two cities (repositories, houses, the days board)
function changed(a, b) {
  const ids = new Set();
  for (const n of new Set([...Object.keys(a.repos), ...Object.keys(b.repos)])) { const x = a.repos[n], y = b.repos[n]; if (!x || !y || x.total !== y.total || x.c7 !== y.c7 || x.c30 !== y.c30) ids.add(n); }
  const ca = new Map((a.contributors ?? []).map((c) => [c.login, c.total])), cb = new Map((b.contributors ?? []).map((c) => [c.login, c.total]));
  for (const l of new Set([...ca.keys(), ...cb.keys()])) if (ca.get(l) !== cb.get(l)) ids.add("person:" + l);
  b.days.forEach((d, k) => { if (d.n !== a.days[k]?.n) ids.add(`day-${k}`); }); // the days board (city/stations.js)
  return [...ids];
}

export async function playFilm({ url, title = "City", org = "", getData, patch, fx, modelOf, home = () => {}, orbit = () => {}, timeZone = "UTC", onCaption = () => {}, monthMs = 3200, setReplaying = () => {} }) {
  const film = await (await fetch(url, { credentials: "include" })).json();
  if (!film.frames?.length) throw new Error("the log has no history yet (run the backfill)");
  const now = getData(), month = (t) => new Intl.DateTimeFormat("en-GB", { timeZone, month: "long", year: "numeric" }).format(new Date((t - DAY) * 1000)).toUpperCase();
  setReplaying(true);
  let shown = now;
  const go = async (next) => { const ids = changed(shown, next); shown = next; if (ids.length) await patch(next, ids); };
  const T = title.toUpperCase();
  try {
    onCaption([`${T} · THE YEAR`, "rewinding to " + month(film.frames[0].t - 30 * DAY)]);
    await go(filmData(now, film.frames[0], film));
    home(1800);
    for (const f of film.frames) {
      const t0 = performance.now(), data = filmData(now, f, film);
      const commits = sum(f.month), people = (data.contributors ?? []).length;
      onCaption([`${T} · ${month(f.t)}`, `${commits.toLocaleString("en-US")} commits · ${f.merges} merges · ${f.releases.length} releases · ${f.newRepos.length} new repositories · ${people.toLocaleString("en-US")} contributors`]);
      await go(data);
      const model = modelOf();
      const beats = [...f.releases.map(([, repo]) => ({ kind: "release", repo })), ...f.newRepos.map(([, repo]) => ({ kind: "repo.new", repo }))].slice(0, 6);
      beats.forEach((e, i) => setTimeout(() => fx(primitivesFor(e, model), e), 300 + i * ((monthMs - 900) / Math.max(1, beats.length))));
      orbit(12);
      await new Promise((r) => setTimeout(r, Math.max(400, monthMs - (performance.now() - t0))));
    }
    onCaption([`${T} · TODAY`, `height is history, light is now${org ? ` · github.com/${org}` : ""}`]);
    await go(getData());
    await new Promise((r) => setTimeout(r, 2200));
  } finally { if (shown !== getData()) await go(getData()); setReplaying(false); }
}
