// The city now comes with the page: the members' city when someone is signed in, else the public one.

export function load({ locals }) {
  const city = locals.relay.city(!!locals.member);
  // no snapshot yet: the page still opens, on the loading plate, saying why (no token, scanning off, the scan's
  // error, or a scan under way) and opening the city once the relay has one
  return { city, waiting: city ? "" : locals.relay.waiting() ?? "", members: !!locals.member };
}
