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

console.log(`waiting: ${users.length} account(s), ${interest.length} interested; new: ${newUsers.length} + ${newInterest.length}`);
if (!newUsers.length && !newInterest.length) process.exit(0);

const parts = [];
if (newUsers.length) parts.push(`${newUsers.length} new account${newUsers.length > 1 ? "s" : ""} waiting for approval`);
if (newInterest.length) parts.push(`${newInterest.length} new interested ${newInterest.length > 1 ? "people" : "person"}`);
const issue = await gh("issues", "POST", {
  title: "Riptide Officials: " + parts.join(" and "),
  body: `@${MENTION} ${parts.join(" and ")}.\n\nOpen the Admin page to see who: ${SITE}admin.html\n\n(This message has no names or contact details on purpose.)`
});
await gh(`issues/${issue.number}`, "PATCH", { state: "closed" });

const keep = notified.filter((k) => (k.startsWith("u:") ? users.some((d) => "u:" + idOf(d) === k) : interest.some((d) => "i:" + idOf(d) === k)));
await saveNotified(token, keep.concat(newUsers.map((d) => "u:" + idOf(d)), newInterest.map((d) => "i:" + idOf(d))));
console.log("Notified.");
