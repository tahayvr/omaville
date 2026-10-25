// The city now comes with the page: the members' city when someone is signed in, else the public one.
import { error } from "@sveltejs/kit";

export function load({ locals }) {
  const city = locals.relay.city(!!locals.member);
  if (!city) error(503, "The city has no snapshot yet: the first scan is still running.");
  return { city, members: !!locals.member };
}
