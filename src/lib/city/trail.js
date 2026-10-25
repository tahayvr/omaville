// A person's trail: their house first, then the repositories they worked on, busiest first, as a path the views
// draw while that person (or their house, or their team) is selected. Everything on the trail is lit; the rest of
// the city stays as it is. The window is the people card's: 30 days for a person, lifetime for a house.
export function trailFor(sel, M, PEOPLE) {
  if (!sel) return null;
  const teamOf = (p) => p.teams ?? [];
  let people = [];
  if (sel.kind === "person") people = [PEOPLE[sel.id]].filter(Boolean);
  else if (sel.kind === "team") people = PEOPLE.filter((p) => teamOf(p).includes(sel.id));
  else if (typeof sel.id === "string" && sel.id.startsWith("person:")) {
    const login = sel.id.slice(7), p = PEOPLE.find((x) => x.gh === login), c = (M.contributors ?? []).find((x) => x.login === login);
    people = [{ gh: login, repos: p?.repos?.length ? p.repos : c?.repos ?? [], wards: p?.wards }];
  } else return null;
  const repos = new Map();
  for (const p of people) for (const [r, n] of p.repos ?? []) if (M.roofs?.[r]) repos.set(r, (repos.get(r) ?? 0) + n);
  const order = [...repos].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const homes = people.map((p) => p.gh && M.homes?.[p.gh] ? ["person:" + p.gh, M.homes[p.gh]] : null).filter(Boolean);
  // and the Basecamp wards they worked in (the members' city), busiest first, after the repositories
  const wards = new Map(); for (const p of people) for (const [id, n] of p.wards ?? []) if (M.wardAt?.[id]) wards.set(id, (wards.get(id) ?? 0) + n);
  const wardOrder = [...wards].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const ids = [...homes.map(([id]) => id), ...order.map(([r]) => r), ...wardOrder.map(([id]) => "ward:" + id)];
  // one path per person in a team would be noise: a team's trail is its houses joined, then its repositories
  const points = [...homes.map(([, h]) => h), ...order.map(([r]) => M.roofs[r]), ...wardOrder.map(([id]) => M.wardAt[id])];
  return { ids, points, counts: order };
}
