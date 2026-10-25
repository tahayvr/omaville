// Source: the GitHub API. Needs a token that can read the org's repositories and members.
//   Fine-grained token on the org: Repository "Contents: read", "Metadata: read", "Pull requests: read";
//   Organization "Members: read". For the public city alone, a token for public repositories is enough.
const API = "https://api.github.com";

export function client(token, { log = () => {} } = {}) {
  let remaining = Infinity;
  async function call(url, init = {}, tries = 4) {
    for (let attempt = 0; ; attempt++) {
      let res;
      try { // a request that hangs (a laptop that slept, a dropped socket) is retried, never waited on forever
        res = await fetch(url, { ...init, signal: AbortSignal.timeout(60000), headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "omaville", ...init.headers } });
      } catch (e) {
        if (attempt >= tries) throw new Error(`${e.name === "TimeoutError" ? "timed out" : e.message} ${url}`);
        log(`retry: ${e.name === "TimeoutError" ? "timed out" : e.message} ${url}`); await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt)); continue;
      }
      remaining = +(res.headers.get("x-ratelimit-remaining") ?? remaining);
      if (res.ok) return res.json();
      const retry = res.status === 403 || res.status === 429 || res.status >= 500;
      if (!retry || attempt >= tries) throw new Error(`${res.status} ${url}: ${(await res.text()).slice(0, 300)}`);
      const reset = +(res.headers.get("x-ratelimit-reset") ?? 0) * 1000 - Date.now();
      const wait = Math.min(60000, Math.max(1000 * 2 ** attempt, res.status === 403 && remaining === 0 ? reset : 0));
      log(`retry in ${Math.round(wait / 1000)}s: ${res.status} ${url}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  const graphql = async (query, variables) => {
    const j = await call(`${API}/graphql`, { method: "POST", body: JSON.stringify({ query, variables }) });
    if (j.errors?.length) throw new Error(j.errors.map((e) => e.message).join("; "));
    return j.data;
  };
  const rest = (path) => call(`${API}${path}`);
  return { graphql, rest, remaining: () => remaining };
}

// a repository's own hints for the city (config.hints, e.g. .omacom-city.yml, at its default branch):
// `project: <Basecamp project id>` puts it in that project's ward, nothing else links repositories to projects
export const projectHint = (text) => { const m = (text ?? "").match(/^\s*project:\s*["']?(\d+)["']?\s*$/m); return m ? m[1] : undefined; };
const REPOS = (hints) => `query($org:String!,$after:String){organization(login:$org){repositories(first:50,after:$after,orderBy:{field:PUSHED_AT,direction:DESC}){pageInfo{hasNextPage endCursor}nodes{
  name description isArchived isFork isMirror isPrivate createdAt pushedAt primaryLanguage{name}
  defaultBranchRef{name target{...on Commit{history{totalCount}}}} parent{nameWithOwner defaultBranchRef{name}}
  pullRequests(states:OPEN){totalCount}
  hint:object(expression:"HEAD:${hints.replace(/[^\w./-]/g, "")}"){...on Blob{text}}
  releases{totalCount}
  refs(refPrefix:"refs/heads/",first:100,orderBy:{field:TAG_COMMIT_DATE,direction:DESC}){nodes{name target{...on Commit{committedDate}}}}}}}}`;
const TEAMS = `query($org:String!,$after:String){organization(login:$org){teams(first:50,after:$after){pageInfo{hasNextPage endCursor}nodes{name members(first:100){nodes{login}}}}}}`;
const MEMBERS = `query($org:String!,$after:String){organization(login:$org){membersWithRole(first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{login name}}}}`;
const HISTORY = `query($owner:String!,$name:String!,$since:GitTimestamp!,$after:String){repository(owner:$owner,name:$name){defaultBranchRef{target{...on Commit{
  history(since:$since,first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{oid authoredDate committedDate messageHeadline parents{totalCount} author{name email user{login}}}}}}}}}`;

const LIST = `query($org:String!,$after:String){organization(login:$org){repositories(first:50,after:$after){pageInfo{hasNextPage endCursor}nodes{name isFork isMirror isPrivate}}}}`;
const MERGED = `query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){pullRequests(states:MERGED,first:100,after:$after,orderBy:{field:CREATED_AT,direction:ASC}){pageInfo{hasNextPage endCursor}nodes{number title mergedAt author{login}}}}}`;
const RELEASES = `query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){releases(first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{databaseId tagName name publishedAt isDraft}}}}`;

// The org's whole history, for the relay's log (Phase 4 backfill): every commit on each default branch (as
// commit.seen, one per sha), every merged pull request and every release, with the same ids the webhooks use, so
// a backfill and the live stream never count the same thing twice. Forks and mirrors are skipped: their history is
// upstream's. onRepo reports progress; isBot marks bot and routine authors.
export async function historyOf({ org, token, publicOnly = false, isBot = () => false, onRepo = () => {}, onPage = () => {}, mirrors = [], log = console.error }) {
  const gh = client(token, { log }), events = [];
  const repos = (await pages(async (after) => (await gh.graphql(LIST, { org, after })).organization.repositories)).filter((r) => !r.isFork && !r.isMirror && !mirrors.includes(r.name) && !(publicOnly && r.isPrivate)); // a stock mirror's history is upstream's, not the org's
  const sec = (t) => Math.floor(Date.parse(t) / 1000);
  let finished = 0;
  await pool(repos, 4, async (r, k) => {
    const priv = r.isPrivate ? { private: true } : {};
    try {
      onPage(r.name, 0);
      const commits = await pages(async (after) => { onPage(r.name, 1); return (await gh.graphql(HISTORY, { owner: org, name: r.name, since: "1970-01-01T00:00:00Z", after })).repository?.defaultBranchRef?.target?.history ?? { nodes: [], pageInfo: {} }; });
      for (const c of commits) if (c.parents.totalCount < 2) {
        const login = c.author?.user?.login ?? "", bot = isBot(login || c.author?.name || "", c.messageHeadline);
        events.push({ id: `sha:${c.oid}`, time: sec(c.authoredDate || c.committedDate), source: "backfill", kind: "commit.seen", actor: login, repo: r.name, ...priv, ...(bot ? { bot: true } : {}), title: (c.messageHeadline || "").slice(0, 140) });
      }
      for (const pr of await pages(async (after) => (await gh.graphql(MERGED, { owner: org, name: r.name, after })).repository.pullRequests))
        events.push({ id: `gh:pr.merge:${r.name}#${pr.number}:merged`, time: sec(pr.mergedAt), source: "backfill", kind: "pr.merge", actor: pr.author?.login ?? "", repo: r.name, ...priv, number: pr.number, title: (pr.title || "").slice(0, 140), summary: `#${pr.number} merged into ${r.name}: ${(pr.title || "").slice(0, 140)}` });
      for (const rel of await pages(async (after) => (await gh.graphql(RELEASES, { owner: org, name: r.name, after })).repository.releases))
        if (!rel.isDraft && rel.publishedAt) events.push({ id: `gh:release:${r.name}:${rel.databaseId}`, time: sec(rel.publishedAt), source: "backfill", kind: "release", actor: "", repo: r.name, ...priv, ref: rel.tagName, title: (rel.name || rel.tagName || "").slice(0, 140), summary: `${r.name} ${rel.tagName} released` });
    } catch (e) { log(`history of ${r.name} skipped: ${e.message.slice(0, 120)}`); }
    onRepo(++finished, repos.length, r.name);
  });
  log(`history: ${events.length} events from ${repos.length} repositories, rate left ${gh.remaining()}`);
  return events.sort((a, b) => a.time - b.time);
}

async function pages(fetchPage) {
  const out = [];
  for (let after = null; ;) { const { nodes, pageInfo } = await fetchPage(after); out.push(...nodes); if (!pageInfo.hasNextPage) return out; after = pageInfo.endCursor; }
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
const fromRest = (repo, c, landed) => ({
  repo, sha: c.sha, at: Math.floor(Date.parse(c.commit.author?.date || c.commit.committer?.date) / 1000),
  login: c.author?.login ?? null, name: c.commit.author?.name ?? "", email: c.commit.author?.email ?? "",
  subject: (c.commit.message || "").split("\n")[0], merge: (c.parents?.length ?? 1) > 1, landed,
});

// publicOnly: private repositories are never read (the public city alone, e.g. before sign-in is set up)
export async function fromGithub({ org, token, now, since, hints = ".city.yml", publicOnly = false, maxBranches = 30, patrons: patronsSrc = null, mirrors = [], log = console.error }) {
  const gh = client(token, { log });
  // every member needs a token that may read the org's members; a token for public repositories sees only the public ones
  let members;
  try { members = await pages(async (after) => (await gh.graphql(MEMBERS, { org, after })).organization.membersWithRole); }
  catch (e) {
    log(`members: ${e.message.slice(0, 120)}; the public members instead`);
    members = [];
    for (let page = 1; ; page++) { const p = await gh.rest(`/orgs/${org}/public_members?per_page=100&page=${page}`); members.push(...p.map((m) => ({ login: m.login, name: null }))); if (p.length < 100) break; }
  }
  log(`members: ${members.length}`);
  const list = (await pages(async (after) => (await gh.graphql(REPOS(hints), { org, after })).organization.repositories)).filter((r) => !(publicOnly && r.isPrivate));
  log(`repos: ${list.length}`);
  const sinceIso = new Date(since * 1000).toISOString();
  const commits = [], branches = [], ahead = new Map(); // ahead: a fork's lifetime commits beyond its upstream
  await pool(list, 6, async (r) => {
    const def = r.defaultBranchRef?.name;
    if (!def) return;
    const recent = Date.parse(r.pushedAt) / 1000 >= since;
    // landed work: the default branch since the window opened; for forks, only what is ahead of upstream
    if (r.isFork && r.parent?.defaultBranchRef) {
      try {
        const [po] = r.parent.nameWithOwner.split("/");
        const cmp = await gh.rest(`/repos/${org}/${r.name}/compare/${encodeURIComponent(`${po}:${r.parent.defaultBranchRef.name}`)}...${encodeURIComponent(def)}?per_page=250`);
        ahead.set(r.name, cmp.ahead_by ?? 0);
        if (recent) for (const c of cmp.commits ?? []) { const x = fromRest(r.name, c, true); if (x.at > since) commits.push(x); }
      } catch (e) { log(`fork compare skipped for ${r.name}: ${e.message.slice(0, 120)}`); }
    } else if (recent) {
      const nodes = await pages(async (after) => {
        const t = (await gh.graphql(HISTORY, { owner: org, name: r.name, since: sinceIso, after })).repository.defaultBranchRef?.target;
        return t?.history ?? { nodes: [], pageInfo: { hasNextPage: false } };
      });
      // author dates, like the branch compares and the git source, so a rebased copy keeps the same key.
      // No change id (pid) here: the history and compare lists carry no tree or diff per commit, and getting
      // one costs a REST call per commit (GET /commits/{sha}), more than a 15-minute run can spend. A copy
      // with a new date and subject (a one-commit squash merge) is caught only by the git source.
      for (const c of nodes) commits.push({ repo: r.name, sha: c.oid, at: Math.floor(Date.parse(c.authoredDate || c.committedDate) / 1000), login: c.author?.user?.login ?? null, name: c.author?.name ?? "", email: c.author?.email ?? "", subject: c.messageHeadline, merge: c.parents.totalCount > 1, landed: true });
    }
    if (!recent) return;
    // work still on branches: compare each recently updated branch with the default branch
    const recentRefs = (r.refs?.nodes ?? []).filter((b) => b.name !== def && Date.parse(b.target?.committedDate) / 1000 > since).slice(0, maxBranches);
    for (const b of recentRefs) {
      try {
        const cmp = await gh.rest(`/repos/${org}/${r.name}/compare/${encodeURIComponent(def)}...${encodeURIComponent(b.name)}?per_page=100`);
        if ((cmp.ahead_by ?? 0) > 2000) continue; // an upstream import, not the org's work
        const authors = {};
        let ahead = 0;
        for (const c of cmp.commits ?? []) {
          const x = fromRest(r.name, c, false);
          if (!x.merge) authors[x.name] = (authors[x.name] || 0) + 1;
          if (x.at > since) { commits.push(x); if (!x.merge) ahead++; }
        }
        branches.push({ repo: r.name, name: b.name, at: Math.floor(Date.parse(b.target.committedDate) / 1000), ahead, authors: Object.entries(authors).sort((a, c) => c[1] - a[1]).slice(0, 3) });
      } catch (e) { log(`branch ${r.name}/${b.name} skipped: ${e.message.slice(0, 120)}`); }
    }
  });
  const repos = list.map((r) => ({
    name: r.name, desc: r.description ?? "", lang: r.primaryLanguage?.name ?? "", archived: r.isArchived, fork: r.isFork, mirror: r.isMirror, private: r.isPrivate,
    created: Math.floor(Date.parse(r.createdAt) / 1000), pushed: Math.floor(Date.parse(r.pushedAt) / 1000), pr: r.pullRequests.totalCount, releases: r.releases?.totalCount ?? 0, project: projectHint(r.hint?.text),
    // lifetime commits, what a building's height follows: the default branch, or for a fork only what is ahead of upstream; mirrors carry none of the org's work
    total: r.isMirror ? 0 : r.isFork ? (ahead.get(r.name) ?? 0) : r.defaultBranchRef?.target?.history?.totalCount ?? 0,
  }));
  // the org's teams on GitHub, for the members' city: [{ name, members: [login] }] (needs a token that reads the org)
  let teams = [];
  if (!publicOnly) {
    try { teams = (await pages(async (after) => (await gh.graphql(TEAMS, { org, after })).organization.teams)).map((t) => ({ name: t.name, members: t.members.nodes.map((m) => m.login) })); }
    catch (e) { log(`teams skipped: ${e.message.slice(0, 120)}`); }
  }
  // the org's patrons, as its patrons file lists them (config.patrons: repo and path)
  let patrons = null;
  if (patronsSrc) {
    try { const f = await gh.rest(`/repos/${org}/${patronsSrc.repo}/contents/${patronsSrc.path}`); patrons = JSON.parse(Buffer.from(f.content, "base64").toString("utf8")); }
    catch (e) { log(`patrons skipped: ${e.message.slice(0, 120)}`); }
  }
  // which members show their membership publicly: the public city marks only those
  let publicMembers = [];
  try { for (let page = 1; ; page++) { const p = await gh.rest(`/orgs/${org}/public_members?per_page=100&page=${page}`); publicMembers.push(...p.map((m) => m.login)); if (p.length < 100) break; } }
  catch (e) { log(`public members skipped: ${e.message.slice(0, 120)}`); }
  // lifetime contributors per public repository (forks and mirrors carry upstream's authors, so they are skipped):
  // one house per person in the contributors' quarter
  const contributors = [], mirrorSet = new Set(mirrors);
  await pool(list.filter((r) => !r.isPrivate && !r.isFork && !r.isMirror && !mirrorSet.has(r.name)), 6, async (r) => {
    try {
      for (let page = 1; page <= 10; page++) {
        const p = await gh.rest(`/repos/${org}/${r.name}/contributors?per_page=100&page=${page}`);
        for (const c of p) if (c.login) contributors.push({ repo: r.name, login: c.login, n: c.contributions, ...(c.type === "Bot" ? { bot: true } : {}) }); // bots kept, flagged: their commits come off the height
        if (p.length < 100) break;
      }
    } catch (e) { log(`contributors skipped for ${r.name}: ${e.message.slice(0, 120)}`); }
  });
  log(`commits: ${commits.length}, branches: ${branches.length}, contributors: ${contributors.length} rows, public members: ${publicMembers.length}, rate left: ${gh.remaining()}`);
  return { now, since, members, publicMembers, teams, patrons, repos, commits: commits.filter((c) => c.at <= now), branches, contributors, source: `github:${org}` };
}
