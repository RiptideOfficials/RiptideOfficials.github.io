# Riptide Officials website

Static site (plain HTML) for GitHub Pages, with Firebase for logins and sign-ups.
Live at https://riptideofficials.github.io once published.

## One-time setup (about 15 minutes, best on a computer)

1. Go to https://console.firebase.google.com and sign in with whpeterson@gmail.com. **Add project** (name: `riptide-officials`; Google Analytics not needed).
2. **Build > Authentication > Get started > Email/Password > Enable > Save.**
3. **Authentication > Settings > Authorized domains > Add domain:** `riptideofficials.github.io`
4. **Build > Firestore Database > Create database.** Choose a US location and start in *production mode*.
5. **Firestore > Rules:** replace everything with the contents of `firestore.rules` and **Publish**.
6. **Project settings (gear) > Your apps > Web (</>)**: register an app, then copy the `firebaseConfig` values into `assets/firebase-config.js`.
7. Open the site, **Member Login > Create account** with whpeterson@gmail.com, and click the verification link emailed to you. Sign in again. You are now the admin.

## Everyday use

- **Add a meet:** Admin > Add a meet. Set the date, sessions, positions (e.g. `Starter | 2`), warm-up and meeting times, and notes.
- **Share the sign-up link:** Copy link (Admin or Meet Sign-Ups). Anyone with it can sign up without a login. The homepage never links to it.
- **Email everyone for a meet:** open the meet > Coordinator tools > Email officials.
- **Team registration link (private):** Admin > Private team info. It lives in the database, not in the website files, and only approved members can see it.
- **Add another admin (e.g. a second Meet Ref):** they create an account, then Admin > Members > Approve > **Make admin**. Admins can add/edit meets, email officials, see contact details, and approve members. Only you (the owner) can make or remove admins.
- **How-to pages:** Documents > Training has checklist pages (How to become an official, Register with USA Swimming) that save each member's progress, plus a Timer briefing checklist. Each has a Word download and a Print button.
- **Approve new members:** Admin > Members > Approve.
- **Interest form:** goes to whpeterson@gmail.com through formsubmit.co. The first submission sends you a one-time activation email; click it.

## Privacy notes

- Email and phone are stored separately from the public sign-up names, and only the admin account can read them.
- The team's USA Swimming registration link is kept in the database, never in the repository. Documents live in the public repository. The site's document page requires login, but a file's direct URL is not secret. Don't upload anything confidential.

## Backup alerts through GitHub

`.github/workflows/notify.yml` runs about every 15 minutes. It signs in as a helper admin account, looks for new accounts waiting for approval and new "interested" people, and opens (then closes) a GitHub issue so GitHub emails the coordinator. The issue never contains names or contact details because this repository is public.

One-time setup: create a helper account on the site, approve it and tap **Make admin**, then add `BOT_EMAIL` and `BOT_PASSWORD` under Settings > Secrets and variables > Actions. Optional: a repository variable `NOTIFY_USER` with the GitHub username to @mention.
