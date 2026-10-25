// The ground plan shared by the layout engine and the renderer: the Omarchy mark on a 15 × 15 grid.
// "#" cells are raised platforms (the strokes of the mark), "." cells are ground: channels and the courtyard.
export const LOGO = [
  "###############",
  "#......#......#",
  "#.######...##.#",
  "#.#.........#.#",
  "#.#.........#.#",
  "#.#.........#.#",
  "#.#.........#.#",
  "###.........#.#",
  "#.#.........#.#",
  "#.#.........#.#",
  "#.#.........#.#",
  "#.#.........#.#",
  "#.###########.#",
  "#......#......#",
  "########.######",
];
export const C = 46, X0 = -345, Y0 = -345;
// the deck: the mark's strokes stand PZ above the ground, and every building that counts stands at that level,
// on a stroke or on a plinth of the same height (a lot, a block of the contributors' quarter), so the one
// height scale starts from the same level everywhere
export const PZ = 12;
// lots with a fixed use: three billboard towers and the truck in the gap of the outer ring
export const BOARDS = ["1,1", "13,3", "1,13"]; // billboard towers; their scenery text is config.layout.boards, in this order
export const RESERVED = new Set(["8,14", ...BOARDS]);
export const inCourtyard = (i, j) => i >= 3 && i <= 11 && j >= 3 && j <= 11;
const X = (i) => X0 + i * C, Y = (j) => Y0 + j * C;

// One height scale for every building in town: height = 16 + 14 · log2(1 + lifetime commits / 8).
// 1 commit ≈ 18, 100 ≈ 68, 1,000 ≈ 114, 7,000 ≈ 153. Nothing shrinks when work pauses; it goes dark.
export const H = (n) => 16 + 14 * Math.log2(1 + Math.max(0, n) / 8);
export const SCENERY_MAX = 60; // scenery never outgrows a real building with about 70 commits
export const hash = (a, b = 0, c = 0) => Math.abs(Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453) % 1;

// The ground cells between and around the rings (the channel), in the order the renderer seeds them, and the
// cells in it that hold the skyline: scenery high-rises at the back and in the corners.
export const CHANNEL = [];
for (let j = 0; j < 15; j++) for (let i = 0; i < 15; i++) if (LOGO[j][i] === "." && !inCourtyard(i, j) && !(i === 8 && j === 14)) CHANNEL.push([i, j]);
const CHANNEL_N = new Map(CHANNEL.map(([i, j], n) => [`${i},${j}`, n]));
export const SKYLINE = (i, j) => j === 1 || (i === 1 && j <= 6) || (i === 13 && j <= 4) || (j === 13 && (i <= 2 || i >= 12));
// which scenery building a cell gets and how tall it stands, fixed by the cell: shared by the renderer (which
// draws it) and the layout (which must know what a claimed lot would replace)
export function sceneryPick(lotX, lotY, n, maxH = SCENERY_MAX) {
  const cap = Math.min(maxH, SCENERY_MAX), v = hash(lotX, lotY, n), h = 22 + Math.round(hash(lotY, lotX) * (cap - 22));
  const cooler = v >= 0.62 && v < 0.72;
  return { v, h, cooler, top: cooler ? 30 + hash(n) * 14 : h };
}
// the height of the scenery a lot holds while no repository claims it (0 for crates, sheds and tanks)
export function sceneryHeight(key) {
  const [i, j] = key.split(",").map(Number);
  if (CHANNEL_N.has(key) && !BOARDS.includes(key) && SKYLINE(i, j)) return sceneryPick(X(i), Y(j), CHANNEL_N.get(key), 150).top;
  if (j >= 9 && j <= 11 && i >= 3 && i <= 7 && hash(i, j, 11) < 0.3) return sceneryPick(X(i), Y(j), i * 7 + j, 44).top; // the service quarter
  return 0;
}

// The lots a new repository can claim, best first: the skyline at the back, then the east and west
// channels, then the front row, then whatever ground is left between the rings; when those 45 are taken,
// the courtyard's prop rows open up (rows 7 and 8 first, then 4 and 5, then the service quarter west of the
// warehouse in rows 9 to 11). When the mark is full the rings around it take over (ringOrder), so the city
// never runs out.
export const OVERFLOW_ROWS = [7, 8, 4, 5];
export function lotOrder() {
  const lots = [];
  for (let j = 0; j < 15; j++) for (let i = 0; i < 15; i++) {
    const key = `${i},${j}`;
    if (LOGO[j][i] !== "." || inCourtyard(i, j) || RESERVED.has(key)) continue;
    const band = j === 1 ? 0 : i === 13 ? 1 : i === 1 ? 2 : j === 13 ? 3 : 4;
    lots.push({ key, i, j, band });
  }
  const ring = lots.sort((a, b) => a.band - b.band || (a.band === 1 || a.band === 2 ? a.j - b.j : a.i - b.i)).map((l) => l.key);
  const overflow = OVERFLOW_ROWS.flatMap((j) => Array.from({ length: 9 }, (_, n) => `${3 + n},${j}`))
    .concat([9, 10, 11].flatMap((j) => Array.from({ length: 5 }, (_, n) => `${3 + n},${j}`)));
  return ring.concat(overflow);
}

// The rings around the mark: ring r is the cells whose Chebyshev distance from the mark's centre is 7 + r,
// nearest the arcology first. The contributors' quarter fills them outward, and a repository that finds the
// mark full takes the next cell no house stands on. Endless: a ring always opens beyond the last.
export const ringOf = (key) => { const [i, j] = key.split(",").map(Number); return Math.max(Math.abs(i - 7), Math.abs(j - 7)) - 7; };
export function ringCells(r) {
  const list = [];
  for (let j = -r; j < 15 + r; j++) for (let i = -r; i < 15 + r; i++) if (Math.max(Math.abs(i - 7), Math.abs(j - 7)) === 7 + r) list.push({ key: `${i},${j}`, d: (i - 2.5) ** 2 + (j - 5) ** 2 });
  return list.sort((a, b) => a.d - b.d || a.key.localeCompare(b.key)).map((c) => c.key);
}
export function* ringOrder() { for (let r = 1; ; r++) yield* ringCells(r); }

// The quarter's street plan. The rings around the mark are cut into blocks by streets: an avenue runs along the
// west edge of every third column of cells and the north edge of every third row, and a ring road runs between
// the mark and the first ring. A cell's buildings stand on what the streets leave. Fixed by the cell, so a
// street never moves and the city reads as blocks however far it grows.
export const STREET = 12;
const mod3 = (n) => ((n % 3) + 3) % 3;
export function streetsOf(i, j) { // which edges of a ring cell carry a street: { w, e, n, s }
  const r = Math.max(Math.abs(i - 7), Math.abs(j - 7)) - 7, s = { w: mod3(i) === 0, e: false, n: mod3(j) === 0, s: false };
  if (r === 1) { if (i === -1) s.e = true; if (i === 15) s.w = true; if (j === -1) s.s = true; if (j === 15) s.n = true; } // the ring road
  return s;
}
// Civic cells: about one in nine cells of the rings holds a stadium, a monument, a park, a plaza or a transit
// station instead of houses, never two side by side. Scenery: they carry no data and stay under SCENERY_MAX.
// Houses and repositories never claim them.
const CIVIC_KINDS = ["stadium", "monument", "park", "plaza", "station", "stadium", "park", "monument"];
const civicRaw = (i, j) => Math.max(Math.abs(i - 7), Math.abs(j - 7)) > 7 && hash(i, j, 77) < 0.12;
export function civicAt(key) {
  const [i, j] = key.split(",").map(Number);
  if (!civicRaw(i, j) || civicRaw(i - 1, j) || civicRaw(i, j - 1) || civicRaw(i - 1, j - 1) || civicRaw(i + 1, j - 1)) return null;
  return CIVIC_KINDS[Math.floor(hash(j, i, 78) * CIVIC_KINDS.length)];
}

// Parcels: one per repository, the building and its dock (open pull requests, work on branches) together.
// Every district owns a fixed list of parcels on the mark; a repository keeps its slot (its index) for good,
// so nothing re-spaces when a neighbour leaves. A parcel is { x, y, w, d } in city units; its dock is the strip
// along its +y edge (DOCK units deep) and the building stands on the rest.
// where city/city.js draws each landmark station, in cells (the middle of its plan): the layout engine places a
// Basecamp ward near the repositories it steers, and some of those are landmarks. Keep in step with city.js.
export const LANDMARK_AT = { hall: [2.5, 5.5], press: [4.5, 12.5], disc: [6.5, 12.5], dispatch: [7.5, 14.5], "works-1": [0.74, 0.26], "works-2": [2, 0.26], "works-3": [3.85, 0.26], "works-4": [4.63, 0.26], "pod-1": [9.43, 0.26], "pod-2": [10.72, 0.26] };
export const DOCK = 9;
const strip = (x0, x1, y0, y1, pw, pd) => { // parcels of pw × pd filling a rectangle, in files along y, x first
  const out = [], files = Math.floor((x1 - x0) / pw), rows = Math.floor((y1 - y0) / pd);
  const gx = (x1 - x0 - files * pw) / 2, gy = (y1 - y0 - rows * pd) / 2;
  for (let r = 0; r < rows; r++) for (let f = 0; f < files; f++) out.push({ x: x0 + gx + f * pw, y: y0 + gy + r * pd, w: pw, d: pd });
  return out;
};
export const PARCELS = {
  apps: strip(X(14) + 17, X(15) - 1, Y(1) + 2, Y(14) - 2, 28, 28),          // the outer east stroke, beside the east belt
  catalog: strip(X(12) + 2, X(13) - 2, Y(3) + 2, Y(12) - 2, 21, 30),        // the inner east stroke
  upstream: strip(X(0) + 2, X(1) - 2, Y(2) + 2, Y(7) - 4, 21, 30)           // the outer west stroke, north of the west bridge
    .concat(strip(X(0) + 2, X(1) - 2, Y(8) + 4, Y(10) - 2, 21, 30)),        // and south of it
  sites: strip(X(0) + 2, X(1) - 2, Y(10) + 2, Y(14) - 2, 21, 30),           // the outer west stroke, toward the front
  retired: strip(X(0) + 4, X(7) - 4, Y(14) + 2, Y(15) - 2, 21, 21),         // the outer south stroke, west of dispatch
};
