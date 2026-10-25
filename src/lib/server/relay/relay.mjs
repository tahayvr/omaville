// The relay: the city's single source of truth, one long-lived object in the app's server (src/hooks.server.js
// starts it, the routes under src/routes call it). It
//   - scans the org on its own schedule (collector/scan.mjs), grows the layout (engine.mjs) and keeps both, the
//     snapshot and the layout, in the database (Postgres, through Drizzle: db/), so a restart picks up where it left off;
//   - takes GitHub and Basecamp webhooks, appends them to the event log and folds them onto the snapshot
//     (state.mjs), keeping two cities over one log: the members' (everything) and the public one;
//   - serves the city as it is now, the live streams (Server-Sent Events), the replay and the year film.
// Every method takes and returns Web API Requests and Responses, so it runs under any server.
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { sql as q, eq, and, lt, lte, desc, max } from "drizzle-orm";
import { toEvents, seenEvents, patronEvents, patronTiers } from "./events.mjs";
import { filmFrames } from "./film.mjs";
import { basecampEvents, wardEvents, progressEvents } from "./basecamp.mjs";
import { basecampHistory } from "../collector/basecamp.mjs";
import { createLog } from "./log.mjs";
import { connect } from "../db/index.js";
import { events as eventsTable, meta as metaTable, checkpoints as checkpointsTable } from "../db/schema.js";
import { createState } from "./state.mjs";
import { scan } from "../collector/scan.mjs";
import { historyOf } from "../collector/github.mjs";
import { publicProblems } from "../collector/public.mjs";
import { layoutCity, publicLayout } from "../engine.mjs";
import { createWelcome } from "./welcome.mjs";

// opts:
//   config            city.config.json
//   database          the database URL (db/index.js): postgres://…, or pglite:memory / pglite:<folder>;
//                     db: instead, a connection made elsewhere ({ db, kind, close } from connect())
//   data              a base file for local work (re-read when it changes); no scan
//   sample            "members": a members' city invented from the base (sample.mjs), for local work
//   devSignin         a name everyone is signed in as (local work only; needs insecure); signin: sign-in is on
//   members           the members' city is on (default true); false: the public city alone, and nothing private is
//                     read or kept (no private repository, no private webhook event, no Basecamp)
//   insecure          unsigned GitHub webhooks and any Basecamp key are accepted (local work only)
//   scanEvery         minutes between scans (needs GITHUB_TOKEN); 0: none
export async function createRelay(opts = {}) {
  const env = opts.env ?? process.env, config = opts.config ?? {}, say = opts.log ?? ((s) => console.error(s));
  const secret = env.CITY_WEBHOOK_SECRET ?? "", insecure = !!opts.insecure, membersOn = opts.members ?? true; // no secret: GitHub's webhooks are refused (the scans alone)
  if (opts.devSignin && !insecure) throw new Error("a dev sign-in is for local work only (insecure)");
  const token = env.GITHUB_TOKEN || env.GH_TOKEN || "", adminToken = env.CITY_SNAPSHOT_TOKEN ?? "";
  const { db, kind: dbKind, close: closeDb } = opts.db ?? (await connect(opts.database ?? "pglite:memory")); // opts.db: a connection made elsewhere (db/index.js)
  // two cities from one log: the members' state (everything) keeps the master layout; the public state never sees
  // a private repository and takes new repositories' places from the master, so positions agree in both
  const log = createLog(db), members = createState(log, { config, includePrivate: true }), state = createState(log, { config, layoutSource: () => publicLayout(members.layout()) });
  const started = Date.now();
  const scanEvery = +(opts.scanEvery ?? (token && !opts.data ? 15 : 0));
  const LOGO_BASE = config.patrons?.site ? new URL(config.patrons.images ?? "/", config.patrons.site).href : "", logos = new Map(); // the logo proxy's source (config.patrons: site + images) and cache
  let lastScan = { at: 0, ok: null, note: "" }, base = null, baseMembers = null, backfill = { running: false }; // the full snapshots the states were built on
  const timers = [];

  // ---- the base: kept in the database (meta); checkpoints for
  // replay: the first base of each UTC day, so the city at any moment is the nearest one before it with the logged
  // events up to that moment folded on ----
  const getMeta = async (k) => (await db.select({ value: metaTable.value }).from(metaTable).where(eq(metaTable.key, k)).limit(1))[0]?.value;
  const putMeta = (k, v) => db.insert(metaTable).values({ key: k, value: v }).onConflictDoUpdate({ target: metaTable.key, set: { value: v } });
  const rowsOf = (r) => r.rows ?? r; // PGlite answers { rows }, postgres.js an array
  // appends and folds run one at a time, in log order, so a base swap never misses a live event
  let chain = Promise.resolve();
  const serial = (fn) => { const run = chain.then(fn); chain = run.catch(() => {}); return run; };
  const welcome = createWelcome({ env, config, getMeta, putMeta }); // off unless CITY_WELCOME=1
  // each contributor's first contribution (time and repository), from the log's history of public commits
  async function firsts() {
    const rows = rowsOf(await db.execute(q`SELECT actor, time, repo FROM (SELECT actor, time, repo, ROW_NUMBER() OVER (PARTITION BY actor ORDER BY time, seq) AS k FROM ${eventsTable} WHERE kind = 'commit.seen' AND private = false AND actor <> '') t WHERE k = 1`));
    return new Map(rows.map((r) => [r.actor, [Number(r.time), r.repo]]));
  }
  const withFirsts = (data, f) => (f.size && data.contributors ? { ...data, contributors: data.contributors.map((c) => (f.has(c.login) ? { ...c, first: f.get(c.login) } : c)) } : data);
  // data: the public snapshot; master: the layout of every repository; membersData: the members' snapshot (the
  // public one when there is no other, e.g. the sample)
  const setBase = (...a) => serial(() => setBaseNow(...a));
  async function setBaseNow(data, master, why, membersData = data) {
    const f = await firsts(), same = membersData === data; data = withFirsts(data, f); membersData = same ? data : withFirsts(membersData, f);
    const problems = publicProblems(data);
    if (problems.length) { say(`${why}: refused, the snapshot is not public (${problems.slice(0, 3).join("; ")})`); return false; }
    const layout = publicLayout(master), arrivals = [...patronEvents(base?.patrons, data.patrons, data.now, patronTiers(config)), ...wardEvents(baseMembers?.wards, membersData.wards, data.now)];
    const changed = data.generatedAt !== base?.generatedAt || JSON.stringify(layout) !== JSON.stringify(state.layout());
    const kept = { data, layout: master, ...(membersData === data ? {} : { members: membersData }) };
    // the two states are prepared (the log read), the base is written to the database, then both commit in one step
    // and the relay's references follow: a failure part way leaves the city in memory as it was, and at worst a base
    // in the database that the next boot takes
    const m = await members.prepare(membersData, master), p = await state.prepare(data, layout);
    await db.insert(checkpointsTable).values({ day: Math.floor(data.now / 86400), now: data.now, body: kept }).onConflictDoNothing({ target: checkpointsTable.day });
    await putMeta("base", kept);
    m.commit(); p.commit(); base = data; baseMembers = membersData;
    if (changed) announce({ generatedAt: data.generatedAt, digest: data.digest });
    await broadcastNow(await log.append(arrivals)); // a new corporate patron: its board is in the new snapshot, patron.new plays on it
    say(`${why}: base ${new Date(data.now * 1000).toISOString()}${changed ? "" : " (unchanged)"}`);
    return true;
  }
  const readJson = async (f) => JSON.parse(await readFile(f, "utf8"));

  // ---- the scan, on the relay's own schedule ----
  let scanning = null;
  function scanNow(why = "scan") {
    if (scanning) return scanning;
    return (scanning = (async () => {
      const t0 = Date.now();
      try {
        const seq0 = (await log.status()).seq; // the base's watermark: every event logged after this is newer than what the scan reads
        const both = await scan({ config, token, projection: "both", publicOnly: !membersOn, prev: { public: base, members: baseMembers }, log: (s) => say(`  ${s}`) });
        both.public.seq = seq0; both.members.seq = seq0;
        const history = await log.append(seenEvents(both.seen)); // the scan appends what it saw to the log (each sha once): the history replay reads
        if (history.length) say(`  history: ${history.length} commits appended to the log`);
        const master = layoutCity(both.members, config, members.layout()); // live placements are kept: the layout only grows (a new database lays it out from scratch)
        const ok = await setBase(both.public, master, why, both.members);
        lastScan = { at: Math.floor(Date.now() / 1000), ok, note: `${Math.round((Date.now() - t0) / 1000)} s` };
      } catch (e) { lastScan = { at: Math.floor(Date.now() / 1000), ok: false, note: e.message.slice(0, 200) }; say(`${why} failed: ${e.message.slice(0, 200)}`); }
      finally { scanning = null; }
    })());
  }

  // a base file for local work: re-read when it changes; with sample "members", a members' city invented beside it
  let dataMtime = 0;
  async function watchData() {
    try {
      const m = (await stat(opts.data)).mtimeMs; if (m === dataMtime) return; dataMtime = m;
      const data = await readJson(opts.data); data.seq = (await log.status()).seq; // the file is the city as of now: the log's top is its watermark
      if (opts.sample !== "members") return void (await setBase(data, layoutCity(data, config, members.layout()), `base from ${opts.data}`));
      const { sampleMembers } = await import("../sample.mjs"), membersData = sampleMembers(data); membersData.seq = data.seq; // its private repository and wards are placed like a scan's
      await setBase(data, layoutCity(membersData, config, members.layout()), `base from ${opts.data}, with the invented members' sample`, membersData);
    } catch (e) { say(`base not read from ${opts.data}: ${e.message.slice(0, 120)}`); }
  }

  // ---- the streams: one set of open pages per city ----
  const clients = new Set(), memberClients = new Set(), ingestMs = []; let hooks = 0; // the status shows ingest time and fan-out
  const send = (msg, also = true) => { for (const c of clients) c.write(msg); if (also) for (const c of memberClients) c.write(msg); };
  const sendMembers = (msg) => { for (const c of memberClients) c.write(msg); };
  const sse = (e) => `id: ${e.seq}\nevent: city\ndata: ${JSON.stringify(e)}\n\n`;
  // a release: everyone whose house was built since the repository's previous release, and who contributed to it,
  // shipped their first contribution in it, so a flag rises on their roof
  async function flagsFor(e) {
    if (e.kind !== "release" || e.private) return e;
    const [prev] = await db.select({ t: max(eventsTable.time) }).from(eventsTable).where(and(eq(eventsTable.kind, "release"), eq(eventsTable.repo, e.repo), lt(eventsTable.seq, e.seq)));
    const born = members.layout()?.houseBorn ?? {}, since = Number(prev?.t ?? 0) || (e.time - 30 * 86400);
    const flags = Object.entries(born).filter(([login, t]) => t > since && t <= e.time && (state.current()?.contributors ?? []).some((c) => c.login === login && c.repos.some(([r]) => r === e.repo))).map(([l]) => l);
    return flags.length ? { ...e, flags } : e;
  }
  // each event goes out with its delta: the signals it changed, folded onto the snapshot (inside serial)
  async function broadcastNow(list) {
    for (let e of list) {
      e = await flagsFor(e);
      const dm = members.fold(e); // the members' city first: it owns the master layout a new repository is placed in
      sendMembers(sse(dm ? { ...e, delta: dm } : e));
      if (e.private) continue;
      const dp = state.fold(e), { private: _, ...pub } = e;
      send(sse(dp ? { ...pub, delta: dp } : pub), false);
    }
  }
  function announce(snap) { send(`event: snapshot\ndata: ${JSON.stringify(snap)}\n\n`); } // a new scan: pages fetch data.json and redraw what changed
  timers.push(setInterval(() => send(": keep-alive\n\n"), 25000));

  const CATCH_UP = opts.catchUp ?? 500; // events a reconnecting page is given from the log; past that it refetches the city
  // the heavy public endpoints (the year film, the city at a moment, the events between two moments) read a large part
  // of the log for one answer: an answer is kept while the log's top stands, and for a while even as it moves
  const CACHE_MAX = 64, CACHE_HOLD = opts.cacheHold ?? 60000, cache = new Map();
  async function cached(key, compute) {
    const top = await log.top(), hit = cache.get(key);
    if (hit && (hit.top === top || Date.now() - hit.at < CACHE_HOLD)) return { value: hit.value, hit: true };
    const value = await compute();
    cache.delete(key); cache.set(key, { top, at: Date.now(), value });
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value); // the oldest answer goes
    return { value, hit: false };
  }
  const served = ({ value, hit }, status = 200) => json(value, status, { "x-cache": hit ? "hit" : "miss" });
  const json = (obj, status = 200, headers = {}) => Response.json(obj, { status, headers: { "access-control-allow-origin": "*", "cache-control": "no-store", ...headers } });
  const authorized = (req) => !!adminToken && req.headers.get("authorization") === `Bearer ${adminToken}`;
  const signed = (req, body) => {
    if (insecure && !secret) return true;
    if (!secret) return false;
    const sig = req.headers.get("x-hub-signature-256") ?? "", want = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
    return sig.length === want.length && timingSafeEqual(Buffer.from(sig), Buffer.from(want));
  };
  const MAX_BODY = 25 * 1024 * 1024;
  const bodyOf = async (req) => { const b = Buffer.from(await req.arrayBuffer()); if (b.length > MAX_BODY) throw new Error("too large"); return b; };

  // ---- the API the routes call ----
  const relay = {
    config, log, insecure,
    privateRepos: () => members.layout()?.private ?? [], // every repository that was ever private (the master layout), for the page's config
    // the city now, for the page's load: { data, layout } (mem: the members' city), or null before the first base
    city: (mem) => { const s = mem ? members : state; return s.current() ? { data: s.current(), layout: s.layout() } : null; },
    // the city now: the snapshot with every newer event folded on (mem: the members' city)
    data: (mem) => ((mem ? members : state).current() ? json((mem ? members : state).current()) : json({ error: "no snapshot yet" }, 503)),
    layout: (mem) => ((mem ? members : state).layout() ? json((mem ? members : state).layout()) : json({ error: "no layout yet" }, 503)),

    // Server-Sent Events: `city` per event (with its delta), `snapshot` per new scan; Last-Event-ID (or ?since=)
    // catches a page up
    stream(req, mem) {
      const url = new URL(req.url), from = req.headers.get("last-event-id") ?? url.searchParams.get("since"), set = mem ? memberClients : clients, enc = new TextEncoder();
      let client;
      const body = new ReadableStream({
        async start(ctl) {
          // the page joins the set first, so an event broadcast while its catch-up is read from the log is held back,
          // then sent after it (less what the catch-up already carried); nothing falls between the two
          let held = [];
          const out = (s) => { try { ctl.enqueue(enc.encode(s)); } catch { set.delete(client); } };
          client = { write: (s) => (held ? held.push(s) : out(s)) };
          set.add(client);
          out(`retry: 3000\nevent: hello\ndata: ${JSON.stringify({ ...(await log.status()), generatedAt: (mem ? baseMembers : base)?.generatedAt ?? null, ...(mem ? { members: true } : {}) })}\n\n`);
          let last = -1;
          if (from !== null && from !== undefined) { // a page that was here catches up; a catch-up cut short tells it to fetch the city afresh
            const list = await log.since(+from || 0, { limit: CATCH_UP, publicOnly: !mem });
            for (const e of list) { out(sse(e)); last = e.seq; }
            if (list.length >= CATCH_UP) out(`event: resync\ndata: ${JSON.stringify({ after: last })}\n\n`);
          }
          const queued = held; held = null;
          for (const s of queued) { const id = /^id: (\d+)\n/.exec(s); if (!id || +id[1] > last) out(s); }
        },
        cancel() { set.delete(client); },
      });
      req.signal?.addEventListener("abort", () => set.delete(client));
      return new Response(body, { headers: { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no", ...(mem ? {} : { "access-control-allow-origin": "*" }) } });
    },
    async recent(url) { const limit = Math.min(500, +(url.searchParams.get("limit") ?? 50)); return json((await log.since(+(url.searchParams.get("since") ?? 0), { limit: 500 })).slice(-limit)); },
    // replay: the events in a time range, and the city at a moment
    async between(url, mem) {
      const t0 = +(url.searchParams.get("from") ?? 0), t1 = +(url.searchParams.get("to") ?? Math.floor(Date.now() / 1000)), kinds = url.searchParams.get("kinds")?.split(",");
      return served(await cached(`between|${mem ? 1 : 0}|${t0}|${t1}|${kinds?.join(",") ?? ""}`, async () => (await log.between(t0, t1, { limit: 20000, publicOnly: !mem })).filter((e) => !kinds || kinds.includes(e.kind))));
    },
    async stateAt(url, mem) {
      const t = +(url.searchParams.get("t") ?? 0);
      const got = await cached(`at|${mem ? 1 : 0}|${t}`, async () => {
        const [cp] = await db.select({ body: checkpointsTable.body }).from(checkpointsTable).where(lte(checkpointsTable.now, t)).orderBy(desc(checkpointsTable.day)).limit(1);
        if (!cp) return null;
        const b = cp.body, s = createState(log, { config, includePrivate: mem });
        await s.setBase(mem ? b.members ?? b.data : b.data, mem ? b.layout : publicLayout(b.layout), { until: t });
        return { data: s.current(), layout: s.layout() };
      });
      return got.value ? served(got) : json({ error: "no checkpoint before that moment" }, 404);
    },
    // the year film's monthly frames (client/film.js)
    async film(url, mem) {
      const to = Math.min(+(url.searchParams.get("to") ?? 0) || state.base()?.now || Math.floor(Date.now() / 1000), 2 ** 31 - 1), from = to - 365 * 86400;
      return served(await cached(`film|${mem ? 1 : 0}|${to}`, async () => filmFrames(await log.between(0, to + 1, { limit: 2_000_000, publicOnly: !mem }), { from, to, frames: 12 })));
    },
    // corporate patrons' logos from the patrons site's image folder only, same origin (WebGL reads them)
    async logo(file) {
      if (!LOGO_BASE || !/^[a-z0-9._-]+\.(webp|png|svg|jpe?g)$/i.test(file)) return new Response(null, { status: 404 });
      let got = logos.get(file);
      if (!got) {
        try { const r = await fetch(`${LOGO_BASE}${file}`, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(String(r.status)); got = { type: r.headers.get("content-type") ?? "application/octet-stream", body: Buffer.from(await r.arrayBuffer()) }; if (got.body.length < 2_000_000) logos.set(file, got); }
        catch { return new Response(null, { status: 404 }); }
      }
      return new Response(got.body, { headers: { "content-type": got.type, "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff", ...(/svg/.test(got.type) ? { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'" } : {}) } });
    },
    async status() {
      const a = [...ingestMs].sort((x, y) => x - y);
      return json({ ...(await log.status()), database: dbKind, streams: clients.size, members: membersOn, memberStreams: memberClients.size, signin: !!(opts.signin || opts.devSignin), welcome: welcome.on, hooks, ingest: a.length ? { p50: +a[Math.floor(a.length / 2)].toFixed(2), p95: +a[Math.floor(a.length * 0.95)].toFixed(2), n: a.length } : null, uptime: Math.round((Date.now() - started) / 1000), base: state.base(), scan: { every: scanEvery, ...lastScan, running: !!scanning }, backfill });
    },

    // a GitHub webhook (X-Hub-Signature-256 checked against CITY_WEBHOOK_SECRET)
    async hook(req) {
      const t0 = performance.now();
      let raw; try { raw = await bodyOf(req); } catch { return new Response(null, { status: 413 }); }
      if (!signed(req, raw)) return json({ error: "bad signature" }, 401);
      let payload; try { payload = JSON.parse(raw.toString("utf8")); } catch { return json({ error: "not JSON" }, 400); }
      const name = req.headers.get("x-github-event") ?? "", delivery = req.headers.get("x-github-delivery") ?? "";
      if (name === "ping") return json({ ok: true });
      const appended = await serial(async () => { const got = await log.append(toEvents(name, payload, { delivery, config }).filter((e) => membersOn || !e.private)); await broadcastNow(got); return got; });
      void Promise.allSettled(appended.map((e) => welcome.maybe(e))); // after the answer; a failure is logged there, never thrown here
      ingestMs.push(performance.now() - t0); if (ingestMs.length > 500) ingestMs.shift(); hooks++;
      if (appended.length) say(`${name}: ${appended.map((e) => `${e.seq} ${e.kind} ${e.repo}`).join(", ")}`);
      return json({ accepted: appended.length }, 202);
    },
    // Basecamp's per-project webhooks, at a secret path (basecamp.mjs)
    async basecampHook(req, given) {
      const key = env.CITY_BASECAMP_HOOK_KEY ?? "";
      if (!membersOn) return new Response(null, { status: 404 });
      if (!insecure && !(key && given.length === key.length && timingSafeEqual(Buffer.from(given), Buffer.from(key)))) return new Response(null, { status: 404 });
      let payload; try { payload = JSON.parse((await bodyOf(req)).toString("utf8")); } catch { return json({ error: "not JSON" }, 400); }
      const appended = await serial(async () => { const got = await log.append(basecampEvents(payload)); await broadcastNow(got); return got; }); hooks++;
      if (appended.length) say(`basecamp: ${appended.map((e) => `${e.seq} ${e.kind} ward ${e.ward}`).join(", ")}`);
      return json({ accepted: appended.length }, 202);
    },
    // the org's whole history into the log, once (each event at most once)
    backfill(req) {
      if (!authorized(req)) return json({ error: "bad token" }, 401); if (!token) return json({ error: "no GITHUB_TOKEN" }, 409);
      if (backfill.running) return json({ error: "running", ...backfill }, 409);
      backfill = { running: true, done: 0, of: 0, appended: 0, pages: 0 }; // counts only: the status is public, and the history reads private repositories too
      const bot = new RegExp(config.bots ?? "\\[bot\\]$", "i"), routine = new RegExp(config.routine?.who ?? "$^", "i"), routineSubject = new RegExp(config.routine?.subject ?? "$^", "i");
      historyOf({ org: config.org, token, publicOnly: !membersOn, mirrors: config.layout?.mirrors ?? [], isBot: (who, subject) => bot.test(who) || routine.test(who) || routineSubject.test(subject ?? ""), onRepo: (d, of) => { Object.assign(backfill, { done: d, of }); }, onPage: (name, n) => { backfill.pages += n; }, log: (s) => say(`  ${s}`) })
        .then(async (events) => { // and Basecamp's history, when the city's account is configured (members only)
          if (membersOn && config.basecamp?.account && env.BASECAMP_TOKEN) try { events = events.concat(progressEvents(await basecampHistory({ account: config.basecamp.account, token: env.BASECAMP_TOKEN, log: (s) => say(`  ${s}`) }))); } catch (e) { say(`  basecamp history skipped: ${e.message.slice(0, 160)}`); }
          backfill.appended = (await log.append(events)).length; backfill.running = false; say(`backfill: ${backfill.appended} new events`); if (base) await setBase(base, members.layout(), "backfill", baseMembers);
        })
        .catch((e) => { backfill = { running: false, error: e.message.slice(0, 200) }; });
      return json({ started: true }, 202);
    },
    scan(req) { if (!authorized(req)) return json({ error: "bad token" }, 401); if (!token) return json({ error: "no GITHUB_TOKEN" }, 409); scanNow("scan on request"); return json({ scanning: true }, 202); },
    // a base from elsewhere: {data, layout, members?} or data.json
    async snapshot(req) {
      if (!authorized(req)) return json({ error: "bad token" }, 401);
      try { const b = JSON.parse((await bodyOf(req)).toString("utf8")); const ok = await setBase(b.data ?? b, b.layout ?? layoutCity(b.members ?? b.data ?? b, config, members.layout()), "snapshot posted", b.members ?? b.data ?? b); return json({ ok }, ok ? 200 : 422); }
      catch (e) { return json({ error: e.message.slice(0, 120) }, 400); }
    },
    async close() { for (const t of timers) clearInterval(t); await chain; await closeDb(); },
  };

  // ---- boot: the kept base, else a base file, else the first scan ----
  const kept = await getMeta("base");
  if (kept) { const b = kept; base = b.data; baseMembers = b.members ?? b.data; await members.setBase(baseMembers, b.layout); await state.setBase(b.data, publicLayout(b.layout)); say(`base from the database: ${new Date(b.data.now * 1000).toISOString()}`); }
  if (opts.data) { await watchData(); timers.push(setInterval(watchData, 30000)); }
  if (scanEvery) { if (!kept || Date.now() / 1000 - (base?.generatedAt ?? 0) > scanEvery * 60) scanNow("first scan"); timers.push(setInterval(() => scanNow(), scanEvery * 60 * 1000)); }

  for (const t of timers) t.unref?.();
  say(`relay: ${insecure ? "unsigned hooks accepted" : secret ? "signed hooks only" : "no CITY_WEBHOOK_SECRET, hooks refused"}${membersOn ? "" : ", public city only"}, scan ${scanEvery ? `every ${scanEvery} min` : "off"}, log ${(await log.status()).events} events in ${dbKind}${opts.devSignin ? `, everyone signed in as ${opts.devSignin}` : ""}`);
  return relay;
}
