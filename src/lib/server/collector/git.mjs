// Source: a folder of local clones (bare or not). Useful offline, for testing, and as a fallback.
// Clone with:  git clone --bare --filter=blob:none https://github.com/<org>/<repo> clones/<repo>.git
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const git = (dir, ...args) => {
  try { return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] }); }
  catch { return ""; }
};

export function fromGit({ dir, now, since, meta = {}, members = [], patrons: patronsSrc = null }) {
  const names = readdirSync(dir).filter((d) => existsSync(join(dir, d, "HEAD")) || existsSync(join(dir, d, ".git")));
  const repos = [], commits = [], branches = [];
  const sinceIso = new Date(since * 1000).toISOString();
  for (const folder of names.sort()) {
    const name = folder.replace(/\.git$/, ""), d = join(dir, folder), m = meta[name] ?? {};
    const head = git(d, "symbolic-ref", "--short", "HEAD").trim() || "main";
    const upstream = git(d, "for-each-ref", "refs/upstream").trim() !== "";
    const not = upstream ? ["--not", "--glob=refs/upstream/*"] : [];
    const landed = new Set(git(d, "rev-list", head, ...not).split("\n").filter(Boolean));
    // --raw lists each file's blob before and after, from the trees alone (a blob:none clone fetches nothing).
    // That set is the change itself, like git patch-id but without reading a diff: a copy rebased onto a base
    // that left its files alone, or squash-merged alone, makes the same change whatever its date or subject,
    // so it gets the same pid. (Stricter than patch-id: a copy whose files the new base also changed differs.)
    const fmt = "%x01%H%x02%at%x02%an%x02%ae%x02%P%x02%s";
    for (const blk of git(d, "log", "--branches", ...not, `--since=${sinceIso}`, `--format=${fmt}`, "--raw", "--no-abbrev", "--no-renames").split("\x01").slice(1)) {
      const [head1, ...rest] = blk.split("\n");
      const [sha, at, an, ae, parents, subject] = head1.split("\x02");
      if (!sha || +at > now) continue;
      const nr = ae.match(/^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/i);
      const change = rest.filter((l) => l.startsWith(":")).map((l) => { const [m, path] = l.split("\t"); const f = m.split(" "); return `${path}:${f[2]}>${f[3]}`; }).sort();
      const pid = change.length ? createHash("sha1").update(`${ae.toLowerCase()}\n${change.join("\n")}`).digest("hex").slice(0, 16) : undefined;
      commits.push({ repo: name, sha, at: +at, login: nr ? nr[1] : null, name: an, email: ae, subject: subject || "", merge: parents.split(" ").length > 1, landed: landed.has(sha), ...(pid ? { pid } : {}) });
    }
    for (const line of git(d, "for-each-ref", "refs/heads", "--format=%(refname:short)%09%(committerdate:unix)").split("\n").filter(Boolean)) {
      const [b, ct] = line.split("\t");
      if (b === head || +ct > now) continue;
      // only recent, non-merge work counts; a branch that carries a whole upstream import is not the org's work
      const total = +git(d, "rev-list", "--count", `${head}..${b}`, ...not).trim() || 0;
      if (total > 2000) continue;
      const ahead = +git(d, "rev-list", "--count", "--no-merges", `--since=${sinceIso}`, `${head}..${b}`, ...not).trim() || 0;
      const authors = {};
      for (const a of git(d, "log", `${head}..${b}`, "--no-merges", "--format=%an", ...not).split("\n").filter(Boolean)) authors[a] = (authors[a] || 0) + 1;
      branches.push({ repo: name, name: b, at: +ct, ahead, authors: Object.entries(authors).sort((x, y) => y[1] - x[1]).slice(0, 3) });
    }
    const pushed = +git(d, "log", "--branches", ...not, "-1", "--format=%at").trim() || 0;
    repos.push({ name, desc: m.desc ?? "", lang: m.lang ?? "", archived: !!m.archived, fork: !!m.fork || upstream, mirror: !!m.mirror, created: m.created ?? 0, pushed: Math.min(pushed, now), pr: m.pr ?? 0, total: landed.size || m.total || 0 });
  }
  const fileIn = (src) => { try { return JSON.parse(git(join(dir, existsSync(join(dir, `${src.repo}.git`)) ? `${src.repo}.git` : src.repo), "show", `HEAD:${src.path}`)); } catch { return null; } };
  const patrons = patronsSrc ? fileIn(patronsSrc) : null;
  // lifetime contributors per repository from the clones (a fork's upstream authors are excluded by refs/upstream)
  const contributors = [];
  for (const folder of names) {
    const name = folder.replace(/\.git$/, ""), d = join(dir, folder), m = meta[name] ?? {};
    if (m.fork || m.mirror || git(d, "for-each-ref", "refs/upstream").trim() !== "") continue;
    for (const line of git(d, "shortlog", "-sn", "--no-merges", "HEAD").split("\n").filter(Boolean)) {
      const mm = line.trim().match(/^(\d+)\s+(.+)$/);
      if (mm) contributors.push({ repo: name, login: mm[2], n: +mm[1] }); // author names, not logins: the API source is the one with logins
    }
  }
  return { now, since, members, teams: [], patrons, repos, commits, branches, contributors, source: `git:${names.length} clones` };
}
