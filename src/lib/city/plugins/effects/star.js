// A star: someone starred one of the org's repositories. A small violet ring at its roof, and nothing left behind.
export default {
  kind: "star",
  name: "Stars",
  legend: {
    signal: "a GitHub star on a repository",
    formula: "one small violet ring at its roof",
    window: "live",
  },
  webhook: { event: "star", map: (p) => (p.action === "created" ? { time: Math.floor(Date.parse(p.starred_at ?? "") / 1000) || 0, summary: `${p.sender?.login ?? "Someone"} starred ${p.repository?.name ?? ""}` } : null) },
  play: (e, at) => [{ t: "ring", at: at.roof, hue: "v", r: 5 }],
};
