/* SCORM 1.2 bridge for the Learning Agility course library.
 * Loaded after data.js and before app.js. It:
 *  - restores "saved" and "reviewed" marks from cmi.suspend_data into localStorage
 *    so app.js picks them up unchanged;
 *  - mirrors every change app.js writes back into the LMS;
 *  - reports progress: incomplete until every main Part video (1080p, one per unique
 *    video) is marked reviewed, then completed with score 100.
 * Without an LMS (opened as a plain web page) it does nothing.
 */
(function () {
  'use strict';
  var KEY_SAVED = 'agility-saved', KEY_REVIEWED = 'agility-reviewed';
  var assets = window.ASSETS || [];
  var primary = assets.filter(function (a) { return a.type === 'video' && a.height === 1080; })
    .filter(function (a, i, arr) { return arr.findIndex(function (b) { return b.hash === a.hash; }) === i; })
    .map(function (a) { return a.hash; });

  function findAPI(win) {
    for (var i = 0; win && i < 10; i++) {
      if (win.API) return win.API;
      if (win.parent && win.parent !== win) win = win.parent; else break;
    }
    return null;
  }
  var api = findAPI(window) || (window.opener ? findAPI(window.opener) : null);
  if (!api) return;

  var started = Date.now(), finished = false, completed = false;
  api.LMSInitialize('');

  function get(k) { try { return String(api.LMSGetValue(k) || ''); } catch (e) { return ''; } }
  function set(k, v) { try { api.LMSSetValue(k, String(v)); } catch (e) {} }
  function readLocal(k) { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } }

  var status = get('cmi.core.lesson_status');
  completed = status === 'completed' || status === 'passed';
  if (status === '' || status === 'not attempted') set('cmi.core.lesson_status', 'incomplete');
  set('cmi.core.score.min', 0);
  set('cmi.core.score.max', 100);

  // Restore state from the LMS. Compact format: {s:[asset numbers], r:[indexes into primary]}
  // plus x:[other reviewed hashes] for non-primary items, keeping within the 4096-char limit.
  var raw = get('cmi.suspend_data');
  if (raw) {
    try {
      var d = JSON.parse(raw);
      var savedIds = (d.s || []).map(function (n) { return 'asset-' + String(n).padStart(3, '0'); });
      var reviewed = (d.r || []).map(function (i) { return primary[i]; }).filter(Boolean).concat(d.x || []);
      var store = Storage.prototype.setItem;
      store.call(localStorage, KEY_SAVED, JSON.stringify(savedIds));
      store.call(localStorage, KEY_REVIEWED, JSON.stringify(reviewed));
    } catch (e) {}
  } else {
    // Fresh LMS attempt: don't inherit marks left in this browser by another learner or attempt.
    try { localStorage.removeItem(KEY_SAVED); localStorage.removeItem(KEY_REVIEWED); } catch (e) {}
  }

  function sync() {
    var savedIds = readLocal(KEY_SAVED), reviewed = readLocal(KEY_REVIEWED);
    var r = [], x = [];
    reviewed.forEach(function (h) { var i = primary.indexOf(h); if (i >= 0) r.push(i); else x.push(h); });
    var s = savedIds.map(function (id) { return parseInt(String(id).replace('asset-', ''), 10); })
      .filter(function (n) { return !isNaN(n); });
    var data = JSON.stringify({ s: s, r: r, x: x });
    if (data.length > 4096) data = JSON.stringify({ s: s, r: r });
    set('cmi.suspend_data', data);

    var pct = primary.length ? Math.round(100 * r.length / primary.length) : 100;
    if (!completed) {
      set('cmi.core.score.raw', pct);
      if (pct >= 100) { completed = true; set('cmi.core.lesson_status', 'completed'); }
    }
    try { api.LMSCommit(''); } catch (e) {}
  }

  var origSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    origSet.call(this, k, v);
    if (this === localStorage && (k === KEY_SAVED || k === KEY_REVIEWED)) sync();
  };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function finish() {
    if (finished) return;
    finished = true;
    var t = Math.round((Date.now() - started) / 1000);
    set('cmi.core.session_time', pad(Math.floor(t / 3600)) + ':' + pad(Math.floor(t / 60) % 60) + ':' + pad(t % 60));
    set('cmi.core.exit', completed ? '' : 'suspend');
    try { api.LMSCommit(''); api.LMSFinish(''); } catch (e) {}
  }
  window.addEventListener('pagehide', finish);
  window.addEventListener('beforeunload', finish);
  window.SCORM_PRIMARY_COUNT = primary.length;
})();
