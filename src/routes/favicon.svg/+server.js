// The page's icon: the Omarchy mark from the city's own grid (LOGO), one square per raised cell, light on dark.
import { LOGO } from "$lib/city/grid.js";

const cells = LOGO.flatMap((row, j) => [...row].map((c, i) => (c === "#" ? `M${i + 1} ${j + 1}h1v1h-1z` : ""))).join("");
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 17 17"><rect width="17" height="17" rx="2" fill="#0b0b0c"/><path d="${cells}" fill="#f4f4f5"/></svg>`;

export const GET = () => new Response(SVG, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
