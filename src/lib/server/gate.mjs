// Who may enter the members' city: invite-only, no sign-up. A GitHub identity is let in when its login is a
// member of the org (checked with the app's own token, which sees private memberships too) or its verified email
// is on config.people.invited; a Basecamp identity (37signals Launchpad) when it belongs to config.basecamp.account.
// Both are checked again at every sign-in, so someone who leaves the org or the account is turned away.
const GH = "https://api.github.com";

export async function githubAllowed({ login, email, emailVerified }, { org, orgToken, invited = [], fetchImpl = fetch }) {
  if (login && orgToken && org) {
    const r = await fetchImpl(`${GH}/orgs/${org}/members/${encodeURIComponent(login)}`, { headers: { authorization: `Bearer ${orgToken}`, accept: "application/vnd.github+json", "user-agent": "omaville" } });
    if (r.status === 204) return { ok: true, member: true };
  }
  const list = new Set(invited.map((e) => String(e).toLowerCase()));
  if (email && emailVerified !== false && list.has(String(email).toLowerCase())) return { ok: true, member: false };
  return { ok: false };
}

// Launchpad's authorization.json: the identity and the accounts it belongs to
export function basecampAllowed(authorization, account) {
  return !!account && (authorization?.accounts ?? []).some((a) => String(a.id) === String(account));
}
