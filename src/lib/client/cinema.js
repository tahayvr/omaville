// Cinema and kiosk modes: the chrome steps away and the camera drifts on its own. ?mode=cinema glides along a
// rail between the busiest stations and cuts to each live effect as it plays; ?mode=kiosk is the same with a
// clock and the day's totals in a corner, for a hallway screen (and the Omarchy screensaver, omarchy/).
// Any key or click brings the chrome back for a moment; Esc leaves the mode. ?mode=screensaver is the kiosk that
// closes its window at the first key, click or real pointer move. With reduced motion the camera cuts instead of
// gliding, less often, and does not turn.
export function startCinema({ mode, root, map, model, data, timeZone = "UTC", focus, home, still = false }) {
  if (!["cinema", "kiosk", "screensaver"].includes(mode)) return null;
  const saver = mode === "screensaver";
  if (saver) mode = "kiosk";
  root.dataset.cinema = mode;
  const tour = (model.tour?.length ? model.tour : Object.keys(data.repos)).slice(0, 10);
  let i = 0, cut = 0, wake = 0;
  // the rail: a slow turn of the whole city, then each busy station, then the whole city again
  const next = () => {
    if (Date.now() < cut) return;
    if (i % (tour.length + 1) === tour.length) home(4000);
    else focus([tour[i % (tour.length + 1)]], 3500);
    i++;
  };
  next();
  const rail = setInterval(next, still ? 20000 : 9000), turn = setInterval(() => { if (!still && !map.flying?.()) map.orbit?.(3); }, 2500); // a slow turn between flights
  // a live effect: the camera cuts to it and stays a few seconds
  const onEffect = (ids) => { if (!ids?.length) return; cut = Date.now() + 7000; focus(ids, 900); };
  // the kiosk's corner: the time in the org's timezone and today's totals
  let corner = null, clock = 0;
  if (mode === "kiosk") {
    corner = document.createElement("div"); corner.className = "ow-kiosk";
    root.appendChild(corner);
    const draw = () => {
      const today = data.days?.[data.days.length - 1], week = (data.days ?? []).slice(-7).reduce((s, d) => s + d.n, 0);
      const t = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
      const d = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(new Date());
      corner.innerHTML = `<b>${t}</b><span>${d}</span><span>${(today?.n ?? 0).toLocaleString("en-US")} commits today · ${week.toLocaleString("en-US")} this week</span>`;
    };
    draw(); clock = setInterval(draw, 15000);
  }
  if (saver) { // the first real input ends the screensaver (a pointer that drifts a few pixels does not)
    let from = null;
    const quit = () => { window.close(); clearInterval(rail); clearInterval(turn); clearInterval(clock); corner?.remove(); delete root.dataset.cinema; }; // a window the script may not close stays, as the plain city
    const moved = (e) => { if (!from) { from = [e.clientX, e.clientY]; return; } if (Math.hypot(e.clientX - from[0], e.clientY - from[1]) > 24) quit(); };
    addEventListener("keydown", quit); addEventListener("pointerdown", quit); addEventListener("pointermove", moved);
    return { onEffect, stop: quit };
  }
  const reveal = () => { root.dataset.chrome = "on"; clearTimeout(wake); wake = setTimeout(() => delete root.dataset.chrome, 4000); };
  const keys = (e) => { if (e.key === "Escape") stop(); else reveal(); };
  addEventListener("pointermove", reveal); addEventListener("keydown", keys);
  function stop() {
    clearInterval(rail); clearInterval(turn); clearInterval(clock); corner?.remove();
    delete root.dataset.cinema; delete root.dataset.chrome;
    removeEventListener("pointermove", reveal); removeEventListener("keydown", keys);
    const u = new URL(location.href); u.searchParams.delete("mode"); history.replaceState(null, "", u);
  }
  return { onEffect, stop };
}
