/* Riptide Officials: shared code (auth, header, helpers). Uses Firebase compat SDK. */
(function () {
  var cfg = window.FIREBASE_CONFIG || {};
  var configured = !!cfg.apiKey && !/^PASTE/.test(cfg.apiKey);
  var R = (window.Riptide = { configured: configured });

  if (configured) {
    firebase.initializeApp(cfg);
    R.auth = firebase.auth();
    R.db = firebase.firestore();
    // helps phones/networks where the default connection stalls
    try { R.db.settings({ experimentalAutoDetectLongPolling: true, merge: true }); } catch (e) {}
  }

  R.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  R.isAdminUser = function (u) {
    return !!(u && u.email && u.emailVerified &&
      u.email.toLowerCase() === String(window.ADMIN_EMAIL || "").toLowerCase());
  };

  R.base = (function () {
    // folder this page lives in, so links work on GitHub Pages and locally
    return "";
  })();

  R.fmtDate = function (iso, withYear) {
    if (!iso) return "";
    var p = iso.split("-");
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString(undefined, {
      weekday: "short", month: "short", day: "numeric", year: withYear === false ? undefined : "numeric"
    });
  };
  R.fmtRange = function (m) {
    if (!m.date) return "";
    if (!m.endDate || m.endDate === m.date) return R.fmtDate(m.date);
    return R.fmtDate(m.date, false) + " to " + R.fmtDate(m.endDate);
  };

  R.setupBanner = function () {
    return '<div class="msg err"><strong>Site setup not finished.</strong> The Firebase settings in ' +
      "<code>assets/firebase-config.js</code> haven't been filled in yet. See README.md.</div>";
  };

  /* ---------- header ---------- */
  R.renderHeader = function (ctx, active) {
    var el = document.getElementById("site-header");
    if (!el) return;
    var member = ctx && ctx.member;
    var links = "";
    function a(href, label, key, cls) {
      return '<a href="' + href + '" class="' + (cls || "") + (active === key ? " active" : "") + '">' + label + "</a>";
    }
    if (member) {
      links += a("home.html", "Home", "home");
      links += a("how-to.html", "Get Certified", "steps");
      links += a("apprentice-forms.html", "Apprentice Forms", "forms");
      links += a("meets.html", "Meet Sign-Ups", "meets");
      links += a("docs.html", "Documents", "docs");
      links += a("docs.html#apparel", "Apparel", "apparel");
      if (ctx.isAdmin) { links += a("admin.html", "Admin", "admin", "coord"); links += a("assignments.html", "Assignments", "assignments", "coord"); }
      links += a("account.html", "Account", "account");
    } else if (ctx && ctx.user) {
      links += a("index.html", "Home", "index");
      links += '<a href="#" id="signout">Sign out</a>';
    } else {
      links += a("index.html", "Home", "index");
      links += a("interested.html", "Become an Official", "interested");
      links += a("login.html", "Member Login", "login", "cta");
    }
    el.className = "site-header";
    el.innerHTML =
      '<div class="bar">' +
      '<a class="brand" href="' + (member ? "home.html" : "index.html") + '">' +
      '<img src="assets/img/riptide-logo.jpg" alt="Riptide Swimming logo">' +
      "<span>Riptide Officials<small>Riptide Swimming</small></span></a>" +
      '<button class="nav-toggle" id="navtoggle" aria-label="Menu">Menu</button>' +
      '<nav class="nav" id="nav">' + links + "</nav></div>";
    document.getElementById("navtoggle").onclick = function () {
      document.getElementById("nav").classList.toggle("open");
    };
    if (member && ctx.isAdmin && R.db) R.adminBadge();
    var so = document.getElementById("signout");
    if (so) so.onclick = function (e) {
      e.preventDefault();
      R.auth.signOut().then(function () { location.href = "index.html"; });
    };
  };

  // red number on the Admin link = accounts waiting for approval + interested people not yet answered
  R.adminBadge = function () {
    var adm = document.querySelector('#nav a[href="admin.html"]');
    if (!adm || !R.db) return;
    var cnt = 0, left = 2, done = function (add) {
      cnt += add; if (--left) return;
      Array.prototype.forEach.call(adm.querySelectorAll(".cnt"), function (x) { x.remove(); });
      if (cnt > 0) { var b = document.createElement("span"); b.className = "cnt"; b.textContent = cnt > 99 ? "99+" : cnt; b.title = cnt + " waiting"; adm.appendChild(b); }
    };
    try {
      R.db.collection("users").get().then(function (q) { var k = 0; q.docs.forEach(function (d) { if (!d.data().approved) k++; }); done(k); }).catch(function () { done(0); });
      R.db.collection("interest").get().then(function (q) { var k = 0; q.docs.forEach(function (d) { if (!d.data().responded) k++; }); done(k); }).catch(function () { done(0); });
    } catch (x) {}
  };

  // Turn a page's stack of document boxes into one tab per box (only one shows at a time)
  R.docTabs = function (root) {
    var grid = root.querySelector(".doc-grid"); if (!grid) return;
    var secs = Array.prototype.slice.call(grid.querySelectorAll(":scope > section.doc-section"));
    if (secs.length < 2) return;
    var NAMES = { training: "Getting started", "stroke-turn": "Stroke & Turn", starter: "Starter", "deck-referee": "Deck Referee", apparel: "Apparel", general: "General", "meet-referee": "Meet Ref / Deck Ref", admin: "Admin Official", "chief-judge": "Chief Judge", reference: "Reference" };
    var bar = document.createElement("div"); bar.className = "doc-tabs"; bar.setAttribute("role", "tablist");
    function show(id) {
      secs.forEach(function (s) { s.hidden = s.id !== id; });
      Array.prototype.forEach.call(bar.children, function (b) { b.classList.toggle("on", b.getAttribute("data-t") === id); b.setAttribute("aria-selected", b.getAttribute("data-t") === id); });
      try { history.replaceState(null, "", "#" + id); } catch (e) {}
    }
    secs.forEach(function (s) {
      var b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("data-t", s.id);
      b.textContent = NAMES[s.id] || (s.querySelector("h2") ? s.querySelector("h2").textContent : s.id);
      b.onclick = function () { show(s.id); };
      bar.appendChild(b);
    });
    grid.classList.add("tabbed"); grid.parentNode.insertBefore(bar, grid);
    var jump = root.querySelector("p.muted a[href^='#']"); if (jump) jump.parentNode.hidden = true;   // old "Jump to" line
    var want = (location.hash || "").slice(1);
    show(secs.some(function (s) { return s.id === want; }) ? want : secs[0].id);
    window.addEventListener("hashchange", function () { var h = (location.hash || "").slice(1); if (secs.some(function (s) { return s.id === h; })) show(h); });
  };

  /* ---------- auth context ---------- */
  // Resolves { user, member, isAdmin, profile } for whoever is (or isn't) signed in.
  R.getContext = function () {
    return new Promise(function (resolve) {
      if (!configured) return resolve({ user: null, member: false, isAdmin: false });
      var timer = setTimeout(function () {
        resolve({ user: null, member: false, isAdmin: false, timedOut: true });
      }, 15000);
      var unsub = R.auth.onAuthStateChanged(function (user) {
        unsub(); clearTimeout(timer);
        if (!user) return resolve({ user: null, member: false, isAdmin: false });
        var isOwner = R.isAdminUser(user);
        var gt = setTimeout(function () {
          resolve({ user: user, profile: null, isOwner: isOwner, isAdmin: isOwner, member: isOwner, timedOut: true });
        }, 12000);
        R.db.collection("users").doc(user.uid).get().then(function (snap) {
          clearTimeout(gt);
          var profile = snap.exists ? snap.data() : null;
          if (isOwner && profile && !profile.approved) {
            // admin approves themselves once their email is verified
            R.db.collection("users").doc(user.uid).update({ approved: true }).catch(function () {});
            profile.approved = true;
          }
          var isAdmin = isOwner || !!(profile && profile.approved && profile.admin === true);
          resolve({ user: user, profile: profile, isOwner: isOwner, isAdmin: isAdmin,
            member: isAdmin || !!(profile && profile.approved) });
        }).catch(function () {
          clearTimeout(gt);
          resolve({ user: user, profile: null, isOwner: isOwner, isAdmin: isOwner, member: isOwner });
        });
      });
    });
  };

  // For members-only pages. Shows a message and returns null if not allowed.
  R.requireMember = function (active) {
    var app = document.getElementById("app");
    if (!configured) {
      R.renderHeader({}, active);
      app.innerHTML = R.setupBanner();
      return Promise.resolve(null);
    }
    return R.getContext().then(function (ctx) {
      if (!ctx.user) {
        location.replace("login.html?next=" + encodeURIComponent(location.pathname.split("/").pop() + location.search));
        return null;
      }
      R.renderHeader(ctx, active);
      if (!ctx.member && ctx.timedOut) {
        app.innerHTML = '<div class="card"><h2>Having trouble connecting</h2><p>The site could not reach the server. Check your connection, then tap Refresh below.</p></div>';
        return null;
      }
      if (!ctx.member) {
        var verifyNote = !ctx.isOwner && ctx.user.email &&
          String(ctx.user.email).toLowerCase() === String(window.ADMIN_EMAIL).toLowerCase() && !ctx.user.emailVerified
          ? "<p>Please verify your email (check your inbox) and sign in again to unlock admin access.</p>" : "";
        app.innerHTML = '<div class="card"><h2>Waiting for approval</h2>' +
          "<p>Your account has been created. The Riptide officials coordinator needs to approve it before you can see the calendar, documents, and sign-ups.</p>" +
          verifyNote +
          '<p class="muted small">Signed in as ' + R.esc(ctx.user.email) + "</p></div>";
        return null;
      }
      return ctx;
    });
  };

  R.requireAdmin = function (active) {
    return R.requireMember(active).then(function (ctx) {
      if (!ctx) return null;
      if (!ctx.isAdmin) {
        document.getElementById("app").innerHTML =
          '<div class="card"><h2>Admins only</h2><p>This page is for the officials coordinator.</p></div>';
        return null;
      }
      return ctx;
    });
  };

  /* ---------- meets ---------- */
  R.meetUrl = function (id) {
    var base = location.href.split("#")[0].split("?")[0].replace(/[^\/]*$/, "");
    return base + "meet.html?m=" + encodeURIComponent(id);
  };

  // "Label | value" lines -> [{label, value}]
  R.parseSchedule = function (text) {
    return String(text || "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var i = l.indexOf("|");
      return i < 0 ? { label: l, value: "" } : { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() };
    });
  };
  // "Role | slots" lines -> [{name, slots}]
  R.parseRoles = function (text) {
    return String(text || "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var i = l.lastIndexOf("|");
      var name = i < 0 ? l : l.slice(0, i).trim();
      var n = i < 0 ? 0 : parseInt(l.slice(i + 1), 10);
      return { name: name, slots: isNaN(n) ? 0 : n };
    });
  };
  R.lines = function (text) {
    return String(text || "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  };

  /* ---------- meets: sessions, positions, assignments ---------- */
  R.WHOLE_POS = ["Meet Referee", "Admin Official"];                       // cover the whole meet
  R.SESSION_POS = ["Starter", "Stroke & Turn", "Deck Referee", "Chief Judge"]; // chosen per session
  R.WHOLE_GROUPS = [
    { key: "meetRef", label: "Meet Referee", cert: "Meet Referee" },
    { key: "admin", label: "Admin Official", cert: "Admin Official" }
  ];
  R.SESSION_GROUPS = [
    { key: "deckRef", label: "Deck Referee", cert: "Deck Referee" },
    { key: "reliefDeckRef", label: "Relief Deck Referee", cert: "Deck Referee" },
    { key: "leadStarter", label: "Lead Starter", cert: "Starter" },
    { key: "reliefStarter", label: "Relief Starter", cert: "Starter" },
    { key: "strokeTurn", label: "Stroke & Turn", cert: "Stroke & Turn" },
    { key: "shadow", label: "Shadowing", cert: "" }
  ];
  R.fmtTime = function (t) {
    var m = /^(\d{1,2}):(\d{2})/.exec(t || ""); if (!m) return "";
    var h = +m[1], ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
    return h + ":" + m[2] + " " + ap;
  };
  // Meet uniform can differ by day: [{date, text}] (older meets have one text for all days)
  R.uniformDays = function (info) {
    var list = Array.isArray(info.uniformByDate) ? info.uniformByDate.filter(function (d) { return d.text; }) : [];
    if (!list.length && info.uniform) return [{ date: "", text: info.uniform }];
    var same = list.length > 1 && list.every(function (d) { return d.text === list[0].text; });
    return same ? [{ date: "", text: list[0].text }] : list;
  };
  R.sessionWhen = function (x) {
    return [x.date ? R.fmtDate(x.date) : "", x.start ? R.fmtTime(x.start) : ""].filter(Boolean).join(" at ");
  };
  // One shape for new meets and older ones.
  R.normMeet = function (m) {
    var v2 = Array.isArray(m.sessionList), sessions;
    if (v2) {
      sessions = m.sessionList.map(function (x, i) {
        return { name: x.name || "Session " + (i + 1), date: x.date || "", start: x.start || "",
          positions: x.positions || [], shadow: x.shadow || [], notes: x.notes || "", details: x.details || "" };
      });
    } else {
      var lines = R.lines(m.sessions); if (!lines.length) lines = ["All sessions"];
      sessions = lines.map(function (n) { return { name: n, date: "", start: "", positions: R.SESSION_POS.slice(), shadow: R.SESSION_POS.slice(), notes: "", details: "" }; });
    }
    return { v2: v2, sessions: sessions, whole: Array.isArray(m.wholeMeet) ? m.wholeMeet : R.WHOLE_POS.slice(), info: m.info || {} };
  };
  R.normAssign = function (m, n) {
    var a = m.assignments || {}, out = { whole: {}, sessions: [] };
    R.WHOLE_GROUPS.forEach(function (g) { out.whole[g.key] = ((a.whole || {})[g.key] || a[g.key] || []).slice(); });
    for (var i = 0; i < n; i++) {
      var src = (a.sessions && a.sessions[i]) || (i === 0 && !a.sessions ? a : {}), o = {};
      R.SESSION_GROUPS.forEach(function (g) { o[g.key] = (src[g.key] || []).slice(); });
      out.sessions.push(o);
    }
    return out;
  };

  /* ---------- add to calendar ---------- */
  function addDays(iso, n) {
    var p = iso.split("-");
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)).toISOString().slice(0, 10);
  }
  R.meetDescription = function (m, url) {
    var n = R.normMeet(m), lines = [];
    if (n.v2) {
      n.sessions.forEach(function (x) {
        lines.push(x.name + (R.sessionWhen(x) ? ": " + R.sessionWhen(x) : ""));
        R.parseSchedule(x.details).forEach(function (d) { if (d.value) lines.push("  " + d.label + ": " + d.value); });
        if (x.notes) lines.push(x.notes);
      });
      if (n.info.parking) lines.push("", "Parking: " + n.info.parking);
      R.uniformDays(n.info).forEach(function (d) { lines.push("", "Meet uniform" + (d.date ? " (" + R.fmtDate(d.date) + ")" : "") + ": " + d.text); });
      if (n.info.food) lines.push("", "Food: " + n.info.food);
      if (n.info.misc) lines.push("", "Other: " + n.info.misc);
    } else {
      lines = R.parseSchedule(m.schedule).map(function (x) { return x.label + (x.value ? ": " + x.value : ""); });
      if (m.notes) lines.push("", m.notes);
    }
    lines.push("", "Details and sign-up: " + url);
    return lines.join("\n");
  };
  R.googleCalUrl = function (m, url) {
    var a = m.date.replace(/-/g, ""), b = addDays(m.endDate || m.date, 1).replace(/-/g, "");
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(m.title) +
      "&dates=" + a + "/" + b + "&details=" + encodeURIComponent(R.meetDescription(m, url)) +
      "&location=" + encodeURIComponent(m.location || "");
  };
  R.icsHref = function (m, id, url) {
    function esc(t) { return String(t || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
    function fold(l) { var o = []; while (l.length > 74) { o.push(l.slice(0, 74)); l = " " + l.slice(74); } o.push(l); return o.join("\r\n"); }
    var stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Riptide Officials//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
      "UID:" + id + "@riptideofficials", "DTSTAMP:" + stamp,
      "DTSTART;VALUE=DATE:" + m.date.replace(/-/g, ""), "DTEND;VALUE=DATE:" + addDays(m.endDate || m.date, 1).replace(/-/g, ""),
      "SUMMARY:" + esc(m.title), "LOCATION:" + esc(m.location), "DESCRIPTION:" + esc(R.meetDescription(m, url)), "URL:" + url,
      "END:VEVENT", "END:VCALENDAR"];
    return "data:text/calendar;charset=utf-8," + encodeURIComponent(lines.map(fold).join("\r\n"));
  };

  R.newId = function () {
    var a = new Uint8Array(15);
    (window.crypto || window.msCrypto).getRandomValues(a);
    var chars = "abcdefghijkmnpqrstuvwxyz23456789", s = "";
    for (var i = 0; i < a.length; i++) s += chars[a[i] % chars.length];
    return s;
  };

  R.copyText = function (text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (res) {
      var t = document.createElement("textarea");
      t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(t); res();
    });
  };

  /* ---------- never leave a page stuck on "Loading..." ---------- */
  function stuckGuard(detail) {
    var app = document.getElementById("app");
    if (!app || !/^\s*Loading\.\.\.\s*$/.test(app.textContent)) return;
    app.innerHTML = '<div class="card"><h2>This page did not finish loading</h2>' +
      "<p>Tap Refresh below, or sign in again. If it keeps happening, email the coordinator.</p>" +
      '<div class="btn-row"><a class="btn" href="login.html">Sign in</a> <a class="btn ghost" href="home.html">Calendar</a></div>' +
      (detail ? '<p class="muted small">' + R.esc(detail) + "</p>" : "") + "</div>";
  }
  window.addEventListener("error", function (e) { stuckGuard(e && e.message); });
  window.addEventListener("unhandledrejection", function (e) {
    stuckGuard(e && e.reason && (e.reason.message || String(e.reason)));
  });
  setTimeout(function () { stuckGuard("Timed out waiting for the page."); }, 20000);

  /* ---------- footer: version time + refresh ---------- */
  function fmt(ms) {
    return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  }

  // Re-download this page and its scripts/styles (bypassing the browser cache), then reload.
  R.refreshLatest = function (btn) {
    if (btn) { btn.disabled = true; btn.textContent = "Refreshing..."; }
    var urls = [location.href.split("#")[0]];
    Array.prototype.forEach.call(document.querySelectorAll("script[src],link[rel=stylesheet][href]"), function (el) {
      var u = el.src || el.href;
      if (u && u.indexOf(location.origin) === 0) urls.push(u);
    });
    Promise.all(urls.map(function (u) { return fetch(u, { cache: "reload" }).catch(function () {}); }))
      .then(function () { location.reload(); });
  };

  // Compares the version of this page in your browser with the newest one on the server.
  R.checkForUpdate = function () {
    var loaded = Date.parse(document.lastModified);
    return fetch(location.href.split("#")[0], { method: "HEAD", cache: "no-store" }).then(function (r) {
      var lm = r.headers.get("Last-Modified"), latest = lm ? Date.parse(lm) : NaN;
      var note = document.getElementById("ver-note");
      if (isNaN(latest)) return;
      var newer = !isNaN(loaded) && latest - loaded > 2000;
      if (note) note.textContent = "Latest version: " + fmt(latest) + (newer ? "" : " \u2713 you have it");
      var old = document.getElementById("update-banner");
      if (newer && !old) {
        var b = document.createElement("div");
        b.id = "update-banner"; b.className = "update-banner";
        b.innerHTML = 'A newer version of this site is available. <button type="button" class="btn small light">Refresh now</button>';
        b.querySelector("button").onclick = function () { R.refreshLatest(this); };
        var h = document.getElementById("site-header");
        h.parentNode.insertBefore(b, h.nextSibling);
      }
    }).catch(function () {});
  };

  R.footer = function () {
    var f = document.getElementById("site-footer");
    if (!f) return;
    var loaded = Date.parse(document.lastModified);
    var appEl = document.getElementById("app");
    if (appEl && /^\s*Loading\.\.\.\s*$/.test(appEl.textContent)) {
      f.classList.add("pending");
      var reveal = function () { f.classList.remove("pending"); if (mo) mo.disconnect(); };
      var mo = window.MutationObserver ? new MutationObserver(function () {
        if (!/^\s*Loading\.\.\.\s*$/.test(appEl.textContent)) reveal();
      }) : null;
      if (mo) mo.observe(appEl, { childList: true, subtree: true, characterData: true });
      setTimeout(reveal, 6000);
    }
    f.innerHTML = "Riptide Swimming Officials &middot; Questions? Email the coordinator at " +
      '<a href="mailto:' + R.esc(window.ADMIN_EMAIL) + '">' + R.esc(window.ADMIN_EMAIL) + "</a>" +
      '<div class="ver"><span id="ver-note">Page version: ' + (isNaN(loaded) ? "unknown" : fmt(loaded)) + "</span> " +
      '<button type="button" class="btn small ghost" id="ver-refresh">&#8635; Refresh</button></div>';
    document.getElementById("ver-refresh").onclick = function () { R.refreshLatest(this); };
    R.checkForUpdate();
  };
})();
