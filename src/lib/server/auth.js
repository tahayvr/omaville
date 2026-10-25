// Sign-in for the members' city, with Better Auth: GitHub (built in) and Basecamp (37signals Launchpad, through
// the generic OAuth plugin), invite-only (gate.mjs). Users, accounts and sessions live in the app's database, on
// Better Auth's Drizzle adapter (db/schema.js). Off unless BETTER_AUTH_SECRET and at least one provider are set.
// Env: BETTER_AUTH_SECRET, BETTER_AUTH_URL (the city's address), GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET (callback
//      <url>/api/auth/callback/github), BASECAMP_CLIENT_ID, BASECAMP_CLIENT_SECRET (callback
//      <url>/api/auth/callback/basecamp).
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { getRequestEvent } from "$app/server";
import { env } from "$env/dynamic/private";
import { githubAllowed, basecampAllowed } from "./gate.mjs";
import { user, session, account, verification } from "./db/schema.js";

const LAUNCHPAD = "https://launchpad.37signals.com";

// db: the app's Drizzle connection (db/index.js)
export function makeAuth(config, db) {
  const github = env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET, basecamp = env.BASECAMP_CLIENT_ID && env.BASECAMP_CLIENT_SECRET;
  if (!env.BETTER_AUTH_SECRET || !(github || basecamp)) return null;
  const orgToken = env.GITHUB_TOKEN || env.GH_TOKEN || "";
  const auth = betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL || undefined,
    database: drizzleAdapter(db, { provider: "pg", schema: { user, session, account, verification } }),
    session: { expiresIn: 14 * 86400 },
    socialProviders: github ? {
      github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET, mapProfileToUser: (p) => ({ name: p.login }) }, // the login is the name the city knows
    } : {},
    user: {
      // invite-only: every GitHub sign-in, first or returning, is checked against the org and the invite list
      async validateUserInfo({ user, source }) {
        if (source.oauth?.providerId !== "github") return;
        const ok = await githubAllowed({ login: source.oauth.profile?.login, email: user.email, emailVerified: user.emailVerified }, { org: config.org, orgToken, invited: config.people?.invited ?? [] });
        if (!ok.ok) return { error: "not_invited", errorDescription: "That account is not a member or invited" };
      },
    },
    plugins: [
      ...(basecamp ? [genericOAuth({ config: [{
        providerId: "basecamp", clientId: env.BASECAMP_CLIENT_ID, clientSecret: env.BASECAMP_CLIENT_SECRET,
        authorizationUrl: `${LAUNCHPAD}/authorization/new`, tokenUrl: `${LAUNCHPAD}/authorization/token`,
        authorizationUrlParams: { type: "web_server" }, tokenUrlParams: { type: "web_server" }, pkce: false,
        // the identity, and only when it belongs to the foundation's Basecamp account
        async getUserInfo(tokens) {
          const a = await (await fetch(`${LAUNCHPAD}/authorization.json`, { headers: { authorization: `Bearer ${tokens.accessToken}`, "user-agent": "omaville (https://github.com/omacom)" } })).json();
          if (!basecampAllowed(a, config.basecamp?.account)) return null;
          const i = a.identity ?? {};
          return { id: String(i.id), name: `${i.first_name ?? ""} ${i.last_name ?? ""}`.trim() || i.email_address, email: i.email_address, emailVerified: true };
        },
      }] })] : []),
      sveltekitCookies(getRequestEvent), // the last plugin
    ],
  });
  return { auth, providers: [github && "github", basecamp && "basecamp"].filter(Boolean) };
}
