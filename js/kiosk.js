/*
 * Экран расписания КИТиС для большого монитора в колледже. Первый скрипт страницы (в <head>).
 * 1. Не показывается внутри чужого сайта (iframe).
 * 2. Масштаб: на большом экране всё увеличивается пропорционально, как на макете шириной 1440 px.
 * 3. Без дела 3 минуты — экран сам возвращается к списку групп; курсор мыши прячется.
 * 4. Раз в час страница перезагружается и берёт свежее расписание, но только когда экран
 *    никто не трогает и сайт доступен: без интернета остаётся прежнее расписание, а не ошибка браузера.
 * 5. Если страница не отрисовалась, сама пробует ещё раз каждую минуту.
 */
(function () {
  'use strict';
  var d = document.documentElement;
  var loc = window.location;

  var framed = false;
  if (loc.protocol !== 'file:' && window.top !== window.self) {
    try { framed = window.top.location.origin !== loc.origin; } catch (e) { framed = true; }
  }
  if (framed) {
    d.setAttribute('data-framed', '');
    return;
  }

  var MIN = 60 * 1000;
  var IDLE_HOME = 3 * MIN;       // вернуться к списку групп
  var RELOAD_EVERY = 60 * MIN;   // перезагрузка со свежими данными
  var RELOAD_IDLE = 2 * MIN;     // ...но только если экран не трогали хотя бы 2 минуты
  var CURSOR_HIDE = 5000;

  /* ---------- масштаб под экран ---------- */
  function fit() {
    var w = window.innerWidth || 1440;
    var z = Math.max(1, Math.min(3, w / 1440));
    z = Math.round(z * 100) / 100;
    d.style.zoom = z === 1 ? '' : String(z);
    d.style.setProperty('--kz', String(z));
  }
  fit();
  window.addEventListener('resize', fit);

  /* ---------- бездействие ---------- */
  var lastInput = Date.now();
  var homed = true;        // экран уже на списке групп и с тех пор его не трогали
  var cursorTimer = 0;
  function touched() { lastInput = Date.now(); homed = false; }
  ['pointerdown', 'touchstart', 'keydown', 'wheel', 'input'].forEach(function (ev) {
    window.addEventListener(ev, touched, { capture: true, passive: true });
  });
  function hideCursorLater() {
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(function () { d.classList.add('kiosk-nocursor'); }, CURSOR_HIDE);
  }
  window.addEventListener('mousemove', function () {
    touched();
    d.classList.remove('kiosk-nocursor');
    hideCursorLater();
  }, { passive: true });
  hideCursorLater();

  // долгое нажатие на сенсорном экране не открывает меню браузера
  window.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  function goHome() {
    try { window.history.replaceState(null, '', loc.pathname + loc.search); } catch (e) { /* адрес останется */ }
    window.dispatchEvent(new Event('kiosk-reset'));
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    window.scrollTo(0, 0);
    homed = true;
  }

  /* ---------- свежие данные раз в час ---------- */
  var loadedAt = Date.now();
  var checking = false;
  function reloadIfOnline() {
    if (checking) return;
    checking = true;
    var done = function (ok) { checking = false; if (ok) loc.reload(); };
    try {
      fetch('data/kitis-data.js?check=' + Date.now(), { method: 'HEAD', cache: 'no-store' })
        .then(function (r) { done(r.ok); }, function () { done(false); });
    } catch (e) { done(false); }
  }

  setInterval(function () {
    var idle = Date.now() - lastInput;
    if (idle >= IDLE_HOME && !homed) goHome();
    if (Date.now() - loadedAt >= RELOAD_EVERY && idle >= RELOAD_IDLE) reloadIfOnline();
  }, 15000);

  /* ---------- экран не гаснет, пока открыт сайт (если браузер это умеет) ---------- */
  var lock = null;
  function keepAwake() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    navigator.wakeLock.request('screen').then(function (l) { lock = l; }, function () { /* не разрешено — ничего страшного */ });
  }
  document.addEventListener('visibilitychange', function () { if (!lock || lock.released) keepAwake(); });
  keepAwake();

  /* ---------- запасной экран ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    if (!document.querySelector('script[data-dc-script]')) return;
    setTimeout(function () {
      if (d.hasAttribute('data-dc-ready')) return;
      var host = document.getElementById('app') || document.body;
      var box = document.createElement('div');
      box.setAttribute('role', 'alert');
      box.style.cssText = 'max-width:520px;margin:15vh auto;padding:32px;border-radius:20px;background:#fff;'
        + 'box-shadow:0 1px 3px rgba(0,0,0,.08);font:18px/1.5 Onest,system-ui,sans-serif;color:#1d2433;text-align:center';
      box.textContent = 'Расписание загружается… Страница обновится сама через минуту.';
      host.appendChild(box);
      setInterval(reloadIfOnline, MIN);
    }, 5000);
  });
})();
