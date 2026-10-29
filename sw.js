// Receives phone alerts for the coordinator and updates the number on the home-screen icon.
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) {}
  var n = parseInt(d.count, 10) || 0;
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title || "Riptide Officials", { body: d.body || "Something is waiting for you.", icon: "assets/img/icon-192.png", tag: "riptide-admin", renotify: true, data: { url: d.url || "admin.html" } }),
    (self.navigator && self.navigator.setAppBadge) ? self.navigator.setAppBadge(n).catch(function () {}) : null
  ]));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "admin.html";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) { if ("focus" in list[i]) { list[i].navigate(url).catch(function () {}); return list[i].focus(); } }
    return self.clients.openWindow(url);
  }));
});
