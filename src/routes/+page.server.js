// The city now comes with the page: the members' city when someone is signed in, else the public one.
import { error } from "@sveltejs/kit";

export function load({ locals }) {
  const city = locals.relay.city(!!locals.member);
  if (!city) error(503, `The city has no snapshot yet: ${locals.relay.waiting() ?? "it is on its way"}.`); // the relay says why: no token, scanning off, the scan's error, or a scan under way
  return { city, members: !!locals.member };
}
