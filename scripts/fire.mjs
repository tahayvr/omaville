#!/usr/bin/env node
// Fire sample GitHub webhooks at a relay, signed like GitHub signs them, to watch the city react.
//
//   node scripts/fire.mjs [--to http://localhost:8080/hook] [--kinds push,merge,release] [--repo <name>] [--every 3000]
//   node scripts/fire.mjs --kinds repo --name omafoo      # a new repository, placed live
//
// Kinds: push, branch, open, merge, close, release, ci-run, ci-pass, ci-fail, issue, repo. Without --kinds it
// fires one of each; with --every it keeps firing a random one every N ms (a demo for a hallway screen).
// Repositories are picked from dev/snapshot.json unless --repo names one. CITY_WEBHOOK_SECRET signs the body.
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const to = args.to ?? "http://localhost:8080/hook", secret = process.env.CITY_WEBHOOK_SECRET ?? "";
const data = JSON.parse(readFileSync(args.data ?? "dev/snapshot.json", "utf8"));
const repos = Object.entries(data.repos).filter(([, r]) => r.flag !== "archived").map(([n]) => n);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const now = () => new Date().toISOString();
const repoOf = (name) => ({ name, full_name: `${data.org || "org"}/${name}`, private: false, default_branch: "master", created_at: now() });
const sender = { login: args.author ?? pick(data.contributors?.slice(0, 40).map((c) => c.login) ?? ["octocat"]) }; // --author: a login (a new one builds a new house)
const n = () => Math.floor(Math.random() * 1e9);

const KINDS = {
  push: (r) => ["push", { ref: "refs/heads/master", after: randomUUID().replace(/-/g, ""), repository: repoOf(r), sender, commits: Array.from({ length: 1 + Math.floor(Math.random() * 5) }, (_, i) => ({ id: randomUUID(), distinct: true, message: `Tune the ${pick(["belt", "press", "dock", "crane", "lamp"])} (${i + 1})`, timestamp: now(), author: { name: sender.login, username: sender.login } })), head_commit: { message: "Tune the belt", timestamp: now() } }],
  branch: (r) => ["push", { ref: "refs/heads/feature-" + n(), after: randomUUID(), repository: repoOf(r), sender, commits: [{ id: randomUUID(), distinct: true, message: "Work in progress", timestamp: now(), author: { username: sender.login } }], head_commit: { message: "Work in progress", timestamp: now() } }],
  open: (r) => ["pull_request", { action: "opened", number: n() % 9000, pull_request: { number: n() % 9000, title: "Add a crane to the dock", updated_at: now() }, repository: repoOf(r), sender }],
  merge: (r) => ["pull_request", { action: "closed", number: n() % 9000, pull_request: { number: n() % 9000, title: "Merge the new belt", merged: true, merged_at: now() }, repository: repoOf(r), sender }],
  close: (r) => ["pull_request", { action: "closed", number: n() % 9000, pull_request: { number: n() % 9000, title: "Not this time", merged: false, closed_at: now() }, repository: repoOf(r), sender }],
  release: (r) => ["release", { action: "published", release: { id: n(), tag_name: `v${1 + (n() % 4)}.${n() % 10}.0`, name: "", published_at: now() }, repository: repoOf(r), sender }],
  "ci-run": (r) => ["workflow_run", { action: "in_progress", workflow_run: { id: n(), run_attempt: 1, name: "CI", run_started_at: now() }, repository: repoOf(r), sender }],
  "ci-pass": (r) => ["workflow_run", { action: "completed", workflow_run: { id: n(), run_attempt: 1, name: "CI", conclusion: "success", updated_at: now() }, repository: repoOf(r), sender }],
  "ci-fail": (r) => ["workflow_run", { action: "completed", workflow_run: { id: n(), run_attempt: 1, name: "CI", conclusion: "failure", updated_at: now() }, repository: repoOf(r), sender }],
  issue: (r) => ["issues", { action: "opened", issue: { number: n() % 9000, title: "The lamp flickers", updated_at: now() }, repository: repoOf(r), sender }],
  repo: () => ["repository", { action: "created", repository: { ...repoOf(args.name ?? "new-" + (n() % 1000)), description: "A new repository" }, sender }],
};

async function fire(kind) {
  const [name, payload] = KINDS[kind](args.repo ?? pick(repos));
  const body = JSON.stringify(payload);
  const headers = { "content-type": "application/json", "x-github-event": name, "x-github-delivery": randomUUID() };
  if (secret) headers["x-hub-signature-256"] = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  const res = await fetch(to, { method: "POST", headers, body });
  console.error(`${kind} → ${payload.repository?.name ?? ""}: ${res.status} ${await res.text()}`);
}

const kinds = (args.kinds ?? Object.keys(KINDS).join(",")).split(",").filter((k) => KINDS[k]);
if (args.every) { for (;;) { await fire(pick(kinds)); await new Promise((r) => setTimeout(r, +args.every)); } }
else for (const k of kinds) { await fire(k); await new Promise((r) => setTimeout(r, 400)); }
