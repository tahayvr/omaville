// buildStation, by slicing: a station's drawing is whatever buildCity puts inside <g data-station="id"> groups
// (its building, its pallet, capsules and workers, a day's column). Rebuilding a few stations is a full build of
// the city with the new data, cut down to those groups, so a station drawn in place is byte for byte what a full
// build would draw. Pure string work: runs in the builder worker and in Node.
export function stationFragments(svg, ids) {
  const want = new Set(ids), out = Object.fromEntries(ids.map((id) => [id, []]));
  const open = /<g data-station="([^"]+)"/g;
  let m;
  while ((m = open.exec(svg))) {
    if (!want.has(m[1])) continue;
    // the matching </g>: count nested <g …> and </g> from here
    let depth = 0, i = m.index;
    const tag = /<g[\s>]|<\/g>/g; tag.lastIndex = i;
    let t;
    while ((t = tag.exec(svg))) { if (t[0] === "</g>") { if (--depth === 0) break; } else depth++; }
    if (!t) break;
    const end = t.index + 4;
    out[m[1]].push(svg.slice(i, end));
    open.lastIndex = end; // a group of the same station nested inside belongs to this fragment
  }
  return out;
}
// the stations a change to these repositories redraws: the repositories themselves and the org's day columns
export const stationsFor = (repos, days = []) => [...repos, ...days.map((i) => `day-${i}`)];
