#!/usr/bin/env node
// Load test for the relay: N open pages (Server-Sent Events streams) while webhooks arrive at a steady rate.
// Reports how many events each page received and the lag from the webhook's POST to its arrival on a page.
//
//   node scripts/load.mjs [--relay http://localhost:8080] [--pages 200] [--rate 1] [--seconds 30] [--repo <name>, default the config's primary]
//
// Run it against a local relay started with --insecure (or set CITY_WEBHOOK_SECRET to sign). Never against a
// relay others depend on: it appends real events to that relay's log.
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const relay = (args.relay ?? "http://localhost:8080").replace(/\/$/, ""), pages = +(args.pages ?? 200), rate = +(args.rate ?? 1), seconds = +(args.seconds ?? 30);
const secret = process.env.CITY_WEBHOOK_SECRET ?? "", repo = args.repo ?? JSON.parse(readFileSync("city.config.json", "utf8")).primary;
const sent = new Map(), lags = [], got = new Array(pages).fill(0);

// N pages: each reads the stream and notes when a load-test event arrives
const controllers = [];
async function page(i) {
  const ac = new AbortController(); controllers.push(ac);
  const res = await fetch(`${relay}/events`, { signal: ac.signal });
  const reader = res.body.getReader(), dec = new TextDecoder(); let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let k; while ((k = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, k); buf = buf.slice(k + 2);
        const data = block.split("\n").find((l) => l.startsWith("data: "));
        if (!data || !block.includes("event: city")) continue;
        const m = data.match(/load:([0-9a-f-]{36})/); if (!m || !sent.has(m[1])) continue;
        got[i]++; lags.push(performance.now() - sent.get(m[1]));
      }
    }
  } catch {}
}
await Promise.all(Array.from({ length: pages }, (_, i) => page(i).catch(() => {})).map((p) => Promise.race([p, new Promise((r) => setTimeout(r, 50))])));
await new Promise((r) => setTimeout(r, 1000));
console.error(`${pages} pages open on ${relay}/events; firing ${rate}/s for ${seconds} s`);

const ingest = [];
let fired = 0;
const t0 = performance.now();
while (performance.now() - t0 < seconds * 1000) {
  const id = randomUUID(), body = JSON.stringify({ ref: "refs/heads/master", after: id.replace(/-/g, ""), repository: { name: repo, default_branch: "master" }, sender: { login: "load-test" }, commits: [{ id, distinct: true, message: `load:${id}`, timestamp: new Date().toISOString(), author: { username: "load-test" } }], head_commit: { message: `load:${id}`, timestamp: new Date().toISOString() } });
  const headers = { "content-type": "application/json", "x-github-event": "push", "x-github-delivery": id };
  if (secret) headers["x-hub-signature-256"] = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  sent.set(id, performance.now());
  const s = performance.now(); const r = await fetch(`${relay}/hook`, { method: "POST", headers, body }); ingest.push(performance.now() - s); fired++;
  if (!r.ok) console.error(`hook ${r.status}`);
  await new Promise((res) => setTimeout(res, Math.max(0, 1000 / rate - (performance.now() - s))));
}
await new Promise((r) => setTimeout(r, 2000));
controllers.forEach((c) => c.abort());

const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const full = got.filter((n) => n === fired).length;
console.log(`fired ${fired} events; ${full}/${pages} pages received all of them (min ${Math.min(...got)}, max ${Math.max(...got)})`);
console.log(`ingest (POST /hook): p50 ${q(ingest, 0.5).toFixed(1)} ms, p95 ${q(ingest, 0.95).toFixed(1)} ms`);
console.log(`delivery (POST to page): p50 ${q(lags, 0.5).toFixed(1)} ms, p95 ${q(lags, 0.95).toFixed(1)} ms, max ${Math.max(...lags).toFixed(1)} ms`);
if (full < pages) process.exitCode = 1;
