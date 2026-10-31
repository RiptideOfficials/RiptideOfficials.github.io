// Emails each assigned official a reminder about 3 days before a meet (once per meet).
// Needs two repository secrets: MAIL_USER (Gmail address) and MAIL_APP_PASSWORD (a Gmail "app password").
// Without them this does nothing. Uses the same helper admin account as notify.mjs to read the site.
import { readFileSync } from "node:fs";

const cfgText = readFileSync("assets/firebase-config.js", "utf8");
const API_KEY = /apiKey:\s*"([^"]+)"/.exec(cfgText)?.[1];
const PROJECT = /projectId:\s*"([^"]+)"/.exec(cfgText)?.[1];
const { BOT_EMAIL, BOT_PASSWORD, MAIL_USER, MAIL_APP_PASSWORD } = process.env;
const DAYS = 3, SITE = "https://riptideofficials.github.io/";
if (!MAIL_USER || !MAIL_APP_PASSWORD) { console.log("Reminders skipped (MAIL_USER / MAIL_APP_PASSWORD not set)."); process.exit(0); }
if (!API_KEY || !PROJECT || !BOT_EMAIL || !BOT_PASSWORD) { console.log("Reminders skipped (missing site settings)."); process.exit(0); }
const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const dec = (v) => {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(dec);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
  return null;
};
const docOf = (d) => ({ id: d.name.split("/").pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, dec(v)])) });

const sr = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: BOT_EMAIL, password: BOT_PASSWORD, returnSecureToken: true })
});
const sj = await sr.json(); if (!sr.ok) { console.log("Sign-in failed", sj.error?.message); process.exit(1); }
const H = { Authorization: "Bearer " + sj.idToken };
async function list(path) {
  const out = []; let t = "";
  do {
    const r = await fetch(`${base}/${path}?pageSize=300${t ? "&pageToken=" + encodeURIComponent(t) : ""}`, { headers: H });
    const j = await r.json(); if (!r.ok) { console.log("Could not read", path, j.error?.message); process.exit(1); }
    (j.documents || []).forEach((d) => out.push(docOf(d))); t = j.nextPageToken || "";
  } while (t);
  return out;
}

const norm = (t) => String(t || "").toLowerCase().replace(/\s*\(.*?\)\s*$/, "").replace(/\s+/g, " ").trim();
const nowChicago = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
const today = new Date(nowChicago.getFullYear(), nowChicago.getMonth(), nowChicago.getDate());
const GROUPS = { meetRef: "Meet Referee", admin: "Admin Official", deckRef: "Deck Referee", reliefDeckRef: "Relief Deck Referee", leadStarter: "Lead Starter",
  reliefStarter: "Relief Starter", strokeTurn: "Stroke & Turn", shadow: "Shadowing" };
const WHOLE = ["meetRef", "admin"];

const meets = (await list("meets")).filter((m) => {
  if (m.remindersSent || !m.date) return false;
  const [y, mo, d] = m.date.split("-").map(Number);
  const days = Math.round((new Date(y, mo - 1, d) - today) / 86400000);
  return days >= 0 && days <= DAYS;
});
if (!meets.length) { console.log("No meets in the next " + DAYS + " days that still need reminders."); process.exit(0); }

const users = await list("users");
const nodemailer = (await import("nodemailer")).default;
const mail = nodemailer.createTransport({ service: "gmail", auth: { user: MAIL_USER, pass: MAIL_APP_PASSWORD } });
const fmt = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); };

for (const m of meets) {
  const contacts = await list(`meets/${m.id}/contacts`);
  const emailFor = (name) => {
    const n = norm(name);
    const c = contacts.find((x) => norm(x.name) === n && x.email) || users.find((x) => norm(x.name) === n && x.email && x.approved);
    return c?.email || "";
  };
  const a = m.assignments || {}, byPerson = new Map();
  const add = (name, pos) => { const k = norm(name); if (!k) return; if (!byPerson.has(k)) byPerson.set(k, { name, pos: [] }); byPerson.get(k).pos.push(pos); };
  for (const k of WHOLE) ((a.whole || {})[k] || a[k] || []).forEach((n) => add(n, GROUPS[k]));
  const sessions = a.sessions || [a];
  const names = String(m.sessions || "").split("\n").map((s) => s.trim()).filter(Boolean);
  sessions.forEach((s, i) => Object.keys(GROUPS).filter((k) => !WHOLE.includes(k)).forEach((k) =>
    (s[k] || []).forEach((n) => add(n, GROUPS[k] + (sessions.length > 1 && names[i] ? " (" + names[i] + ")" : "")))));
  let sent = 0, missing = [];
  for (const p of byPerson.values()) {
    const to = emailFor(p.name);
    if (!to) { missing.push(p.name); continue; }
    const when = m.endDate && m.endDate !== m.date ? `${fmt(m.date)} to ${fmt(m.endDate)}` : fmt(m.date);
    const link = `${SITE}meet.html?m=${encodeURIComponent(m.id)}`;
    try {
      await mail.sendMail({
        from: `"Riptide Officials" <${MAIL_USER}>`, to, replyTo: MAIL_USER, subject: `Reminder: ${m.title} on ${when}`,
        text: `Hi ${p.name.split(" ")[0]},\n\nThis is a reminder that you are assigned to work ${m.title} (${when})${m.location ? " at " + m.location : ""}.\n\nYour position: ${p.pos.join(", ")}\n\nMeet details, times and uniform: ${link}\n\nThank you for officiating!\nWendy Peterson, Riptide Officials Coordinator`
      });
      sent++;
    } catch (e) { console.log("Email failed for one person:", e.message); }
  }
  console.log(`${m.title}: ${sent} reminder(s) sent` + (missing.length ? `, no email found for ${missing.length}` : ""));
  const r = await fetch(`${base}/meets/${m.id}?updateMask.fieldPaths=remindersSent`, { method: "PATCH", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ fields: { remindersSent: { booleanValue: true } } }) });
  if (!r.ok) console.log("Could not mark reminders as sent:", await r.text());
}
