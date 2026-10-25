// scan now (Authorization: Bearer CITY_SNAPSHOT_TOKEN)
export const POST = ({ locals, request }) => locals.relay.scan(request);
