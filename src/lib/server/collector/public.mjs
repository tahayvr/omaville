// The public city must not carry what belongs to the members' city: a private repository, a team, a real name
// beside a GitHub login, or a membership mark that is not public. Returns the problems found (none: safe to serve).
// Run on every scan the relay serves (relay/server.mjs) and on any data.json by scripts/assert-public.mjs.
// The parts of city.config.json a page may have: the org's words and the layout's words the renderer and the
// legend read (districts' names, the slots' kinds and signs, the boards' text, the newcomers' name), and which
// repository takes which landmark slot or kit, minus any repository that was ever private unless the page is a
// member's. Never the people, the bots, the hints, the mirrors or a district's matching rules.
export function publicConfig(config, { private: priv = [], member = false } = {}) {
  const keep = ["org", "name", "title", "description", "window", "primary", "timezone", "patrons"];
  const out = Object.fromEntries(keep.filter((k) => k in config).map((k) => [k, config[k]]));
  const L = config.layout ?? {}, hidden = new Set(member ? [] : priv), shown = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([repo]) => !hidden.has(repo)));
  out.layout = {
    ...(L.districts ? { districts: L.districts.map(({ id, name }) => ({ id, name })) } : {}),
    ...(L.newcomers ? { newcomers: L.newcomers } : {}), ...(L.kinds ? { kinds: L.kinds } : {}), ...(L.signs ? { signs: L.signs } : {}), ...(L.boards ? { boards: L.boards } : {}),
    ...(L.landmarks ? { landmarks: shown(L.landmarks) } : {}), ...(L.kits ? { kits: shown(L.kits) } : {}),
  };
  return out;
}

export function publicProblems(data) {
  const problems = [];
  if (data.projection !== "public") problems.push(`projection is ${data.projection ?? "missing"}, not public`);
  for (const [n, r] of Object.entries(data.repos)) if (r.private) problems.push(`private repository ${n}`);
  for (const p of data.people) {
    if (p.teams) problems.push(`teams on ${p.n}`);
    if (p.gh && p.n !== p.gh) problems.push(`real name beside login: ${p.n} / ${p.gh}`);
    if (p.member && !p.gh) problems.push(`membership without a login: ${p.n}`);
  }
  if (data.publicMembers) problems.push("publicMembers list left in");
  for (const p of data.people) { if (p.bc) problems.push(`a Basecamp-only person: ${p.n}`); if (p.w30 != null || p.wards) problems.push(`Basecamp work on ${p.n}`); if (p.av) problems.push(`an avatar on ${p.n}`); }
  for (const [id, w] of Object.entries(data.wards ?? {})) { const extra = Object.keys(w).filter((k) => k !== "repos"); if (extra.length) problems.push(`ward ${id} carries ${extra.join(", ")}`); }
  const names = new Set(Object.keys(data.repos));
  for (const p of data.people) for (const [r] of p.repos) if (!names.has(r)) problems.push(`${p.n} refers to a hidden repository ${r}`);
  for (const d of data.days) for (const [r] of d.repos) if (!names.has(r)) problems.push(`a day refers to a hidden repository ${r}`);
  for (const c of data.contributors ?? []) for (const [r] of c.repos) if (!names.has(r)) problems.push(`contributor ${c.login} refers to a hidden repository ${r}`);
  return problems;
}
