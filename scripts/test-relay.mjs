#!/usr/bin/env node
// Tests for the event spine: webhook mapping, the log's dedupe and public projection, and every event kind having
// an effect. Plain Node, no framework: exits non-zero on the first failure.
import assert from "node:assert/strict";
import { toEvents, KINDS, patronEvents, patronTiers } from "../src/lib/server/relay/events.mjs";
import { createLog } from "../src/lib/server/relay/log.mjs";
import { connect } from "../src/lib/server/db/index.js";
import { EFFECTS, primitivesFor } from "../src/lib/city/effects.js";
import { createState, applyDelta } from "../src/lib/server/relay/state.mjs";
import { filmFrames } from "../src/lib/server/relay/film.mjs";

const repo = (name, priv = false) => ({ name, private: priv, default_branch: "master" });
const config = { bots: "\\[bot\\]$", routine: { who: "^omabot$", subject: "^chore: sync" } };
let n = 0; const t = async (name, f) => { await f(); n++; console.error(`ok ${name}`); };
const freshLog = async () => createLog((await connect("pglite:memory")).db); // a database of its own (PGlite, in memory)

await t("push to the default branch is one commit event, bots counted apart", async () => {
  const [e, ...rest] = toEvents("push", { ref: "refs/heads/master", after: "abc", repository: repo("omarchy"), sender: { login: "dhh" }, head_commit: { message: "Fix it\nbody", timestamp: "2026-10-18T10:00:00Z" },
    commits: [{ distinct: true, message: "Fix it", author: { username: "dhh" } }, { distinct: true, message: "chore: sync themes", author: { username: "x" } }, { distinct: false, message: "dup" }, { distinct: true, message: "Merge pull request #1 from a/b" }] }, { config });
  assert.equal(rest.length, 0); assert.equal(e.kind, "commit"); assert.equal(e.n, 1); assert.equal(e.bots, 1); assert.equal(e.title, "Fix it"); assert.equal(e.id, "gh:commit:abc");
});
await t("push to another branch is a branch event; deleting a branch is nothing", async () => {
  assert.equal(toEvents("push", { ref: "refs/heads/wip", after: "d", repository: repo("omarchy"), commits: [{ distinct: true, message: "wip" }] })[0].kind, "branch");
  assert.equal(toEvents("push", { ref: "refs/heads/wip", deleted: true, repository: repo("omarchy"), commits: [] }).length, 0);
});
await t("pull requests open, merge and close", async () => {
  const pr = (action, extra) => toEvents("pull_request", { action, pull_request: { number: 7, title: "T", ...extra }, repository: repo("gliff") })[0]?.kind;
  assert.equal(pr("opened"), "pr.open"); assert.equal(pr("closed", { merged: true }), "pr.merge"); assert.equal(pr("closed", { merged: false }), "pr.close"); assert.equal(pr("labeled"), undefined);
});
await t("a plugin's webhook becomes its event, with an effect, and a private repository stays private", async () => {
  const [e] = toEvents("star", { action: "created", starred_at: "2026-10-18T10:00:00Z", repository: repo("gliff", true), sender: { login: "ana" } }, { delivery: "d-1" });
  assert.equal(e.kind, "star"); assert.equal(e.id, "gh:star:d-1"); assert.equal(e.private, true); assert.equal(e.actor, "ana"); assert.equal(e.time, 1792317600);
  assert.equal(toEvents("star", { action: "deleted", repository: repo("gliff") }).length, 0);
  assert.ok(primitivesFor(e, { roofs: { gliff: [1, 2, 3] } }).length > 0);
});
await t("a new corporate patron on the site is one patron.new; individual patrons and the first snapshot are not", async () => {
  const tiers = (corp, people) => [{ id: "distinguished-corporate-patrons", members: corp.map((name) => ({ name })) }, { id: "founding-patrons", members: people.map((name) => ({ name })) }];
  const corp = patronTiers({ patrons: { boards: { tier: "distinguished-corporate-patrons", label: "distinguished corporate patron" } } });
  assert.equal(patronEvents(null, tiers(["A"], []), 1, corp).length, 0);
  const ev = patronEvents(tiers(["A"], ["P"]), tiers(["A", "B"], ["P", "Q"]), 5, corp);
  assert.equal(ev.length, 1); assert.equal(ev[0].kind, "patron.new"); assert.equal(ev[0].name, "B"); assert.equal(ev[0].id, "patron:distinguished-corporate-patrons:B");
  assert.deepEqual(primitivesFor(ev[0], { patronAt: { B: [1, 2, 3] } })[0].at, [1, 2, 3]);
});
await t("the year film's frames count the log's commits per month, bots left out, and know what came later", async () => {
  const D = 86400, c = (time, repo, actor, bot) => ({ kind: "commit.seen", time, repo, actor, ...(bot ? { bot: true } : {}) });
  const ev = [c(5 * D, "a", "x"), c(6 * D, "a", "bot", true), c(40 * D, "b", "y"), c(41 * D, "a", "x"), { kind: "release", time: 42 * D, repo: "a", ref: "v1" }, c(70 * D, "a", "x")];
  const f = filmFrames(ev, { from: 0, to: 60 * D, frames: 2 });
  assert.deepEqual(f.frames[0].repos, { a: 1 }); assert.deepEqual(f.frames[1].repos, { a: 2, b: 1 });
  assert.deepEqual(f.frames[1].newRepos, [[40 * D, "b"]]); assert.equal(f.frames[1].releases.length, 1);
  assert.deepEqual(f.now.repos, { a: 3, b: 1 }); assert.deepEqual(f.now.people, { x: 3, y: 1 });
  assert.equal(f.frames[1].days.reduce((s, n) => s + n, 0), 2); // the 30 days before day 60: b and a, not the bot
});
await t("CI, releases, issues, repositories, members", async () => {
  assert.equal(toEvents("workflow_run", { action: "completed", workflow_run: { id: 1, conclusion: "failure" }, repository: repo("a") })[0].kind, "ci.fail");
  assert.equal(toEvents("workflow_run", { action: "completed", workflow_run: { id: 1, conclusion: "cancelled" }, repository: repo("a") }).length, 0);
  assert.equal(toEvents("release", { action: "published", release: { id: 2, tag_name: "v1" }, repository: repo("a") })[0].kind, "release");
  assert.equal(toEvents("release", { action: "published", release: { id: 2, draft: true }, repository: repo("a") }).length, 0);
  assert.equal(toEvents("issues", { action: "opened", issue: { number: 3 }, repository: repo("a") })[0].kind, "issue.open");
  assert.equal(toEvents("repository", { action: "created", repository: repo("new") })[0].kind, "repo.new");
  assert.equal(toEvents("organization", { action: "member_added", membership: { user: { login: "z" } } })[0].kind, "member.join");
});
await t("every kind has an effect, and effects anchor on the repository's roof", async () => {
  for (const k of KINDS) assert.ok(EFFECTS[k], `no effect for ${k}`);
  const p = primitivesFor({ kind: "commit", repo: "a", n: 40 }, { hub: [0, 0, 1], crown: [0, 0, 2], roofs: { a: [5, 5, 5] } });
  assert.deepEqual(p[0].from, [5, 5, 5]); assert.equal(p[0].crates, 6);
});
const log = await freshLog();
await t("the log appends once per id and numbers events in order", async () => {
  const evs = [{ id: "x1", time: 1, kind: "commit", repo: "a", n: 1 }, { id: "x2", time: 2, kind: "pr.open", repo: "b" }, { id: "x1", time: 1, kind: "commit", repo: "a" }];
  const got = await log.append(evs);
  assert.deepEqual(got.map((e) => e.seq), [1, 2]);
  assert.equal((await log.append([evs[0]])).length, 0);
  assert.deepEqual(await log.status(), { events: 2, seq: 2, last: 2 });
});
await t("the public stream never carries a private repository", async () => {
  await log.append(toEvents("pull_request", { action: "opened", pull_request: { number: 9, title: "secret" }, repository: repo("hidden", true) }));
  assert.equal((await log.since(0, { publicOnly: false })).length, 3);
  const pub = await log.since(0);
  assert.equal(pub.length, 2); assert.ok(pub.every((e) => !("private" in e) && e.repo !== "hidden"));
  assert.deepEqual((await log.since(1)).map((e) => e.seq), [2]);
});
const snap = { now: 1000, generatedAt: 900, window: { from: 0 }, days: Array.from({ length: 30 }, (_, i) => ({ at: i * 86400, n: 0 })), repos: { a: { total: 10, c30: 2, c7: 1, pr: 3, unmerged: 0, days: Array(30).fill(0), latest: [] } } };
const log2 = await freshLog(), st = createState(log2);
await t("events newer than the snapshot fold into signals and come out as deltas", async () => {
  await st.setBase(snap);
  const [e] = await log2.append([{ id: "c1", time: 29 * 86400 + 50, kind: "commit", repo: "a", n: 3, actor: "dhh", title: "Ship" }]);
  const d = st.fold(e);
  assert.equal(d.repos.a.total, 13); assert.equal(d.repos.a.c7, 4); assert.equal(d.repos.a.days[29], 3); assert.equal(d.days[29], 3); assert.equal(d.repos.a.latest[0][2], "Ship");
  assert.equal(st.fold((await log2.append([{ id: "p1", time: 29 * 86400 + 60, kind: "pr.merge", repo: "a" }]))[0]).repos.a.pr, 2);
  assert.equal(st.fold({ id: "x", time: 5000, kind: "release", repo: "a" }), null);
  assert.equal(st.fold({ id: "y", time: 5000, kind: "commit", repo: "unplaced", n: 1 }), null);
});
await t("a base with a log watermark folds by sequence: a push authored before the scan still counts, what the scan saw does not", async () => {
  const log3 = await freshLog(), s3 = createState(log3, { config });
  const [seen] = await log3.append([{ id: "old", time: 29 * 86400 + 10, kind: "commit", repo: "a", n: 2 }]); // logged before the scan began: the scan read it
  await s3.setBase({ ...snap, seq: seen.seq, now: 29 * 86400 + 100 });
  assert.equal(s3.current().repos.a.total, 10);
  const [late] = await log3.append([{ id: "late", time: 29 * 86400 + 20, kind: "commit", repo: "a", n: 1 }]); // pushed after the scan began, its commit authored before `now`
  assert.equal(s3.fold(late).repos.a.total, 11); assert.equal(s3.fold(seen), null);
  await s3.setBase({ ...snap, seq: seen.seq, now: 29 * 86400 + 100 }); // the same base again: the late push is refolded from the log, the old one is not
  assert.equal(s3.current().repos.a.total, 11);
  await s3.setBase({ ...snap, seq: seen.seq, now: 29 * 86400 + 100 }, undefined, { until: 29 * 86400 + 15 }); // the city at a moment before the push
  assert.equal(s3.current().repos.a.total, 10);
});
await t("a base is prepared, then committed in one step: nothing changes until commit", async () => {
  const before = st.current().repos.a.total, ready = await st.prepare({ ...snap, now: 29 * 86400 + 55, repos: { a: { ...snap.repos.a, total: 99 } } });
  assert.equal(st.current().repos.a.total, before); ready.commit(); assert.equal(st.current().repos.a.total, 99);
});
await t("a new snapshot refolds only what is newer than it", async () => {
  await st.setBase({ ...snap, now: 29 * 86400 + 55, repos: { a: { ...snap.repos.a, total: 13, pr: 3 } } }); // the scan saw the commit, not the merge
  assert.equal(st.current().repos.a.total, 13); assert.equal(st.current().repos.a.pr, 2);
  const page = JSON.parse(JSON.stringify(snap)); assert.deepEqual(applyDelta(page, { repos: { a: { pr: 9 } }, days: { 3: 4 } }), ["a"]); assert.equal(page.repos.a.pr, 9); assert.equal(page.days[3].n, 4);
});
{
  const { readFileSync } = await import("node:fs");
  const { layoutCity } = await import("../src/lib/server/engine.mjs");
  const data = JSON.parse(readFileSync("dev/snapshot.json", "utf8")), config = JSON.parse(readFileSync("city.config.json", "utf8")), layout = layoutCity(data, config, null);
  const log3 = await freshLog(), st3 = createState(log3, { config });
  await t("a new repository is placed live, where the next scan places it", async () => {
    await st3.setBase(data, layout);
    const [e] = await log3.append(toEvents("repository", { action: "created", repository: { name: "omacom-new-tool", created_at: new Date((data.now + 600) * 1000).toISOString() } }));
    const d = st3.fold(e);
    assert.ok(d.placed?.at, "placed somewhere"); assert.equal(d.layout.lots[d.placed.at] ?? d.placed.at.split(":")[0], d.layout.lots[d.placed.at] ? "omacom-new-tool" : d.placed.at.split(":")[0]);
    const scan = layoutCity({ ...data, now: data.now + 900, repos: { ...data.repos, "omacom-new-tool": d.repos["omacom-new-tool"] } }, config, layout);
    assert.deepEqual(scan.lots, d.layout.lots); assert.deepEqual(scan.districts, d.layout.districts);
    await st3.setBase(data, layout); // a rebase refolds it to the same place
    assert.deepEqual(st3.layout().lots, d.layout.lots);
    const priv = await log3.append(toEvents("repository", { action: "created", repository: { name: "secret-thing", private: true, created_at: new Date((data.now + 700) * 1000).toISOString() } }));
    assert.equal(st3.fold(priv[0]), null); assert.equal(st3.current().repos["secret-thing"], undefined);
  });
}
{
  const { githubAllowed, basecampAllowed } = await import("../src/lib/server/gate.mjs");
  const { publicLayout, layoutCity } = await import("../src/lib/server/engine.mjs");
  const { readFileSync } = await import("node:fs");
  const { civicAt } = await import("../src/lib/city/grid.js");
  await t("a Basecamp project gets a civic cell near its repositories, once, and no house or lot moves", async () => {
    const d = JSON.parse(readFileSync("dev/snapshot.json", "utf8")), c = JSON.parse(readFileSync("city.config.json", "utf8")), L = layoutCity(d, c, null);
    const a = layoutCity({ ...d, wards: { 7: { repos: ["omarchy-mac-installer"] }, 8: {} } }, c, L);
    assert.ok(civicAt(a.wards[7]) && civicAt(a.wards[8]) && a.wards[7] !== a.wards[8]);
    assert.deepEqual(a.houses, layoutCity(d, c, L).houses); assert.deepEqual(a.lots, L.lots);
    const b = layoutCity({ ...d, wards: { 8: {}, 9: {} } }, c, a); // a project that left keeps its cell; a new one takes another
    assert.equal(b.wards[7], a.wards[7]); assert.equal(b.wards[8], a.wards[8]); assert.ok(![a.wards[7], a.wards[8]].includes(b.wards[9]));
  });
  await t("the members' city is invite-only: an org member, an invited verified email, or the foundation's Basecamp account", async () => {
    const org = (member) => async (url) => ({ status: member && url.endsWith("/members/dhh") ? 204 : 404 });
    const opts = (member, invited = []) => ({ org: "omacom", orgToken: "t", invited, fetchImpl: org(member) });
    assert.deepEqual(await githubAllowed({ login: "dhh" }, opts(true)), { ok: true, member: true });
    assert.equal((await githubAllowed({ login: "stranger", email: "a@b.c", emailVerified: true }, opts(false))).ok, false);
    assert.deepEqual(await githubAllowed({ login: "guest", email: "A@b.c", emailVerified: true }, opts(false, ["a@b.c"])), { ok: true, member: false });
    assert.equal((await githubAllowed({ login: "guest", email: "a@b.c", emailVerified: false }, opts(false, ["a@b.c"]))).ok, false); // unverified: no
    assert.equal(basecampAllowed({ accounts: [{ id: 5 }, { id: 42 }] }, "42"), true);
    assert.equal(basecampAllowed({ accounts: [{ id: 5 }] }, "42"), false);
    assert.equal(basecampAllowed({ accounts: [{ id: 42 }] }, undefined), false); // no account configured: nobody
  });
  await t("the public layout never names a private repository, and every other position is the master's", async () => {
    const data = JSON.parse(readFileSync("dev/snapshot.json", "utf8")), config = JSON.parse(readFileSync("city.config.json", "utf8")), layout = layoutCity(data, config, null);
    const members = { ...data, repos: { ...data.repos, "omasecret": { ...data.repos.omafind, private: true }, "hidden-infra": { ...data.repos.signed, private: true } } };
    const master = layoutCity(members, config, layout), pub = publicLayout(master), text = JSON.stringify(pub);
    assert.ok(master.private.includes("omasecret") && master.private.includes("hidden-infra"));
    assert.ok(!text.includes("omasecret") && !text.includes("hidden-infra") && !("private" in pub));
    for (const [k, n] of Object.entries(master.lots)) if (!master.private.includes(n)) assert.equal(pub.lots[k], n);
    for (const [d, list] of Object.entries(master.districts)) list.forEach((n, i) => assert.equal(pub.districts[d][i], n && master.private.includes(n) ? null : n));
  });
}
{
  const { aggregate } = await import("../src/lib/server/collector/aggregate.mjs");
  const { seenEvents } = await import("../src/lib/server/relay/events.mjs");
  await t("the scan's commits go into the log once per sha, bots flagged, branch-only work left out", async () => {
    const now = Date.UTC(2026, 9, 18, 12) / 1000, D = 86400, seen = [];
    aggregate({ now, since: now - 30 * D, members: [{ login: "a", name: "A" }], repos: [{ name: "r", total: 10, pr: 0 }, { name: "p", total: 1, pr: 0, private: true }], branches: [], contributors: [], commits: [
      { repo: "r", sha: "1", at: now - 3600, login: "a", name: "A", email: "a@x", subject: "one", merge: false, landed: true },
      { repo: "r", sha: "1", at: now - 3600, login: "a", name: "A", email: "a@x", subject: "one", merge: false, landed: true },
      { repo: "r", sha: "2", at: now - D, login: "github-actions[bot]", name: "bot", email: "b@x", subject: "chore", merge: false, landed: true },
      { repo: "r", sha: "3", at: now - D, login: "a", name: "A", email: "a@x", subject: "wip", merge: false, landed: false },
      { repo: "p", sha: "4", at: now - D, login: "a", name: "A", email: "a@x", subject: "secret", merge: false, landed: true }] }, { bots: "\\[bot\\]" }, { seen });
    const evs = seenEvents(seen), byId = Object.fromEntries(evs.map((e) => [e.id, e]));
    assert.deepEqual(Object.keys(byId).sort(), ["sha:1", "sha:2", "sha:4"]);
    assert.equal(byId["sha:2"].bot, true); assert.equal(byId["sha:4"].private, true); assert.equal(byId["sha:1"].kind, "commit.seen");
    const lg = await freshLog(); assert.equal((await lg.append(evs)).length, 3); assert.equal((await lg.append(evs)).length, 0);
    assert.ok((await lg.since(0)).every((e) => e.repo !== "p"));
  });
}
{
  const { createWelcome } = await import("../src/lib/server/relay/welcome.mjs");
  const meta = new Map(), calls = [];
  const w = createWelcome({ env: { CITY_WELCOME: "1", CITY_PUBLIC_URL: "https://city.example/", CITY_COMMENT_TOKEN: "t" }, config: { org: "omacom" }, getMeta: (k) => meta.get(k), putMeta: (k, v) => meta.set(k, v), fetchImpl: async (url, init) => { calls.push([url, JSON.parse(init.body).body]); return { ok: true, status: 201 }; }, log: () => {} });
  const merged = toEvents("pull_request", { action: "closed", pull_request: { number: 12, title: "Fix", merged: true, merged_at: "2026-10-18T10:00:00Z", user: { login: "zed" }, author_association: "FIRST_TIME_CONTRIBUTOR" }, repository: repo("omarchy") })[0];
  await w.maybe(merged); await w.maybe(merged);
  await w.maybe({ ...merged, first: false, number: 13 }); await w.maybe({ ...merged, private: true, number: 14 });
  const down = createWelcome({ env: { CITY_WELCOME: "1", CITY_PUBLIC_URL: "https://city.example/", CITY_COMMENT_TOKEN: "t" }, config: { org: "omacom" }, getMeta: async () => { throw new Error("database down"); }, putMeta: () => {}, fetchImpl: async () => ({ ok: true, status: 201 }), log: () => {} });
  assert.equal(await down.maybe(merged), false); // a database that is down is a false, never a rejection
  await t("the welcome comment goes once, to a first-timer's merged public pull request, with a link to the house", async () => {
    assert.equal(calls.length, 1); assert.match(calls[0][0], /repos\/omacom\/omarchy\/issues\/12\/comments$/); assert.match(calls[0][1], /\?house=zed$/);
    assert.equal(createWelcome({ env: {}, getMeta: () => null, putMeta: () => {} }).on, false); // off by default
  });
}
{
  // Basecamp, against a mock API (every name here is made up): the scan, one worker per person, and the two cities
  const { fromBasecamp } = await import("../src/lib/server/collector/basecamp.mjs");
  const { aggregate, project } = await import("../src/lib/server/collector/aggregate.mjs");
  const { publicProblems } = await import("../src/lib/server/collector/public.mjs");
  const now = Date.UTC(2026, 9, 18, 12) / 1000, D = 86400, iso = (t) => new Date(t * 1000).toISOString(), base = "https://3.basecampapi.com/9";
  const routes = {
    "/projects.json": [{ id: 1, name: "Secret plan", status: "active", created_at: iso(now - 90 * D), app_url: "https://3.basecamp.com/9/projects/1", dock: [{ name: "todoset", id: 11, enabled: true }, { name: "kanban_board", id: 12, enabled: true }, { name: "message_board", id: 13, enabled: true }] }],
    "/projects/1/people.json": [{ id: 100, name: "Ada Coder", email_address: "ada@x" }, { id: 101, name: "Bo Planner", email_address: "bo@y" }],
    "/buckets/1/todosets/11/todolists.json": [{ id: 21, title: "Launch list", completed_ratio: "3/5" }],
    "/buckets/1/todosets/11/hill.json": { dots: [{ label: "Launch list", position: 64 }] },
    "/buckets/1/card_tables/12.json": { lists: [{ id: 31, title: "Doing", type: "Kanban::Column", cards_count: 2 }, { id: 32, title: "Done", type: "Kanban::DoneColumn", cards_count: 0 }] },
    "/buckets/1/card_tables/lists/31/cards.json": [{ id: 41, title: "Draw the wards" }, { id: 42, title: "Ship it" }],
    "/buckets/1/message_boards/13/messages.json": [{ id: 51, subject: "Kickoff", created_at: iso(now - 2 * D) }],
    "/reports/progress.json": [{ created_at: iso(now - D), action: "completed", bucket: { id: 1 }, creator: { id: 100, name: "Ada Coder", email_address: "ada@x" }, recording: { type: "Todo" } },
      { created_at: iso(now - 3 * D), action: "moved", bucket: { id: 1 }, creator: { id: 101, name: "Bo Planner", email_address: "bo@y" }, recording: { type: "Kanban::Card" } }],
  };
  const fetcher = async (url) => { const body = routes[url.replace(base, "")]; return { ok: body !== undefined, status: body === undefined ? 404 : 200, headers: new Map(), json: async () => body }; };
  fetcher.headers = null;
  const bc = await fromBasecamp({ account: 9, token: "t", now, since: now - 30 * D, log: () => {}, fetcher: async (u, i) => { const r = await fetcher(u, i); r.headers = { get: () => null }; return r; } });
  const data = aggregate({ now, since: now - 30 * D, members: [{ login: "ada", name: "Ada Coder" }], teams: [{ name: "Core", members: ["ada"] }], repos: [{ name: "r", total: 5, pr: 0, project: "1" }], branches: [], contributors: [], basecamp: bc,
    commits: [{ repo: "r", sha: "1", at: now - D, login: "ada", name: "Ada Coder", email: "ada@x", subject: "one", merge: false, landed: true }] }, { people: { who: "all", hidden: ["nobody"] } }); // r links itself to project 1 with its hint file
  await t("Basecamp: projects become wards, people merge by email into one worker, GitHub teams join them, and the public city sees none of it", async () => {
    const w = data.wards[1];
    assert.equal(w.name, "Secret plan"); assert.deepEqual(w.repos, ["r"]); assert.deepEqual(w.hill, [["Launch list", 64]]);
    assert.equal(w.open, 2); assert.equal(w.done, 3); assert.equal(w.building, 1); assert.equal(w.columns[0][1], 2); assert.equal(w.messages7, 1); assert.equal(w.events30, 2);
    const ada = data.people.find((p) => p.n === "Ada Coder"), bo = data.people.find((p) => p.n === "Bo Planner");
    assert.equal(ada.gh, "ada"); assert.deepEqual(ada.teams, ["Core"]); assert.equal(ada.c30, 1); assert.equal(ada.w30, 1); assert.equal(bo.bc, true); assert.equal(bo.w30, 1);
    const pub = project(data, "public");
    assert.deepEqual(pub.wards, { 1: { repos: ["r"] } });
    assert.ok(!pub.people.some((p) => p.bc || p.w30 != null)); assert.ok(!JSON.stringify(pub).includes("Secret plan") && !JSON.stringify(pub).includes("Bo Planner") && !JSON.stringify(pub).includes("Kickoff"));
    assert.deepEqual(publicProblems(pub), []);
    assert.ok(publicProblems({ ...pub, wards: { 1: { name: "Secret plan" } } }).length > 0);
  });
  const hid = aggregate({ now, since: now - 30 * D, members: [{ login: "ada", name: "Ada Coder" }], teams: [{ name: "Core", members: ["ada"] }], repos: [{ name: "r", total: 5, pr: 0, project: "1" }], branches: [], contributors: [], basecamp: bc, commits: [] }, { people: { who: "all", hidden: ["bo@y", "ada"] } });
  await t("a hidden person is counted in their ward but never drawn or listed", async () => {
    assert.ok(!hid.people.some((p) => p.n === "Ada Coder" || p.n === "Bo Planner")); assert.equal(hid.wards[1].events30, 2);
  });
}
{
  const { basecampEvents, wardEvents, BASECAMP_KINDS, progressEvents } = await import("../src/lib/server/relay/basecamp.mjs");
  await t("Basecamp webhooks are members-only events at their ward, with titles but never bodies, and each has an effect", async () => {
    const p = (kind, extra = {}) => ({ id: 77, kind, created_at: "2026-10-18T10:00:00Z", recording: { id: 5, type: "Todo", title: "Fix the hill\nwith a body", bucket: { id: 1, name: "Secret plan" }, ...extra }, creator: { name: "Ada Coder" } });
    const [e] = basecampEvents(p("todo_completed"));
    assert.equal(e.kind, "todo.done"); assert.equal(e.ward, "1"); assert.equal(e.private, true); assert.equal(e.title, "Fix the hill"); assert.equal(e.id, "bc:77");
    assert.equal(basecampEvents(p("comment_created"))[0].title, ""); // a comment shows only as light
    assert.equal(basecampEvents(p("todo_uncompleted")).length, 0);
    for (const k of BASECAMP_KINDS) assert.ok(EFFECTS[k], `no effect for ${k}`);
    const lg = await freshLog(); await lg.append([e]);
    assert.ok((await lg.since(0)).every((x) => x.kind !== "todo.done")); // the public projection of the log never carries it
    const ev = wardEvents({ 1: { name: "A", hill: [["L", 20]] } }, { 1: { name: "A", hill: [["L", 60]] }, 2: { name: "B" } }, 9);
    assert.deepEqual(ev.map((x) => x.kind).sort(), ["hill.move", "project.new"]); assert.ok(ev.every((x) => x.private));
    const snap = { now: 100, repos: {}, days: [], wards: { 1: { name: "Secret plan", events7: 0, open: 3, done: 1 } } };
    const mem = createState(await freshLog(), { config: {}, includePrivate: true }), pub = createState(await freshLog(), { config: {} });
    await mem.setBase(JSON.parse(JSON.stringify(snap)), null); await pub.setBase({ ...snap, wards: { 1: { repos: [] } } }, null);
    const d = mem.fold({ ...e, time: 200 });
    assert.equal(d.wards[1].done, 2); assert.equal(d.wards[1].open, 2); assert.equal(d.wards[1].events7, 1);
    assert.equal(pub.fold({ ...e, time: 200 }), null); // the public state never folds it
    const hist = progressEvents([{ id: 77, created_at: "2026-10-18T10:00:00Z", action: "completed", recording: { type: "Todo", title: "Fix the hill" }, bucket: { id: 1 }, creator: { name: "Ada Coder" } }, { id: 78, action: "created", recording: { type: "Schedule::Entry" }, bucket: { id: 1 } }]);
    assert.equal(hist.length, 1); assert.equal(hist[0].id, e.id); assert.equal(hist[0].kind, "todo.done"); assert.equal(hist[0].private, true); // the backfill and the hook log it once
  });
}
await t("the public city alone keeps nothing private: no private hook event, no Basecamp hook, no secret no hooks", async () => {
  const { createRelay } = await import("../src/lib/server/relay/relay.mjs");
  const quiet = () => {}, hook = (name, body) => new Request("http://x/hook", { method: "POST", headers: { "x-github-event": name, "x-github-delivery": "d" }, body: JSON.stringify(body) });
  const push = (name, priv) => ({ ref: "refs/heads/master", after: name, repository: repo(name, priv), commits: [{ distinct: true, message: "x" }] });
  const pub = await createRelay({ env: {}, insecure: true, members: false, scanEvery: 0, log: quiet });
  assert.equal((await (await pub.hook(hook("push", push("hidden", true)))).json()).accepted, 0);
  assert.equal((await (await pub.hook(hook("push", push("open", false)))).json()).accepted, 1);
  assert.equal((await pub.basecampHook(new Request("http://x", { method: "POST", body: "{}" }), "k")).status, 404);
  assert.equal((await pub.log.since(0, { publicOnly: false })).length, 1);
  await pub.close();
  const unsigned = await createRelay({ env: {}, scanEvery: 0, log: quiet }); // production without CITY_WEBHOOK_SECRET starts, and refuses hooks
  assert.equal((await unsigned.hook(hook("push", push("open", false)))).status, 401);
  await unsigned.close();
});
await t("the stream's catch-up misses nothing: an event broadcast meanwhile follows it once, in order; a catch-up cut short says resync", async () => {
  const { createRelay } = await import("../src/lib/server/relay/relay.mjs");
  const quiet = () => {}, hook = (name, body) => new Request("http://x/hook", { method: "POST", headers: { "x-github-event": name, "x-github-delivery": "d" }, body: JSON.stringify(body) });
  const push = (sha) => ({ ref: "refs/heads/master", after: sha, repository: repo("open"), commits: [{ distinct: true, message: sha }] });
  const r = await createRelay({ env: {}, insecure: true, members: false, scanEvery: 0, catchUp: 4, log: quiet });
  await r.hook(hook("push", push("s1"))); await r.hook(hook("push", push("s2")));
  const res = r.stream(new Request("http://x/events?since=0"), false), reader = res.body.getReader(), dec = new TextDecoder();
  const live = r.hook(hook("push", push("s3"))); // broadcast while the catch-up is being read
  let text = ""; while (!/id: 3\n/.test(text)) text += dec.decode((await reader.read()).value);
  await live; await new Promise((ok) => setTimeout(ok, 50)); try { text += dec.decode((await Promise.race([reader.read(), new Promise((ok) => setTimeout(() => ok({ value: new Uint8Array() }), 100))])).value); } catch {}
  const ids = [...text.matchAll(/^id: (\d+)$/gm)].map((m) => +m[1]);
  assert.deepEqual(ids, [1, 2, 3]); assert.ok(text.startsWith("retry: 3000\nevent: hello")); assert.ok(!text.includes("event: resync"));
  reader.cancel();
  await r.hook(hook("push", push("s4")));
  const cut = r.stream(new Request("http://x/events?since=0"), false), rd = cut.body.getReader(); let t2 = "";
  while (!/event: resync/.test(t2)) t2 += dec.decode((await rd.read()).value);
  assert.deepEqual([...t2.matchAll(/^id: (\d+)$/gm)].map((m) => +m[1]), [1, 2, 3, 4]); assert.ok(t2.includes('"after":4')); rd.cancel();
  const st = await (await r.status()).json(); assert.equal(st.backfill.at, undefined);
  await r.close();
});
await t("the film, the city at a moment and the events between are answered from the kept answer while the log's top stands", async () => {
  const { createRelay } = await import("../src/lib/server/relay/relay.mjs");
  const quiet = () => {}, hook = (name, body) => new Request("http://x/hook", { method: "POST", headers: { "x-github-event": name, "x-github-delivery": "d" }, body: JSON.stringify(body) });
  const r = await createRelay({ env: {}, insecure: true, members: false, scanEvery: 0, cacheHold: 0, log: quiet });
  await r.hook(hook("push", { ref: "refs/heads/master", after: "f1", repository: repo("open"), commits: [{ distinct: true, message: "one" }] }));
  const film = () => r.film(new URL("http://x/film?to=2000000000")), between = () => r.between(new URL("http://x/events/between?from=0&to=2000000000"), false);
  assert.equal((await film()).headers.get("x-cache"), "miss"); assert.equal((await film()).headers.get("x-cache"), "hit");
  assert.equal((await between()).headers.get("x-cache"), "miss"); assert.equal((await between()).headers.get("x-cache"), "hit");
  assert.equal((await (await between()).json()).length, 1);
  await r.hook(hook("push", { ref: "refs/heads/master", after: "f2", repository: repo("open"), commits: [{ distinct: true, message: "two" }] })); // the log moved: a fresh answer
  assert.equal((await between()).headers.get("x-cache"), "miss"); assert.equal((await (await between()).json()).length, 2);
  assert.equal((await r.stateAt(new URL("http://x/state/at?t=5"), false)).status, 404);
  await r.close();
});
await t("the page's config carries the layout's words, never a private repository, a mirror, a hint or a matching rule", async () => {
  const { publicConfig } = await import("../src/lib/server/collector/public.mjs");
  const cfg = { org: "o", bots: "x", hints: { a: 1 }, people: { invited: ["e"] }, layout: { districts: [{ id: "apps", name: "Apps", match: { repos: ["secret"] } }], landmarks: { open: { slot: "hall" }, secret: { slot: "press" } }, kits: { secret: "capsule" }, mirrors: ["m"], kinds: { hall: "Hall" }, signs: { hall: "S" }, boards: ["B"] } };
  const pub = publicConfig(cfg, { private: ["secret"] }), s = JSON.stringify(pub);
  assert.ok(!s.includes("secret") && !s.includes("mirrors") && !s.includes("hints") && !s.includes("invited") && !s.includes("bots") && !s.includes("match"));
  assert.deepEqual(pub.layout.districts, [{ id: "apps", name: "Apps" }]); assert.deepEqual(pub.layout.landmarks, { open: { slot: "hall" } }); assert.deepEqual(pub.layout.kits, {}); assert.equal(pub.layout.kinds.hall, "Hall");
  assert.equal(publicConfig(cfg, { private: ["secret"], member: true }).layout.landmarks.secret.slot, "press");
});
await t("with no city yet, the relay says why: no token, scanning off, an unreadable base file; nothing once there is one", async () => {
  const { createRelay } = await import("../src/lib/server/relay/relay.mjs");
  const quiet = () => {};
  const none = await createRelay({ env: {}, members: false, log: quiet });
  assert.match(none.waiting(), /GITHUB_TOKEN is not set/); assert.match((await (await none.status()).json()).waiting, /GITHUB_TOKEN/); await none.close();
  const off = await createRelay({ env: { GITHUB_TOKEN: "x" }, scanEvery: 0, members: false, log: quiet });
  assert.match(off.waiting(), /scanning is off/); assert.ok(!off.waiting().includes("x\"")); await off.close();
  const lost = await createRelay({ env: {}, data: "no/such/file.json", members: false, log: quiet });
  assert.match(lost.waiting(), /CITY_DATA could not be read \(the file does not exist\)/); await lost.close();
  const ready = await createRelay({ env: {}, data: "dev/snapshot.json", members: false, log: quiet });
  assert.equal(ready.waiting(), null); await ready.close();
});
console.error(`${n} tests passed`);
