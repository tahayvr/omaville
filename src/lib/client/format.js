// Numbers and dates as the cards say them (UTC calendar days, like the data's window).
export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const fmt = (n) => Number(n).toLocaleString("en-US");
export const day = (at) => { const d = new Date(at * 1000); return d.getUTCDate() + " " + MON[d.getUTCMonth()]; };
export const wday = (at) => WD[new Date(at * 1000).getUTCDay()];
export const plural = (n, w, ws = w + "s") => fmt(n) + " " + (n === 1 ? w : ws);
export function ago(t) { const s = Math.max(0, Date.now() / 1000 - t); return s < 90 ? "just now" : s < 5400 ? Math.round(s / 60) + " min ago" : s < 129600 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " days ago"; }
export const longDate = (at) => new Date(at * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
