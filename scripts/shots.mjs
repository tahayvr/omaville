#!/usr/bin/env node
// Screenshots for review: the city in light and dark through the built app (node build, after vite build, with
// the org sample as its base). Drives a local Chrome over the DevTools protocol with Node's own WebSocket.
//
//   node scripts/shots.mjs [--data dev/snapshot.json] [--out shots] [--chrome /path/to/chrome] [--width 1600 --height 1000]
//                          [--scale 2] [--gpu] [--only dark]
//
// --gpu draws with the machine's GPU instead of software WebGL (SwiftShader), which renders the glow and lamps
// faithfully; --scale is the device pixel ratio.
//
// Writes one PNG per shot into --out and an index.md that lists them.
import { readFile, mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const dataFile = args.data ?? "dev/snapshot.json", outDir = args.out ?? "shots", W = +(args.width ?? 1600), Hh = +(args.height ?? 1000), scale = +(args.scale ?? 1);
const gpu = process.argv.includes("--gpu");
const SHOTS = [
  { name: "3d-light", view: "3d", theme: "light" },
  { name: "3d-dark", view: "3d", theme: "dark" },
].filter((s) => !args.only || s.name.includes(args.only));

// ---- the app, built, on a scratch database ----
if (!existsSync("build/index.js")) { console.error("no build/: run vite build first"); process.exit(2); }
const scratch = await mkdtemp(join(tmpdir(), "city-shots-db-")), appPort = 8900 + Math.floor(Math.random() * 90);
const app = spawn(process.execPath, ["build"], { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, PORT: String(appPort), CITY_INSECURE: "1", CITY_DATA: dataFile, DATABASE_URL: "pglite:" + join(scratch, "db"), CITY_SAMPLE: "" } });
const site = `http://127.0.0.1:${appPort}/`;
for (let i = 0; i < 100; i++) { try { if ((await fetch(site + "status")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }

// ---- Chrome, headless, with software WebGL so the 3D view draws on a machine without a GPU ----
const chrome = args.chrome ?? process.env.CHROME ?? ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find(existsSync);
if (!chrome) { console.error("no Chrome found: pass --chrome or set CHROME"); process.exit(2); }
const profile = await mkdtemp(join(tmpdir(), "city-shots-"));
const proc = spawn(chrome, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", ...(gpu ? ["--enable-gpu", "--ignore-gpu-blocklist"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]), "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
const wsUrl = await new Promise((ok, fail) => {
  let buf = "";
  proc.stderr.on("data", (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) ok(m[1]); });
  proc.on("exit", (c) => fail(new Error(`Chrome exited (${c}) before it listened`)));
  setTimeout(() => fail(new Error("Chrome did not start in 20 s")), 20000);
});

// ---- a minimal DevTools client ----
const ws = new WebSocket(wsUrl);
await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
let nextId = 0;
const pending = new Map();
const errors = new Map(); // sessionId → page errors, reported when a shot fails
ws.onmessage = (e) => { const m = JSON.parse(e.data);
  if (m.method === "Runtime.exceptionThrown") (errors.get(m.sessionId) ?? errors.set(m.sessionId, []).get(m.sessionId)).push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") (errors.get(m.sessionId) ?? errors.set(m.sessionId, []).get(m.sessionId)).push(m.params.args.map((a) => a.value ?? a.description).join(" "));
  const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.fail(new Error(m.error.message)) : p.ok(m.result); } };
const send = (method, params = {}, sessionId) => new Promise((ok, fail) => { const id = ++nextId; pending.set(id, { ok, fail }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await mkdir(outDir, { recursive: true });
const done = [];
let failed = 0;
for (const shot of SHOTS) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  try {
    await s("Page.enable"); await s("Runtime.enable");
    await s("Emulation.setDeviceMetricsOverride", { width: W, height: Hh, deviceScaleFactor: scale, mobile: false });
    await s("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: shot.theme }, { name: "prefers-reduced-motion", value: "reduce" }] });
    await s("Page.navigate", { url: site });
    const t0 = Date.now();
    for (;;) { // ready: the app has booted and the "Drawing the city…" pill is gone
      const { result } = await s("Runtime.evaluate", { expression: `!!document.querySelector(".ow-root[data-ready]")`, returnByValue: true });
      if (result.value) break;
      if (Date.now() - t0 > (+args.timeout || 90) * 1000) throw new Error(`the page did not finish drawing in ${+args.timeout || 90} s`);
      await sleep(250);
    }
    await sleep(2500); // a few frames for WebGL
    const { exceptionDetails } = await s("Runtime.evaluate", { expression: "0" });
    if (exceptionDetails) throw new Error(exceptionDetails.text);
    const { data } = await s("Page.captureScreenshot", { format: "png" });
    await writeFile(join(outDir, `${shot.name}.png`), Buffer.from(data, "base64"));
    done.push(shot);
    console.error(`${shot.name}: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e) { failed++; console.error(`${shot.name}: FAILED ${e.message}${errors.get(sessionId)?.length ? `\n  page errors: ${errors.get(sessionId).slice(0, 5).join("\n  ")}` : ""}`); }
  await send("Target.closeTarget", { targetId });
}
await writeFile(join(outDir, "index.md"), `# Omaville screenshots\n\n${done.map((d) => `- **${d.name}**: ${d.theme} — \`${d.name}.png\``).join("\n")}\n`);
ws.close(); proc.kill(); app.kill();
await rm(profile, { recursive: true, force: true }).catch(() => {}); await rm(scratch, { recursive: true, force: true }).catch(() => {});
if (failed) process.exitCode = 1;
