// the org's whole history into the log, once (Authorization: Bearer CITY_SNAPSHOT_TOKEN)
export const POST = ({ locals, request }) => locals.relay.backfill(request);
