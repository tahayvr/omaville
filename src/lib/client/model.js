// What the cards, the tooltip, the search and the lighting read from the city's model (buildCity's `model`):
// repositories, stations, districts, people and days. The model is merged in place when new data redraws a station
// (merge), so everything here reads it live.
import { trailFor } from "../city/trail.js";
import { fmt, day } from "./format.js";

export function lens(M) {
  const R = M.repos, ST = M.stations, PEOPLE = M.people, DAYS = M.days;
  const isGroup = (id) => !!M.groups[id];
  const membersOf = (id) => (M.groups[id] ? M.groups[id] : [id]);
  const sumOf = (ids, key) => ids.reduce((t, id) => t + (R[id] ? R[id][key] || 0 : 0), 0);
  const L = {
    M, R, ST, PEOPLE, DAYS, isGroup, membersOf, sumOf,
    get WIN() { return M.window ? M.window.days : 30; },
    get TO() { return day(M.window ? M.window.to : M.now); },
    get YEAR() { return new Date((M.window ? M.window.to : M.now) * 1000).getUTCFullYear(); },
    pidx: (name) => PEOPLE.findIndex((p) => p.n === name),
    seriesOf(ids) { const a = new Array(30).fill(0); for (const id of ids) if (R[id] && R[id].days) R[id].days.forEach((v, i) => (a[i] += v)); return a; },
    topPeople(ids, n = 6) { const o = {}; for (const id of ids) if (R[id]) for (const [p, c] of R[id].top) o[p] = (o[p] || 0) + c; return Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n); },
    latestOf(ids, n = 5) { return ids.flatMap((id) => (R[id] ? R[id].latest.map((l) => [...l, id]) : [])).sort((a, b) => b[0] - a[0]).slice(0, n); },
    repoKind: (id) => ((ST[id] && ST[id].kind) || (R[id] && R[id].flag === "archived" ? "Archive" : "Repository")) + (R[id]?.private ? " · private" : ""), // private: only the members' city has them
    ghRepo: (id) => `https://github.com/${encodeURIComponent(M.org)}/${encodeURIComponent(id)}`,
    groupName: (id) => M.groupNames?.[id] ?? id, // a district's name, from the config
    nameOf: (id) => (isGroup(id) ? M.groupNames?.[id] ?? id : ST[id] && ST[id].title ? ST[id].title : id),
    // the totals across the org (the header and the overview)
    totals() {
      return {
        c30: DAYS.reduce((t, d) => t + d.n, 0), c7: DAYS.slice(-7).reduce((t, d) => t + d.n, 0),
        pr: Object.values(R).reduce((t, r) => t + (r.pr || 0), 0), un: Object.values(R).reduce((t, r) => t + (r.unmerged || 0), 0),
        active: Object.values(R).filter((r) => r.c30 > 0).length,
      };
    },
    // what a selection (or a hover) lights: a person, a house or a team lights their trail
    idsFor(sel) {
      if (!sel) return [];
      if (sel.kind === "person" || sel.kind === "team" || (typeof sel.id === "string" && sel.id.startsWith("person:"))) return trailFor(sel, M, PEOPLE)?.ids ?? [];
      if (sel.kind === "day") return ["day-" + sel.id];
      return membersOf(sel.id).concat(isGroup(sel.id) ? [sel.id] : []);
    },
    trail: (sel) => (sel ? trailFor(sel, M, PEOPLE) : null),
    teams: () => [...new Set(PEOPLE.flatMap((p) => p.teams ?? []))].sort(),
    contributor: (login) => (M.contributors || []).find((x) => x.login === login),
    // the search: repositories, people, districts, teams, houses, patrons' boards and (members) wards
    index() {
      return [
        ...Object.entries(R).map(([n, r]) => ({ kind: "station", id: n, label: n, sub: L.repoKind(n) + (r.desc ? " · " + r.desc : ""), meta: r.c30 ? fmt(r.c30) : "", score: r.c30 })),
        ...PEOPLE.map((p, i) => ({ kind: "person", id: i, label: p.n, sub: (p.member ? "Org member · " : p.bc ? "Basecamp · " : "Contributor · ") + (p.gh ? "@" + p.gh + " · " : "") + ((p.repos || []).length ? p.repos.slice(0, 3).map((r) => r[0]).join(", ") : "no commits in 30 days"), meta: p.c30 ? fmt(p.c30) : "—", score: p.c30 + (p.c30 ? 1000 : 0) })),
        ...Object.keys(M.groups).map((g) => ({ kind: "station", id: g, label: M.groupNames?.[g] ?? g, sub: "District · " + M.groups[g].length + " repos", meta: fmt(sumOf(M.groups[g], "c30")), score: 500 })),
        ...L.teams().map((t) => ({ kind: "team", id: t, label: t, sub: "Team · " + PEOPLE.filter((p) => (p.teams ?? []).includes(t)).length + " people", meta: "", score: 700 })), // the members' city only
        ...(M.contributors || []).map((c) => ({ kind: "station", id: "person:" + c.login, label: c.login, sub: "Contributor · " + fmt(c.total) + " commits, lifetime", meta: "", score: Math.min(400, c.total) })),
        ...Object.entries(ST || {}).filter(([id]) => id.startsWith("patron:")).map(([id, s]) => ({ kind: "station", id, label: s.title, sub: s.what.split(",")[0], meta: "", score: 300 })), // corporate patrons' boards
        ...Object.entries(ST || {}).filter(([id, s]) => id.startsWith("ward:") && s.link).map(([id, s]) => ({ kind: "station", id, label: s.title, sub: "Basecamp ward", meta: "", score: 300 })), // wards, by name in the members' city only
      ];
    },
  };
  return L;
}

// new data, merged into the model in place (the cards, the header and the movers read it)
export function merge(M, next) {
  for (const [id, r] of Object.entries(next.repos ?? {})) M.repos[id] ? Object.assign(M.repos[id], r) : (M.repos[id] = r);
  for (const [id, st] of Object.entries(next.stations ?? {})) M.stations[id] ? Object.assign(M.stations[id], st) : (M.stations[id] = st);
  (next.days ?? []).forEach((d, i) => { if (M.days[i]) Object.assign(M.days[i], d); });
  // people and contributors are merged in place too (the lens holds the arrays): a house's card and the crew list read the new totals
  const into = (list, key, more) => { if (!list || !more) return; const by = new Map(list.map((x) => [x[key], x])); for (const x of more) { const had = by.get(x[key]); had ? Object.assign(had, x) : list.push(x); } };
  into(M.contributors, "login", next.contributors); into(M.people, "n", next.people);
  for (const k of ["runs", "drones", "ticker", "roofs", "homes", "lights", "pads", "patronAt", "wardAt"]) if (next[k]) M[k] = next[k];
}
