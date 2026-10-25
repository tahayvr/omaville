// GitHub webhook payloads → city events. Pure: a payload in, zero or more events out.
//
// Every event has one shape, whatever its source:
//   { id, time, source, kind, actor, repo, private?, n?, bots?, ref?, number?, title, summary }
// The kinds are fixed and small (see KINDS). `id` is stable for the same delivery, so a redelivered webhook or a
// scan that finds the same thing again is dropped by the log, never counted twice.
import { EFFECT_PLUGINS } from "../../city/plugins/index.js";
export const KINDS = ["commit", "branch", "pr.open", "pr.merge", "pr.close", "ci.run", "ci.pass", "ci.fail", "release", "issue.open", "issue.close", "repo.new", "repo.archive", "member.join", "patron.new"];

const sec = (t) => (t ? Math.floor(Date.parse(t) / 1000) : Math.floor(Date.now() / 1000));
const clip = (s, n = 140) => (s || "").split("\n")[0].slice(0, n);

// bots and routine accounts move belts but never build: their commits are counted apart (law 10)
export function botTest(config = {}) {
  const bot = new RegExp(config.bots ?? "\\[bot\\]$", "i"), routine = new RegExp(config.routine?.who ?? "$^", "i"), subject = new RegExp(config.routine?.subject ?? "$^", "i");
  return (c) => bot.test(c.author?.username ?? "") || bot.test(c.author?.name ?? "") || routine.test(c.author?.username ?? "") || routine.test(c.author?.name ?? "") || subject.test(c.message ?? "");
}

export function toEvents(name, payload, { delivery = "", config = {} } = {}) {
  const repo = payload.repository?.name ?? "", priv = !!payload.repository?.private, actor = payload.sender?.login ?? "";
  const base = (kind, id, time, extra = {}) => ({ id: `gh:${kind}:${id}`, time, source: "github", kind, actor, repo, ...(priv ? { private: true } : {}), ...extra });
  switch (name) {
    case "push": {
      if (payload.deleted || !payload.ref?.startsWith("refs/heads/")) return [];
      const branch = payload.ref.slice(11), onDefault = branch === payload.repository?.default_branch;
      const isBot = botTest(config), commits = (payload.commits ?? []).filter((c) => c.distinct !== false && !/^Merge (pull request|branch) /.test(c.message ?? ""));
      if (!commits.length) return [];
      const bots = commits.filter(isBot).length, n = commits.length - bots, head = payload.head_commit ?? commits[commits.length - 1];
      const authors = Object.entries(commits.filter((c) => !isBot(c) && c.author?.username).reduce((m, c) => ((m[c.author.username] = (m[c.author.username] || 0) + 1), m), {})); // [login, commits]: their houses grow
      const title = clip(head?.message);
      return [base(onDefault ? "commit" : "branch", payload.after || delivery, sec(head?.timestamp), {
        n, ...(bots ? { bots } : {}), ...(authors.length ? { authors } : {}), ...(onDefault ? {} : { ref: branch }), title,
        summary: `${n || bots} ${(n || bots) === 1 ? "commit" : "commits"} to ${repo}${onDefault ? "" : ` (${branch})`}: ${title}`,
      })];
    }
    case "pull_request": {
      const pr = payload.pull_request ?? {}, a = payload.action, num = pr.number ?? payload.number, title = clip(pr.title);
      if (a === "opened" || a === "reopened") return [base("pr.open", `${repo}#${num}:${a}:${pr.updated_at ?? ""}`, sec(pr.updated_at), { number: num, title, summary: `Pull request #${num} opened in ${repo}: ${title}` })];
      if (a === "closed") return [pr.merged
        ? base("pr.merge", `${repo}#${num}:merged`, sec(pr.merged_at), { number: num, title, author: pr.user?.login ?? "", ...(/^FIRST_TIME/.test(pr.author_association ?? "") ? { first: true } : {}), summary: `#${num} merged into ${repo}: ${title}` })
        : base("pr.close", `${repo}#${num}:closed:${pr.closed_at ?? ""}`, sec(pr.closed_at), { number: num, title, summary: `#${num} closed in ${repo}: ${title}` })];
      return [];
    }
    case "release": {
      const r = payload.release ?? {};
      if (payload.action !== "published" || r.draft) return [];
      return [base("release", `${repo}:${r.id}`, sec(r.published_at), { ref: r.tag_name, title: clip(r.name || r.tag_name), summary: `${repo} ${r.tag_name} released` })];
    }
    case "workflow_run": {
      const w = payload.workflow_run ?? {}, title = clip(w.name);
      if (payload.action === "requested" || payload.action === "in_progress") return [base("ci.run", `${w.id}:${w.run_attempt ?? 1}:run`, sec(w.run_started_at ?? w.created_at), { title, summary: `${title} running on ${repo}` })];
      if (payload.action === "completed" && (w.conclusion === "success" || w.conclusion === "failure")) {
        const ok = w.conclusion === "success";
        return [base(ok ? "ci.pass" : "ci.fail", `${w.id}:${w.run_attempt ?? 1}:${w.conclusion}`, sec(w.updated_at), { title, summary: `${title} ${ok ? "passed" : "failed"} on ${repo}` })];
      }
      return [];
    }
    case "issues": {
      const is = payload.issue ?? {}, title = clip(is.title);
      if (payload.action === "opened" || payload.action === "reopened") return [base("issue.open", `${repo}#${is.number}:${payload.action}:${is.updated_at ?? ""}`, sec(is.updated_at), { number: is.number, title, summary: `Issue #${is.number} opened in ${repo}: ${title}` })];
      if (payload.action === "closed") return [base("issue.close", `${repo}#${is.number}:closed:${is.closed_at ?? ""}`, sec(is.closed_at), { number: is.number, title, summary: `Issue #${is.number} closed in ${repo}` })];
      return [];
    }
    case "repository": {
      if (payload.action === "created") { const r = payload.repository ?? {}; return [base("repo.new", `${repo}:created`, sec(r.created_at), { title: repo, desc: (r.description || "").slice(0, 200), lang: r.language || "", flag: r.archived ? "archived" : r.mirror_url ? "mirror" : r.fork ? "fork" : "", summary: `New repository: ${repo}` })]; }
      if (payload.action === "archived") return [base("repo.archive", `${repo}:archived:${delivery}`, sec(), { title: repo, summary: `${repo} archived` })];
      return [];
    }
    case "organization": {
      if (payload.action !== "member_added") return [];
      const who = payload.membership?.user?.login ?? "";
      return [{ id: `gh:member.join:${who}:${delivery}`, time: sec(), source: "github", kind: "member.join", actor: who, repo: "", title: who, summary: `${who} joined the org` }];
    }
    default: { // a plugin's event (city/plugins/effects/): its webhook maps the payload, the id is the delivery
      const pl = EFFECT_PLUGINS.find((x) => x.webhook?.event === name);
      const f = pl && pl.webhook.map(payload);
      if (!f) return [];
      const { time, ...rest } = f, at = time || Math.floor(Date.now() / 1000);
      return [base(pl.kind, delivery || `${repo}:${at}`, at, rest)];
    }
  }
}

// A commit the scan saw land on a default branch: the log's history (replay counts these, one per sha). It has no
// effect and is never streamed: the scan's snapshot already carries it.
export function seenEvents(seen = []) {
  return seen.map((c) => ({ id: `sha:${c.sha}`, time: c.at, source: "scan", kind: "commit.seen", actor: c.login ?? "", repo: c.repo, ...(c.private ? { private: true } : {}), ...(c.bot ? { bot: true } : {}), title: c.subject }));
}

// What the public city may see of an event: nothing from a private repository, and names only as GitHub logins
// (an event carries logins and repository names only, both public for public repositories).
export function publicEvent(e) {
  if (e.private) return null;
  const { private: _, ...rest } = e;
  return rest;
}

// A corporate patron the site lists now and did not list in the previous snapshot: one patron.new each (the city
// draws corporate patrons only). The id is the tier and the name, so the same arrival is logged once.
// tiers: tier id → what one patron of it is called, from config.patrons' crown and boards (patronTiers)
export const patronTiers = (config) => Object.fromEntries(["crown", "boards"].map((k) => config.patrons?.[k]).filter((t) => t?.tier).map((t) => [t.tier, t.label ?? "patron"]));
export function patronEvents(prev, next, time, tiers = {}) {
  if (!prev) return []; // the first snapshot is where the city starts, not a wave of arrivals
  const names = (list, id) => new Set(((list ?? []).find((t) => t.id === id)?.members ?? []).map((m) => m.name));
  const out = [];
  for (const [id, tier] of Object.entries(tiers)) {
    const was = names(prev, id);
    for (const name of names(next, id)) if (!was.has(name)) out.push({ id: `patron:${id}:${name}`, time, source: "scan", kind: "patron.new", actor: "", repo: "", name, tier, title: name, summary: `${name} became a ${tier}` });
  }
  return out;
}
