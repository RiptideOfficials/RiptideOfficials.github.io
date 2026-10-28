/* Riptide Officials: shared code (auth, header, helpers). Uses Firebase compat SDK. */
(function () {
  var cfg = window.FIREBASE_CONFIG || {};
  var configured = !!cfg.apiKey && !/^PASTE/.test(cfg.apiKey);
  var R = (window.Riptide = { configured: configured });

  if (configured) {
    firebase.initializeApp(cfg);
    R.auth = firebase.auth();
    R.db = firebase.firestore();
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
      links += a("home.html", "Calendar", "home");
      links += a("docs.html", "Documents", "docs");
      links += a("meets.html", "Meet Sign-Ups", "meets");
      if (ctx.isAdmin) links += a("admin.html", "Admin", "admin");
      links += '<a href="#" id="signout">Sign out</a>';
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
    var so = document.getElementById("signout");
    if (so) so.onclick = function (e) {
      e.preventDefault();
      R.auth.signOut().then(function () { location.href = "index.html"; });
    };
  };

  /* ---------- auth context ---------- */
  // Resolves { user, member, isAdmin, profile } for whoever is (or isn't) signed in.
  R.getContext = function () {
    return new Promise(function (resolve) {
      if (!configured) return resolve({ user: null, member: false, isAdmin: false });
      var unsub = R.auth.onAuthStateChanged(function (user) {
        unsub();
        if (!user) return resolve({ user: null, member: false, isAdmin: false });
        var isOwner = R.isAdminUser(user);
        R.db.collection("users").doc(user.uid).get().then(function (snap) {
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

  R.footer = function () {
    var f = document.getElementById("site-footer");
    if (f) f.innerHTML = "Riptide Swimming Officials &middot; Questions? Email the coordinator at " +
      '<a href="mailto:' + R.esc(window.ADMIN_EMAIL) + '">' + R.esc(window.ADMIN_EMAIL) + "</a>";
  };
})();
