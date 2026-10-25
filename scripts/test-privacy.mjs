#!/usr/bin/env node
// Privacy, end to end: the built app (node build, after vite build) on a scratch database is sent a private repository's push and Basecamp events
// carrying secret markers (a title, a person's name, an avatar), while the public stream is recorded. Neither the
// recorded stream nor any public endpoint may carry a marker, and the public snapshot must pass the public guard.
// Exits non-zero on the first leak.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publicProblems } from "../src/lib/server/collector/public.mjs";

const dir = mkdtempSync(join(tmpdir(), "city-privacy-")), port = 8900 + Math.floor(Math.random() * 90), base = `http://localhost:${port}`;
const relay = spawn(process.execPath, ["build"], { stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, PORT: String(port), CITY_INSECURE: "1", CITY_DATA: "dev/snapshot.json", DATABASE_URL: "pglite:" + join(dir, "db"), CITY_SAMPLE: "", CITY_WEBHOOK_SECRET: "", BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret", GITHUB_CLIENT_ID: "test", GITHUB_CLIENT_SECRET: "test" } });
let log = ""; relay.stderr.on("data", (d) => (log += d));
const fail = (msg) => { console.error(`LEAK: ${msg}`); relay.kill(); rmSync(dir, { recursive: true, force: true }); process.exit(1); };
const MARKS = ["SECRET-COMMIT", "SECRET-TITLE", "Secret Person", "secret-avatar.png", "secret-repo", "SECRET-PROJECT"];

try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch(base + "/status")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  // record the public stream while the private events arrive
  const ctl = new AbortController(), res = await fetch(base + "/events", { signal: ctl.signal });
  let stream = ""; const reader = res.body.getReader(), dec = new TextDecoder();
  const recording = (async () => { try { for (;;) { const { value, done } = await reader.read(); if (done) break; stream += dec.decode(value); } } catch {} })();
  const post = (path, body, headers = {}) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const now = new Date(Date.now() + 60000).toISOString();
  await post("/hook", { ref: "refs/heads/master", after: "s1", repository: { name: "secret-repo", private: true, default_branch: "master" }, sender: { login: "someone" },
    head_commit: { message: "SECRET-COMMIT", timestamp: now }, commits: [{ id: "s1", distinct: true, message: "SECRET-COMMIT", author: { username: "someone" } }] }, { "x-github-event": "push", "x-github-delivery": "p1" });
  for (const [i, kind] of ["todo_completed", "message_created", "comment_created", "kanban_card_created", "upload_created"].entries())
    await post("/hook/basecamp/any", { id: 900 + i, kind, created_at: now, recording: { id: 1, type: "Todo", title: "SECRET-TITLE", bucket: { id: 42, name: "SECRET-PROJECT" } }, creator: { id: 7, name: "Secret Person", avatar_url: "https://x/secret-avatar.png" } });
  await new Promise((r) => setTimeout(r, 800)); ctl.abort(); await recording;
  for (const m of MARKS) if (stream.includes(m)) fail(`the public stream carries "${m}"`);
  // every public endpoint
  const t = Math.floor(Date.now() / 1000);
  for (const path of ["/", "/data.json", "/layout.json", "/events/recent?limit=500", `/events/between?from=0&to=${t + 3600}`, "/film", `/state/at?t=${t + 3600}`, "/status"]) {
    const body = await (await fetch(base + path)).text();
    for (const m of MARKS) if (body.includes(m)) fail(`${path} carries "${m}"`);
  }
  // the members' city answers only with a session
  for (const path of ["/members/data.json", "/members/layout.json", "/members/events", "/members/film", `/members/events/between?from=0&to=${t + 3600}`]) {
    const r = await fetch(base + path); if (r.status !== 401) fail(`${path} answered ${r.status} without a session`);
  }
  const problems = publicProblems(await (await fetch(base + "/data.json")).json());
  if (problems.length) fail(`the public snapshot: ${problems.slice(0, 3).join("; ")}`);
  // and the members' side did take them (so the test is not passing on events that never arrived)
  if (!/basecamp: \d+ todo\.done ward 42/.test(log) || !/push: \d+ commit secret-repo/.test(log)) fail(`the relay did not log the private events:\n${log}`);
  console.error("privacy: the public stream and every public endpoint carry no private repository, Basecamp title, name or avatar");
} finally { relay.kill(); rmSync(dir, { recursive: true, force: true }); }
