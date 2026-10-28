// Crawlers may read the page (and its scripts, to render it); the relay's endpoints, the members' city and sign-in
// are not for them.
const PRIVATE = ["/api/", "/members/", "/hook", "/events", "/backfill", "/scan", "/snapshot", "/state/", "/film", "/data.json", "/layout.json", "/status", "/logos/"];

export const GET = ({ url }) =>
  new Response(["User-agent: *", ...PRIVATE.map((p) => `Disallow: ${p}`), "", `Sitemap: ${url.origin}/sitemap.xml`, ""].join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" },
  });
