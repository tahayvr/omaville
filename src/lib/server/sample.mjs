// An invented members' city for local work (pnpm dev:members): the public snapshot plus Basecamp wards, a private
// repository, and made-up Basecamp people with teams and work, none of it real. It lives only in the dev relay's
// memory; never mistake it for the org's.
export function sampleMembers(publicData) {
  const data = structuredClone(publicData), now = data.now, DAY = 86400;
  // the wards steer the busiest public repositories, whatever the org (lifetime commits, then name)
  const ranked = Object.entries(data.repos).filter(([, r]) => !r.private && r.flag !== "archived").sort((a, b) => (b[1].total ?? 0) - (a[1].total ?? 0) || a[0].localeCompare(b[0])).map(([n]) => n);
  const pick = (from, n) => ranked.slice(from, from + n);
  // a private repository: a copy of a small public one, renamed (the layout engine gives it a lot)
  const like = data.repos[ranked[Math.floor(ranked.length * 0.75)] ?? ranked[0]];
  data.repos["sample-private-tool"] = { ...like, desc: "An invented private repository (sample)", private: true, latest: [[now - 3600, "sample", "An invented commit"]] };

  const ward = (name, repos, o = {}) => ({
    name, url: "", repos, people: o.people ?? 6,
    hill: o.hill ?? [["Shape the plan", 20], ["Build the core", 50], ["Polish", 85]],
    lists: o.lists ?? 4, open: o.open ?? 18, done: o.done ?? 31, building: o.building ?? 2,
    columns: o.columns ?? [["Triage", 3, "triage", ["An idea", "A report"]], ["Up next", 5, "column", ["A card", "Another card"]], ["In progress", 4, "column", ["Doing this"]], ["Done", 22, "done", []]],
    messages7: o.messages7 ?? 2, subjects: o.subjects ?? [[now - DAY, "A weekly update"], [now - 3 * DAY, "Plans for the next cycle"]],
    checkins: o.checkins ?? 12, uploads: o.uploads ?? 9, events7: o.events7 ?? 24, events30: o.events30 ?? 80, last: now - 1800,
    ...(o.archived ? { archived: true } : {}),
  });
  data.wards = {
    "9000001": ward("Sample: the next release", pick(0, 3), { people: 11, events7: 60, building: 3 }),
    "9000002": ward("Sample: the website", pick(3, 2), { hill: [["Copy", 70], ["Design", 40]], events7: 12 }),
    "9000003": ward("Sample: a port", pick(5, 3), { hill: [["Boot", 90], ["Graphics", 30], ["Sound", 10]], open: 40, done: 12 }),
    "9000004": ward("Sample: a quiet project", [], { events7: 0, events30: 3, messages7: 0, building: 0, hill: [], columns: [] }),
    "9000005": ward("Sample: an archived project", [], { archived: true, events7: 0, events30: 0, building: 0 }),
  };

  // Basecamp people, all made up: teams and work at the wards, never on a real person. Real people keep only what
  // the public sample says about them.
  const wardIds = Object.keys(data.wards);
  const MADE_UP = [["Ada Quill", "core"], ["Bram Okoro", "core"], ["Cleo Marsh", "site"], ["Dov Hartley", "mac"], ["Esme Vance", "mac"],
    ["Felix Arden", "packages"], ["Gita Rowe", "site"], ["Hugo Lind", "core"], ["Iris Calder", "packages"], ["Juno Pratt", "mac"]];
  MADE_UP.forEach(([n, team], i) => data.people.push({ n, gh: null, c30: 0, c7: 0, focus: "", repos: [], days: Array(30).fill(0), latest: [], teams: [team], bc: true,
    w30: 48 - i * 4, w7: 14 - i, wards: [[wardIds[i % 3], 30 - i * 2], [wardIds[(i + 1) % 3], 6]] }));

  data.projection = "members";
  return data;
}
