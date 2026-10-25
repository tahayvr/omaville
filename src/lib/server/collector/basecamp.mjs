// Basecamp, read for the members' city: the projects the city's account can see (a real person account, added to
// every project by an admin; it self-admits to open ones), their people, hill charts, to-do lists, card tables,
// message subjects, check-ins and files, and the account's progress report for who did what in the window.
// Bodies, comments and chat lines are never read. Whatever the account cannot see is simply not there yet: a
// project that appears later gets its ward then.
//
//   fromBasecamp({ account, token, now, since, log }) → { projects, people, events }
//
// Auth: an OAuth access token for the city's account (BASECAMP_TOKEN). The API is bc3-api (3.basecampapi.com).
const DAY = 86400;
const API = (account) => `https://3.basecampapi.com/${account}`;

export function basecampClient(account, token, { log = () => {}, fetcher = fetch } = {}) {
  async function call(url, tries = 4) {
    for (let attempt = 0; ; attempt++) {
      let res;
      try { res = await fetcher(url, { signal: AbortSignal.timeout(60000), headers: { authorization: `Bearer ${token}`, accept: "application/json", "user-agent": "omaville (https://github.com/omacom)" } }); }
      catch (e) { if (attempt >= tries) throw e; await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt)); continue; }
      if (res.ok) return { body: await res.json(), next: (res.headers.get("link") ?? "").match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null };
      if (res.status === 404 || res.status === 403) return { body: null, next: null }; // a tool the account cannot see
      if (!(res.status === 429 || res.status >= 500) || attempt >= tries) throw new Error(`${res.status} ${url}`);
      const wait = Math.min(60000, (+(res.headers.get("retry-after") ?? 0) * 1000) || 1000 * 2 ** attempt);
      log(`basecamp: retry in ${Math.round(wait / 1000)}s: ${res.status}`); await new Promise((r) => setTimeout(r, wait));
    }
  }
  const get = async (path) => (await call(path.startsWith("http") ? path : API(account) + path)).body;
  async function all(path, max = 50) { // every page (Link: rel="next")
    const out = []; let url = path.startsWith("http") ? path : API(account) + path;
    for (let n = 0; url && n < max; n++) { const { body, next } = await call(url); if (Array.isArray(body)) out.push(...body); url = next; }
    return out;
  }
  return { get, all };
}

const sec = (t) => Math.floor(Date.parse(t ?? "") / 1000) || 0;
const tool = (p, name) => (p.dock ?? []).find((d) => d.name === name && d.enabled !== false);

export async function fromBasecamp({ account, token, now, since, log = console.error, fetcher = fetch }) {
  const bc = basecampClient(account, token, { log, fetcher });
  const list = (await bc.all("/projects.json")).filter((p) => p.status !== "trashed");
  log(`basecamp: ${list.length} projects`);
  const people = new Map(), projects = [];
  const addPerson = (x) => { if (x?.id && !people.has(x.id)) people.set(x.id, { id: x.id, name: x.name ?? "", email: (x.email_address ?? "").toLowerCase(), avatar: x.avatar_url ?? "" }); };
  for (const p of list) {
    const out = { id: p.id, name: p.name ?? "", status: p.status ?? "active", created: sec(p.created_at), url: p.app_url ?? "", people: [], lists: [], hill: [], columns: [], messages: [], checkins: 0, uploads: 0 };
    try {
      for (const x of await bc.all(`/projects/${p.id}/people.json`)) { addPerson(x); out.people.push(x.id); }
      const todoset = tool(p, "todoset");
      if (todoset) {
        for (const l of await bc.all(`/buckets/${p.id}/todosets/${todoset.id}/todolists.json`)) {
          const [done, total] = String(l.completed_ratio ?? "0/0").split("/").map(Number);
          out.lists.push({ id: l.id, title: l.title ?? "", done: done || 0, open: Math.max(0, (total || 0) - (done || 0)) });
        }
        const hill = await bc.get(`/buckets/${p.id}/todosets/${todoset.id}/hill.json`); // a hill chart, when the project tracks one
        for (const d of hill?.dots ?? []) out.hill.push({ title: d.label ?? "", pos: Math.max(0, Math.min(100, +d.position || 0)) });
      }
      for (const board of (p.dock ?? []).filter((d) => (d.name === "kanban_board" || d.name === "card_table") && d.enabled !== false)) {
        const table = await bc.get(`/buckets/${p.id}/card_tables/${board.id}.json`);
        for (const col of table?.lists ?? []) {
          const cards = col.cards_count ? await bc.all(`/buckets/${p.id}/card_tables/lists/${col.id}/cards.json`, 4) : [];
          out.columns.push({ id: col.id, title: col.title ?? "", kind: /Done/.test(col.type ?? "") ? "done" : /Triage/.test(col.type ?? "") ? "triage" : "column", n: col.cards_count ?? cards.length, cards: cards.slice(0, 24).map((c) => ({ id: c.id, title: c.title ?? "" })) });
        }
      }
      const board = tool(p, "message_board");
      if (board) for (const m of await bc.all(`/buckets/${p.id}/message_boards/${board.id}/messages.json`, 3)) { const at = sec(m.created_at); if (at > since) out.messages.push({ id: m.id, subject: m.subject ?? "", at }); }
      const quest = tool(p, "questionnaire");
      if (quest) for (const q of await bc.all(`/buckets/${p.id}/questionnaires/${quest.id}/questions.json`)) out.checkins += q.answers_count ?? 0;
      const vault = tool(p, "vault");
      if (vault) { const v = await bc.get(`/buckets/${p.id}/vaults/${vault.id}.json`); out.uploads = (v?.uploads_count ?? 0) + (v?.documents_count ?? 0); }
    } catch (e) { log(`basecamp: project ${p.id} partly read: ${e.message.slice(0, 120)}`); }
    projects.push(out);
  }
  // who did what, across every visible project, in the window: the progress report, newest first
  const events = [];
  for (const e of await bc.all("/reports/progress.json", 40)) {
    const at = sec(e.created_at); if (at <= since) break;
    if (at > now) continue;
    addPerson(e.creator);
    events.push({ at, kind: e.action ?? e.kind ?? "", type: e.recording?.type ?? "", project: e.bucket?.id ?? 0, person: e.creator?.id ?? 0 });
  }
  log(`basecamp: ${people.size} people, ${events.length} events in the window`);
  return { projects, people: [...people.values()], events };
}

// Basecamp's history for the backfill: the progress report, every page the feed keeps (newest first)
export async function basecampHistory({ account, token, log = console.error, fetcher = fetch, pages = 500 }) {
  const all = await basecampClient(account, token, { log, fetcher }).all("/reports/progress.json", pages);
  log(`basecamp history: ${all.length} entries`);
  return all;
}

// The wards in the members' city: one per project, from what the scan read. The public city keeps only that a
// ward exists (its id, which is opaque, and the repositories linked to it), so its buildings stand dark.
export function wardsOf(bc, { now, config = {}, hints = {} }) { // hints: repository → project id, from each repository's hint file (config.hints)
  const links = {}, wards = {};
  for (const [repo, id] of Object.entries(hints)) (links[id] ??= []).push(repo); // a repository's hint file links it to its project
  for (const p of bc?.projects ?? []) {
    if (p.status === "trashed") continue;
    const evs = (bc.events ?? []).filter((e) => e.project === p.id);
    wards[p.id] = {
      name: p.name, url: p.url, archived: p.status === "archived" || undefined, repos: links[p.id] ?? [], people: p.people.length,
      hill: p.hill.map((h) => [h.title.slice(0, 60), h.pos]),
      lists: p.lists.length, open: p.lists.reduce((s, l) => s + l.open, 0), done: p.lists.reduce((s, l) => s + l.done, 0),
      building: p.lists.filter((l) => l.done > 0 && l.open > 0).length, // lists under way: a construction site each
      columns: p.columns.map((c) => [c.title.slice(0, 40), c.n, c.kind, c.cards.slice(0, 12).map((x) => x.title.slice(0, 80))]),
      messages7: p.messages.filter((m) => m.at > now - 7 * DAY).length, subjects: p.messages.slice(0, 5).map((m) => [m.at, m.subject.slice(0, 120)]),
      checkins: p.checkins, uploads: p.uploads, events7: evs.filter((e) => e.at > now - 7 * DAY).length, events30: evs.length,
      last: evs.reduce((m, e) => Math.max(m, e.at), 0) || undefined,
    };
  }
  return wards;
}
