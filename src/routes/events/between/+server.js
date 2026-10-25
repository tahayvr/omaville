// the public events in a time range (the replay)
export const GET = ({ locals, url }) => locals.relay.between(url, false);
