// Basecamp webhook payloads → city events, and the events a new scan implies (a new project, a lantern that moved
// on a hill). Every one is members-only (private: true, so the public projection of the log never carries it),
// carries its project as `ward`, and never a body: a to-do's or card's title and a message's subject at most.
//
// Basecamp posts webhooks per project with no signature, so the relay takes them at a secret path,
// POST /hook/basecamp/<CITY_BASECAMP_HOOK_KEY>; scripts/basecamp-hooks.mjs registers that URL on every project.
const KINDS = [
  [/^todo_completed$/, "todo.done"],
  [/^kanban_card_created$/, "card.new"],
  [/^kanban_card_(moved|completed|column_changed)$/, "card.move"],
  [/^message_created$/, "message.new"],
  [/^(comment_created|chat_line_created)$/, "chat.line"],
  [/^question_answer_created$/, "checkin.answer"],
  [/^(upload_created|document_created)$/, "upload.new"],
];
export const BASECAMP_KINDS = ["todo.done", "card.new", "card.move", "message.new", "chat.line", "checkin.answer", "upload.new", "hill.move", "project.new"];

const clip = (s, n = 140) => String(s ?? "").split("\n")[0].slice(0, n);
export function basecampEvents(p) {
  const kind = KINDS.find(([re]) => re.test(p?.kind ?? ""))?.[1], ward = p?.recording?.bucket?.id;
  if (!kind || !ward) return [];
  const time = Math.floor(Date.parse(p.created_at ?? "") / 1000) || Math.floor(Date.now() / 1000);
  const title = kind === "chat.line" ? "" : clip(p.recording?.title); // a comment or chat line shows only as light
  const who = p.creator?.name ?? "";
  const says = { "todo.done": "completed a to-do", "card.new": "added a card", "card.move": "moved a card", "message.new": "posted a message", "chat.line": "said something", "checkin.answer": "answered a check-in", "upload.new": "added a file" }[kind];
  return [{ id: `bc:${p.id}`, time, source: "basecamp", kind, actor: who, repo: "", ward: String(ward), private: true, title, summary: `${who || "Someone"} ${says} in ${clip(p.recording?.bucket?.name, 60)}${title ? `: ${title}` : ""}` }];
}

// what one scan says happened since the last: a project the city had not seen, a list that moved on its hill
export function wardEvents(prev, next, time) {
  if (!prev) return []; // the first scan with wards is where they start
  const out = [];
  for (const [id, w] of Object.entries(next ?? {})) {
    const was = prev[id];
    if (!was) { out.push({ id: `bc:project:${id}`, time, source: "scan", kind: "project.new", actor: "", repo: "", ward: id, private: true, title: w.name ?? "", summary: `A new project: ${w.name ?? ""}` }); continue; }
    const before = new Map((was.hill ?? []).map(([t, pos]) => [t, pos]));
    for (const [t, pos] of w.hill ?? []) if (before.has(t) && before.get(t) !== pos) out.push({ id: `bc:hill:${id}:${t}:${pos}:${time}`, time, source: "scan", kind: "hill.move", actor: "", repo: "", ward: id, private: true, title: t, from: before.get(t), to: pos, summary: `${t} moved ${pos > before.get(t) ? "down" : "up"} the hill in ${w.name ?? "a project"}` });
  }
  return out;
}

// a ward's signals after one live event (the members' state folds it; the next scan has the exact counts)
export function foldWard(w, e) {
  w.events7 = (w.events7 ?? 0) + 1; w.events30 = (w.events30 ?? 0) + 1; w.last = Math.max(w.last ?? 0, e.time);
  if (e.kind === "todo.done") { w.done = (w.done ?? 0) + 1; w.open = Math.max(0, (w.open ?? 0) - 1); }
  else if (e.kind === "message.new") { w.messages7 = (w.messages7 ?? 0) + 1; if (e.title) w.subjects = [[e.time, e.title], ...(w.subjects ?? [])].slice(0, 5); }
  else if (e.kind === "card.new") { const c = (w.columns ?? []).find((x) => x[2] !== "done"); if (c) c[1] += 1; }
  else if (e.kind === "upload.new") w.uploads = (w.uploads ?? 0) + 1;
  else if (e.kind === "checkin.answer") w.checkins = (w.checkins ?? 0) + 1;
  else if (e.kind === "hill.move") { const h = (w.hill ?? []).find(([t]) => t === e.title); if (h) h[1] = e.to; }
  return w;
}

// The progress report's entries (collector/basecamp.mjs reads them as far back as the feed reaches) as the same
// events the webhooks give, with the same ids, so the backfill and the live hooks never log one twice.
const FROM_PROGRESS = [[/^Todo$/, /completed/, "todo.done"], [/^Kanban::Card$/, /created/, "card.new"], [/^Kanban::Card$/, /moved|completed/, "card.move"], [/^Message$/, /created/, "message.new"],
  [/^Comment$/, /created/, "chat.line"], [/^Question::Answer$/, /created/, "checkin.answer"], [/^(Upload|Document)$/, /created/, "upload.new"]];
export function progressEvents(entries = []) {
  const out = [];
  for (const e of entries) {
    const kind = FROM_PROGRESS.find(([t, a]) => t.test(e.recording?.type ?? "") && a.test(e.action ?? e.kind ?? ""))?.[2], ward = e.bucket?.id;
    if (!kind || !ward || !e.id) continue;
    out.push({ id: `bc:${e.id}`, time: Math.floor(Date.parse(e.created_at ?? "") / 1000) || 0, source: "backfill", kind, actor: e.creator?.name ?? "", repo: "", ward: String(ward), private: true, title: kind === "chat.line" ? "" : clip(e.recording?.title), summary: "" });
  }
  return out;
}
