// Checks Firestore (as a helper admin account) for people waiting on the coordinator and opens a
// GitHub issue (no personal details) so GitHub emails the coordinator.
import { readFileSync } from "node:fs";

const cfgText = readFileSync("assets/firebase-config.js", "utf8");
const API_KEY = /apiKey:\s*"([^"]+)"/.exec(cfgText)?.[1];
const PROJECT = /projectId:\s*"([^"]+)"/.exec(cfgText)?.[1];
const { BOT_EMAIL, BOT_PASSWORD, GH_TOKEN, GITHUB_REPOSITORY } = process.env;
const MENTION = (process.env.NOTIFY_USER || "RiptideReaders").trim();
const SITE = "https://riptideofficials.github.io/";

function fail(msg) { console.error(msg); process.exit(1); }
if (!API_KEY || !PROJECT) fail("Could not read the Firebase settings.");
if (!BOT_EMAIL || !BOT_PASSWORD) fail("BOT_EMAIL and BOT_PASSWORD secrets are not set.");

const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

async function signIn() {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: BOT_EMAIL, password: BOT_PASSWORD, returnSecureToken: true })
  });
  const j = await r.json();
  if (!r.ok) fail("Helper account sign-in failed: " + (j.error?.message || r.status));
  return { token: j.idToken, uid: j.localId };
}

async function listAll(path, token) {
  const out = []; let pageToken = "";
  do {
    const r = await fetch(`${base}/${path}?pageSize=300${pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : ""}`, { headers: { Authorization: "Bearer " + token } });
    const j = await r.json();
    if (!r.ok) fail(`Could not read ${path}: ${j.error?.message || r.status} (is the helper account approved and an admin?)`);
    (j.documents || []).forEach((d) => out.push(d));
    pageToken = j.nextPageToken || "";
  } while (pageToken);
  return out;
}
const idOf = (d) => d.name.split("/").pop();
const boolOf = (d, k) => d.fields?.[k]?.booleanValue === true;

async function getNotified(token) {
  const r = await fetch(`${base}/private/notified`, { headers: { Authorization: "Bearer " + token } });
  if (r.status === 404) return [];
  const j = await r.json();
  if (!r.ok) fail("Could not read the notified list: " + (j.error?.message || r.status));
  return (j.fields?.ids?.arrayValue?.values || []).map((v) => v.stringValue);
}
async function saveNotified(token, ids) {
  const r = await fetch(`${base}/private/notified?updateMask.fieldPaths=ids`, {
    method: "PATCH", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { ids: { arrayValue: { values: ids.map((s) => ({ stringValue: s })) } } } })
  });
  if (!r.ok) fail("Could not save the notified list: " + (await r.text()));
}

async function gh(path, method, body) {
  const r = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/${path}`, {
    method, headers: { Authorization: "Bearer " + GH_TOKEN, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await r.json();
  if (!r.ok) fail("GitHub error: " + JSON.stringify(j));
  return j;
}

const { token, uid } = await signIn();
const notified = await getNotified(token);
const users = (await listAll("users", token)).filter((d) => idOf(d) !== uid && !boolOf(d, "approved"));
const interest = (await listAll("interest", token)).filter((d) => !boolOf(d, "responded"));
const newUsers = users.filter((d) => !notified.includes("u:" + idOf(d)));
const newInterest = interest.filter((d) => !notified.includes("i:" + idOf(d)));

// New meet sign-ups (upcoming meets only). The first time this runs, existing sign-ups are recorded silently.
const chi = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
const todayIso = `${chi.getFullYear()}-${String(chi.getMonth() + 1).padStart(2, "0")}-${String(chi.getDate()).padStart(2, "0")}`;
const sField = (d, k) => d.fields?.[k]?.stringValue || "";
const signups = [];
for (const m of (await listAll("meets", token)).filter((d) => (sField(d, "endDate") || sField(d, "date")) >= todayIso)) {
  for (const c of await listAll(`meets/${idOf(m)}/contacts`, token)) signups.push({ id: "s:" + idOf(m) + "/" + idOf(c), name: sField(c, "name"), role: sField(c, "role"), meet: sField(m, "title") });
}
const firstRun = !notified.includes("s:init");
const newSignups = firstRun ? [] : signups.filter((x) => !notified.includes(x.id));

console.log(`waiting: ${users.length} account(s), ${interest.length} interested; new: ${newUsers.length} + ${newInterest.length}; sign-ups new: ${newSignups.length}${firstRun ? " (first run, baseline saved)" : ""}`);
const keepIds = () => notified.filter((k) => (k.startsWith("u:") ? users.some((d) => "u:" + idOf(d) === k) : k.startsWith("i:") ? interest.some((d) => "i:" + idOf(d) === k) : k === "s:init" || signups.some((x) => x.id === k)));
if (!newUsers.length && !newInterest.length && !newSignups.length) {
  if (firstRun) // Email about new meet sign-ups (best effort; needs the MAIL_USER / MAIL_APP_PASSWORD secrets).
if (newSignups.length && process.env.MAIL_USER && process.env.MAIL_APP_PASSWORD) {
  try {
    const nodemailer = (await import("nodemailer")).default;
    const mail = nodemailer.createTransport({ service: "gmail", auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_APP_PASSWORD } });
    const lines = newSignups.map((x) => `- ${x.name || "Someone"}: ${x.role || "position not listed"} (${x.meet || "a meet"})`).join("\n");
    await mail.sendMail({
      from: `"Riptide Officials" <${process.env.MAIL_USER}>`, to: process.env.NOTIFY_EMAIL || "whpeterson@gmail.com",
      subject: newSignups.length === 1 ? `New sign-up: ${newSignups[0].name || "Someone"} for ${newSignups[0].meet || "a meet"}` : `${newSignups.length} new meet sign-ups`,
      text: `New meet sign-up${newSignups.length > 1 ? "s" : ""}:\n\n${lines}\n\nSee everyone who signed up: ${SITE}meets.html\n`
    });
    console.log("sign-up email sent");
  } catch (e) { console.log("sign-up email failed:", e.message); }
}
await saveNotified(token, keepIds().concat(["s:init"], signups.map((x) => x.id)));
  process.exit(0);
}
const total = users.length + interest.length + newSignups.length;

const parts = [];
if (newUsers.length) parts.push(`${newUsers.length} new account${newUsers.length > 1 ? "s" : ""} waiting for approval`);
if (newInterest.length) parts.push(`${newInterest.length} new interested ${newInterest.length > 1 ? "people" : "person"}`);
const sFirst = (n) => { const w = String(n || "Someone").trim().split(/\s+/); return w.length > 1 ? w[0] + " " + w[w.length - 1][0] + "." : w[0]; };
const gparts = parts.slice();   // generic wording for the public GitHub issue (no names)
if (newSignups.length) gparts.push(`${newSignups.length} new meet sign-up${newSignups.length > 1 ? "s" : ""}`);
if (newSignups.length) parts.push(newSignups.length === 1 ? `${sFirst(newSignups[0].name)} signed up for ${newSignups[0].meet || "a meet"}` : `${newSignups.length} new meet sign-ups`);
const issue = await gh("issues", "POST", {
  title: "Riptide Officials: " + gparts.join(" and "),
  body: `@${MENTION} ${gparts.join(" and ")}.\n\nOpen the Admin page to see who: ${SITE}admin.html\n\n(This message has no names or contact details on purpose.)`
});
let pushNote = "";

// Phone alerts (Web Push) to every admin phone that turned them on. Best effort: never stops the run.
try {
  const { VAPID_PRIVATE_KEY } = process.env;
  const pub = /VAPID_PUBLIC_KEY\s*=\s*"([^"]+)"/.exec(cfgText)?.[1];
  if (VAPID_PRIVATE_KEY && pub) {
    const webpush = (await import("web-push")).default;
    webpush.setVapidDetails("mailto:" + (process.env.VAPID_CONTACT || "whpeterson@gmail.com"), pub, VAPID_PRIVATE_KEY);
    const subs = await listAll("adminpush", token);
    const payload = JSON.stringify({ title: "Riptide Officials", body: parts.join(" and ") + ".", count: total, url: newSignups.length && !newUsers.length && !newInterest.length ? "meets.html" : "admin.html" });
    var pushed = 0, failed = [];
    for (const d of subs) {
      try { await webpush.sendNotification(JSON.parse(d.fields.sub.stringValue), payload); console.log("push sent"); pushed++; }
      catch (e) {
        console.log("push failed", e.statusCode || e.message); failed.push(e.statusCode || "error");
        if (e.statusCode === 404 || e.statusCode === 410) await fetch(`${base}/adminpush/${idOf(d)}`, { method: "DELETE", headers: { Authorization: "Bearer " + token } });
      }
    }
    pushNote = `Phone alerts: ${subs.length} phone(s), ${pushed} sent` + (failed.length ? `, failed (${failed.join(",")})` : "") + ".";
  } else pushNote = "Phone alerts skipped (no VAPID_PRIVATE_KEY secret).";
} catch (e) { pushNote = "Phone alerts error: " + e.message; console.log(pushNote); }
if (pushNote) await gh(`issues/${issue.number}/comments`, "POST", { body: pushNote });
await gh(`issues/${issue.number}`, "PATCH", { state: "closed" });

await saveNotified(token, keepIds().concat(newUsers.map((d) => "u:" + idOf(d)), newInterest.map((d) => "i:" + idOf(d)), (firstRun ? signups : newSignups).map((x) => x.id), firstRun ? ["s:init"] : []));
console.log("Notified.");
