// The board comes with the page, like the city: the members' snapshot when someone is signed in, else the public one.
export function load({ locals, url }) {
  const city = locals.relay.city(!!locals.member);
  return { data: city?.data ?? null, waiting: city ? "" : locals.relay.waiting() ?? "", members: !!locals.member, origin: url.origin };
}
