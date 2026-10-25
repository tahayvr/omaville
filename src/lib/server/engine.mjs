// The layout engine: decides where every repository stands, and remembers it.
//
// Pure: data, config and the previous layout in, the new layout out. Runs in the relay (on every base), in the
// relay's state object (relay/state.mjs) and in the Worker, so a repository placed live lands where the next scan
// places it.
//
// One repository, one parcel, one building. Rules, in order:
//   1. A repository keeps the place it already has: its district slot (an index into that district's parcels,
//      city/grid.js) or its lot. Only archiving moves it (to the archive), and leaving the archive places it
//      again like a newcomer. A repository that disappears from the data keeps its slot or lot, vacant, so
//      nothing around it ever shifts; a slot left by archiving stays empty until a newcomer takes it.
//   2. Archived repositories go to the archive.
//   3. Landmarks named in the config get their hand-built station.
//   4. Otherwise the first district whose rule matches takes it, in its first free slot.
//   5. Anything left claims the next free lot, best lots first, and is built up over its first days. A
//      repository whose district is full claims a lot too and keeps its district's kind of building there
//      (layout.kinds). A lot never lowers the skyline: a repository takes a lot that holds scenery only if
//      it stands at least as tall as that scenery (both measured from the ground, the tower on its plinth), else the next lot that
//      it doesn't lower. When the mark's lots run out, the rings around it open, the same rings the
//      contributors' quarter fills: the next cell no house stands on. Nothing is ever skipped.
// Open pull requests and work on branches are drawn on the repository's own parcel, so they need no slots.
import { lotOrder, PARCELS, H, PZ, sceneryHeight, ringOrder, ringOf, civicAt, C, X0, Y0, LANDMARK_AT } from "../city/grid.js";

export function layoutCity(data, config, previous = null) {
  const city = config.layout ?? {};
  const landmarks = city.landmarks ?? (config.primary ? { [config.primary]: "hall" } : {}); // without landmarks, the primary repository is the hall
  const districts = city.districts ?? [];
  const prev = previous ?? { districts: {}, lots: {}, landmarks: {}, born: {} };
  const names = Object.keys(data.repos);
  const exists = new Set(names);
  const out = { version: 3, landmarks: {}, districts: Object.fromEntries(districts.map((d) => [d.id, []])), lots: {}, kinds: {}, houses: {}, born: { ...(prev.born ?? {}) } };
  const placed = new Set();
  const archiveId = districts.find((d) => d.match?.flags?.includes("archived"))?.id;
  const isArchived = (n) => data.repos[n]?.flag === "archived";
  // a district holds as many repositories as it has parcels on the mark; a slot is an index and never shifts
  const slots = (id) => PARCELS[id]?.length ?? districts.find((d) => d.id === id)?.capacity ?? 0;
  const free = (id) => { const a = out.districts[id]; const i = a.indexOf(null); return i >= 0 ? i : a.length < slots(id) ? a.length : -1; };
  const room = (id) => free(id) >= 0;
  const put = (id, n) => { out.districts[id][free(id)] = n; placed.add(n); };

  // 1. keep what already stands, in the same slot: districts, unless archived since or back from the archive
  //    (that slot is left empty); a repository gone from the data keeps its slot, vacant
  for (const d of districts) (prev.districts?.[d.id] ?? []).forEach((n, i) => {
    if (i >= slots(d.id)) return;
    const leaves = n === null || placed.has(n) || (exists.has(n) && (isArchived(n) ? d.id !== archiveId : d.id === archiveId));
    out.districts[d.id][i] = leaves ? null : n;
    if (!leaves) placed.add(n);
  });
  for (const d of districts) out.districts[d.id] = Array.from(out.districts[d.id], (v) => v ?? null);
  // lots are kept even for repositories missing from the data: a vacant lot, never a reshuffle
  for (const [key, n] of Object.entries(prev.lots ?? {})) {
    if (placed.has(n) || (exists.has(n) && isArchived(n))) continue;
    out.lots[key] = n; placed.add(n);
    if (prev.kinds?.[n]) out.kinds[n] = prev.kinds[n];
  }
  // 2. archive
  if (archiveId) for (const n of names.filter(isArchived).sort()) if (!placed.has(n)) put(archiveId, n);
  // 3. landmarks
  for (const [n, slot] of Object.entries(landmarks)) if (exists.has(n) && !isArchived(n) && !placed.has(n)) { out.landmarks[n] = typeof slot === "string" ? slot : slot.slot; placed.add(n); } // "slot", or { slot, what }
  // 4. districts by rule: explicit lists first, then flags, then name patterns
  const rest = names.filter((n) => !placed.has(n)).sort((a, b) => (data.repos[b].c30 - data.repos[a].c30) || a.localeCompare(b));
  for (const d of districts) for (const n of d.match?.repos ?? []) if (exists.has(n) && !placed.has(n) && d.id !== archiveId && room(d.id)) put(d.id, n);
  const rules = [
    (d, n) => d.match?.flags?.includes(data.repos[n].flag),
    (d, n) => d.match?.pattern && new RegExp(d.match.pattern, "i").test(n),
    (d, n) => d.match?.topics?.some((t) => (data.repos[n].topics ?? []).includes(t)),
  ];
  for (const rule of rules) for (const n of rest) {
    if (placed.has(n)) continue;
    const d = districts.find((x) => x.id !== archiveId && rule(x, n) && room(x.id));
    if (d) put(d.id, n);
  }
  // 5. new towers on free lots (never a cell that already holds houses), never lowering the skyline
  const houseCells = new Set(Object.values(prev.houses ?? {}).map((v) => v.split(":")[0]));
  const openLots = lotOrder().filter((k) => !out.lots[k] && !houseCells.has(k));
  const outer = ringOrder();
  const nextRingCell = () => { for (;;) { const k = outer.next().value; if (!out.lots[k] && !houseCells.has(k) && !civicAt(k)) return k; } }; // a civic cell (a stadium, a park…) is never a lot
  const tops = (n) => PZ + H(data.repos[n].total ?? data.repos[n].c30 ?? 0); // a lot tower stands on a PZ plinth
  const kindOf = (n) => districts.find((x) => x.id !== archiveId && (x.match?.repos?.includes(n) || rules.some((rule) => rule(x, n))))?.id;
  for (const n of rest) {
    if (placed.has(n)) continue;
    const i = openLots.findIndex((k) => tops(n) >= sceneryHeight(k));
    const key = i >= 0 ? openLots.splice(i, 1)[0] : nextRingCell();
    out.lots[key] = n; placed.add(n);
    const kind = kindOf(n); if (kind) out.kinds[n] = kind; // a full district's newcomer keeps its district's building
  }
  if (!Object.keys(out.kinds).length) delete out.kinds;
  // when each repository first appeared in the city: creation date when known, else first sighting;
  // a creation date that turns up later (an earlier source had none) replaces a first sighting, never the reverse
  for (const n of names) { const created = data.repos[n].created || 0; out.born[n] ??= created || data.now; if (created && created < out.born[n]) out.born[n] = created; }
  // the contributors' quarter: one tower per person, placed once. It stands outside the mark, in rings around
  // it: the ring next to the mark first, its cells nearest the arcology first, then the next ring out, so the
  // city grows outward around the plant and never reshuffles. Whoever arrives in the same run is placed in a
  // seeded shuffle of their logins, never by size, so tall and short towers stand together like a real city
  // instead of a sorted bar chart. A block holds 7 to 9 towers, fixed per cell by a hash, so the quarter reads
  // like city blocks, not a grid.
  const PER_CELL = city.quarter?.perCell ?? 9, VARY = city.quarter?.vary ?? 2;
  const cellHash = (s) => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 1000003; return h; };
  const capacity = (cell) => PER_CELL - (cellHash(cell) % (VARY + 1));
  // a house is never removed, except one that should never have been built: a bot's
  const bot = new RegExp(config.bots ?? "\\[bot\\]$", "i");
  // and one on a civic cell, which moves once to the next free slot (the street plan of 18 Oct 2026 laid civic
  // cells over a few blocks that had houses; a civic cell is never given houses again)
  out.houses = Object.fromEntries(Object.entries(prev.houses ?? {}).filter(([login, where]) => !bot.test(login) && !civicAt(where.split(":")[0])));
  if (prev.houseBorn) out.houseBorn = Object.fromEntries(Object.entries(prev.houseBorn).filter(([l, t]) => out.houses[l] && data.now - t < 7 * 86400)); // only recent ones matter
  const taken = {};
  for (const v of Object.values(out.houses)) { const [cell, s] = v.split(":"); (taken[cell] ??= new Set()).add(+s); }
  const cells = ringOrder();
  let cur = cells.next().value;
  const roomIn = (cell) => !out.lots[cell] && !civicAt(cell) && (taken[cell]?.size ?? 0) < capacity(cell);
  const arriving = (data.contributors ?? []).filter((c) => !out.houses[c.login]).sort((a, b) => cellHash("~" + a.login) - cellHash("~" + b.login) || a.login.localeCompare(b.login));
  for (const c of arriving) {
    while (!roomIn(cur)) cur = cells.next().value;
    let s = 0; while (taken[cur]?.has(s)) s++;
    out.houses[c.login] = `${cur}:${s}`; (taken[cur] ??= new Set()).add(s);
    (out.houseBorn ??= {})[c.login] = data.now; // when the house was built: a crane stands over it for its first day
  }
  // wards: one per Basecamp project (data.wards, the members' city), on a civic cell of the rings, placed once.
  // A ward takes the free civic cell nearest the repositories linked to it (their hint files) (a project with none
  // takes the first free one, nearest the mark); houses and lots never stood on civic cells, so nothing moves
  out.wards = { ...(prev.wards ?? {}) };
  const wardCells = new Set(Object.values(out.wards)), civics = [];
  { const it = ringOrder(); for (let n = 0; n < 2000 && civics.length < 200; n++) { const k = it.next().value; if (civicAt(k)) civics.push(k); } }
  const centre = (k) => { const [i, j] = k.split(",").map(Number); return [X0 + i * C + C / 2, Y0 + j * C + C / 2]; };
  const where = (n) => {
    const lm = LANDMARK_AT[out.landmarks[n]]; if (lm) return [X0 + lm[0] * C, Y0 + lm[1] * C];
    if (Object.values(out.lots).includes(n)) return centre(Object.entries(out.lots).find(([, v]) => v === n)[0]);
    for (const [d, list] of Object.entries(out.districts)) { const i = list.indexOf(n), p = i >= 0 && PARCELS[d]?.[i]; if (p) return [p.x + p.w / 2, p.y + p.d / 2]; }
    return null;
  };
  for (const id of Object.keys(data.wards ?? {}).sort((a, b) => +a - +b || a.localeCompare(b))) {
    if (out.wards[id]) continue;
    const pts = (data.wards[id]?.repos ?? []).map(where).filter(Boolean), free = civics.filter((k) => !wardCells.has(k));
    if (!free.length) break;
    const c = pts.length ? [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length] : null;
    const k = c ? free.reduce((best, k2) => (Math.hypot(...centre(k2).map((v, i) => v - c[i])) < Math.hypot(...centre(best).map((v, i) => v - c[i])) ? k2 : best)) : free[0];
    out.wards[id] = k; wardCells.add(k);
  }
  if (!Object.keys(out.wards).length) delete out.wards;
  // the master layout covers the members' city too: it remembers every repository that was ever private, so the
  // public layout can leave them out (publicLayout) while positions stay the same in both cities
  const priv = new Set([...(prev.private ?? []), ...names.filter((n) => data.repos[n].private)]);
  if (priv.size) out.private = [...priv].sort(); else delete out.private;
  return out;
}

// The public city's layout: the master layout without any repository that was ever private. Their district slots
// read as empty parcels and their lots as unclaimed ground, so nothing about them shows; every other position is
// exactly the master's.
export function publicLayout(master) {
  if (!master?.private?.length) { const { private: _, ...rest } = master ?? {}; return rest; }
  const hide = new Set(master.private);
  const out = { ...master, districts: {}, lots: {}, kinds: {}, born: {}, landmarks: {} };
  for (const [d, list] of Object.entries(master.districts ?? {})) out.districts[d] = list.map((n) => (n && hide.has(n) ? null : n));
  for (const [k, n] of Object.entries(master.lots ?? {})) if (!hide.has(n)) out.lots[k] = n;
  for (const [n, v] of Object.entries(master.kinds ?? {})) if (!hide.has(n)) out.kinds[n] = v;
  for (const [n, v] of Object.entries(master.born ?? {})) if (!hide.has(n)) out.born[n] = v;
  for (const [n, v] of Object.entries(master.landmarks ?? {})) if (!hide.has(n)) out.landmarks[n] = v;
  if (!Object.keys(out.kinds).length) delete out.kinds;
  delete out.private;
  return out;
}

