// What every page gets from the server: the parts of city.config.json the browser needs (collector/public.mjs:
// never people, aliases, teams, the invite list, nor a repository that was ever private unless a member asks), and
// who is signed in ({ who } or the ways in, null when sign-in is off).
import { publicConfig } from "$lib/server/collector/public.mjs";

export function load({ locals }) {
  return { config: publicConfig(locals.relay.config, { private: locals.relay.privateRepos(), member: !!locals.member }), me: locals.me };
}
