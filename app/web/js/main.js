/* ==========================================================================
   main.js —— 外壳：导航、路由、主题、快捷键、调试浮层
   ========================================================================== */

import { api, IS_MOCK, IS_DEBUG } from './api.js';
import * as store from './store.js';
import { S, on, setTheme } from './store.js';
import { icon, el, toast, popLayer, fmtNum, baseName } from './ui.js';

import extractPage from './pages/extract.js';
import packPage from './pages/pack.js';
import inspectPage from './pages/inspect.js';
import workshopPage from './pages/workshop.js';
import galleryPage from './pages/gallery.js';
import settingsPage from './pages/settings.js';

const PAGES = [extractPage, packPage, inspectPage, workshopPage, galleryPage, settingsPage];

const view = document.getElementById('view');
let currentCleanup = null;
let bootFailed = false;

/* --------------------------------------------------------------------------
   路由
   -------------------------------------------------------------------------- */
function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const qIndex = raw.indexOf('?');
  const path = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  const qs = qIndex >= 0 ? raw.slice(qIndex + 1) : '';
  const params = {};
  new URLSearchParams(qs).forEach((v, k) => {
    params[k] = v;
  });
  return { id: (path || 'extract').trim(), params };
}

function navigate(hash) {
  const target = hash.startsWith('#') ? hash : `#${hash}`;
  if (location.hash === target) {
    renderRoute();
    return;
  }
  location.hash = target;
}

async function renderRoute() {
  if (bootFailed) return;
  const route = parseRoute();
  const page = PAGES.find((p) => p.id === route.id) || PAGES[0];

  document.querySelectorAll('.nav-item a').forEach((a) => {
    a.classList.toggle('is-active', a.dataset.id === page.id);
    if (a.dataset.id === page.id) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  if (typeof currentCleanup === 'function') {
    try {
      currentCleanup();
    } catch (e) {
      console.error('[router] cleanup failed', e);
    }
  }
  currentCleanup = null;

  view.innerHTML = '';
  view.scrollTop = 0;
  document.title = `${page.title} · NekoRePKG · 猫羽解包器`;
  store.setHint(`${page.title} · ${page.subtitle}`);

  try {
    currentCleanup = await page.mount(view, { params: route.params, navigate, page });
  } catch (e) {
    console.error('[router] mount failed', e);
    view.innerHTML = `<div class="page"><div class="card">
      <div class="card-head"><div class="card-head-l">
        <div class="card-title">${icon('alert-triangle', 18)}页面加载失败</div>
        <div class="card-desc">${escapeForText(e.message)}</div>
      </div></div>
      <button class="btn btn-ghost" type="button" onclick="location.reload()">${icon('refresh', 15)}重新加载</button>
    </div></div>`;
    toast('error', `「${page.title}」加载失败：${e.message}`);
  }
}

function escapeForText(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* --------------------------------------------------------------------------
   导航
   -------------------------------------------------------------------------- */
function buildNav() {
  const list = document.getElementById('nav-list');
  list.innerHTML = PAGES.map(
    (p) => `<li class="nav-item">
      <a href="#/${p.id}" data-id="${p.id}" title="${p.title}">
        ${icon(p.icon, 18)}
        <span>${p.label}</span>
      </a>
    </li>`
  ).join('');
}

/* --------------------------------------------------------------------------
   外壳同步
   -------------------------------------------------------------------------- */
function syncShell() {
  /* RePKG 状态胶囊 */
  const pill = document.getElementById('repkg-pill');
  const pillTxt = document.getElementById('repkg-txt');
  if (pill && pillTxt) {
    const r = S.repkg;
    let state = 'warn';
    let text = '检测 RePKG…';
    if (r) {
      if (r.ok) {
        state = 'ok';
        text = `RePKG ${r.version || ''} 就绪`.replace(/\s+/g, ' ');
      } else {
        state = 'err';
        text = '未找到 RePKG';
      }
    } else if (S.ready) {
      state = 'err';
      text = 'RePKG 未就绪';
    }
    pill.dataset.state = state;
    pillTxt.textContent = text;
    pill.title = r && r.path ? `${r.path}（点击前往设置）` : 'RePKG 内核状态（点击前往设置）';
  }

  /* 任务角标 */
  const active = S.jobs.filter((j) => j.status === 'running' || j.status === 'queued').length;
  const badge = document.getElementById('job-badge');
  const badgeCount = document.getElementById('job-badge-count');
  if (badge && badgeCount) {
    badgeCount.textContent = active > 99 ? '99+' : String(active);
    badge.dataset.zero = active === 0 ? 'true' : 'false';
    badge.dataset.active = active > 0 ? 'true' : 'false';
    badge.title = active ? `${active} 个任务正在处理（点击查看）` : '当前没有任务';
  }

  /* 状态栏 */
  const ver = document.getElementById('sb-version');
  if (ver) ver.textContent = `NekoRePKG ${(S.app && S.app.version) || '1.0.0'}`;

  const jobsEl = document.getElementById('sb-jobs');
  if (jobsEl) {
    const queued = S.jobs.filter((j) => j.status === 'queued').length;
    const running = S.jobs.filter((j) => j.status === 'running').length;
    if (!running && !queued) jobsEl.textContent = '无任务';
    else jobsEl.textContent = `${fmtNum(running)} 进行中 · ${fmtNum(queued)} 排队`;
  }

  const hintEl = document.getElementById('sb-hint');
  if (hintEl) hintEl.textContent = S.hint || '就绪';

  const connEl = document.getElementById('sb-conn');
  if (connEl) {
    connEl.dataset.state = S.conn;
    const label = connEl.querySelector('span');
    if (label) {
      label.textContent =
        S.conn === 'live' ? (IS_MOCK ? '演示通道' : '已连接') : S.conn === 'offline' ? '连接中断' : '连接中';
    }
  }

  const modeEl = document.getElementById('sb-mode');
  if (modeEl) {
    modeEl.textContent = IS_MOCK ? '演示模式' : '真实模式';
    modeEl.dataset.mock = IS_MOCK ? 'true' : 'false';
    modeEl.title = IS_MOCK ? '当前为 ?mock=1 演示模式，不会发起任何真实请求' : '通过本地服务读写真实文件';
  }
}

function syncTheme() {
  const theme = S.theme;
  document.documentElement.dataset.theme = theme;
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.innerHTML = icon(theme === 'moe' ? 'moon' : 'sun', 18);
  btn.title = theme === 'moe' ? '切换到简洁主题' : '切换到萌系主题';
  btn.setAttribute('aria-label', btn.title);
}

function wireShell() {
  const pill = document.getElementById('repkg-pill');
  if (pill) pill.addEventListener('click', () => navigate('#/settings'));

  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      setTheme(S.theme === 'moe' ? 'pro' : 'moe');
    });
  }

  const jobBtn = document.getElementById('job-badge');
  if (jobBtn) {
    if (!jobBtn.querySelector('.i')) jobBtn.insertAdjacentHTML('afterbegin', icon('activity', 18));
    jobBtn.addEventListener('click', () => navigate('#/extract'));
  }

  on('state', () => {
    syncShell();
    syncTheme();
  });
  on('jobs', syncShell);
  on('hint', syncShell);
  on('conn', syncShell);
  on('theme', syncTheme);

  window.addEventListener('hashchange', () => renderRoute());
}

/* --------------------------------------------------------------------------
   快捷键
   -------------------------------------------------------------------------- */
function wireKeys() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (popLayer()) {
        e.preventDefault();
      }
      return;
    }
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;
    if (e.key === 'o' || e.key === 'O') {
      e.preventDefault();
      navigate('#/extract');
      setTimeout(() => window.dispatchEvent(new CustomEvent('nekorepkg:pick')), 140);
    } else if (e.key === ',') {
      e.preventDefault();
      navigate('#/settings');
    }
  });
}

/* --------------------------------------------------------------------------
   Mock 调试浮层（仅 ?mock=1&debug=1）
   -------------------------------------------------------------------------- */
function mountDebugPanel() {
  if (!(IS_MOCK && IS_DEBUG)) return;
  const box = el(
    `<div class="debug-panel" data-has-err="false" aria-live="polite">
       <div class="debug-head">
         <i class="debug-dot"></i>
         <span>JS 错误监视</span>
         <span class="spacer"></span>
         <span class="dbg-count">0</span>
       </div>
       <div class="debug-body">
         <div class="ok">window.onerror / unhandledrejection 已接管 · 暂无错误</div>
       </div>
     </div>`
  );
  document.body.appendChild(box);
  const body = box.querySelector('.debug-body');
  const countEl = box.querySelector('.dbg-count');
  let count = 0;

  const add = (text) => {
    count += 1;
    box.dataset.hasErr = 'true';
    countEl.textContent = String(count);
    if (count === 1) body.innerHTML = '';
    const item = document.createElement('div');
    item.className = 'dbg-item';
    item.textContent = text;
    body.appendChild(item);
  };

  window.addEventListener('error', (e) => {
    if (e && e.message) {
      add(`${e.message} @ ${e.filename || '?'}:${e.lineno || 0}`);
      return;
    }
    const t = e && e.target;
    if (t && t.tagName) add(`资源加载失败：${t.src || t.href || t.tagName}`);
  }, true);

  window.addEventListener('unhandledrejection', (e) => {
    const r = e && e.reason;
    add(`未处理的 Promise 拒绝：${(r && (r.message || r.toString && r.toString())) || r}`);
  });

  box.title = '?mock=1&debug=1 时显示，正常模式不出现';
}

/* --------------------------------------------------------------------------
   启动
   -------------------------------------------------------------------------- */
function showBootError(err) {
  const msg = String((err && err.message) || err || '未知错误');
  bootFailed = true;
  S.conn = 'offline';
  S.hint = '本地服务连接失败';
  view.innerHTML = `<div class="page">
    <div class="card hero-card" style="padding:32px;text-align:center">
      <img src="assets/mascot.svg" alt="" style="width:132px;margin:0 auto 12px;display:block" />
      <h1 style="font-size:20px;font-weight:800;margin-bottom:6px">连不上本地服务喵…</h1>
      <p class="muted" style="max-width:52ch;margin:0 auto 16px">
        NekoRePKG 的界面已经加载，但读取运行状态失败。请确认程序没有被防火墙拦截，或者重启程序再试一次。
      </p>
      <div class="path-display" style="max-width:560px;margin:0 auto 16px;justify-content:center">
        ${escapeForText(msg)}
      </div>
      <button class="btn btn-primary" type="button" onclick="location.reload()">${icon('refresh', 16)}重新加载</button>
      <p class="text-sm muted" style="margin-top:14px">
        当前 URL：<span class="mono">${escapeForText(location.href)}</span>
      </p>
    </div>
  </div>`;
  toast('error', `初始化失败：${msg}`);
  syncShell();
}

async function boot() {
  S.theme = document.documentElement.dataset.theme === 'pro' ? 'pro' : 'moe';
  syncTheme();
  buildNav();
  wireShell();
  wireKeys();
  mountDebugPanel();
  syncShell();

  if (!location.hash) {
    try {
      history.replaceState(null, '', `${location.pathname}${location.search}#/extract`);
    } catch (e) {
      location.hash = '#/extract';
    }
  }

  try {
    await store.init();
  } catch (e) {
    console.error('[boot]', e);
    showBootError(e);
    return;
  }

  syncTheme();
  syncShell();
  await renderRoute();
}

boot();

/* 便于调试：控制台可查看当前状态（不影响功能） */
window.NekoRePKG = { store, api, navigate, version: '1.0.0' };
