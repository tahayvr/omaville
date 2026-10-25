// The city's event log: append-only, one row per event, a sequence number per row, an event id that can be
// appended only once. It lives in the database's `events` table (db/schema.js) and every call is async.
import { and, asc, count, gt, gte, lt, max, eq } from "drizzle-orm";
import { events } from "../db/schema.js";
import { publicEvent } from "./events.mjs";

const clamp = (t) => Math.max(0, Math.min(2 ** 31 - 1, Math.floor(Number(t) || 0))); // times are seconds, kept within 32 bits
const CHUNK = 500; // rows per insert

export function createLog(db) {
  const row = (r) => ({ ...r.body, seq: Number(r.seq) });
  const shown = (publicOnly) => (e) => (publicOnly ? { seq: e.seq, ...publicEvent(e) } : e);
  return {
    // append events; an id already in the log is dropped. Returns the appended events with their seq, in order.
    async append(list) {
      const out = [], seen = new Set();
      list = list.filter((e) => !seen.has(e.id) && seen.add(e.id)); // an id twice in one call is one event
      for (let i = 0; i < list.length; i += CHUNK) {
        const part = list.slice(i, i + CHUNK);
        const rows = part.map((e) => ({ id: e.id, time: clamp(e.time), kind: e.kind, repo: e.repo ?? "", private: !!e.private, actor: e.actor ?? "", body: e }));
        const got = await db.insert(events).values(rows).onConflictDoNothing({ target: events.id }).returning({ seq: events.seq, id: events.id });
        const seqOf = new Map(got.map((g) => [g.id, Number(g.seq)]));
        for (const e of part) if (seqOf.has(e.id)) out.push({ seq: seqOf.get(e.id), ...e });
      }
      return out.sort((a, b) => a.seq - b.seq);
    },
    // events after seq, oldest first; the public projection leaves out what the public city may not see
    async since(seq = 0, { limit = 500, publicOnly = true } = {}) {
      const rows = await db.select({ seq: events.seq, body: events.body }).from(events)
        .where(and(gt(events.seq, seq | 0), publicOnly ? eq(events.private, false) : undefined)).orderBy(asc(events.seq)).limit(limit);
      return rows.map(row).map(shown(publicOnly));
    },
    // events in a time range, for the replay, the film and the "since you were here" line
    async between(t0, t1, { limit = 5000, publicOnly = true } = {}) {
      const rows = await db.select({ seq: events.seq, body: events.body }).from(events)
        .where(and(gte(events.time, clamp(t0)), lt(events.time, clamp(t1)), publicOnly ? eq(events.private, false) : undefined)).orderBy(asc(events.time), asc(events.seq)).limit(limit);
      return rows.map(row).map(shown(publicOnly));
    },
    async top() { const [r] = await db.select({ seq: max(events.seq) }).from(events); return Number(r?.seq ?? 0); }, // the latest sequence number (the primary key's maximum: no scan)
    async status() {
      const [r] = await db.select({ n: count(), seq: max(events.seq), last: max(events.time) }).from(events);
      return { events: Number(r?.n ?? 0), seq: Number(r?.seq ?? 0), last: Number(r?.last ?? 0) };
    },
  };
}
