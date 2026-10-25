// The welcome comment: when a first-time contributor's pull request is merged into a public repository, the
// city comments on it once with a link to the house the contribution built. Off unless CITY_WELCOME=1; it needs
// CITY_PUBLIC_URL (the city's address) and CITY_COMMENT_TOKEN (a personal access token that
// may comment on the org's pull requests). Each pull request is welcomed at most once (kept in the relay's meta).
export function createWelcome({ env = process.env, config = {}, getMeta, putMeta, fetchImpl = fetch, log = console.error }) {
  const on = env.CITY_WELCOME === "1" && !!env.CITY_PUBLIC_URL && !!env.CITY_COMMENT_TOKEN;
  const name = config.name || config.org, title = config.title || "the city"; // the org's words (city.config.json)
  const body = (login) => `Welcome, @${login}. Your first contribution to ${name} built you a house in ${title}: ${env.CITY_PUBLIC_URL.replace(/\/$/, "")}/?house=${encodeURIComponent(login)}`;
  return {
    on,
    async maybe(e) {
      if (!on || e.kind !== "pr.merge" || !e.first || e.private || !e.author || !e.repo) return false;
      const key = `welcome:${e.repo}#${e.number}`;
      try { // the whole path: a database that is down must not reach the hook (relay.mjs fires this after its answer)
        if (await getMeta(key)) return false;
        await putMeta(key, String(Date.now()));
        const r = await fetchImpl(`https://api.github.com/repos/${config.org}/${e.repo}/issues/${e.number}/comments`, { method: "POST", headers: { authorization: `Bearer ${env.CITY_COMMENT_TOKEN}`, accept: "application/vnd.github+json", "content-type": "application/json", "user-agent": "omaville" }, body: JSON.stringify({ body: body(e.author) }) });
        log(`welcome ${e.repo}#${e.number} @${e.author}: ${r.status}`);
        return r.ok;
      } catch (err) { log(`welcome failed: ${err.message.slice(0, 120)}`); return false; }
    },
  };
}
