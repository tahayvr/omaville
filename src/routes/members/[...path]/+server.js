// The members' city (private repositories, names, Basecamp wards): only with a session. The same endpoints as
// the public city, under /members/.
const json401 = () => Response.json({ error: "sign in" }, { status: 401, headers: { "cache-control": "no-store" } });
export function GET({ locals, params, request, url }) {
  if (!locals.member) return json401();
  const r = locals.relay;
  switch (params.path) {
    case "data.json": return r.data(true);
    case "layout.json": return r.layout(true);
    case "events": return r.stream(request, true);
    case "events/between": return r.between(url, true);
    case "state/at": return r.stateAt(url, true);
    case "film": return r.film(url, true);
    default: return Response.json({ error: "not found" }, { status: 404 });
  }
}
