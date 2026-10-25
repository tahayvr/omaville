// One scan of the org: read it (GitHub API, or local clones), aggregate, project, digest. Called by the relay on
// its own schedule (relay/server.mjs) and by the CLI (collector/collect.mjs).
//
// generatedAt only changes when the data changed: the aggregate is digested, and when the previous snapshot
// carries the same digest its stamp is kept, so open pages never redraw for a scan that found nothing new.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { aggregate, project } from "./aggregate.mjs";
import { fromGithub } from "./github.mjs";
import { fromGit } from "./git.mjs";
import { fromBasecamp } from "./basecamp.mjs";

export const digestOf = (data) => createHash("sha1").update(JSON.stringify({ repos: data.repos, people: data.people, days: data.days, modules: data.modules, contributors: data.contributors, patrons: data.patrons, wards: data.wards })).digest("hex").slice(0, 16);

// projection: "public" (default), "members", or "both" ({ public, members, seen } from one read of the org; prev is
// then { public, members } too; seen: the landed commits, for the relay's log). publicOnly: no private repository
// and no Basecamp is read at all.
export async function scan({ config, token = "", source = token ? "github" : "git", now = Math.floor(Date.now() / 1000), projection = "public", publicOnly = false, prev = null, clones = "clones", meta = null, members = null, log = console.error , basecampToken = null}) {
  const since = now - (config.window ?? 30) * 86400, org = config.org;
  const json = (p) => JSON.parse(readFileSync(p, "utf8"));
  const input = source === "github"
    ? await fromGithub({ org, token, now, since, hints: config.hints, publicOnly, patrons: config.patrons, mirrors: config.layout?.mirrors ?? config.mirrors ?? [], log }) // the mirrors are named in the layout section
    : fromGit({ dir: clones, now, since, meta: meta ? json(meta) : {}, members: members ? json(members) : [], patrons: config.patrons });
  // Basecamp (the wards and the people's work) when the city's account is configured: config.basecamp.account and
  // BASECAMP_TOKEN; a failed read leaves the wards out of this scan, never the city
  const bcToken = publicOnly ? "" : basecampToken ?? process.env.BASECAMP_TOKEN; // the wards are members-only
  if (config.basecamp?.account && bcToken) {
    try { input.basecamp = await fromBasecamp({ account: config.basecamp.account, token: bcToken, now, since, log }); }
    catch (e) { log(`basecamp skipped: ${e.message.slice(0, 160)}`); }
  }
  // a repository GitHub could not count this time keeps its last count, so a building never drops for one bad read
  const last = (n) => (projection === "both" ? prev?.members ?? prev?.public : prev)?.repos?.[n]?.total;
  for (const r of input.repos ?? []) if (r.total == null) { r.total = last(r.name) ?? 0; log(`${r.name}: no count this time, kept ${r.total}`); }
  const seen = [];
  const full = aggregate(input, config, { seen });
  const finish = (data, p) => {
    data.digest = digestOf(data);
    data.generatedAt = p?.digest === data.digest && p.generatedAt ? p.generatedAt : Math.floor(Date.now() / 1000);
    return data;
  };
  const out = projection === "both" ? { public: finish(project(full, "public"), prev?.public), members: finish(project(full, "members"), prev?.members), seen } : finish(project(full, projection), prev);
  const pub = projection === "both" ? out.public : out, total = Object.values(pub.repos).reduce((t, r) => t + r.c30, 0);
  log(`scan: ${Object.keys(pub.repos).length} ${projection === "both" ? "public " : ""}repos${projection === "both" ? ` (${Object.keys(out.members.repos).length} with private)` : ""}, ${pub.people.length} people, ${total} commits in ${pub.window.days} days (${input.source})${pub.generatedAt === (projection === "both" ? prev?.public : prev)?.generatedAt ? ", unchanged" : ""}`);
  return out;
}
