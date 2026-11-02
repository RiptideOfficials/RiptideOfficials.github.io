/* Riptide Officials: lets admins edit the document lists and the "how to" steps in place (little pencil on each box).
   Edits are saved in the database (pagecontent/<page>); the original text stays in the page files as the fallback.
   Needs app.js first. */
(function () {
  var R = window.Riptide, E = (R.Edit = {});

  /* ---------- helpers ---------- */
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else if (k === "class") n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function btn(label, cls, fn) {
    var b = el("button", { type: "button", class: "btn small " + (cls || ""), text: label });
    b.onclick = fn; return b;
  }
  var URL_OK = /^(https?:\/\/|mailto:|tel:|docs\/|assets\/|[A-Za-z0-9_\-]+\.html)/i;
  function isExternal(u) { return /^https?:\/\//i.test(u); }
  function tagFor(url) {
    var m = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(url || ""), ext = m ? m[1].toLowerCase() : "";
    if (ext === "pdf") return ["PDF", "pdf"];
    if (ext === "xlsx" || ext === "xls" || ext === "csv") return ["XLS", "xls"];
    if (ext === "docx" || ext === "doc") return ["DOC", "doc"];
    if (/^(jpg|jpeg|png|gif|webp)$/.test(ext)) return ["IMG", "img"];
    if (isExternal(url)) return ["LINK", "page"];
    return ["PAGE", "page"];
  }
  function tagClass(label) { return { PDF: "pdf", XLS: "xls", DOC: "doc", IMG: "img" }[label] || "page"; }

  /* ---------- safe HTML for the rich text boxes ---------- */
  var ALLOWED = { P: 1, BR: 1, STRONG: 1, B: 1, EM: 1, I: 1, U: 1, UL: 1, OL: 1, LI: 1, A: 1, H3: 1, DIV: 1, IMG: 1 };
  function linkTool(field, asButton) {   // turns the selected words into a link, or a blue button-style link
    return function () {
      var sel = window.getSelection(); if (!sel || sel.isCollapsed) { alert("First select the words you want to turn into " + (asButton ? "a button." : "a link.")); return; }
      var u = prompt("Paste the web address (starts with https://):", "https://"); if (!u || !URL_OK.test(u.trim())) return;
      field.focus(); document.execCommand("createLink", false, u.trim());
      var n = window.getSelection().anchorNode, a = n && (n.nodeType === 1 ? n : n.parentNode); a = a && a.closest ? a.closest("a") : null;
      if (!a) { var as = field.querySelectorAll("a"); a = as[as.length - 1]; }
      if (a) { if (asButton) a.className = "btn small"; else a.removeAttribute("class"); }
    };
  }
  E.clean = function (html) {
    var doc = new DOMParser().parseFromString("<body>" + html + "</body>", "text/html");
    function walk(src, dst) {
      Array.prototype.forEach.call(src.childNodes, function (n) {
        if (n.nodeType === 3) {
          var inA = dst.tagName === "A" || (dst.closest && dst.closest("a")), txt = n.nodeValue;
          if (inA || !/[\w.+-]+@[\w-]+(\.[\w-]+)+/.test(txt)) { dst.appendChild(document.createTextNode(txt)); return; }
          var re = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, last = 0, mm;   // bare email addresses become mailto links
          while ((mm = re.exec(txt))) {
            if (mm.index > last) dst.appendChild(document.createTextNode(txt.slice(last, mm.index)));
            dst.appendChild(el("a", { href: "mailto:" + mm[0], text: mm[0] })); last = mm.index + mm[0].length;
          }
          if (last < txt.length) dst.appendChild(document.createTextNode(txt.slice(last)));
          return;
        }
        if (n.nodeType !== 1) return;
        var t = n.tagName;
        if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|FORM|INPUT|BUTTON|TEXTAREA|SELECT|LINK|META|SVG)$/.test(t)) return;
        if (!ALLOWED[t]) { walk(n, dst); return; }   // unknown tag: keep its text
        if (t === "A") {
          var h = (n.getAttribute("href") || "").trim();
          if (!URL_OK.test(h)) { walk(n, dst); return; }
          var a = el("a", { href: h }); if (/\bbtn\b/.test(n.className || "")) a.className = "btn small"; if (isExternal(h)) { a.target = "_blank"; a.rel = "noopener"; }
          walk(n, a); dst.appendChild(a); return;
        }
        if (t === "IMG") {
          var s = n.getAttribute("src") || "";
          if (/^assets\/img\//.test(s) || /^data:image\/(jpeg|png|gif|webp);base64,/i.test(s)) dst.appendChild(el("img", { src: s, class: "shot", alt: n.getAttribute("alt") || "", loading: "lazy" }));
          return;
        }
        if (t === "DIV") {
          if (n.hasAttribute("data-team-link")) { dst.appendChild(el("div", { "data-team-link": "", style: "margin:10px 0", text: "Loading the team link..." })); return; }
          var c = n.className || "";
          if (/\bcallout\b/.test(c)) { var d = el("div", { class: /\bwarn\b/.test(c) ? "callout warn" : "callout" }); walk(n, d); dst.appendChild(d); return; }
          var p = el("p"); walk(n, p); if (p.textContent.trim() || p.querySelector("img")) dst.appendChild(p); else if (p.querySelector("br") && !p.querySelector("img")) { dst.appendChild(p); } return;   // plain divs become paragraphs
        }
        var out = el(t.toLowerCase()); walk(n, out); dst.appendChild(out);
      });
    }
    var box = document.createElement("div"); walk(doc.body, box); return box.innerHTML;
  };

  /* ---------- load / save the page's edits ---------- */
  function load(page) {
    return R.db.collection("pagecontent").doc(page).get().then(function (s) { return s.exists ? (s.data() || {}) : {}; }).catch(function () { return {}; });
  }
  function store(page, content) { return R.db.collection("pagecontent").doc(page).set(content); }

  /* ---------- uploading files (saved into the website's GitHub repo, so they get a normal link) ---------- */
  var GH_REPO = window.GH_REPO || "RiptideOfficials/RiptideOfficials.github.io";
  function ghToken() { try { return localStorage.getItem("ro_gh_token") || ""; } catch (x) { return ""; } }
  function uploadFile(file, onDone, setMsg) {
    var tok = ghToken();
    if (!tok) { setMsg('<div class="msg err">Add your GitHub upload key first (the box at the bottom of this editor).</div>'); return; }
    if (file.size > 25 * 1024 * 1024) { setMsg('<div class="msg err">That file is over 25 MB. Please use a smaller file.</div>'); return; }
    var d = new Date(), stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
    var safe = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
    var path = "docs/uploads/" + stamp + "-" + safe;
    setMsg("Uploading " + R.esc(file.name) + "...");
    var fr = new FileReader();
    fr.onload = function () {
      var b64 = String(fr.result).split(",")[1];
      fetch("https://api.github.com/repos/" + GH_REPO + "/contents/" + path, {
        method: "PUT",
        headers: { Authorization: "Bearer " + tok, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Upload " + file.name + " from the website", content: b64, branch: "main" })
      }).then(function (r) {
        if (r.status === 201 || r.status === 200) { setMsg('<div class="msg ok">Uploaded. It can take a minute or two before people can open it.</div>'); onDone(path, file.name); }
        else if (r.status === 401 || r.status === 403) setMsg('<div class="msg err">GitHub did not accept the upload key. Check that it has Contents: Read and write for this site.</div>');
        else setMsg('<div class="msg err">The upload did not go through (error ' + r.status + ").</div>");
      }).catch(function () { setMsg('<div class="msg err">Could not reach GitHub. Check your connection.</div>'); });
    };
    fr.readAsDataURL(file);
  }
  function tokenBox() {
    var box = el("details", { class: "token-box" });
    box.appendChild(el("summary", { text: "Upload key (one-time setup for uploading files)" }));
    box.appendChild(el("div", { class: "small muted", html: "To upload files, this device needs a GitHub key. On GitHub: Settings &rarr; Developer settings &rarr; Personal access tokens &rarr; Fine-grained tokens &rarr; Generate new token. Pick only the <strong>RiptideOfficials.github.io</strong> repository, set <strong>Contents</strong> to <strong>Read and write</strong>, then paste the key here. It stays on this device only." }));
    var inp = el("input", { type: "password", placeholder: "Paste your GitHub key here", value: ghToken(), autocomplete: "off" });
    var note = el("span", { class: "small muted", text: ghToken() ? "A key is saved on this device." : "" });
    box.appendChild(inp);
    box.appendChild(el("div", { class: "btn-row" }, [btn("Save key", "ghost", function () { try { localStorage.setItem("ro_gh_token", inp.value.trim()); note.textContent = inp.value.trim() ? "Saved on this device." : "Key removed."; } catch (x) { note.textContent = "Could not save on this device."; } }), note]));
    return box;
  }

  /* ---------- link lists (Documents / Apprentice forms) ---------- */
  function parseList(sec) {   // the page's own markup -> groups [{heading, items:[{title,desc,url,tag,dl,dlLabel}]}]
    var groups = [], cur = null;
    Array.prototype.forEach.call(sec.children, function (n) {
      if (n.tagName === "H3") { cur = { heading: n.textContent, items: [] }; groups.push(cur); }
      else if (n.tagName === "UL" && n.classList.contains("doc-list")) {
        if (!cur) { cur = { heading: "", items: [] }; groups.push(cur); }
        Array.prototype.forEach.call(n.children, function (li) {
          var a = li.querySelector("a:not(.dl)"); if (!a) return;
          if (li.classList.contains("btn-li")) { var dd = li.querySelector(".d"); cur.items.push({ title: a.textContent, desc: dd ? dd.textContent : "", url: a.getAttribute("href"), tag: "", dl: "", dlLabel: "", btn: true }); return; }
          var t = li.querySelector(".t"), d = li.querySelector(".d"), b = li.querySelector(".badge"), dl = li.querySelector("a.dl");
          cur.items.push({ title: t ? t.textContent : a.textContent, desc: d ? d.textContent : "", url: a.getAttribute("href"), tag: b ? b.textContent : "", dl: dl ? dl.getAttribute("href") : "", dlLabel: dl ? dl.textContent : "" });
        });
        cur = null;
      }
    });
    return groups;
  }
  function renderList(sec, groups) {
    Array.prototype.slice.call(sec.children).forEach(function (n) { if (n.tagName === "UL" && n.classList.contains("doc-list") || n.tagName === "H3") sec.removeChild(n); });
    var anchor = sec.querySelector(".edit-ui");
    groups.forEach(function (g) {
      if (g.heading) { var h = el("h3", { text: g.heading, style: "margin-top:14px" }); anchor ? sec.insertBefore(h, anchor) : sec.appendChild(h); }
      var ul = el("ul", { class: "doc-list" });
      g.items.forEach(function (it) {
        var tg = it.tag || tagFor(it.url)[0], ext = isExternal(it.url);
        if (it.btn) {   // shown as a blue button instead of a row
          var ba = el("a", { class: "btn", href: it.url, text: it.title }); if (ext) { ba.target = "_blank"; ba.rel = "noopener"; }
          var bl = el("li", { class: "btn-li" }); bl.appendChild(ba); if (it.desc) bl.appendChild(el("span", { class: "d", text: it.desc })); ul.appendChild(bl); return;
        }
        var a = el("a", { href: it.url }); if (ext) { a.target = "_blank"; a.rel = "noopener"; }
        a.appendChild(el("span", { class: "badge " + tagClass(tg), text: tg }));
        var txt = el("span"); txt.appendChild(el("span", { class: "t", text: it.title }));
        if (it.desc) txt.appendChild(el("span", { class: "d", text: it.desc }));
        a.appendChild(txt);
        var li = el("li"); li.appendChild(a);
        var dlu = it.dl || (!ext && /^docs\//.test(it.url) && tagFor(it.url)[0] !== "PAGE" ? it.url : "");
        if (dlu) li.appendChild(el("a", { class: "dl", href: dlu, download: "", text: it.dlLabel || "Download" }));
        ul.appendChild(li);
      });
      anchor ? sec.insertBefore(ul, anchor) : sec.appendChild(ul);
    });
  }
  function editList(sec, page, content, original, after) {
    var groups = JSON.parse(JSON.stringify((content.lists && content.lists[sec.id]) || original)), view = Array.prototype.slice.call(sec.children).filter(function (n) { return n.tagName === "UL" || n.tagName === "H3"; });
    var ui = el("div", { class: "edit-ui" });
    var msg = el("div", { role: "status" });
    function draw() {
      ui.innerHTML = "";
      ui.appendChild(el("p", { class: "muted small", text: "Change the text or link, use the arrows to reorder, or remove a row. Links can be a full web address (https://...) or a file in the site (docs/...)." }));
      groups.forEach(function (g, gi) {
        var box = el("div", { class: "edit-group" });
        var h = el("input", { placeholder: "Heading for this group (optional)", value: g.heading || "" }); h.oninput = function () { g.heading = h.value; };
        box.appendChild(h);
        g.items.forEach(function (it, ii) {
          var row = el("div", { class: "edit-row" });
          [["title", "Name shown"], ["desc", "Short description (optional)"], ["url", "Link: https://... or docs/..."]].forEach(function (f) {
            var inp = el("input", { placeholder: f[1], value: it[f[0]] || "" });
            inp.oninput = function () { it[f[0]] = inp.value; if (f[0] === "url") it.tag = ""; };
            row.appendChild(inp);
          });
          var cbl = el("label", { class: "tbd-opt" }), cb = el("input", { type: "checkbox" }); cb.checked = !!it.btn; cb.onchange = function () { it.btn = cb.checked; };
          cbl.appendChild(cb); cbl.appendChild(document.createTextNode(" Show as a blue button")); row.appendChild(cbl);
          var fileIn = el("input", { type: "file", style: "display:none" });
          fileIn.onchange = function () {
            if (!fileIn.files[0]) return;
            uploadFile(fileIn.files[0], function (path, name) { it.url = path; it.tag = ""; it.dl = ""; if (!(it.title || "").trim()) it.title = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "); draw(); msg.innerHTML = '<div class="msg ok">Uploaded. It can take a minute or two before people can open it. Tap Save to finish.</div>'; }, function (h) { msg.innerHTML = h; });
          };
          var tools = el("div", { class: "edit-tools" }, [
            btn(it.url ? "Replace file" : "Upload file", "", function () { fileIn.click(); }), fileIn,
            btn("↑", "ghost", function () { if (ii > 0) { g.items.splice(ii - 1, 0, g.items.splice(ii, 1)[0]); draw(); } }),
            btn("↓", "ghost", function () { if (ii < g.items.length - 1) { g.items.splice(ii + 1, 0, g.items.splice(ii, 1)[0]); draw(); } }),
            btn("Remove", "danger", function () { g.items.splice(ii, 1); draw(); })
          ]);
          row.appendChild(tools); box.appendChild(row);
        });
        box.appendChild(btn("+ Add a link", "ghost", function () { g.items.push({ title: "", desc: "", url: "" }); draw(); }));
        if (groups.length > 1 && !g.items.length) box.appendChild(btn("Remove this group", "danger", function () { groups.splice(gi, 1); draw(); }));
        ui.appendChild(box);
      });
      ui.appendChild(btn("+ Add a group with its own heading", "ghost", function () { groups.push({ heading: "", items: [{ title: "", desc: "", url: "" }] }); draw(); }));
      var bar = el("div", { class: "btn-row" }, [
        btn("Save", "green", save), btn("Cancel", "ghost", close),
        (content.lists && content.lists[sec.id]) ? btn("Restore the original list", "danger", restore) : null
      ]);
      ui.appendChild(bar); ui.appendChild(msg); ui.appendChild(tokenBox());
    }
    function close() { if (ui.parentNode) ui.parentNode.removeChild(ui); view.forEach(function (n) { n.hidden = false; }); }
    function save() {
      var clean = [];
      for (var gi = 0; gi < groups.length; gi++) {
        var g = groups[gi], items = [];
        for (var i = 0; i < g.items.length; i++) {
          var it = g.items[i], t = (it.title || "").trim(), u = (it.url || "").trim();
          if (!t && !u) continue;
          if (!t || !URL_OK.test(u)) { msg.innerHTML = '<div class="msg err">Each link needs a name and a link that starts with https:// (or docs/).</div>'; return; }
          items.push({ title: t, desc: (it.desc || "").trim(), url: u, tag: it.tag || "", dl: it.dl || "", dlLabel: it.dlLabel || "", btn: !!it.btn });
        }
        if (items.length) clean.push({ heading: (g.heading || "").trim(), items: items });
      }
      content.lists = content.lists || {}; content.lists[sec.id] = clean;
      msg.textContent = "Saving...";
      store(page, content).then(function () { close(); renderList(sec, clean); after && after(); })
        .catch(function () { msg.innerHTML = '<div class="msg err">Could not save. Make sure the latest firestore.rules are published.</div>'; });
    }
    function restore() {
      if (!confirm("Go back to the original list? Your changes to this box will be lost.")) return;
      delete content.lists[sec.id];
      store(page, content).then(function () { close(); renderList(sec, original); after && after(); }).catch(function () { msg.innerHTML = '<div class="msg err">Could not save.</div>'; });
    }
    view.forEach(function (n) { n.hidden = true; });
    draw(); sec.appendChild(ui);
  }

  /* ---------- rich text boxes (the how-to steps) ---------- */
  function blockParts(host) {   // [fixed-top nodes, editable nodes]
    var top = [], rest = [];
    if (host.tagName === "DETAILS") {
      Array.prototype.forEach.call(host.children, function (n) { (n.tagName === "SUMMARY" || n.classList.contains("pencil") || n.classList.contains("edit-ui") ? top : rest).push(n); });
    } else {
      var body = host.querySelector(".body") || host, seenH2 = false;
      Array.prototype.forEach.call(body.children, function (n) {
        if (n.classList.contains("pencil") || n.classList.contains("edit-ui")) return;
        if (!seenH2) { top.push(n); if (n.tagName === "H2") seenH2 = true; } else rest.push(n);
      });
    }
    return [top, rest];
  }
  function titleOf(host) { var t = host.tagName === "DETAILS" ? host.querySelector("summary") : host.querySelector("h2"); return t ? t.textContent : ""; }
  function blockHtml(host) { return E.clean(blockParts(host)[1].map(function (n) { return n.outerHTML; }).join("")); }
  function applyBlock(host, b) {
    var parts = blockParts(host), titleEl = host.tagName === "DETAILS" ? host.querySelector("summary") : host.querySelector("h2");
    if (titleEl && b.title) titleEl.textContent = b.title;
    var holder = host.tagName === "DETAILS" ? host : (host.querySelector(".body") || host);
    parts[1].forEach(function (n) { holder.removeChild(n); });
    var tmp = document.createElement("div"); tmp.innerHTML = E.clean(b.html || "");
    Array.prototype.slice.call(tmp.childNodes).forEach(function (n) { holder.appendChild(n); });
  }
  function pickPicture(ed) {
    var inp = el("input", { type: "file", accept: "image/*" });
    inp.onchange = function () { if (inp.files && inp.files[0]) addPicture(ed, inp.files[0]); };
    inp.click();
  }
  function addPicture(ed, f) {   // shrink a screenshot/photo and place it in the text where the cursor is
    (function () {
      var url = URL.createObjectURL(f), im = new Image();
      im.onload = function () {
        var w = im.naturalWidth, h = im.naturalHeight, max = 900, r = Math.min(1, max / w);
        var c = document.createElement("canvas"); c.width = Math.round(w * r); c.height = Math.round(h * r);
        var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
        var data = c.toDataURL("image/jpeg", 0.72); URL.revokeObjectURL(url);
        ed.focus(); document.execCommand("insertImage", false, data);
        Array.prototype.forEach.call(ed.querySelectorAll("img"), function (i) { i.className = "shot"; i.removeAttribute("style"); });
      };
      im.onerror = function () { alert("Could not read that picture."); };
      im.src = url;
    })();
  }
  function editBlock(host, page, content, original, after) {
    var id = host.id, cur = (content.blocks && content.blocks[id]) || original;
    var holder = host.tagName === "DETAILS" ? host : (host.querySelector(".body") || host), parts = blockParts(host);
    var ui = el("div", { class: "edit-ui" }), msg = el("div", { role: "status" });
    var title = el("input", { value: cur.title || "", "aria-label": "Title" });
    var tools = el("div", { class: "rt-tools" });
    var ed = el("div", { class: "rt-box", contenteditable: "true" });
    ed.innerHTML = cur.html.replace(/<div data-team-link[^>]*>.*?<\/div>/g, '<div data-team-link contenteditable="false" class="rt-ph">[The team registration button shows here]</div>');
    ed.addEventListener("paste", function (e) {   // pasting a copied screenshot puts it right in the text
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) if (items[i].kind === "file" && /^image\//.test(items[i].type)) { e.preventDefault(); addPicture(ed, items[i].getAsFile()); return; }
    });
    function cmd(name, val) { ed.focus(); document.execCommand(name, false, val || null); }
    [["B", "Bold", function () { cmd("bold"); }], ["Link", "Make the selected words a link", linkTool(ed, false)], ["Button", "Make the selected words a blue button link", linkTool(ed, true)], ["Unlink", "Remove the link", function () { cmd("unlink"); }], ["• List", "Bulleted list", function () { cmd("insertUnorderedList"); }], ["Heading", "Small heading", function () { cmd("formatBlock", "h3"); }], ["Paragraph", "Normal text", function () { cmd("formatBlock", "p"); }], ["Picture", "Add a screenshot or photo from your device", function () { pickPicture(ed); }]]
      .forEach(function (t) { var b = btn(t[0], "ghost", t[2]); b.title = t[1]; b.onmousedown = function (e) { e.preventDefault(); }; tools.appendChild(b); });
    function close() { if (ui.parentNode) ui.parentNode.removeChild(ui); parts[1].concat(parts[0]).forEach(function (n) { n.hidden = false; }); }
    var bad = false;
    function shrinkPics() {
      bad = false;   // any picture that got in another way (png, blob) is turned into a small jpeg so it can be saved
      return Promise.all(Array.prototype.map.call(ed.querySelectorAll("img"), function (i) {
        var src = i.getAttribute("src") || "";
        if (/^assets\/img\//.test(src) || /^data:image\/jpeg;base64,/.test(src)) return null;
        return new Promise(function (res) {
          var im = new Image(); im.crossOrigin = "anonymous";
          im.onload = function () {
            try {
              var r = Math.min(1, 900 / im.naturalWidth), c = document.createElement("canvas"); c.width = Math.round(im.naturalWidth * r); c.height = Math.round(im.naturalHeight * r);
              var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
              i.setAttribute("src", c.toDataURL("image/jpeg", 0.72));
            } catch (e) { bad = true; }
            res();
          };
          im.onerror = function () { bad = true; res(); };
          im.src = src;
        });
      }));
    }
    function save() {
      msg.textContent = "Saving...";
      shrinkPics().then(function () {
        if (bad) { msg.innerHTML = '<div class="msg err">One of the pictures could not be saved (it was copied from another website). Delete it, then take a screenshot of it (Windows key + Shift + S) and paste that instead.</div>'; return; }
        save2();
      });
    }
    function save2() {
      var html = E.clean(ed.innerHTML.replace(/<div data-team-link[^>]*>.*?<\/div>/g, '<div data-team-link></div>'));
      var want = ed.querySelectorAll("img").length, got = (html.match(/<img /g) || []).length;
      if (got < want) { var bs = ed.querySelector("img"); msg.innerHTML = '<div class="msg err">A picture was dropped (' + (want - got) + '). Please tell Wendy\'s helper: ' + ((bs && (bs.getAttribute("src") || "").slice(0, 40)) || "?").replace(/</g, "") + ' / size ' + html.length + '</div>'; return; }
      content.blocks = content.blocks || {}; content.blocks[id] = { title: title.value.trim() || original.title, html: html };
      msg.textContent = "Saving...";
      store(page, content).then(function () { close(); applyBlock(host, content.blocks[id]); after && after(); })
        .catch(function () { msg.innerHTML = '<div class="msg err">Could not save. Make sure the latest firestore.rules are published.</div>'; });
    }
    function restore() {
      if (!confirm("Go back to the original text? Your changes to this box will be lost.")) return;
      delete content.blocks[id];
      store(page, content).then(function () { close(); applyBlock(host, original); after && after(); }).catch(function () { msg.innerHTML = '<div class="msg err">Could not save.</div>'; });
    }
    ui.appendChild(el("label", { text: "Title" })); ui.appendChild(title);
    ui.appendChild(el("label", { text: "Text" })); ui.appendChild(tools); ui.appendChild(ed);
    ui.appendChild(el("p", { class: "muted small", text: "Tip: press Enter twice to leave a blank line (a space). To remove a space, put the cursor on the blank line and press Backspace. Email addresses turn into links by themselves." }));
    ui.appendChild(el("div", { class: "btn-row" }, [btn("Save", "green", save), btn("Cancel", "ghost", close), (content.blocks && content.blocks[id]) ? btn("Restore the original text", "danger", restore) : null]));
    ui.appendChild(msg);
    parts[1].forEach(function (n) { n.hidden = true; });
    if (host.tagName !== "DETAILS") parts[0].forEach(function (n) { if (n.tagName === "H2") n.hidden = true; });
    holder.appendChild(ui);
    if (host.tagName === "DETAILS") host.open = true;
  }

  /* ---------- page title + intro line ---------- */
  function headParts(h) { return [h.querySelector("h1"), h.querySelector("p.muted")]; }
  function applyHead(h, v) {
    var p = headParts(h);
    if (p[0] && v.title) { p[0].textContent = v.title; try { document.title = v.title + " | Riptide Officials"; } catch (x) {} }
    if (p[1] && typeof v.intro === "string") p[1].textContent = v.intro;
  }
  function editHead(h, page, content, original, after) {
    var cur = (content.heads && content.heads[h.id]) || original, p = headParts(h);
    var ui = el("div", { class: "edit-ui" }), msg = el("div", { role: "status" });
    var t = el("input", { value: cur.title || "" }), i = el("input", { value: cur.intro || "" });
    function close() { if (ui.parentNode) ui.parentNode.removeChild(ui); p.forEach(function (n) { if (n) n.hidden = false; }); }
    function save() {
      content.heads = content.heads || {}; content.heads[h.id] = { title: t.value.trim() || original.title, intro: i.value.trim() };
      msg.textContent = "Saving...";
      store(page, content).then(function () { close(); applyHead(h, content.heads[h.id]); }).catch(function () { msg.innerHTML = '<div class="msg err">Could not save. Make sure the latest firestore.rules are published.</div>'; });
    }
    function restore() {
      if (!confirm("Go back to the original title? Your changes here will be lost.")) return;
      delete content.heads[h.id];
      store(page, content).then(function () { close(); applyHead(h, original); }).catch(function () { msg.innerHTML = '<div class="msg err">Could not save.</div>'; });
    }
    ui.appendChild(el("label", { text: "Page title" })); ui.appendChild(t);
    ui.appendChild(el("label", { text: "Line under the title" })); ui.appendChild(i);
    ui.appendChild(el("div", { class: "btn-row" }, [btn("Save", "green", save), btn("Cancel", "ghost", close), (content.heads && content.heads[h.id]) ? btn("Restore the original", "danger", restore) : null]));
    ui.appendChild(msg);
    p.forEach(function (n) { if (n) n.hidden = true; });
    var anchor = h.querySelector(".btn-row"); anchor ? h.insertBefore(ui, anchor) : h.appendChild(ui);
  }

  /* ---------- loose text on a page: group headings, notes (callouts), intro lines ---------- */
  function textTargets(root) {
    var seen = {}, out = [];
    if (!root.querySelector(".guide-head, [data-edit-text]")) return out;   // the step-by-step pages, plus anything marked data-edit-text
    Array.prototype.forEach.call(root.querySelectorAll(".group-title, .callout, .card > h3, .card > p, .guide-note, [data-edit-text]"), function (n) {
      var marked = n.hasAttribute("data-edit-text");
      if (marked ? n.closest(".edit-ui") : (n.closest("[data-editable],[data-edit-head],.edit-ui,.doc-section,.progress,.contact-card,.restore-box") || n.querySelector("[data-team-link]"))) return;
      var kind = /^H\d$/.test(n.tagName) ? "head" : "note";
      seen[kind] = (seen[kind] || 0) + 1;
      n.setAttribute("data-etid", n.id ? "t-" + n.id : "t-" + kind + "-" + seen[kind]);
      out.push(n);
    });
    return out;
  }
  function isHeadEl(n) { return /^H\d$/.test(n.tagName) || n.getAttribute("data-edit-text") === "line"; }
  function applyText(n, v) { if (isHeadEl(n)) n.textContent = v.text || ""; else n.innerHTML = E.clean(v.html || ""); }
  function editText(n, wrap, page, content, original) {
    var id = n.getAttribute("data-etid"), head = isHeadEl(n), cur = (content.texts && content.texts[id]) || original;
    var ui = el("div", { class: "edit-ui" }), msg = el("div", { role: "status" }), field;
    if (head) { field = el("input", { value: cur.text || "", "aria-label": "Heading" }); ui.appendChild(field); }
    else {
      var tools = el("div", { class: "rt-tools" });
      field = el("div", { class: "rt-box", contenteditable: "true" }); field.innerHTML = cur.html || "";
      function cmd(name, val) { field.focus(); document.execCommand(name, false, val || null); }
      [["B", "Bold", function () { cmd("bold"); }], ["Link", "Make the selected words a link", linkTool(field, false)], ["Button", "Make the selected words a blue button link", linkTool(field, true)], ["Unlink", "Remove the link", function () { cmd("unlink"); }]].forEach(function (t) { var b = btn(t[0], "ghost", t[2]); b.onmousedown = function (e) { e.preventDefault(); }; tools.appendChild(b); });
      ui.appendChild(tools); ui.appendChild(field);
    }
    function close() { if (ui.parentNode) ui.parentNode.removeChild(ui); n.hidden = false; var pb = wrap.querySelector(".pencil"); if (pb) pb.hidden = false; }
    function put(v, ok) { content.texts = content.texts || {}; if (v) content.texts[id] = v; else delete content.texts[id];
      msg.textContent = "Saving...";
      store(page, content).then(function () { applyText(n, v || original); close(); }).catch(function () { msg.innerHTML = '<div class="msg err">Could not save. Make sure the latest firestore.rules are published.</div>'; }); }
    ui.appendChild(el("div", { class: "btn-row" }, [
      btn("Save", "green", function () { var v = head ? { text: field.value.trim() || original.text } : { html: E.clean(field.innerHTML) }; put(v); }),
      btn("Cancel", "ghost", close),
      (content.texts && content.texts[id]) ? btn("Restore the original", "danger", function () { if (confirm("Go back to the original text?")) put(null); }) : null]));
    ui.appendChild(msg);
    n.hidden = true; var pb2 = wrap.querySelector(".pencil"); if (pb2) pb2.hidden = true;
    wrap.appendChild(ui);
  }

  /* ---------- a row of buttons (e.g. "Jump to") ---------- */
  var BTN_OK = /^(#[A-Za-z0-9_\-]+|https?:\/\/|mailto:|tel:|docs\/|assets\/|[A-Za-z0-9_\-]+\.html)/i;
  var CLS_OK = /^btn( (small|green|light|ghost|coord))*$/;
  function parseButtons(row) { return Array.prototype.map.call(row.querySelectorAll("a"), function (a) { return { label: a.textContent, url: a.getAttribute("href") || "", cls: a.className || "" }; }); }
  function renderButtons(row, list) {
    row.innerHTML = "";
    list.forEach(function (b) { var a = el("a", { class: (b.cls && CLS_OK.test(b.cls)) ? b.cls : "btn small", href: b.url, text: b.label }); if (/^https?:/i.test(b.url)) { a.target = "_blank"; a.rel = "noopener"; } row.appendChild(a); });
  }
  function editButtons(row, wrap, page, content, original) {
    var id = row.id, list = JSON.parse(JSON.stringify((content.buttons && content.buttons[id]) || original));
    var ui = el("div", { class: "edit-ui" }), msg = el("div", { role: "status" });
    function close() { if (ui.parentNode) ui.parentNode.removeChild(ui); row.hidden = false; var pb = wrap.querySelector(".pencil"); if (pb) pb.hidden = false; }
    function draw() {
      ui.innerHTML = "";
      ui.appendChild(el("p", { class: "muted small", text: "Each button has the words on it and where it goes. To jump to a section on this page use #step-1, #renew, etc. Or use a full web address (https://...)." }));
      list.forEach(function (b, i) {
        var l = el("input", { placeholder: "Words on the button", value: b.label }); l.oninput = function () { b.label = l.value; };
        var u = el("input", { placeholder: "Goes to: #step-1 or https://...", value: b.url }); u.oninput = function () { b.url = u.value; };
        ui.appendChild(el("div", { class: "edit-row" }, [l, u, el("div", { class: "edit-tools" }, [
          btn("↑", "ghost", function () { if (i > 0) { list.splice(i - 1, 0, list.splice(i, 1)[0]); draw(); } }),
          btn("↓", "ghost", function () { if (i < list.length - 1) { list.splice(i + 1, 0, list.splice(i, 1)[0]); draw(); } }),
          btn("Remove", "danger", function () { list.splice(i, 1); draw(); })])]));
      });
      ui.appendChild(btn("+ Add a button", "ghost", function () { list.push({ label: "", url: "" }); draw(); }));
      ui.appendChild(el("div", { class: "btn-row" }, [btn("Save", "green", function () {
        var clean = [];
        for (var i = 0; i < list.length; i++) { var t = (list[i].label || "").trim(), u = (list[i].url || "").trim(); if (!t && !u) continue;
          if (!t || !BTN_OK.test(u)) { msg.innerHTML = '<div class="msg err">Each button needs words and a link (#section, https://..., or a page name).</div>'; return; } clean.push(list[i].cls && CLS_OK.test(list[i].cls) ? { label: t, url: u, cls: list[i].cls } : { label: t, url: u }); }
        content.buttons = content.buttons || {}; content.buttons[id] = clean; msg.textContent = "Saving...";
        store(page, content).then(function () { renderButtons(row, clean); close(); }).catch(function () { msg.innerHTML = '<div class="msg err">Could not save. Make sure the latest firestore.rules are published.</div>'; });
      }), btn("Cancel", "ghost", close),
      (content.buttons && content.buttons[id]) ? btn("Restore the original", "danger", function () {
        if (!confirm("Go back to the original buttons?")) return; delete content.buttons[id];
        store(page, content).then(function () { renderButtons(row, original); close(); }).catch(function () { msg.innerHTML = '<div class="msg err">Could not save.</div>'; });
      }) : null]));
      ui.appendChild(msg);
    }
    draw(); row.hidden = true; var pb2 = wrap.querySelector(".pencil"); if (pb2) pb2.hidden = true; wrap.appendChild(ui);
  }

  /* ---------- steps an admin adds or moves on the step-by-step pages ---------- */
  function stepGroups(root) {   // [{key, head, steps}] - steps before the first section heading use key "_"
    var gs = [], cur = { key: "_", head: null, steps: [] }; gs.push(cur);
    Array.prototype.forEach.call(root.querySelectorAll(".step, .timer-doc, .group-title"), function (n) {
      if (n.classList.contains("group-title")) { cur = { key: n.id || ("g" + gs.length), head: n, steps: [] }; gs.push(cur); }
      else if (n.tagName === "SECTION") cur.steps.push(n);
    });
    return gs;
  }
  function isPlain(root) { return !root.querySelector("section.step") && !!root.querySelector("section.timer-doc"); }   // sections without step numbers (timer briefing)
  function mkStep(key, s, plain) {
    if (plain) {
      var t = el("section", { class: "card timer-doc", id: s.id, "data-editable": "", "data-addstep": key });
      t.appendChild(el("h2", { text: s.title || "New section" })); t.insertAdjacentHTML("beforeend", E.clean(s.html || "")); return t;
    }
    var d = el("section", { class: "step card", id: s.id, "data-editable": "", "data-addstep": key });
    d.appendChild(el("input", { type: "checkbox", class: "stepbox", "data-step": s.id, "aria-label": "Mark this step done" }));
    var b = el("div", { class: "body" }); b.appendChild(el("div", { class: "num", text: "Step 1" })); b.appendChild(el("h2", { text: s.title || "New step" }));
    b.insertAdjacentHTML("beforeend", E.clean(s.html || "")); d.appendChild(b); return d;
  }
  function placeSteps(root, content) {
    if (!root.querySelector("section.step, section.timer-doc")) return;
    var plain = isPlain(root);
    stepGroups(root).forEach(function (g) {
      var anchor = g.steps.length ? g.steps[g.steps.length - 1] : g.head;
      if (!anchor) return;
      ((content.added || {})[g.key] || []).forEach(function (s) {
        var d = mkStep(g.key, s, plain); anchor.parentNode.insertBefore(d, anchor.nextSibling); anchor = d; g.steps.push(d);
      });
      var ord = (content.order || {})[g.key];
      if (ord && ord.length && g.steps.length > 1) {
        var last = g.steps[g.steps.length - 1], marker = last.nextSibling, parent = last.parentNode;
        var sorted = g.steps.map(function (n, i) { var k = ord.indexOf(n.id); return { n: n, k: k < 0 ? 1e6 + i : k }; }).sort(function (a, b) { return a.k - b.k; });
        sorted.forEach(function (x) { parent.insertBefore(x.n, marker); });
      }
    });
  }

  /* ---------- put it all on a page ---------- */
  E.renumber = function (root) {   // "Step 1, Step 2..." follow whatever steps are on the page; each section heading (group) starts again at 1
    var n = 0;
    Array.prototype.forEach.call(root.querySelectorAll(".step, .group-title"), function (st) {
      if (st.classList.contains("group-title")) { n = 0; return; }
      var num = st.querySelector(".num"); if (!num || !/^\s*step\s*\d+/i.test(num.textContent)) return;
      num.textContent = "Step " + (++n);
    });
  };
  E.run = function (root, ctx, page) {
    return load(page).then(function (content) {
      // boxes an admin adds as things come up (announcements): saved in content.boxes[containerId]
      var adders = Array.prototype.slice.call(root.querySelectorAll("[data-add-boxes]"));
      adders.forEach(function (c) {
        (((content.boxes || {})[c.id]) || []).forEach(function (b) {
          var d = el("div", { class: "card announce", id: b.id, "data-editable": "", "data-dyn": c.id });
          d.appendChild(el("h2", { text: b.title || "Announcement" })); d.insertAdjacentHTML("beforeend", E.clean(b.html || ""));
          c.appendChild(d);
        });
      });
      placeSteps(root, content);
      var lists = Array.prototype.slice.call(root.querySelectorAll("section.doc-section")).filter(function (s) { return s.querySelector("ul.doc-list"); });
      var blocks = Array.prototype.slice.call(root.querySelectorAll("[data-editable]"));
      var heads = Array.prototype.slice.call(root.querySelectorAll("[data-edit-head]"));
      var originals = {};
      heads.forEach(function (h) { var p = headParts(h); originals[h.id] = { title: p[0] ? p[0].textContent : "", intro: p[1] ? p[1].textContent : "" }; });
      heads.forEach(function (h) { if (content.heads && content.heads[h.id]) applyHead(h, content.heads[h.id]); });
      lists.forEach(function (s) { originals[s.id] = parseList(s); });
      blocks.forEach(function (h) { originals[h.id] = { title: titleOf(h), html: blockHtml(h) }; });
      lists.forEach(function (s) { if (content.lists && content.lists[s.id]) renderList(s, content.lists[s.id]); });
      blocks.forEach(function (h) { if (content.blocks && content.blocks[h.id]) applyBlock(h, content.blocks[h.id]); });
      var texts = textTargets(root), textOrig = {};
      texts.forEach(function (n) { var id = n.getAttribute("data-etid"); textOrig[id] = isHeadEl(n) ? { text: n.textContent } : { html: E.clean(n.innerHTML) }; if (content.texts && content.texts[id]) applyText(n, content.texts[id]); });
      var btnRows = Array.prototype.slice.call(root.querySelectorAll("[data-edit-buttons]")), btnOrig = {};
      btnRows.forEach(function (r) { btnOrig[r.id] = parseButtons(r); if (content.buttons && content.buttons[r.id]) renderButtons(r, content.buttons[r.id]); });
      // sections an admin removed from the page (they can be restored); the step numbers then close up
      var hidden = content.hidden || {}, hiddenList = [];
      blocks = blocks.filter(function (h) {
        if (hidden[h.id] && h.classList.contains("step")) { hiddenList.push({ id: h.id, title: (originals[h.id] || {}).title || h.id }); h.parentNode.removeChild(h); return false; }
        return true;
      });
      E.renumber(root);
      if (!ctx || !ctx.isAdmin) return;
      if (hiddenList.length) {
        var rb = el("div", { class: "card restore-box" }); rb.appendChild(el("strong", { text: "Removed sections (only you see this)" }));
        hiddenList.forEach(function (x) {
          var row = el("div", { class: "btn-row", style: "margin:6px 0 0;align-items:center" }, [el("span", { text: x.title }), btn("Restore", "ghost", function () {
            delete content.hidden[x.id]; store(page, content).then(function () { location.reload(); }).catch(function () { alert("Could not restore. Please try again."); });
          })]);
          rb.appendChild(row);
        });
        var first = root.querySelector("#progress") || root.firstChild; first.parentNode.insertBefore(rb, first);
      }
      texts.forEach(function (n) {
        var w = el("div", { class: "edit-wrap" }); n.parentNode.insertBefore(w, n); w.appendChild(n);
        var pb = el("button", { type: "button", class: "pencil", title: "Edit this text", "aria-label": "Edit this text", html: "\u270E <span>Edit</span>" });
        pb.onclick = function () { if (!w.querySelector(".edit-ui")) editText(n, w, page, content, textOrig[n.getAttribute("data-etid")]); };
        w.insertBefore(pb, w.firstChild);
      });
      btnRows.forEach(function (r) {
        var w = el("div", { class: "edit-wrap" }); r.parentNode.insertBefore(w, r); w.appendChild(r);
        var pb = el("button", { type: "button", class: "pencil", title: "Edit these buttons", "aria-label": "Edit these buttons", html: "\u270E <span>Edit</span>" });
        pb.onclick = function () { if (!w.querySelector(".edit-ui")) editButtons(r, w, page, content, btnOrig[r.id]); };
        w.insertBefore(pb, w.firstChild);
      });
      function pencil(host, fn) {
        var p = el("button", { type: "button", class: "pencil", title: "Edit this box", "aria-label": "Edit this box", html: "✎ <span>Edit</span>" });
        p.onclick = function () { if (host.querySelector(".edit-ui")) return; fn(); };
        host.classList.add("has-pencil"); host.insertBefore(p, host.firstChild);
      }
      lists.forEach(function (s) { if (s.hasAttribute("data-edit-list")) pencil(s, function () { editList(s, page, content, originals[s.id], null); }); });   // a stand-alone list box (no tabs)
      heads.forEach(function (h) { pencil(h, function () { editHead(h, page, content, originals[h.id], null); }); });
      if (lists.some(function (s) { return !s.hasAttribute("data-edit-list"); })) {
        var wrap = el("div", { class: "edit-page-bar" });
        var eb = el("button", { type: "button", class: "pencil static", html: "\u270E <span>Edit or upload files in this tab</span>" });
        eb.onclick = function () {
          var s = lists.filter(function (x) { return !x.hidden; })[0] || lists[0];
          if (s.querySelector(".edit-ui")) return;
          editList(s, page, content, originals[s.id], null);
        };
        wrap.appendChild(eb);
        var g = root.querySelector(".doc-grid"); if (g) g.parentNode.insertBefore(wrap, g);
      }
      blocks.forEach(function (h) {
        var host = h.tagName === "DETAILS" ? h : h;
        pencil(host, function () { editBlock(h, page, content, originals[h.id], null); });
        if (h.hasAttribute("data-addstep")) {
          var rm2 = el("button", { type: "button", class: "pencil del", title: "Delete this step", "aria-label": "Delete this step", html: "\u2715 <span>Delete</span>" });
          rm2.onclick = function () {
            if (!confirm("Delete this step? This cannot be undone.")) return;
            var k = h.getAttribute("data-addstep");
            content.added = content.added || {}; content.added[k] = (content.added[k] || []).filter(function (x) { return x.id !== h.id; });
            if (content.blocks) delete content.blocks[h.id];
            if (content.order && content.order[k]) content.order[k] = content.order[k].filter(function (x) { return x !== h.id; });
            store(page, content).then(function () { location.reload(); }).catch(function () { alert("Could not delete. Please try again."); });
          };
          h.insertBefore(rm2, h.firstChild);
        }
        if ((h.classList.contains("step") && h.querySelector(".num")) || h.classList.contains("timer-doc")) {
          [["mv up", "\u25B2", "Move this step up", -1], ["mv dn", "\u25BC", "Move this step down", 1]].forEach(function (m) {
            var mb = el("button", { type: "button", class: "pencil " + m[0], title: m[2], "aria-label": m[2], text: m[1] });
            mb.onclick = function () {
              var g = stepGroups(root).filter(function (x) { return x.steps.indexOf(h) >= 0; })[0]; if (!g) return;
              var i = g.steps.indexOf(h), j = i + m[3]; if (j < 0 || j >= g.steps.length) return;
              var other = g.steps[j];
              if (m[3] < 0) other.parentNode.insertBefore(h, other); else other.parentNode.insertBefore(h, other.nextSibling);
              E.renumber(root);
              content.order = content.order || {}; content.order[g.key] = stepGroups(root).filter(function (x) { return x.key === g.key; })[0].steps.map(function (n) { return n.id; });
              store(page, content).catch(function () { alert("Could not save the new order. Make sure the latest firestore.rules are published."); });
              h.scrollIntoView({ block: "center", behavior: "smooth" });
            };
            h.insertBefore(mb, h.firstChild);
          });
        }
        if (!h.hasAttribute("data-dyn") && !h.hasAttribute("data-addstep") && h.classList.contains("step")) {
          var rm = el("button", { type: "button", class: "pencil del", title: "Remove this section", "aria-label": "Remove this section", html: "\u2715 <span>Delete</span>" });
          rm.onclick = function () {
            if (!confirm("Remove this section from the page? The step numbers will update. You can restore it later from the box at the top.")) return;
            content.hidden = content.hidden || {}; content.hidden[h.id] = true;
            store(page, content).then(function () { location.reload(); }).catch(function () { delete content.hidden[h.id]; alert("Could not remove it. Make sure the latest firestore.rules are published."); });
          };
          h.insertBefore(rm, h.firstChild);
        }
        if (h.hasAttribute("data-dyn")) {
          var del = el("button", { type: "button", class: "pencil del", title: "Delete this box", "aria-label": "Delete this box", html: "\u2715 <span>Delete</span>" });
          del.onclick = function () {
            if (!confirm("Delete this box? This cannot be undone.")) return;
            var cid = h.getAttribute("data-dyn"); content.boxes = content.boxes || {};
            content.boxes[cid] = (content.boxes[cid] || []).filter(function (b) { return b.id !== h.id; });
            if (content.blocks) delete content.blocks[h.id];
            store(page, content).then(function () { h.parentNode.removeChild(h); }).catch(function () { alert("Could not delete. Please try again."); });
          };
          h.insertBefore(del, h.firstChild);
        }
      });
      var plainPage = isPlain(root);
      if (root.querySelector("section.step, section.timer-doc")) stepGroups(root).forEach(function (g) {
        var anchor = g.steps.length ? g.steps[g.steps.length - 1] : g.head; if (!anchor || (!g.steps.length && !g.head.id)) return;
        var bar = el("div", { class: "btn-row add-step-bar", style: "margin:0 0 14px" });
        var add = el("button", { type: "button", class: "btn coord", text: plainPage ? "+ Add a section" : "+ Add a step" });
        add.onclick = function () {
          add.disabled = true;
          content.added = content.added || {}; var id = "s-" + Date.now().toString(36);
          content.added[g.key] = (content.added[g.key] || []).concat([{ id: id, title: plainPage ? "New section" : "New step", html: "<p>Tap Edit to write this.</p>" }]);
          store(page, content).then(function () { location.reload(); }).catch(function () { add.disabled = false; alert("Could not add it. Make sure the latest firestore.rules are published."); });
        };
        bar.appendChild(add); anchor.parentNode.insertBefore(bar, anchor.nextSibling);
      });
      adders.forEach(function (c) {
        var bar = el("div", { class: "btn-row", style: "margin:0 0 14px" });
        var add = el("button", { type: "button", class: "btn coord", text: "+ Add " + (c.getAttribute("data-add-boxes") || "a box") });
        add.onclick = function () {
          add.disabled = true;
          content.boxes = content.boxes || {};
          content.boxes[c.id] = [{ id: "box-" + Date.now().toString(36), title: "New announcement", html: "<p>Tap Edit to write your message.</p>" }].concat(content.boxes[c.id] || []);
          store(page, content).then(function () { location.reload(); }).catch(function () { add.disabled = false; alert("Could not add it. Make sure the latest firestore.rules are published."); });
        };
        bar.appendChild(add); c.parentNode.insertBefore(bar, c);
      });
    });
  };
})();
