/* ==========================================================================
   pages/workshop.js —— 创意工坊
   ========================================================================== */

import { api } from '../api.js';
import { S, on } from '../store.js';
import {
  $,
  on as delegate,
  icon,
  toast,
  fmtBytes,
  fmtNum,
  fmtTimeShort,
  typeBadge,
  TYPE_LABEL,
  emptyState,
  skeletonGrid,
  midEllipsis,
  baseName,
  openModal,
  setLoading,
  esc,
} from '../ui.js';

const st = {
  data: null,
  loading: true,
  error: '',
  q: '',
  type: '',
  sort: 'name',
  dirFilter: '',
  selected: new Set(),
  root: null,
};

const unsubs = [];

/** 注册事件并在卸载时移除（#view / #overlay-host 跨页面复用） */
function listen(target, type, fn, opts) {
  target.addEventListener(type, fn, opts);
  unsubs.push(() => target.removeEventListener(type, fn, opts));
}

function shell() {
  return `<div class="page">
    <div class="page-head">
      <div>
        <h1>创意工坊</h1>
        <p class="page-sub">扫描 Steam 工坊目录，勾选后可以一次全部解包。</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost btn-sm" data-act="add-dir" type="button">${icon('folder-search', 15)}手动选择目录</button>
        <button class="btn btn-primary btn-sm" data-act="refresh" type="button">${icon('refresh', 15)}重新扫描</button>
      </div>
    </div>

    <section class="card card-pad-sm">
      <div class="toolbar">
        <div class="input-group" style="flex:1;min-width:200px">
          ${icon('search', 15)}
          <input class="input" id="ws-q" type="search" placeholder="搜索作品名、标签或 ID…" spellcheck="false" />
        </div>
        <div class="segmented" id="ws-type">
          <button type="button" data-type="" class="is-active">全部</button>
          <button type="button" data-type="scene">场景</button>
          <button type="button" data-type="video">视频</button>
          <button type="button" data-type="web">网页</button>
        </div>
        <div class="select-wrap" style="width:132px">
          <select class="select" id="ws-sort" aria-label="排序方式">
            <option value="name">按名称</option>
            <option value="size">按大小</option>
            <option value="mtime">按修改时间</option>
          </select>
        </div>
      </div>
      <div class="row row-wrap" style="margin-top:10px;gap:10px">
        <span class="text-xs muted ellipsis" id="ws-steam">正在查找 Steam…</span>
        <span id="ws-dirs" class="row" style="gap:6px"></span>
        <span class="spacer"></span>
        <span class="text-xs muted" id="ws-scan"></span>
        <span class="row" style="gap:6px;flex:none">
          <button class="btn btn-xs btn-ghost" data-act="select-all" type="button">${icon('check', 12)}全选筛选结果</button>
          <button class="btn btn-xs btn-ghost" data-act="clear-sel" type="button">${icon('x', 12)}清空选择</button>
        </span>
      </div>
    </section>

    <div id="ws-body"></div>
  </div>`;
}

function filtered() {
  const d = st.data;
  if (!d || !Array.isArray(d.items)) return [];
  const q = st.q.trim().toLowerCase();
  let list = d.items.slice();
  if (st.dirFilter) list = list.filter((x) => String(x.dir || '').toLowerCase().startsWith(st.dirFilter.toLowerCase()));
  if (st.type) list = list.filter((x) => String(x.type).toLowerCase() === st.type);
  if (q) {
    list = list.filter((x) => {
      const hay = `${x.title || ''} ${x.id || ''} ${(x.tags || []).join(' ')} ${x.description || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }
  if (st.sort === 'size') list.sort((a, b) => (b.size || 0) - (a.size || 0));
  else if (st.sort === 'mtime') list.sort((a, b) => new Date(b.mtime || 0) - new Date(a.mtime || 0));
  else list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN'));
  return list;
}

function cardHtml(item) {
  const sel = st.selected.has(item.id);
  return `<article class="ws-card ${sel ? 'is-selected' : ''}" data-id="${esc(item.id)}" tabindex="0" role="button"
      aria-pressed="${sel}" aria-label="${esc(item.title)}">
    <div class="ws-cover">
      ${
        item.preview_url
          ? `<img src="${esc(item.preview_url)}" alt="" loading="lazy" />`
          : `<div class="ws-cover-empty">${icon('image-off', 26)}</div>`
      }
      <button class="ws-check" type="button" data-check="${esc(item.id)}" aria-label="选择 ${esc(item.title)}">${icon('check', 14)}</button>
      <span class="ws-type">${typeBadge(item.type)}</span>
    </div>
    <div class="ws-body">
      <div class="ws-title" title="${esc(item.title)}">${esc(item.title)}</div>
      <div class="ws-meta">
        <span>${fmtBytes(item.size)}</span>
        <span class="dot">·</span>
        <span class="ws-time" title="${esc(item.mtime || '')}">${esc(fmtTimeShort(item.mtime))}</span>
        ${item.pkg_count > 1 ? `<span class="dot">·</span><span>${fmtNum(item.pkg_count)} 个包</span>` : ''}
      </div>
    </div>
  </article>`;
}

function render() {
  const body = $('#ws-body', st.root);
  if (!body) return;
  const d = st.data;

  if (st.loading && (!d || !d.items || !d.items.length)) {
    body.innerHTML = skeletonGrid(8, { ratio: '16 / 9' });
    const scan = $('#ws-scan', st.root);
    if (scan) scan.textContent = '正在扫描…';
    return;
  }
  if (st.error && (!d || !d.items || !d.items.length)) {
    body.innerHTML = `<section class="card">
      <div class="notice is-err">${icon('alert-circle', 17)}<div>${esc(st.error)}</div></div>
      <div class="row" style="margin-top:var(--s4)">
        <button class="btn btn-primary btn-sm" data-act="refresh" type="button">${icon('refresh', 14)}重新扫描</button>
        <button class="btn btn-ghost btn-sm" data-act="add-dir" type="button">${icon('folder-search', 14)}手动选择目录</button>
      </div>
    </section>`;
    return;
  }

  const dirs = (d && d.dirs) || [];
  if (!dirs.length) {
    body.innerHTML = `<section class="card">
      ${emptyState({
        title: '没找到 Steam 创意工坊喵…',
        text: '可以手动指定 Wallpaper Engine 的 workshop 目录，通常是 <span class="mono">steamapps\\workshop\\content\\431960</span>。',
        actions: [{ label: '手动选择目录', id: 'add-dir', primary: true, icon: 'folder' }],
      })}
    </section>`;
    return;
  }

  const list = filtered();
  if (!list.length) {
    body.innerHTML = `<section class="card">
      ${emptyState({
        title: st.q || st.type ? '没有符合条件的作品' : '工坊里还没有作品喵~',
        text: st.q || st.type ? '换个关键词或筛选条件试试。' : '订阅一些壁纸后点「重新扫描」。',
        actions: [{ label: '重新扫描', id: 'refresh', icon: 'refresh' }],
      })}
    </section>`;
    return;
  }

  body.innerHTML = `<div class="ws-grid">${list.map(cardHtml).join('')}</div>`;
  renderFloatBar();
}

function renderFloatBar() {
  const host = document.getElementById('overlay-host');
  let bar = document.getElementById('ws-float');
  const count = st.selected.size;
  document.body.classList.toggle('has-floatbar', count > 0);
  if (!count) {
    if (bar) bar.remove();
    return;
  }
  const items = ((st.data && st.data.items) || []).filter((x) => st.selected.has(x.id));
  const total = items.reduce((s, x) => s + (x.size || 0), 0);

  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'floatbar';
    bar.id = 'ws-float';
    host.appendChild(bar);
  }
  bar.innerHTML = `
    <span class="floatbar-count">已选 <span class="num">${fmtNum(count)}</span> 个</span>
    <span class="floatbar-sum">合计 ${fmtBytes(total)}</span>
    <button class="btn btn-primary btn-sm" data-act="batch-extract" type="button">${icon('extract', 14)}批量解包</button>
    <button class="btn btn-ghost btn-sm" data-act="clear-sel" type="button">取消选择</button>`;
}

function syncSteamLine() {
  const el = $('#ws-steam', st.root);
  if (!el) return;
  const d = st.data;
  if (!d) {
    el.textContent = '正在查找 Steam…';
    return;
  }
  const dirs = d.dirs || [];
  const root = d.steam_root || '未检测到 Steam';
  const extra = dirs.length > 1 ? `· ${fmtNum(dirs.length)} 个工坊目录` : '';
  el.innerHTML = `${icon('folder', 11)} <span class="ellipsis">Steam：${esc(root)} ${esc(extra)}</span>`;
  el.title = dirs.join('\n') || root;

  /* 多个 workshop 目录时给一个下拉筛选 */
  const dirBox = $('#ws-dirs', st.root);
  if (dirBox) {
    if (dirs.length > 1) {
      if (!dirBox.querySelector('select')) {
        dirBox.innerHTML = `<span class="select-wrap" style="width:196px">
          <select class="select" id="ws-dir-sel" style="height:26px;font-size:var(--fs-xs)" aria-label="选择工坊目录">
            <option value="">全部目录</option>
            ${dirs
              .map((x, i) => {
                const label = `${String(x).slice(0, 2)}…\\${baseName(x)}`;
                return `<option value="${esc(x)}" ${st.dirFilter === x ? 'selected' : ''}>目录 ${i + 1} · ${esc(label)}</option>`;
              })
              .join('')}
          </select>
        </span>`;
      }
    } else if (dirBox.innerHTML) {
      dirBox.innerHTML = '';
      st.dirFilter = '';
    }
  }

  const scan = $('#ws-scan', st.root);
  if (scan) {
    if (d.scanning) {
      scan.innerHTML = `<span class="spinner" style="width:10px;height:10px;border-width:1.5px;vertical-align:-1px"></span> 扫描中…`;
    } else {
      scan.textContent = d.updated_at ? `上次扫描 ${fmtTimeShort(d.updated_at)}` : '';
    }
  }
}

function selectedPkgs() {
  const items = ((st.data && st.data.items) || []).filter((x) => st.selected.has(x.id));
  return items.map((x) => x.pkg).filter(Boolean);
}

/** 只同步卡片的勾选态，避免整块网格重绘导致缩略图重新加载 */
function syncSelection() {
  if (!st.root) return;
  st.root.querySelectorAll('.ws-card').forEach((card) => {
    const sel = st.selected.has(card.dataset.id);
    card.classList.toggle('is-selected', sel);
    card.setAttribute('aria-pressed', sel ? 'true' : 'false');
  });
  renderFloatBar();
}

function openDetail(item) {
  if (!item) return;
  const tags = (item.tags || []).map((t) => `<span class="chip">${esc(t)}</span>`).join('');
  openModal({
    title: item.title || '作品信息',
    sub: `Workshop ID：${item.id}`,
    width: '620px',
    body: `<div class="row" style="gap:14px;align-items:flex-start">
      ${
        item.preview_url
          ? `<img src="${esc(item.preview_url)}" alt="" style="width:200px;border-radius:10px;border:1px solid var(--border);flex:none" />`
          : ''
      }
      <div style="min-width:0;display:flex;flex-direction:column;gap:8px">
        <div class="row">${typeBadge(item.type)}<span class="badge">${fmtBytes(item.size)}</span>
          <span class="badge">${fmtNum(item.pkg_count)} 个包</span></div>
        <div class="text-sm dim">${esc(item.description || '这个作品没有写描述。')}</div>
        ${tags ? `<div class="hero-tags">${tags}</div>` : ''}
        <div class="text-xs muted">修改时间：${esc(fmtTimeShort(item.mtime))}</div>
      </div>
    </div>
    <div class="path-display" style="margin-top:var(--s3)" title="${esc(item.pkg || '')}">
      ${icon('file', 13)}<span class="ellipsis" style="flex:1">${esc(midEllipsis(item.pkg || '', 66))}</span>
    </div>`,
    actions: [
      {
        label: '解包这个',
        icon: 'extract',
        onClick: () => {
          if (item.pkg) location.hash = `#/extract?path=${encodeURIComponent(item.pkg)}`;
        },
      },
      {
        label: '查看包信息',
        primary: true,
        icon: 'info',
        onClick: () => {
          if (item.pkg) location.hash = `#/inspect?path=${encodeURIComponent(item.pkg)}`;
        },
      },
    ],
  });
}

/* --------------------------------------------------------------------------
   数据
   -------------------------------------------------------------------------- */
async function load() {
  st.loading = true;
  st.error = '';
  render();
  syncSteamLine();
  try {
    const data = await api.workshop();
    st.data = data;
    st.error = data && data.error ? data.error : '';
    st.loading = !!(data && data.scanning);
  } catch (e) {
    st.error = e.message || '扫描失败';
    st.loading = false;
  }
  render();
  syncSteamLine();
}

async function refresh() {
  const btn = st.root && st.root.querySelector('[data-act="refresh"]');
  setLoading(btn, true);
  try {
    await api.refreshWorkshop();
    st.loading = true;
    if (st.data) st.data = { ...st.data, scanning: true };
    render();
    syncSteamLine();
  } catch (e) {
    toast('error', `重新扫描失败：${e.message}`);
  } finally {
    setTimeout(() => setLoading(btn, false), 600);
  }
}

async function addDir() {
  try {
    const res = await api.pick('folder', { title: '选择 workshop\\content\\431960 目录' });
    if (res && res.path) {
      await api.addWorkshopDir(res.path);
      toast('ok', '已添加工坊目录，正在扫描');
      st.loading = true;
      await load();
    }
  } catch (e) {
    toast('error', `添加目录失败：${e.message}`);
  }
}

export default {
  id: 'workshop',
  label: '创意工坊',
  icon: 'workshop',
  title: '创意工坊',
  subtitle: '浏览 Steam 订阅作品',

  async mount(root) {
    st.root = root;
    st.data = S.workshop ? S.workshop : null;
    st.loading = !st.data;
    st.error = '';
    st.q = '';
    st.type = '';
    st.sort = 'name';
    st.dirFilter = '';
    st.selected = new Set();

    root.innerHTML = shell();

    const qInput = $('#ws-q', root);
    let qTimer = 0;
    if (qInput) {
      qInput.addEventListener('input', () => {
        clearTimeout(qTimer);
        qTimer = setTimeout(() => {
          st.q = qInput.value;
          render();
        }, 130);
      });
    }
    const sortSel = $('#ws-sort', root);
    if (sortSel) {
      sortSel.addEventListener('change', () => {
        st.sort = sortSel.value;
        render();
      });
    }

    /* 多目录下拉（由 syncSteamLine 动态创建，所以用委托） */
    listen(root, 'change', (e) => {
      if (e.target && e.target.id === 'ws-dir-sel') {
        st.dirFilter = e.target.value;
        render();
      }
    });
    const typeSeg = $('#ws-type', root);
    if (typeSeg) {
      typeSeg.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-type]');
        if (!btn) return;
        st.type = btn.dataset.type;
        typeSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b === btn));
        render();
      });
    }

    unsubs.push(
      delegate(root, '[data-act]', 'click', async (e, node) => {
        const act = node.dataset.act;
        if (act === 'refresh') {
          e.preventDefault();
          return refresh();
        }
        if (act === 'add-dir') {
          e.preventDefault();
          return addDir();
        }
        if (act === 'select-all') {
          e.preventDefault();
          filtered().forEach((x) => st.selected.add(x.id));
          syncSelection();
          return;
        }
        if (act === 'clear-sel') {
          e.preventDefault();
          st.selected.clear();
          syncSelection();
          return;
        }
        if (act === 'batch-extract') {
          e.preventDefault();
          const pkgs = selectedPkgs();
          if (!pkgs.length) {
            toast('warn', '选中的作品没有可解包的 .pkg');
            return;
          }
          const batch = encodeURIComponent(JSON.stringify(pkgs));
          location.hash = `#/extract?batch=${batch}`;
          return;
        }
      })
    );

    /* 卡片点击 / 勾选 */
    unsubs.push(
      delegate(root, '[data-check]', 'click', (e, node) => {
        e.preventDefault();
        e.stopPropagation();
        const id = node.dataset.check;
        if (!id) return;
        if (st.selected.has(id)) st.selected.delete(id);
        else st.selected.add(id);
        syncSelection();
      })
    );

    listen(root, 'click', (e) => {
      const card = e.target.closest('.ws-card');
      if (!card) return;
      if (e.target.closest('[data-check]')) return;
      const id = card.dataset.id;
      const item = ((st.data && st.data.items) || []).find((x) => x.id === id);
      openDetail(item);
    });
    listen(root, 'keydown', (e) => {
      const card = e.target.closest && e.target.closest('.ws-card');
      if (!card) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const id = card.dataset.id;
        const item = ((st.data && st.data.items) || []).find((x) => x.id === id);
        openDetail(item);
      }
    });

    /* 批量选择条（fixed 浮层） */
    const floatHost = document.getElementById('overlay-host');
    listen(floatHost, 'click', async (e) => {
      const btn = e.target.closest('#ws-float [data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'clear-sel') {
        st.selected.clear();
        syncSelection();
      } else if (btn.dataset.act === 'batch-extract') {
        const pkgs = selectedPkgs();
        if (!pkgs.length) return toast('warn', '选中的作品没有可解包的 .pkg');
        location.hash = `#/extract?batch=${encodeURIComponent(JSON.stringify(pkgs))}`;
      }
    });

    /* store 事件 */
    unsubs.push(
      on('workshop', (data) => {
        st.data = data;
        st.loading = !!(data && data.scanning);
        st.error = data && data.error ? data.error : '';
        render();
        syncSteamLine();
      })
    );

    await load();

    return () => {
      clearTimeout(qTimer);
      const bar = document.getElementById('ws-float');
      if (bar) bar.remove();
      document.body.classList.remove('has-floatbar');
      st.root = null;
      while (unsubs.length) {
        const fn = unsubs.pop();
        try {
          fn();
        } catch (err) {
          /* ignore */
        }
      }
    };
  },
};
