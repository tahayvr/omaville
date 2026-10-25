#!/usr/bin/env node
// Register the relay's Basecamp webhook on every project the city's account can see (Basecamp has no account-wide
// webhooks). Lists what it would do unless --apply is given; a project that already posts to the URL is left alone.
//
//   BASECAMP_TOKEN=… node scripts/basecamp-hooks.mjs --url https://city.example.org/hook/basecamp/<CITY_BASECAMP_HOOK_KEY> [--apply]
//
// Run it again whenever the admin adds the account to a new project (the scan's project.new is a good reminder).
import { readFileSync } from "node:fs";
import { basecampClient } from "../src/lib/server/collector/basecamp.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]] : acc), []));
const config = JSON.parse(readFileSync(args.config ?? "city.config.json", "utf8"));
const account = config.basecamp?.account, token = process.env.BASECAMP_TOKEN, url = args.url;
if (!account || !token || typeof url !== "string") { console.error("needs config.basecamp.account, BASECAMP_TOKEN and --url"); process.exit(2); }
const TYPES = ["Todo", "Todolist", "Kanban::Card", "Message", "Comment", "Document", "Upload", "Schedule::Entry", "Question::Answer"];

const bc = basecampClient(account, token);
for (const p of await bc.all("/projects.json")) {
  const hooks = (await bc.get(`/buckets/${p.id}/webhooks.json`)) ?? [];
  if (hooks.some((h) => h.payload_url === url)) { console.log(`${p.id} ${p.name}: already posts to the city`); continue; }
  if (!args.apply) { console.log(`${p.id} ${p.name}: would add the webhook`); continue; }
  const res = await fetch(`https://3.basecampapi.com/${account}/buckets/${p.id}/webhooks.json`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "user-agent": "omaville (https://github.com/omacom)" },
    body: JSON.stringify({ payload_url: url, types: TYPES }),
  });
  console.log(`${p.id} ${p.name}: ${res.ok ? "webhook added" : `failed (${res.status})`}`);
}
