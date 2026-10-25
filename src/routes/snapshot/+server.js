// a base from elsewhere: {data, layout, members?} or data.json (Authorization: Bearer CITY_SNAPSHOT_TOKEN)
export const POST = ({ locals, request }) => locals.relay.snapshot(request);
