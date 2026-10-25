// the public city at a moment (the replay)
export const GET = ({ locals, url }) => locals.relay.stateAt(url, false);
