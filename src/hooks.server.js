// Starts the relay and sign-in with the server, and tells every route who is signed in: locals.member (the
// session as { who, via }, or null) and locals.me (who, or the ways in; null when sign-in is off). Better Auth
// answers under /api/auth/.
import { building } from "$app/environment";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { app } from "$lib/server/city.js";

export async function init() { if (!building) await app(); }

export async function handle({ event, resolve }) {
  if (building) return resolve(event);
  const { relay, signin, devSignin } = await app();
  event.locals.relay = relay;
  let member = null;
  if (devSignin) member = { who: devSignin, via: "dev" };
  else if (signin) { const s = await signin.auth.api.getSession({ headers: event.request.headers }); if (s) member = { who: s.user.name || s.user.email, via: "signed in" }; }
  event.locals.member = member;
  event.locals.me = member ? { who: member.who, dev: !!devSignin } : signin ? { who: null, providers: signin.providers } : null;
  if (event.request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "last-event-id" } });
  return signin ? svelteKitHandler({ event, resolve, auth: signin.auth, building }) : resolve(event);
}
