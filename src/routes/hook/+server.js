// a GitHub webhook (the signature is checked against CITY_WEBHOOK_SECRET)
export const POST = ({ locals, request }) => locals.relay.hook(request);
