/* Jumma Time — countdown widget + "find masjids near me" funnel.
   No dependencies. Real masjid + jamat times live in the Takbeer Time app. */
(function () {
  'use strict';

  var WEB_APP = 'https://takbeertime.com/';
  var PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.takbeertime.android';

  /* ---- Next Jummah countdown ---- */
  function nextFriday() {
    var now = new Date();
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 13, 0, 0, 0);
    // Friday = day 5. Roll forward to the next Friday 13:00 local.
    var add = (5 - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + add);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 7);
    return d;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function renderCountdown(widget) {
    var target = nextFriday();
    var dateEl = widget.querySelector('[data-jw-date]');
    if (dateEl) {
      dateEl.textContent = target.toLocaleDateString(undefined, {
        weekday: 'long', month: 'long', day: 'numeric'
      });
    }
    var dd = widget.querySelector('[data-jw="days"]');
    var hh = widget.querySelector('[data-jw="hours"]');
    var mm = widget.querySelector('[data-jw="mins"]');
    var ss = widget.querySelector('[data-jw="secs"]');

    function tick() {
      var diff = target.getTime() - Date.now();
      if (diff <= 0) {
        target = nextFriday();
        if (dateEl) {
          dateEl.textContent = target.toLocaleDateString(undefined, {
            weekday: 'long', month: 'long', day: 'numeric'
          });
        }
        diff = target.getTime() - Date.now();
      }
      var s = Math.floor(diff / 1000);
      if (dd) dd.textContent = Math.floor(s / 86400);
      if (hh) hh.textContent = pad(Math.floor((s % 86400) / 3600));
      if (mm) mm.textContent = pad(Math.floor((s % 3600) / 60));
      if (ss) ss.textContent = pad(s % 60);
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ---- Find masjids near me ---- */
  function wireGeo(widget) {
    var btn = widget.querySelector('[data-jw-geo]');
    var status = widget.querySelector('[data-jw-status]');
    if (!btn) return;

    function go(url) { window.location.href = url; }

    btn.addEventListener('click', function () {
      if (!navigator.geolocation) {
        if (status) status.textContent = 'Opening the masjid finder…';
        go(WEB_APP);
        return;
      }
      if (status) status.textContent = 'Finding masjids near you…';
      btn.setAttribute('aria-busy', 'true');
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          var lat = pos.coords.latitude.toFixed(5);
          var lng = pos.coords.longitude.toFixed(5);
          go(WEB_APP + '?lat=' + lat + '&lng=' + lng + '&utm_source=jummatime&utm_medium=widget');
        },
        function () {
          if (status) status.textContent = 'Location off — opening the masjid finder anyway.';
          go(WEB_APP + '?utm_source=jummatime&utm_medium=widget');
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
      );
    });
  }

  function init() {
    var widgets = document.querySelectorAll('[data-jummah-widget]');
    for (var i = 0; i < widgets.length; i++) {
      renderCountdown(widgets[i]);
      wireGeo(widgets[i]);
    }
    // Tag every Play Store link with attribution.
    var links = document.querySelectorAll('a[data-play]');
    for (var j = 0; j < links.length; j++) {
      var src = links[j].getAttribute('data-play') || 'cta';
      links[j].setAttribute('href', PLAY_STORE + '&utm_source=jummatime&utm_medium=' + src);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
