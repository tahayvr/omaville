// Basecamp's per-project webhooks, at a secret path (CITY_BASECAMP_HOOK_KEY)
export const POST = ({ locals, request, params }) => locals.relay.basecampHook(request, params.key);
