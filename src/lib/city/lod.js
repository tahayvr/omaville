// Level of detail, in pixels per city unit, the same in both views: the far view is the skyline, the lit windows and
// the big signs; closer come workers, pallets, racks, belts and the smaller signs; closest the name plates and
// plaques. A sign shows once its letters are 3 px tall, a plate or plaque at 5 px, small parts at 0.9 px per unit.
export const SMALL_PARTS = 0.9, SIGN_PX = 3, PLATE_PX = 5;
// The edge lines fade out toward the far view (the dark theme): from the home zoom the city reads by its faces and
// its lights, like a night flight, and the drawing's lines come back as you approach. Opacity per pixels per unit.
export const edgeAlpha = (z) => { const u = Math.max(0, Math.min(1, (z - 0.5) / 1.2)); return 0.08 + 0.92 * u * u * (3 - 2 * u); };
