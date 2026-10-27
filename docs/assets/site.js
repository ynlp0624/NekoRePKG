/* NekoRePKG 官网交互：主题、截图切换、复制、滚动渐入、导航高亮 */
(function () {
  'use strict';

  var root = document.documentElement;
  var THEME_KEY = 'nekorepkg.site.theme';
  var THEME_COLORS = { moe: '#eef4ff', pro: '#12141a' };

  /* ------------------------------------------------------------- theme */
  function applyTheme(theme, save) {
    if (theme !== 'moe' && theme !== 'pro') theme = 'moe';
    root.dataset.theme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLORS[theme]);
    var btn = document.getElementById('theme-btn');
    if (btn) {
      btn.title = theme === 'moe' ? '切换到简洁主题' : '切换到萌系主题';
      btn.setAttribute('aria-label', btn.title);
    }
    if (save) {
      try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
    }
  }

  try {
    var saved = localStorage.getItem(THEME_KEY);
    var qs = new URLSearchParams(location.search);
    var fromUrl = qs.get('theme');
    if (fromUrl === 'moe' || fromUrl === 'pro') applyTheme(fromUrl, true);
    else if (saved) applyTheme(saved, false);
  } catch (e) {}

  var themeBtn = document.getElementById('theme-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      applyTheme(root.dataset.theme === 'moe' ? 'pro' : 'moe', true);
    });
  }

  /* ---------------------------------------------------- screenshot tabs */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab[data-img]'));
  var shot = document.getElementById('shot');
  var shotCap = document.getElementById('shot-cap');

  function selectTab(tab) {
    if (!shot) return;
    tabs.forEach(function (t) {
      var on = t === tab;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    });
    shot.src = tab.dataset.img;
    if (shotCap && tab.dataset.cap) shotCap.textContent = tab.dataset.cap;
    shot.alt = tab.textContent.trim() + ' 界面截图';
  }

  tabs.forEach(function (tab, index) {
    tab.tabIndex = tab.classList.contains('is-active') ? 0 : -1;
    tab.addEventListener('click', function () { selectTab(tab); });
    tab.addEventListener('keydown', function (ev) {
      var next = null;
      if (ev.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
      if (ev.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
      if (next) { ev.preventDefault(); next.focus(); selectTab(next); }
    });
  });

  /* ------------------------------------------------------------- copy */
  Array.prototype.forEach.call(document.querySelectorAll('.copy[data-copy]'), function (btn) {
    btn.addEventListener('click', function () {
      var target = document.querySelector(btn.dataset.copy);
      if (!target) return;
      var text = target.textContent.trim();
      function done() {
        var old = btn.title;
        btn.classList.add('is-done');
        btn.title = '已复制';
        setTimeout(function () { btn.classList.remove('is-done'); btn.title = old || ''; }, 1400);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else {
        fallback();
      }
      function fallback() {
        try {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          done();
        } catch (e) {}
      }
    });
  });

  /* -------------------------------------------------------- reveal */
  var revealables = Array.prototype.slice.call(document.querySelectorAll('.card, .sec-head, .shot-big, .tip, .cta'));
  revealables.forEach(function (el) { el.classList.add('reveal'); });

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    revealables.forEach(function (el) { io.observe(el); });
  } else {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* -------------------------------------------------- active nav link */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav a[href^="#"]'));
  var sections = navLinks
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);

  if ('IntersectionObserver' in window && sections.length) {
    var navIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (a) {
          a.classList.toggle('is-active', a.getAttribute('href') === '#' + entry.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    sections.forEach(function (s) { navIO.observe(s); });
  }

  /* ---------------------------------------------------------------- */
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  /* 诊断角标（?diag=1），只在排查布局时出现 */
  try {
    if (new URLSearchParams(location.search).get('diag') === '1') {
      var box = document.createElement('div');
      box.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:999;padding:6px 10px;border-radius:8px;background:#000c;color:#0f0;font:12px/1.5 monospace;white-space:pre;pointer-events:none';
      box.textContent = 'iw=' + window.innerWidth + ' ih=' + window.innerHeight +
        ' dpr=' + window.devicePixelRatio + ' sw=' + document.documentElement.scrollWidth;
      document.body.appendChild(box);
    }
  } catch (e) {}
})();
