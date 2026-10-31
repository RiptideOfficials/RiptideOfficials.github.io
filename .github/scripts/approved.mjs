// Emails people when the coordinator approves their account (checked every ~15 minutes).
// Needs the MAIL_USER and MAIL_APP_PASSWORD secrets. The first run only records who is already approved (no emails).
import { readFileSync } from "node:fs";

const cfgText = readFileSync("assets/firebase-config.js", "utf8");
const API_KEY = /apiKey:\s*"([^"]+)"/.exec(cfgText)?.[1];
const PROJECT = /projectId:\s*"([^"]+)"/.exec(cfgText)?.[1];
const { BOT_EMAIL, BOT_PASSWORD, MAIL_USER, MAIL_APP_PASSWORD } = process.env;
const SITE = "https://riptideofficials.github.io/";
if (!MAIL_USER || !MAIL_APP_PASSWORD || !API_KEY || !PROJECT || !BOT_EMAIL || !BOT_PASSWORD) { console.log("Approval emails skipped (secrets not set)."); process.exit(0); }
const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const sr = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: BOT_EMAIL, password: BOT_PASSWORD, returnSecureToken: true })
});
const sj = await sr.json(); if (!sr.ok) { console.log("Sign-in failed", sj.error?.message); process.exit(1); }
const H = { Authorization: "Bearer " + sj.idToken };

const users = []; let t = "";
do {
  const r = await fetch(`${base}/users?pageSize=300${t ? "&pageToken=" + encodeURIComponent(t) : ""}`, { headers: H });
  const j = await r.json(); if (!r.ok) { console.log("Could not read users", j.error?.message); process.exit(1); }
  (j.documents || []).forEach((d) => users.push({ id: d.name.split("/").pop(), name: d.fields?.name?.stringValue || "", email: d.fields?.email?.stringValue || "", approved: d.fields?.approved?.booleanValue === true }));
  t = j.nextPageToken || "";
} while (t);
const approved = users.filter((u) => u.approved && u.email && !/\+helper@/i.test(u.email));

const dr = await fetch(`${base}/private/approvedEmailed`, { headers: H });
let done = null;
if (dr.status === 404) done = null;
else { const dj = await dr.json(); if (!dr.ok) { console.log("Could not read the list", dj.error?.message); process.exit(1); } done = (dj.fields?.ids?.arrayValue?.values || []).map((v) => v.stringValue); }
async function save(ids) {
  const r = await fetch(`${base}/private/approvedEmailed?updateMask.fieldPaths=ids`, { method: "PATCH", headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { ids: { arrayValue: { values: ids.map((s) => ({ stringValue: s })) } } } }) });
  if (!r.ok) { console.log("Could not save the list:", await r.text()); process.exit(1); }
}
if (done === null) { await save(approved.map((u) => u.id)); console.log(`First run: recorded ${approved.length} already-approved member(s), no emails sent.`); process.exit(0); }

const fresh = approved.filter((u) => !done.includes(u.id));
if (!fresh.length) { console.log("No newly approved accounts."); process.exit(0); }
const nodemailer = (await import("nodemailer")).default;
const mail = nodemailer.createTransport({ service: "gmail", auth: { user: MAIL_USER, pass: MAIL_APP_PASSWORD } });
const sent = [];
for (const u of fresh) {
  try {
    await mail.sendMail({
      from: `"Riptide Officials" <${MAIL_USER}>`, to: u.email, replyTo: MAIL_USER, subject: "Your Riptide Officials account is approved",
      text: `Hi ${u.name.split(" ")[0] || "there"},\n\nGood news: your Riptide Officials account has been approved. You can sign in here:\n${SITE}login.html\n\nOnce you're in you can see upcoming meets, sign up to work, and find training and registration help.\n\nQuestions? Just reply to this email.\n\nWendy Peterson\nRiptide Officials Coordinator`
    });
    sent.push(u.id);
  } catch (e) { console.log("Email failed for one person:", e.message); }
}
await save(done.concat(sent));
console.log(`Approval emails sent: ${sent.length} of ${fresh.length}.`);
