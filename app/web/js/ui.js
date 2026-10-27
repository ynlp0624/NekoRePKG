/* ==========================================================================
   ui.js —— 图标、格式化、toast、modal、灯箱图层栈、通用 DOM 小工具
   ========================================================================== */

/* --------------------------------------------------------------------------
   图标（内联 SVG，24×24，线性风格；禁止 emoji 当功能图标）
   -------------------------------------------------------------------------- */
const ICONS = {
  extract:
    '<path d="M3 13.5v4.5A2 2 0 0 0 5 20h14a2 2 0 0 0 2-2v-4.5"/><path d="M8 8.5 12 4.5l4 4"/><path d="M12 4.5v10.5"/>',
  pack:
    '<path d="M3 13.5v4.5A2 2 0 0 0 5 20h14a2 2 0 0 0 2-2v-4.5"/><path d="M8 12l4 4 4-4"/><path d="M12 3.5V16"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.2M12 7.9h.01"/>',
  workshop:
    '<rect x="3.2" y="3.2" width="7.4" height="7.4" rx="2.2"/><rect x="13.4" y="3.2" width="7.4" height="7.4" rx="2.2"/><rect x="3.2" y="13.4" width="7.4" height="7.4" rx="2.2"/><rect x="13.4" y="13.4" width="7.4" height="7.4" rx="2.2"/>',
  gallery:
    '<rect x="3" y="3.6" width="18" height="16.8" rx="2.6"/><circle cx="8.6" cy="9.2" r="1.7"/><path d="m20.6 15.4-4.7-4.7L4.2 21"/>',
  settings:
    '<path d="M4 7h2.6M11.6 7H20M4 17h6.4M15.4 17H20"/><circle cx="9.1" cy="7" r="2.2"/><circle cx="12.9" cy="17" r="2.2"/>',
  folder:
    '<path d="M3 8.4A2.4 2.4 0 0 1 5.4 6h3.2l2 2h8A2.4 2.4 0 0 1 21 10.4v6.2A2.4 2.4 0 0 1 18.6 19H5.4A2.4 2.4 0 0 1 3 16.6z"/>',
  file:
    '<path d="M14 3H7.6A1.6 1.6 0 0 0 6 4.6v14.8A1.6 1.6 0 0 0 7.6 21h8.8a1.6 1.6 0 0 0 1.6-1.6V7z"/><path d="M14 3v4h4"/>',
  archive:
    '<rect x="3.2" y="4" width="17.6" height="4.6" rx="1.4"/><path d="M4.6 8.6V19a1.4 1.4 0 0 0 1.4 1.4h12a1.4 1.4 0 0 0 1.4-1.4V8.6"/><path d="M10 12.6h4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20.2 20.2-3.8-3.8"/>',
  refresh:
    '<path d="M20.4 12a8.4 8.4 0 1 1-2.6-6.1"/><path d="M20.4 4.4V10H15"/>',
  play: '<path d="M8.6 5.2 19 12 8.6 18.8z" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6.4" y="6.4" width="11.2" height="11.2" rx="2.4"/>',
  trash:
    '<path d="M4 6.8h16"/><path d="M9.6 6.8V5.2A1.2 1.2 0 0 1 10.8 4h2.4a1.2 1.2 0 0 1 1.2 1.2v1.6"/><path d="M6.2 6.8l.9 12.2A1.9 1.9 0 0 0 9 21h6a1.9 1.9 0 0 0 1.9-2L17.8 6.8"/><path d="M10.2 10.8v6M13.8 10.8v6"/>',
  copy:
    '<rect x="9" y="9" width="11" height="11" rx="2.2"/><path d="M15 9V6.2A2.2 2.2 0 0 0 12.8 4H6.2A2.2 2.2 0 0 0 4 6.2v6.6A2.2 2.2 0 0 0 6.2 15H9"/>',
  external:
    '<path d="M14 4h6v6"/><path d="M20 4 11.6 12.4"/><path d="M18 14.6V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="m20 6.6-10.4 10.8L4 12"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  'chevron-down': '<path d="m6 9.4 6 6 6-6"/>',
  'chevron-left': '<path d="m15 18.4-6.4-6.4L15 5.6"/>',
  'chevron-right': '<path d="m9 5.6 6.4 6.4L9 18.4"/>',
  'arrow-left': '<path d="M19.4 12H4.6"/><path d="m10.6 6-6 6 6 6"/>',
  'alert-triangle':
    '<path d="M10.3 4.5 2.9 17.6A2 2 0 0 0 4.6 20.6h14.8a2 2 0 0 0 1.7-3L13.7 4.5a2 2 0 0 0-3.4 0z"/><path d="M12 9.4v4.2M12 17.1h.01"/>',
  'alert-circle': '<circle cx="12" cy="12" r="9"/><path d="M12 7.8v5.4M12 16.3h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.4V12l3.2 2.1"/>',
  cpu:
    '<rect x="6.6" y="6.6" width="10.8" height="10.8" rx="2.2"/><path d="M9.6 3v3.6M14.4 3v3.6M9.6 17.4V21M14.4 17.4V21M3 9.6h3.6M3 14.4h3.6M17.4 9.6H21M17.4 14.4H21"/>',
  'hard-drive':
    '<rect x="3" y="5.4" width="18" height="13.2" rx="2.2"/><path d="M3 13h18M6.6 16.2h.01M10 16.2h.01"/>',
  sun:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/>',
  moon: '<path d="M20.2 14.4A8.6 8.6 0 0 1 9.6 3.8a8.6 8.6 0 1 0 10.6 10.6z"/>',
  'zoom-in':
    '<circle cx="11" cy="11" r="7"/><path d="m20.2 20.2-3.8-3.8M8 11h6M11 8v6"/>',
  'zoom-out': '<circle cx="11" cy="11" r="7"/><path d="m20.2 20.2-3.8-3.8M8 11h6"/>',
  download:
    '<path d="M12 3.4v11.2"/><path d="m7.4 10.2 4.6 4.6 4.6-4.6"/><path d="M4.4 20.6h15.2"/>',
  terminal:
    '<rect x="3" y="4.4" width="18" height="15.2" rx="2.4"/><path d="m7.4 9.8 2.6 2.6-2.6 2.6M13 15h4"/>',
  pause: '<path d="M9 4.8v14.4M15 4.8v14.4"/>',
  activity: '<path d="M2.8 12h4.1l2.5-6.2 4.2 12.4 2.5-6.2h5.1"/>',
  eye:
    '<path d="M2.4 12S6 6.2 12 6.2 21.6 12 21.6 12 18 17.8 12 17.8 2.4 12 2.4 12z"/><circle cx="12" cy="12" r="2.7"/>',
  shield:
    '<path d="M12 3.2 19.4 6v6c0 4.2-3.1 7.4-7.4 9.2-4.3-1.8-7.4-5-7.4-9.2V6z"/><path d="m9 11.8 2.1 2.1 4-4"/>',
  sparkle:
    '<path d="M12 3.2 13.7 9l5.8 1.7-5.8 1.7L12 18.2l-1.7-5.8L4.5 10.7 10.3 9z"/><path d="M18.6 16.2 19 18l1.8.4-1.8.4-.4 1.8-.4-1.8L16.4 18l1.8-.4z"/>',
  list:
    '<path d="M8.6 6.4h11.8M8.6 12h11.8M8.6 17.6h11.8"/><path d="M4 6.4h.01M4 12h.01M4 17.6h.01"/>',
  filter: '<path d="M3.6 5.4h16.8l-6.5 7.6v6.6l-3.8 1.4v-8z"/>',
  sort: '<path d="M7 4.4v15.2M7 19.6l-3-3M7 19.6l3-3"/><path d="M17 19.6V4.4M17 4.4l-3 3M17 4.4l3 3"/>',
  save:
    '<path d="M4.6 4.4h10.6l4.2 4.2V19a1.6 1.6 0 0 1-1.6 1.6H6.2A1.6 1.6 0 0 1 4.6 19z"/><path d="M8 4.4v4.2h6V4.4M8 20.6v-6.2h8v6.2"/>',
  star: '<path d="m12 3.6 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 10.1l6.1-.9z"/>',
  music:
    '<circle cx="7" cy="17.6" r="2.6"/><circle cx="18" cy="15.6" r="2.6"/><path d="M9.6 17.6V6.6l11-2v11"/>',
  link:
    '<path d="M10.2 13.8a4.1 4.1 0 0 0 5.8 0l3-3a4.1 4.1 0 0 0-5.8-5.8l-1.6 1.6"/><path d="M13.8 10.2a4.1 4.1 0 0 0-5.8 0l-3 3a4.1 4.1 0 0 0 5.8 5.8l1.6-1.6"/>',
  image:
    '<rect x="3" y="3.6" width="18" height="16.8" rx="2.6"/><circle cx="8.6" cy="9.2" r="1.7"/><path d="m20.6 15.4-4.7-4.7L4.2 21"/>',
  'image-off':
    '<path d="m3 3 18 18"/><path d="M20.6 15.6V6.2A2.6 2.6 0 0 0 18 3.6H8.4M3.4 7.2v11.2A2.6 2.6 0 0 0 6 21h11"/><path d="m4 16.6 4.4-4.4 3 3"/>',
  'folder-search':
    '<path d="M3 8.4A2.4 2.4 0 0 1 5.4 6h3.2l2 2h8A2.4 2.4 0 0 1 21 10.4v2.2"/><path d="M21 16.6a4.2 4.2 0 1 1-1.3-3"/><path d="m20.6 20.6-2.2-2.2"/><path d="M3 8.4v8.2A2.4 2.4 0 0 0 5.4 19h5.6"/>',
  dots:
    '<circle cx="5.6" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18.4" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  grid:
    '<rect x="3.4" y="3.4" width="7" height="7" rx="1.8"/><rect x="13.6" y="3.4" width="7" height="7" rx="1.8"/><rect x="3.4" y="13.6" width="7" height="7" rx="1.8"/><rect x="13.6" y="13.6" width="7" height="7" rx="1.8"/>',
  paw:
    '<ellipse cx="6.6" cy="9.4" rx="2.1" ry="2.9" transform="rotate(-16 6.6 9.4)"/><ellipse cx="11" cy="6.4" rx="2.1" ry="2.9"/><ellipse cx="16" cy="6.7" rx="2.1" ry="2.9" transform="rotate(10 16 6.7)"/><ellipse cx="19.6" cy="10.4" rx="2.1" ry="2.9" transform="rotate(20 19.6 10.4)"/><path d="M13 12.4c3.6 0 6.6 2.4 6.6 5.1 0 2.5-2 3.9-4.4 3.9-1.2 0-1.6-.5-2.2-.5s-1 .5-2.2.5c-2.4 0-4.4-1.4-4.4-3.9 0-2.7 3-5.1 6.6-5.1z"/>',
};

export function icon(name, size = 18, cls = '') {
  const inner = ICONS[name];
  if (!inner) return '';
  return (
    `<svg class="i ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`
  );
}

/* --------------------------------------------------------------------------
   格式化
   -------------------------------------------------------------------------- */
export function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function fmtBytes(n, digits = 1) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  if (v < 0) return '—';
  if (v < 1024) return `${Math.round(v)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let x = v / 1024;
  let i = 0;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i += 1;
  }
  return `${x.toFixed(digits)} ${units[i]}`;
}

export function fmtNum(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('zh-CN');
}

const pad2 = (n) => String(n).padStart(2, '0');

/** ISO8601 → 2026-10-27 19:40（本地时区） */
export function fmtTime(iso) {
  if (!iso) return '—';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 列表用的紧凑时间：今天 → 19:40；今年 → 10-27 19:40；其它 → 全文 */
export function fmtTimeShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (d.getFullYear() === now.getFullYear()) return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return fmtTime(d);
}

export function fmtElapsed(sec) {
  if (sec == null || Number.isNaN(Number(sec))) return '—';
  const s = Number(sec);
  if (s < 60) return `${s.toFixed(1)} 秒`;
  const m = Math.floor(s / 60);
  const rest = Math.round(s % 60);
  return `${m} 分 ${pad2(rest)} 秒`;
}

export function fmtPercent(done, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, (done / total) * 100));
}

/** 路径中间省略：保留盘符/开头与文件名尾部 */
export function midEllipsis(text, max = 62) {
  const s = String(text == null ? '' : text);
  if (s.length <= max) return s;
  const keepTail = Math.ceil(max * 0.58);
  const keepHead = max - keepTail - 1;
  return `${s.slice(0, keepHead)}…${s.slice(-keepTail)}`;
}

export function baseName(p) {
  if (!p) return '';
  const parts = String(p).split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

export function dirName(p) {
  if (!p) return '';
  const s = String(p).replace(/[\\/]+$/, '');
  const i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/'));
  return i > 0 ? s.slice(0, i) : s;
}

export const STATUS = {
  queued: { label: '排队中', cls: 'badge-queued' },
  running: { label: '进行中', cls: 'badge-running' },
  done: { label: '完成', cls: 'badge-done' },
  error: { label: '失败', cls: 'badge-error' },
  cancelled: { label: '已取消', cls: 'badge-cancelled' },
};

export function statusBadge(status) {
  const s = STATUS[status] || { label: status || '未知', cls: 'badge-queued' };
  return `<span class="badge ${s.cls}"><span class="dot"></span>${esc(s.label)}</span>`;
}

export const TYPE_LABEL = { scene: '场景', video: '视频', web: '网页' };

export function typeBadge(type) {
  const t = String(type || '').toLowerCase();
  if (!t) return '<span class="badge">未知</span>';
  const cls = t === 'video' ? 'badge-video' : t === 'web' ? 'badge-web' : 'badge-scene';
  return `<span class="badge ${cls}">${esc(TYPE_LABEL[t] || t)}</span>`;
}

/* --------------------------------------------------------------------------
   DOM 小工具
   -------------------------------------------------------------------------- */
export function $(sel, root = document) {
  return root.querySelector(sel);
}

export function $$(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

export function el(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html).trim();
  return tpl.content.firstElementChild;
}

/** 事件委托：handler(event, matchedEl) */
export function on(root, selector, type, handler) {
  const fn = (e) => {
    const target = e.target instanceof Element ? e.target.closest(selector) : null;
    if (target && root.contains(target)) handler(e, target);
  };
  root.addEventListener(type, fn);
  return () => root.removeEventListener(type, fn);
}

export function debounce(fn, ms = 200) {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export async function copyText(text) {
  const s = String(text == null ? '' : text);
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(s);
      return true;
    }
  } catch (e) {
    /* 走回退方案 */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = s;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) {
    return false;
  }
}

/* --------------------------------------------------------------------------
   浮层图层栈（Esc 只关最上层）
   -------------------------------------------------------------------------- */
const layers = [];

/** 注册一个可被 Esc 关闭的图层，返回注销函数 */
export function pushLayer(closeFn) {
  const wrapped = () => closeFn();
  layers.push(wrapped);
  return () => {
    const i = layers.indexOf(wrapped);
    if (i >= 0) layers.splice(i, 1);
  };
}

export function popLayer() {
  const fn = layers[layers.length - 1];
  if (!fn) return false;
  fn();
  return true;
}

export function layerCount() {
  return layers.length;
}

/* --------------------------------------------------------------------------
   Toast
   -------------------------------------------------------------------------- */
const LEVEL_ICON = { ok: 'check', info: 'info', warn: 'alert-triangle', error: 'alert-circle' };
let toastSeq = 0;
const recentToasts = new Map();

function isDuplicateToast(text) {
  const now = Date.now();
  for (const [key, when] of recentToasts) {
    if (now - when > 2600) recentToasts.delete(key);
  }
  const key = String(text || '').trim();
  if (recentToasts.has(key) && now - recentToasts.get(key) < 2600) return true;
  recentToasts.set(key, now);
  return false;
}

export function toast(level, text, opts = {}) {
  const host = document.getElementById('toast-host');
  if (!host) return () => {};
  /* 同一句话短时间重复（后端 SSE 与前端本地提示撞车）只显示一次 */
  if (isDuplicateToast(text) && !opts.force) return () => {};
  const lv = LEVEL_ICON[level] ? level : 'info';
  const id = `t${++toastSeq}`;
  const actions = Array.isArray(opts.actions) ? opts.actions : [];
  const actionsHtml = actions.length
    ? `<div class="toast-actions">${actions
        .map(
          (a, i) =>
            `<button class="btn btn-xs ${a.danger ? 'btn-danger' : i === 0 ? 'btn-soft' : 'btn-ghost'}" data-ta="${i}">${esc(a.label)}</button>`
        )
        .join('')}</div>`
    : '';
  const node = el(
    `<div class="toast" id="${id}" data-level="${lv}" role="alert">
       <span class="toast-ico">${icon(LEVEL_ICON[lv], 17)}</span>
       <div class="toast-body">
         <div class="toast-txt">${esc(text)}</div>
         ${actionsHtml}
       </div>
       <button class="toast-x" type="button" aria-label="关闭提示">${icon('x', 13)}</button>
     </div>`
  );
  host.appendChild(node);

  while (host.children.length > 4) host.firstElementChild.remove();

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    node.classList.add('is-out');
    setTimeout(() => node.remove(), 200);
  };
  const timer = setTimeout(close, opts.duration || (lv === 'error' ? 7000 : 4200));

  node.querySelector('.toast-x').addEventListener('click', close);
  node.querySelectorAll('[data-ta]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const a = actions[Number(btn.dataset.ta)];
      close();
      if (a && typeof a.onClick === 'function') a.onClick();
    });
  });
  return close;
}

/* --------------------------------------------------------------------------
   Modal
   -------------------------------------------------------------------------- */
export function openModal(opts = {}) {
  const host = document.getElementById('overlay-host');
  const dismissible = opts.dismissible !== false;
  const actions = Array.isArray(opts.actions) ? opts.actions : [];
  const overlay = el(
    `<div class="overlay" role="presentation">
       <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(opts.title || '对话框')}" style="--modal-w:${esc(opts.width || '480px')}">
         <div class="modal-head">
           <div class="modal-head-txt">
             <div class="modal-title">${esc(opts.title || '')}</div>
             ${opts.sub ? `<div class="modal-sub">${esc(opts.sub)}</div>` : ''}
           </div>
           ${dismissible ? `<button class="modal-x" type="button" aria-label="关闭">${icon('x', 15)}</button>` : ''}
         </div>
         <div class="modal-body">${opts.body || ''}</div>
         ${actions.length ? `<div class="modal-foot">${actions
           .map(
             (a, i) =>
               `<button class="btn ${a.primary ? 'btn-primary' : a.danger ? 'btn-danger' : 'btn-ghost'}" data-mact="${i}"${a.id ? ` id="${esc(a.id)}"` : ''}>${
                 a.icon ? icon(a.icon, 15) : ''
               }${esc(a.label)}</button>`
           )
           .join('')}</div>` : ''}
       </div>
     </div>`
  );
  host.appendChild(overlay);

  let closed = false;
  let unregister = () => {};
  const close = (result) => {
    if (closed) return;
    closed = true;
    unregister();
    overlay.remove();
    if (typeof opts.onClose === 'function') opts.onClose(result);
  };
  unregister = pushLayer(() => close(undefined));

  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay && dismissible) close(undefined);
  });
  const xBtn = overlay.querySelector('.modal-x');
  if (xBtn) xBtn.addEventListener('click', () => close(undefined));

  overlay.querySelectorAll('[data-mact]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const a = actions[Number(btn.dataset.mact)];
      if (!a) return;
      if (a.onClick) {
        const r = a.onClick({ close, modal: overlay, button: btn });
        if (r === false) return;
      }
      if (a.keepOpen !== true) close(a.value);
    });
  });

  if (typeof opts.onMount === 'function') opts.onMount(overlay, close);

  const focusTarget =
    overlay.querySelector('[data-autofocus]') ||
    overlay.querySelector('.modal-foot .btn-primary') ||
    overlay.querySelector('.modal-foot .btn') ||
    overlay.querySelector('input, select, textarea') ||
    overlay.querySelector('.modal-x');
  if (focusTarget) setTimeout(() => focusTarget.focus(), 30);

  return { overlay, close, root: overlay.querySelector('.modal') };
}

/** 确认对话框 → Promise<boolean> */
export function confirmDialog(opts = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    openModal({
      title: opts.title || '确认操作',
      body: `<div>${opts.text || ''}</div>`,
      width: opts.width || '440px',
      actions: [
        { label: opts.cancelText || '取消', value: false },
        {
          label: opts.okText || '确定',
          primary: !opts.danger,
          danger: !!opts.danger,
          onClick: () => {
            finish(true);
          },
        },
      ],
      onClose: (v) => finish(v === true),
      onMount: (overlay, close) => {
        if (!opts.danger) return;
        const okBtn = overlay.querySelector('.modal-foot .btn');
        if (okBtn) okBtn.focus();
      },
    });
  });
}

/* --------------------------------------------------------------------------
   常用片段
   -------------------------------------------------------------------------- */
export function skeletonCards(n = 4, opts = {}) {
  const cover =
    opts.cover === false
      ? ''
      : `<div class="skel skel-cover"${opts.ratio ? ` style="aspect-ratio:${opts.ratio}"` : ''}></div>`;
  let out = '';
  for (let i = 0; i < n; i += 1) {
    out += `<div class="skel-card">${cover}<div class="skel-body">
      <div class="skel skel-line" style="width:${62 + ((i * 7) % 28)}%"></div>
      <div class="skel skel-line" style="width:${34 + ((i * 11) % 24)}%;height:9px"></div>
    </div></div>`;
  }
  return out;
}

export function skeletonGrid(n = 8, opts = {}) {
  return `<div class="ws-grid">${skeletonCards(n, opts)}</div>`;
}

export function skeletonRows(n = 6) {
  let out = '';
  for (let i = 0; i < n; i += 1) {
    out += `<div class="row" style="gap:12px;padding:9px 0">
      <div class="skel" style="width:28px;height:28px;border-radius:8px;flex:none"></div>
      <div class="skel skel-line" style="flex:1;max-width:${40 + ((i * 9) % 40)}%"></div>
      <div class="skel skel-line" style="width:56px;margin-left:auto"></div>
    </div>`;
  }
  return out;
}

/**
 * 空态
 * @param {{title:string,text?:string,actions?:Array<{label:string,id?:string,primary?:boolean,icon?:string}>,
 *          size?:'sm'|'md', inline?:boolean, art?:string}} o
 */
export function emptyState(o = {}) {
  const small = o.size === 'sm' || o.inline;
  const cls = ['empty', o.inline ? 'empty-inline' : ''].filter(Boolean).join(' ');
  const actions = (o.actions || [])
    .map(
      (a) =>
        `<button class="btn ${small ? 'btn-sm' : ''} ${a.primary ? 'btn-primary' : 'btn-ghost'}" data-act="${esc(a.id || a.label)}" data-eact="${esc(a.id || a.label)}" type="button">${
          a.icon ? icon(a.icon, small ? 14 : 16) : ''
        }${esc(a.label)}</button>`
    )
    .join('');
  return `<div class="${cls}">
    <img class="empty-art ${small ? 'is-sm' : ''}" src="${o.art || 'assets/mascot.svg'}" alt="" draggable="false" />
    <h3>${esc(o.title || '这里空空的喵~')}</h3>
    ${o.text ? `<p>${o.text}</p>` : ''}
    ${actions ? `<div class="row">${actions}</div>` : ''}
  </div>`;
}

/** 按钮 loading */
export function setLoading(btn, on) {
  if (!btn) return;
  btn.classList.toggle('is-loading', !!on);
  btn.toggleAttribute('aria-busy', !!on);
  if (on) btn.setAttribute('aria-busy', 'true');
  else btn.removeAttribute('aria-busy');
}

/** 让数字/尺寸字段可读 */
export function plural(n, unit = '项') {
  return `${fmtNum(n)} ${unit}`;
}
