// Clips: 15 seconds of the 3D view as a video, with a caption burned in (the city, the moment, what is selected,
// the latest event), recorded from the canvas with MediaRecorder and saved by the viewer. Works during a replay
// too, so a busy week can be shared as a clip.
export function canClip() { return typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function"; }

export function recordClip({ source, onFrame, caption, seconds = 15, fps = 30, width = 1280, until = null }) { // until: a promise that ends the clip (the year film), with seconds as the cap
  return new Promise((resolve, reject) => {
    const src = source(), ratio = src.height / src.width, out = document.createElement("canvas");
    out.width = width; out.height = Math.round(width * ratio / 2) * 2;
    const ctx = out.getContext("2d"), styles = getComputedStyle(document.getElementById("ow"));
    const fg = styles.getPropertyValue("--anatomy-text").trim() || "#ddd", accent = styles.getPropertyValue("--ow-accent").trim() || "#3fe0e8";
    const type = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
    if (!type) return reject(new Error("this browser cannot record video"));
    const rec = new MediaRecorder(out.captureStream(fps), { mimeType: type, videoBitsPerSecond: 8e6 }), chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => { off(); resolve(new Blob(chunks, { type: type.split(";")[0] })); };
    const draw = () => {
      ctx.drawImage(source(), 0, 0, out.width, out.height); // copied right after the 3D view rendered this frame
      const [line1, line2] = caption(), pad = Math.round(out.width * 0.025), size = Math.round(out.width * 0.014);
      ctx.fillStyle = "rgba(0,0,0,.42)"; ctx.fillRect(0, out.height - size * 4.6, out.width, size * 4.6);
      ctx.font = `600 ${size}px ui-monospace, Menlo, monospace`; ctx.fillStyle = accent; ctx.fillText(line1, pad, out.height - size * 2.6);
      ctx.font = `500 ${Math.round(size * 0.85)}px ui-monospace, Menlo, monospace`; ctx.fillStyle = fg; ctx.fillText(line2, pad, out.height - size * 1.1);
    };
    const off = onFrame(draw);
    rec.start(250);
    const end = () => rec.state !== "inactive" && rec.stop();
    setTimeout(end, seconds * 1000); until?.then(end, end);
  });
}

export function save(blob, name) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
