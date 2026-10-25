// Turns raw activity (from GitHub or from local clones) into the city's data.json.
//
// input = {
//   now, since,                                   // unix seconds
//   members:  [{ login, name }],                  // the org's members
//   publicMembers: [login],                       // members whose membership is public
//   repos:    [{ name, desc, lang, archived, fork, mirror, private, created, pushed, pr, total }],
//   commits:  [{ repo, sha, at, login, name, email, subject, merge, landed, pid? }],  // pid: a change id (git source)
//   branches: [{ repo, name, at, ahead, authors: [[who, n]] }],
//   contributors: [{ repo, login, n, bot? }],     // lifetime commits per person (and per bot) per public repository
//   basecamp?: { projects, people, events },      // collector/basecamp.mjs: the wards and the people's work
// }
// The full aggregate is the members' city. project(data, "public") derives the public city from it:
// no private repositories, people by GitHub login only, no teams, membership marked only when public.
import { wardsOf } from "./basecamp.mjs";
const DAY = 86400;

// config.people: "all" or "members", or { who, invited, hidden }: hidden people (names, logins or emails) are
// counted but never drawn or listed, in either city
const peopleMode = (config) => (typeof config.people === "string" ? config.people : config.people?.who ?? "members");

// seen: when given an array, every de-duplicated commit that landed on a default branch is pushed into it (the
// relay appends them to its event log: the city's history, for replay)
export function aggregate(input, config = {}, { seen = null } = {}) {
  const now = input.now, window = config.window ?? 30;
  // the window is whole UTC calendar days ending today (today is partial), so a day column is a real day
  const start = Math.floor(now / DAY) * DAY - (window - 1) * DAY;
  const since = start;
  const aliases = {}; // a lowercased login or name → the member's display name, so commits under another email still find them
  const routineWho = new RegExp(config.routine?.who ?? "(?!)", "i");
  const routineSubject = new RegExp(config.routine?.subject ?? "(?!)", "i");
  const mirrors = new Set(config.layout?.mirrors ?? []);

  // ---- who is who ----
  // a member's display name: their GitHub profile name, else the login
  const members = input.members.map((m) => ({ login: m.login, name: m.name || m.login }));
  const byLogin = new Map(members.map((m) => [m.login.toLowerCase(), m.name]));
  for (const m of members) { aliases[m.login.toLowerCase()] ??= m.name; aliases[m.name.toLowerCase()] ??= m.name; }
  const noreply = /^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/i;
  const who = (c) => {
    if (c.login && byLogin.has(c.login.toLowerCase())) return byLogin.get(c.login.toLowerCase());
    const nr = (c.email || "").match(noreply);
    if (nr && byLogin.has(nr[1].toLowerCase())) return byLogin.get(nr[1].toLowerCase());
    const n = (c.name || c.login || "unknown").trim();
    return aliases[n.toLowerCase()] ?? (c.login ? aliases[c.login.toLowerCase()] : undefined) ?? n;
  };

  // ---- commits: drop merges and mirrors, de-duplicate, then set bots and routine work apart ----
  const repoMeta = new Map(input.repos.map((r) => [r.name, r]));
  const prio = (r) => (r === config.primary ? 0 : 1);
  const raw = input.commits.filter((c) => !c.merge && !mirrors.has(c.repo) && !(repoMeta.get(c.repo)?.mirror) && repoMeta.has(c.repo));
  raw.sort((a, b) => prio(a.repo) - prio(b.repo) || (b.landed ? 1 : 0) - (a.landed ? 1 : 0) || b.at - a.at);
  const bot = new RegExp(config.bots ?? "\\[bot\\]$", "i");
  const seenSha = new Set(), seenExact = new Set(), seenPid = new Set(), commits = [], botCommits = [];
  for (const c of raw) {
    const w = who(c);
    // the same commit seen on several branches counts once; a rebased or cherry-picked copy keeps its author, author date and subject
    if (c.sha) { if (seenSha.has(c.sha)) continue; seenSha.add(c.sha); }
    const k1 = `${(c.email || "").toLowerCase()}|${c.at}|${c.subject}`;
    if (seenExact.has(k1)) continue;
    seenExact.add(k1);
    // a copy whose date or subject changed (a rebase with a new date, a one-commit squash merge with "(#123)"
    // appended) still carries the same change: the git source gives it as a pid, see collector/git.mjs
    if (c.pid) { if (seenPid.has(c.pid)) continue; seenPid.add(c.pid); }
    // bots and routine work move belts but never build: kept apart, out of height, people and the counts
    if (routineWho.test(w) || routineWho.test(c.login || "") || bot.test(w) || bot.test(c.login || "") || routineSubject.test(c.subject)) { botCommits.push(c); continue; }
    commits.push({ ...c, who: w });
  }
  if (seen) for (const c of [...commits.map((c) => [c, false]), ...botCommits.map((c) => [c, true])]) if (c[0].landed && c[0].sha) seen.push({ sha: c[0].sha, at: c[0].at, repo: c[0].repo, login: c[0].login || null, who: c[1] ? null : c[0].who, subject: (c[0].subject || "").slice(0, 140), bot: c[1], private: !!repoMeta.get(c[0].repo)?.private });
  const recent = commits.filter((c) => c.at > since && c.at <= now);
  const dayOf = (at) => Math.min(window - 1, Math.max(0, Math.floor((at - start) / DAY)));
  const count = (list, key) => { const m = new Map(); for (const x of list) m.set(key(x), (m.get(key(x)) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
  const newest = (list) => list.slice().sort((a, b) => b.at - a.at);
  const series = (list) => { const d = new Array(window).fill(0); for (const c of list) d[dayOf(c.at)]++; return d; };
  // where each commit of the belt's week falls: 0 = the start of the calendar day six days ago, 1 = the end of
  // today, three decimals, sorted. Belts place one crate per commit at its real time, not spread over its day.
  const weekStart = start + (window - 7) * DAY;
  const placed = (list) => list.filter((c) => c.at >= weekStart).map((c) => Math.round(Math.min(1, (c.at - weekStart) / (7 * DAY)) * 1000) / 1000).sort((a, b) => a - b);

  // ---- repositories ----
  // lifetime commits made by bots and routine accounts, per repository: they come off the height (law: bots move
  // belts but never build). The contributors endpoint names them, so this is a count, not an estimate.
  const botMade = new Map();
  for (const c of input.contributors ?? []) if (c.bot || bot.test(c.login) || routineWho.test(c.login)) botMade.set(c.repo, (botMade.get(c.repo) || 0) + c.n);
  const botRecent = botCommits.filter((c) => c.at > since && c.at <= now);
  const repos = {};
  for (const r of input.repos) {
    const bots = series(botRecent.filter((c) => c.repo === r.name));
    const mine = recent.filter((c) => c.repo === r.name);
    // distinct recent commits that exist only on branches (shared commits count once)
    const unmerged = mine.filter((c) => !c.landed).length;
    const last = Math.max(0, ...commits.filter((c) => c.repo === r.name).map((c) => c.at), r.pushed || 0);
    const week = mine.filter((c) => c.at > now - 7 * DAY);
    const flag = r.archived ? "archived" : mirrors.has(r.name) || r.mirror ? "mirror" : r.fork ? "fork" : "";
    repos[r.name] = {
      desc: r.desc || "", lang: r.lang || "",
      flag, ...(r.private ? { private: true } : {}),
      created: r.created || 0,
      total: flag === "mirror" ? 0 : Math.max(0, (r.total || 0) - (flag === "fork" ? 0 : botMade.get(r.name) || 0)), // lifetime commits by people: height (a mirror carries none of the org's work; a fork counts only what is ahead)
      c30: mine.length, c7: week.length, // recent work: light and motion
      unmerged, people: new Set(mine.map((c) => c.who)).size, people7: new Set(week.map((c) => c.who)).size,
      top: count(mine, (c) => c.who).slice(0, 8), pr: r.pr || 0, ...(r.releases ? { releases: r.releases } : {}), last,
      latest: newest(mine).slice(0, 5).map((c) => [c.at, c.who, c.subject.slice(0, 140)]),
      days: series(mine),
      ...(bots.some(Boolean) ? { bots } : {}), // commits by bots and routine accounts per day: they ride the belts, apart
      ...(() => { const at7 = placed(mine), botAt7 = placed(botRecent.filter((c) => c.repo === r.name)); return { ...(at7.length ? { at7 } : {}), ...(botAt7.length ? { botAt7 } : {}) }; })(),
    };
  }

  // ---- people: org members and, with people: "all", everyone who committed ----
  const teams = new Map(); // login → the names of its GitHub teams (the members' city)
  for (const t of input.teams ?? []) for (const login of t.members ?? []) teams.set(login.toLowerCase(), [...(teams.get(login.toLowerCase()) ?? []), t.name]);
  const list = new Map(members.map((m) => [m.name, { name: m.name, login: m.login, member: true }]));
  if (peopleMode(config) === "all") for (const c of recent) if (!list.has(c.who) && !bot.test(c.who)) list.set(c.who, { name: c.who, login: c.login || null, member: false });
  // Basecamp: one person, one worker. A Basecamp account joins the person its email committed as (or its name's
  // alias); someone only on Basecamp is a worker too, in the members' city. Their work is counted per ward.
  const bc = input.basecamp, work = new Map(), bcEmails = new Map(), bcAvatar = new Map(); // display name → { w30, w7, wards: Map }; → emails
  if (bc) {
    const byEmail = new Map(recent.filter((c) => c.email).map((c) => [c.email.toLowerCase(), c.who]));
    const bcName = new Map(bc.people.map((p) => [p.id, aliases[p.name.toLowerCase()] ?? byEmail.get(p.email) ?? (byLogin.has(p.name.toLowerCase()) ? byLogin.get(p.name.toLowerCase()) : p.name)]));
    for (const p of bc.people) { const n = bcName.get(p.id); if (p.email) bcEmails.set(n, [...(bcEmails.get(n) ?? []), p.email]); if (p.avatar && !bcAvatar.has(n)) bcAvatar.set(n, p.avatar); }
    for (const e of bc.events) {
      const n = bcName.get(e.person); if (!n || bot.test(n)) continue;
      const w = work.get(n) ?? { w30: 0, w7: 0, wards: new Map() }; work.set(n, w);
      w.w30++; if (e.at > now - 7 * DAY) w.w7++; w.wards.set(e.project, (w.wards.get(e.project) ?? 0) + 1);
    }
    for (const n of work.keys()) if (!list.has(n)) list.set(n, { name: n, login: null, member: false, bc: true });
  }
  const hiddenPeople = new Set((config.people?.hidden ?? []).map((x) => String(x).toLowerCase()));
  const shown = (m) => !hiddenPeople.has(m.name.toLowerCase()) && !(m.login && hiddenPeople.has(m.login.toLowerCase())) && !recent.some((c) => c.who === m.name && c.email && hiddenPeople.has(c.email.toLowerCase())) && !(bcEmails.get(m.name) ?? []).some((e) => hiddenPeople.has(e));
  const people = [...list.values()].filter(shown).map((m) => {
    const mine = recent.filter((c) => c.who === m.name);
    const per = count(mine, (c) => c.repo);
    const lat = newest(mine);
    const focus = (per.length
      ? `Mostly ${per.slice(0, 2).map(([r, n]) => `${r} (${n})`).join(" and ")}. Latest: ${lat[0].subject.slice(0, 110)}`
      : "");
    return {
      n: m.name, gh: m.login || undefined, member: m.member || undefined, c30: mine.length, c7: mine.filter((c) => c.at > now - 7 * DAY).length,
      teams: m.login ? teams.get(m.login.toLowerCase()) ?? [] : [], focus, repos: per, days: series(mine),
      latest: lat.slice(0, 5).map((c) => [c.at, c.repo, c.subject.slice(0, 140)]),
      av: bcAvatar.get(m.name) ?? (m.login && m.member ? `https://github.com/${m.login}.png?size=48` : undefined), // avatars: the members' city only
      ...(work.has(m.name) ? { w30: work.get(m.name).w30, w7: work.get(m.name).w7, wards: [...work.get(m.name).wards].sort((a, b) => b[1] - a[1]) } : {}), ...(m.bc ? { bc: true } : {}),
    };
  }).sort((a, b) => b.c30 + (b.w30 ?? 0) - a.c30 - (a.w30 ?? 0) || b.c7 - a.c7 || a.n.localeCompare(b.n));

  // ---- days ----
  const days = Array.from({ length: window }, (_, i) => {
    const list = recent.filter((c) => dayOf(c.at) === i);
    return {
      at: start + i * DAY, n: list.length, people: new Set(list.map((c) => c.who)).size,
      top: count(list, (c) => c.who).slice(0, 5), repos: count(list, (c) => c.repo).slice(0, 5),
      latest: newest(list).slice(0, 5).map((c) => [c.at, c.who, c.repo, c.subject.slice(0, 140)]),
    };
  });

  // ---- contributors: one house per person, lifetime commits summed over the public repositories ----
  const byLogin2 = new Map();
  for (const c of input.contributors ?? []) {
    const flag = repos[c.repo]?.flag;
    if (!repos[c.repo] || flag === "mirror" || flag === "fork") continue; // upstream's authors are not the foundation's contributors
    if (c.bot || bot.test(c.login) || routineWho.test(c.login)) continue;
    const e = byLogin2.get(c.login) ?? { login: c.login, total: 0, repos: [] };
    e.total += c.n; e.repos.push([c.repo, c.n]); byLogin2.set(c.login, e);
  }
  const contributors = [...byLogin2.values()].map((e) => ({ ...e, repos: e.repos.sort((a, b) => b[1] - a[1]).slice(0, 8) })).sort((a, b) => b.total - a.total || a.login.localeCompare(b.login));

  // ---- patrons: the site's tiers, names and links only (no avatars); the public page already shows them ----
  const corporate = new Set(["crown", "boards"].map((k) => config.patrons?.[k]?.tier).filter(Boolean)); // the tiers the city draws, with logos
  const patrons = Array.isArray(input.patrons)
    ? input.patrons.filter((t) => Array.isArray(t.members) && t.members.length).map((t) => ({ id: t.id, name: t.name, members: t.members.map((m) => ({ name: m.name, meta: m.meta || "", href: m.href || "",
      ...(corporate.has(t.id) && m.avatar && config.patrons?.site ? { logo: new URL(m.avatar, config.patrons.site).href } : {}) })) })) // a corporate patron's logo, drawn as a stencil
    : [];

  return {
    schema: 3, org: config.org ?? "", generatedAt: input.generatedAt ?? Math.floor(Date.now() / 1000), now,
    window: { days: window, from: since, to: now },
    repos, people, days, contributors, patrons, ...(bc ? { wards: wardsOf(bc, { now, config, hints: Object.fromEntries(input.repos.filter((r) => r.project).map((r) => [r.name, r.project])) }) } : {}),
    publicMembers: input.publicMembers ?? [],
    modules: [{ id: "retired", repos: Object.entries(repos).filter(([, r]) => r.flag === "archived").map(([n]) => n) }],
    source: input.source ?? "",
  };
}

// The public city: what anyone on the web may see. Private repositories are gone, people are named by their
// GitHub login (a committer with no login keeps the name they committed under, which is already public in git),
// teams and the roster are gone, and membership is marked only for public members.
export function project(data, mode = "public") {
  if (mode !== "public") return { ...data, projection: "members" };
  const hidden = new Set(Object.entries(data.repos).filter(([, r]) => r.private).map(([n]) => n));
  const login = new Map(data.people.filter((p) => p.gh).map((p) => [p.n, p.gh]));
  const who = (n) => login.get(n) ?? n;
  const pub = new Set(data.publicMembers ?? []);
  const repos = Object.fromEntries(Object.entries(data.repos).filter(([n]) => !hidden.has(n)).map(([n, r]) => [n, {
    ...r, top: r.top.map(([w, c]) => [who(w), c]), latest: r.latest.map(([at, w, s]) => [at, who(w), s]),
  }]));
  const people = data.people.filter((p) => !p.bc).map((p) => { // someone only on Basecamp is in the members' city only
    const repos = p.repos.filter(([r]) => !hidden.has(r));
    const o = { ...p, n: who(p.n), repos, latest: p.latest.filter(([, r]) => !hidden.has(r)), focus: "" };
    delete o.teams; delete o.member; delete o.w30; delete o.w7; delete o.wards; delete o.av;
    if (p.gh && pub.has(p.gh)) o.member = true;
    return o;
  });
  const days = data.days.map((d) => ({ ...d, top: d.top.map(([w, c]) => [who(w), c]), repos: d.repos.filter(([r]) => !hidden.has(r)), latest: d.latest.filter(([, , r]) => !hidden.has(r)).map(([at, w, r, s]) => [at, who(w), r, s]) }));
  const contributors = (data.contributors ?? []).map((c) => ({ ...c, repos: c.repos.filter(([r]) => !hidden.has(r)) })).filter((c) => c.repos.length);
  const modules = data.modules.map((m) => ({ ...m, repos: m.repos.filter((r) => !hidden.has(r)) }));
  // a ward stands dark in the public city: that it exists, and the public repositories linked to it
  const wards = data.wards ? Object.fromEntries(Object.entries(data.wards).map(([id, w]) => [id, { repos: (w.repos ?? []).filter((r) => !hidden.has(r)) }])) : undefined;
  const out = { ...data, projection: "public", repos, people, days, contributors, modules, ...(wards ? { wards } : {}) };
  delete out.publicMembers;
  return out;
}
