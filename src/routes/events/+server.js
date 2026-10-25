// the public stream (Server-Sent Events)
export const GET = ({ locals, request }) => locals.relay.stream(request, false);
