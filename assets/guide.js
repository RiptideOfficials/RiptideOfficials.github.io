/* Riptide Officials: guide pages (checklists with saved progress). Needs app.js first. */
(function () {
  var R = window.Riptide, G = (window.Guide = {});

  G.init = function (opts) {
    var key = opts.key, persist = opts.persist !== false;
    R.footer();
    R.requireMember(opts.active || "docs").then(function (ctx) {
      if (!ctx) return;
      var app = document.getElementById("app");
      app.innerHTML = "";
      app.appendChild(document.getElementById("content").content.cloneNode(true));
      if (R.docTabs) R.docTabs(app);

      function go() {
      var boxes = Array.prototype.slice.call(app.querySelectorAll("input.stepbox"));
      var progress = document.getElementById("progress");
      var saveNote = null, timer = null;
      var ref = persist ? R.db.collection("users").doc(ctx.user.uid).collection("progress").doc(key) : null;

      if (progress && boxes.length) {
        progress.innerHTML =
          '<div class="progress card"><div class="progress-top"><strong id="ptext"></strong>' +
          '<span class="muted small" id="psave"></span></div>' +
          '<div class="pbar-track"><span id="pbar"></span></div></div>';
        saveNote = document.getElementById("psave");
      }

      function refresh() {
        var done = boxes.filter(function (b) { return b.checked; }).length;
        boxes.forEach(function (b) {
          var host = b.closest(".step, .chk-item");
          if (host) host.classList.toggle("done", b.checked);
        });
        var t = document.getElementById("ptext"), bar = document.getElementById("pbar");
        if (t) t.textContent = done === boxes.length && boxes.length
          ? "All done! " + done + " of " + boxes.length + " complete"
          : done + " of " + boxes.length + " complete";
        if (bar) bar.style.width = (boxes.length ? Math.round(done / boxes.length * 100) : 0) + "%";
      }

      function save() {
        if (!ref) return;
        clearTimeout(timer);
        if (saveNote) saveNote.textContent = "Saving...";
        timer = setTimeout(function () {
          var done = boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.getAttribute("data-step"); });
          ref.set({ done: done, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
            .then(function () { if (saveNote) saveNote.textContent = "Progress saved"; })
            .catch(function () { if (saveNote) saveNote.textContent = "Couldn't save. Check your connection."; });
        }, 350);
      }

      boxes.forEach(function (b) { b.addEventListener("change", function () { refresh(); save(); }); });

      var reset = app.querySelector("[data-reset]");
      if (reset) reset.onclick = function () {
        if (!confirm(persist ? "Clear all your checkmarks on this page?" : "Clear all checkmarks?")) return;
        boxes.forEach(function (b) { b.checked = false; });
        refresh(); save();
      };
      var pr = app.querySelector("[data-print]");
      if (pr) pr.onclick = function () { window.print(); };

      refresh();
      if (ref) ref.get().then(function (snap) {
        var done = snap.exists && snap.data().done || [];
        boxes.forEach(function (b) { b.checked = done.indexOf(b.getAttribute("data-step")) >= 0; });
        refresh();
      }).catch(function () {});

      // team-only registration link (kept in the database, not in the website files)
      var slots = app.querySelectorAll("[data-team-link]");
      if (slots.length) {
        R.db.collection("private").doc("team").get().then(function (snap) {
          var link = snap.exists ? snap.data().registrationLink : "";
          var ok = link && /^https:\/\/omr\.usaswimming\.org\//.test(link);
          Array.prototype.forEach.call(slots, function (el) {
            el.innerHTML = ok
              ? '<a class="btn" href="' + R.esc(link) + '" target="_blank" rel="noopener">Open the Riptide registration link</a>' +
                '<span class="hint" style="display:block">This link is for Riptide members only. Please don\'t share it.</span>'
              : '<span class="muted">The coordinator hasn\'t added the team link yet. Email ' + R.esc(window.ADMIN_EMAIL) + ".</span>";
          });
        }).catch(function () {});
      }

      }
      (R.Edit ? R.Edit.run(app, ctx, key).catch(function () {}) : Promise.resolve()).then(go).then(function () {
        if (location.hash) { var t = document.querySelector(location.hash); if (t) t.scrollIntoView(); }
      });
    });
  };
})();
