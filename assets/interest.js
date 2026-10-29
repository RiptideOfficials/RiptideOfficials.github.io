/* "Interested in becoming an official?" form. Sends an email to the coordinator. */
(function () {
  var R = window.Riptide;
  window.InterestForm = {
    mount: function (slotId) {
      var slot = document.getElementById(slotId);
      if (!slot) return;
      slot.innerHTML =
        '<form id="interest-form" novalidate>' +
        '<div class="row2"><div><label for="i-name">Your name</label><input id="i-name" name="name" autocomplete="name" required></div>' +
        '<div><label for="i-email">Email</label><input id="i-email" name="email" type="email" autocomplete="email" required></div></div>' +
        '<div class="row2"><div><label for="i-phone">Phone (optional)</label><input id="i-phone" name="phone" type="tel" autocomplete="tel"></div>' +
        '<div><label for="i-swimmer">Do you have a swimmer on Riptide? (optional)</label><input id="i-swimmer" name="swimmer" placeholder="Swimmer\'s name"></div></div>' +
        '<label for="i-msg">Anything you\'d like us to know?</label>' +
        '<textarea id="i-msg" name="message" placeholder="Experience, questions, or if you\'d like to try a shadow session..."></textarea>' +
        '<input class="hp" type="text" name="_honey" tabindex="-1" autocomplete="off" aria-hidden="true">' +
        '<div class="btn-row"><button class="btn green" type="submit" id="i-send">Send</button></div>' +
        '<div id="i-status" role="status"></div></form>';

      var form = document.getElementById("interest-form"), status = document.getElementById("i-status");
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var name = form.name.value.trim(), email = form.email.value.trim();
        if (!name || !/^\S+@\S+\.\S+$/.test(email)) {
          status.innerHTML = '<div class="msg err">Please enter your name and a valid email.</div>';
          return;
        }
        if (form._honey.value) return; // spam trap
        var btn = document.getElementById("i-send");
        btn.disabled = true; btn.textContent = "Sending...";
        var data = { name: name, email: email, phone: form.phone.value.trim(),
          swimmer: form.swimmer.value.trim(), message: form.message.value.trim() };
        // best-effort email copy (works once FormSubmit is activated); the saved entry below is the real record
        try {
          fetch("https://formsubmit.co/ajax/" + encodeURIComponent(window.FORMSUBMIT_ID || window.INTEREST_FORM_EMAIL), {
            method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify(Object.assign({ _subject: "Riptide Officials: new interest form from " + name, _template: "table", _captcha: "false" }, data))
          }).catch(function () {});
        } catch (x) {}
        R.db.collection("interest").add(Object.assign({ createdAt: Date.now() }, data)).then(function () {
          form.reset();
          status.innerHTML = '<div class="msg ok">Thank you! Your message was sent and we\'ll be in touch soon.</div>';
        }).catch(function () {
          status.innerHTML = '<div class="msg err">Sorry, that didn\'t send. Please email ' +
            R.esc(window.INTEREST_FORM_EMAIL) + ' directly.</div>';
        }).then(function () { btn.disabled = false; btn.textContent = "Send"; });
      });
    }
  };
})();
