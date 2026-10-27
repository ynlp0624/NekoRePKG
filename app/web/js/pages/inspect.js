/* ==========================================================================
   pages/inspect.js —— 包信息
   ========================================================================== */

import { api, mockMeta } from '../api.js';
import { S } from '../store.js';
import {
  $,
  $$,
  on as delegate,
  icon,
  toast,
  fmtBytes,
  fmtNum,
  fmtTime,
  midEllipsis,
  baseName,
  typeBadge,
  TYPE_LABEL,
  setLoading,
  copyText,
  emptyState,
  skeletonRows,
  esc,
} from '../ui.js';

const SEG_COLORS = [
  'var(--primary)',
  'var(--accent)',
  'var(--ok)',
  'var(--warn)',
  'var(--err)',
  'var(--text-2)',
  'var(--muted)',
  'var(--border-strong)',
];

const st = {
  path: '',
  data: null,
  loading: false,
  error: '',
  q: '',
  ext: '',
  sortKey: 'path',
  sortDir: 1,
  projectOpen: false,
  root: null,
};

const unsubs = [];

/** 注册事件并在卸载时移除（#view 跨页面复用，必须清理） */
function listen(target, type, fn, opts) {
  target.addEventListener(type, fn, opts);
  unsubs.push(() => target.removeEventListener(type, fn, opts));
}

function shell() {
  return `<div class="page">
    <div class="page-head">
      <div>
        <h1>包信息</h1>
        <p class="page-sub">不用解包，直接看清 <span class="mono">.pkg</span> 里有什么。</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost btn-sm" data-act="pick" type="button">${icon('folder-search', 15)}选择 .pkg</button>
      </div>
    </div>
    <div id="inspect-body"></div>
  </div>`;
}

/* --------------------------------------------------------------------------
   空 / 加载 / 错误
   -------------------------------------------------------------------------- */
function emptyView() {
  return `<section class="card">
    <div class="dropzone" id="inspect-dz" role="button" tabindex="0" aria-label="拖入或选择 .pkg">
      <div class="dz-icon">${icon('info', 28)}</div>
      <div class="dz-title">拖一个 .pkg 进来 / 或点击选择</div>
      <div class="dz-hint">会显示封面、project.json、按扩展名统计与全部条目</div>
      <div class="dz-foot">
        <button class="btn btn-soft btn-sm" data-act="pick" type="button">${icon('plus', 14)}选择文件</button>
        ${
          api.isMock
            ? `<button class="btn btn-ghost btn-sm" data-act="demo-broken" type="button">${icon('alert-triangle', 14)}演示损坏文件</button>`
            : ''
        }
      </div>
    </div>
    <div style="margin-top:var(--s3)">
      ${emptyState({
        inline: true,
        title: '这里空空的喵~',
        text: '选一个 .pkg 就能看到它的封面、条目和 project.json。',
      })}
    </div>
  </section>`;
}

function loadingView() {
  return `<div class="col" style="gap:var(--s4)">
    <section class="card">
      <div class="row" style="gap:var(--s5);align-items:flex-start">
        <div class="skel" style="width:232px;aspect-ratio:16/10;border-radius:var(--radius-sm);flex:none"></div>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:10px">
          <div class="skel skel-line" style="width:46%;height:20px"></div>
          <div class="skel skel-line" style="width:28%"></div>
          <div class="skel" style="height:44px;border-radius:10px;margin-top:6px"></div>
          <div class="skel" style="height:44px;border-radius:10px"></div>
        </div>
      </div>
      <div class="row" style="margin-top:var(--s4);color:var(--text-2);font-size:var(--fs-md)">
        <span class="spinner"></span>
        <span>正在读取 ${esc(midEllipsis(st.path, 60))}…</span>
      </div>
    </section>
    <section class="card">${skeletonRows(8)}</section>
  </div>`;
}

function errorView() {
  return `<section class="card">
    ${emptyState({
      title: '这个包读不出来喵…',
      text: `<span style="color:var(--err)">${esc(st.error || '未知错误')}</span><br /><span class="mono text-xs">${esc(
        midEllipsis(st.path, 72)
      )}</span>`,
      actions: [
        { label: '重试', id: 'retry', primary: true, icon: 'refresh' },
        { label: '换一个包', id: 'pick', icon: 'folder-search' },
      ],
    })}
  </section>`;
}

/* --------------------------------------------------------------------------
   就绪视图
   -------------------------------------------------------------------------- */
function heroView(d) {
  const proj = d.project || {};
  const title = proj.title || d.name || baseName(d.path);
  const cover = d.preview_url
    ? `<img src="${esc(d.preview_url)}" alt="${esc(title)} 封面" />`
    : `<div class="cover-fallback">${icon('image-off', 30)}<span class="text-xs" style="margin-top:6px">没有封面</span></div>`;
  const tags = Array.isArray(proj.tags) ? proj.tags.slice(0, 6) : [];

  return `<section class="card hero-card">
    <div class="inspect-hero">
      <div class="cover">${cover}</div>
      <div style="min-width:0;display:flex;flex-direction:column;gap:var(--s3)">
        <div class="row" style="align-items:flex-start">
          <div style="min-width:0;flex:1">
            <div class="hero-title" title="${esc(title)}">${esc(title)}</div>
            <div class="hero-sub">${esc(d.name || baseName(d.path))}</div>
          </div>
          <div class="row" style="gap:6px;flex:none">
            ${proj.type ? typeBadge(proj.type) : ''}
            <span class="badge">${esc(d.magic || 'pkg')}</span>
          </div>
        </div>

        ${tags.length ? `<div class="hero-tags">${tags.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}
        ${
          proj.description
            ? `<div class="text-sm dim" style="line-height:1.7;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(
                proj.description
              )}</div>`
            : ''
        }

        <div class="info-grid">
          <div class="info-item"><span class="info-k">包大小</span><span class="info-v num">${fmtBytes(d.size)}</span></div>
          <div class="info-item"><span class="info-k">条目数</span><span class="info-v num">${fmtNum(d.entry_count)}</span></div>
          <div class="info-item"><span class="info-k">数据大小</span><span class="info-v num">${fmtBytes(d.data_size)}</span></div>
          <div class="info-item"><span class="info-k">Workshop ID</span><span class="info-v num">${esc(
            proj.workshopid || '—'
          )}</span></div>
          <div class="info-item"><span class="info-k">格式</span><span class="info-v">${esc(
            proj.type ? TYPE_LABEL[proj.type] || proj.type : '未知'
          )}</span></div>
        </div>

        <div class="path-display" title="${esc(d.path)}">
          ${icon('file', 14)}
          <span class="ellipsis" style="flex:1">${esc(midEllipsis(d.path, 76))}</span>
          <button class="btn btn-xs btn-icon btn-ghost" data-act="copy-path" type="button" title="复制路径" aria-label="复制路径">${icon(
            'copy',
            13
          )}</button>
        </div>

        <div class="row row-wrap" style="gap:8px">
          <button class="btn btn-primary" data-act="extract" type="button">${icon('extract', 15)}解包这个包</button>
          <button class="btn btn-ghost" data-act="pack-this" type="button">${icon('pack', 15)}重新打包</button>
          <button class="btn btn-ghost" data-act="reveal" type="button">${icon('folder', 15)}打开所在目录</button>
        </div>
      </div>
    </div>
    ${
      (d.warnings || []).length
        ? `<div class="notice" style="margin-top:var(--s4)">${icon('alert-triangle', 16)}<div>${(d.warnings || [])
            .map((w) => esc(w))
            .join('；')}</div></div>`
        : ''
    }
  </section>`;
}

function statsView(d) {
  const list = (d.by_ext || []).slice(0, 12);
  const total = list.reduce((s, x) => s + (x.size || 0), 0) || 1;
  return `<section class="card">
    <div class="card-head">
      <div class="card-head-l">
        <div class="card-title">${icon('grid', 17)}按扩展名统计</div>
        <div class="card-desc">${fmtNum((d.by_ext || []).length)} 种扩展名 · 条形按体积占比</div>
      </div>
    </div>
    <div class="stat-bar">
      ${list
        .map(
          (x, i) =>
            `<div class="stat-seg" style="width:${Math.max(0.6, (x.size / total) * 100)}%;background:${
              SEG_COLORS[i % SEG_COLORS.length]
            }" title="${esc(x.ext)} · ${fmtNum(x.count)} 个 · ${fmtBytes(x.size)}"></div>`
        )
        .join('')}
    </div>
    <div class="stat-legend">
      ${list
        .map(
          (x, i) => `<div class="stat-item">
            <span class="chip-dot" style="background:${SEG_COLORS[i % SEG_COLORS.length]}"></span>
            <span class="stat-ext">${esc(x.ext || '无扩展名')}</span>
            <span class="stat-num">${fmtNum(x.count)} 个 · ${fmtBytes(x.size)}</span>
          </div>`
        )
        .join('')}
    </div>
  </section>`;
}

function entriesView(d) {
  const exts = (d.by_ext || []).map((x) => x.ext);
  return `<section class="card">
    <div class="card-head">
      <div class="card-head-l">
        <div class="card-title">${icon('list', 17)}条目 <span class="badge-count" id="entry-count">${fmtNum(
          d.entry_count
        )}</span></div>
        <div class="card-desc">点任意一行可以复制路径；解析上限 5000 行</div>
      </div>
    </div>
    <div class="toolbar" style="margin-bottom:var(--s3)">
      <div class="input-group" style="flex:1;min-width:180px">
        ${icon('search', 15)}
        <input class="input" id="entry-q" type="search" placeholder="搜索路径或文件名…" spellcheck="false" value="${esc(st.q)}" />
      </div>
      <div class="select-wrap" style="width:168px">
        <select class="select" id="entry-ext" aria-label="按扩展名筛选">
          <option value="">全部扩展名</option>
          ${exts
            .map(
              (x) =>
                `<option value="${esc(x)}" ${st.ext === x ? 'selected' : ''}>${esc(x || '无扩展名')}</option>`
            )
            .join('')}
        </select>
      </div>
      <button class="btn btn-ghost btn-icon" data-act="copy-all" type="button" title="复制全部条目路径" aria-label="复制全部条目路径">${icon(
        'copy',
        15
      )}</button>
    </div>
    <div class="table-wrap">
      <table class="tbl">
        <colgroup><col /><col style="width:92px" /><col style="width:96px" /><col style="width:108px" /></colgroup>
        <thead>
          <tr>
            <th><button class="th-sort" data-sort="path" type="button">路径 <span class="th-arrow">${sortArrow(
              'path'
            )}</span></button></th>
            <th class="col-ext">扩展名</th>
            <th class="col-type">类型</th>
            <th class="col-size"><button class="th-sort" data-sort="size" type="button">大小 <span class="th-arrow">${sortArrow(
              'size'
            )}</span></button></th>
          </tr>
        </thead>
        <tbody id="entry-rows"></tbody>
      </table>
    </div>
    <div class="row" style="margin-top:var(--s2)">
      <span class="text-xs muted" id="entry-note"></span>
    </div>
  </section>`;
}

function sortArrow(key) {
  if (st.sortKey !== key) return '↕';
  return st.sortDir > 0 ? '↑' : '↓';
}

function projectView(d) {
  const p = d.project;
  if (!p) {
    return `<section class="card">
      <div class="card-head">
        <div class="card-head-l">
          <div class="card-title">${icon('file', 17)}project.json</div>
        </div>
      </div>
      <div class="notice">${icon('info', 16)}<div>这个包里没有 project.json，可能是纯素材包或视频包。</div></div>
    </section>`;
  }
  const json = JSON.stringify(p.raw || p, null, 2);
  return `<section class="card">
    <div class="accordion" data-open="${st.projectOpen ? 'true' : 'false'}" id="proj-acc">
      <button class="accordion-head" data-act="toggle-proj" type="button" aria-expanded="${st.projectOpen}">
        ${icon('file', 16)}
        <span>project.json</span>
        <span class="badge">${fmtNum(json.split('\n').length)} 行</span>
        <span class="chev">${icon('chevron-down', 16)}</span>
      </button>
      <div class="accordion-body">
        <div class="code-block">
          <div class="code-head">
            <span>格式化 JSON</span>
            <span class="spacer"></span>
            <button class="log-btn" data-act="copy-json" type="button">${icon('copy', 12)}复制</button>
          </div>
          <pre class="code-body">${esc(json)}</pre>
        </div>
      </div>
    </div>
  </section>`;
}

function readyView(d) {
  return `<div class="col" style="gap:var(--s4)">
    ${heroView(d)}
    ${statsView(d)}
    ${entriesView(d)}
    ${projectView(d)}
  </div>`;
}

/* --------------------------------------------------------------------------
   表格渲染
   -------------------------------------------------------------------------- */
function filteredEntries() {
  const d = st.data;
  if (!d) return [];
  const q = st.q.trim().toLowerCase();
  let list = d.entries || [];
  if (st.ext) list = list.filter((e) => e.ext === st.ext);
  if (q) list = list.filter((e) => String(e.path).toLowerCase().includes(q));
  const dir = st.sortDir;
  const key = st.sortKey;
  list = list.slice().sort((a, b) => {
    if (key === 'size') return ((a.size || 0) - (b.size || 0)) * dir;
    return String(a.path).localeCompare(String(b.path), 'zh-CN') * dir;
  });
  return list;
}

function renderRows() {
  const d = st.data;
  if (!d) return;
  const list = filteredEntries();
  const MAX = 5000;
  const shown = list.slice(0, MAX);
  const tbody = $('#entry-rows', st.root);
  if (tbody) {
    tbody.innerHTML = shown
      .map(
        (e) => `<tr data-path="${esc(e.path)}" title="点击复制路径：${esc(e.path)}">
          <td class="cell-path">${esc(e.path)}</td>
          <td>${esc(e.ext || '—')}</td>
          <td>${e.type === 'texture' ? '<span class="badge badge-video">贴图</span>' : '<span class="badge">普通</span>'}</td>
          <td class="col-size cell-size">${fmtBytes(e.size, 1)}</td>
        </tr>`
      )
      .join('');
  }
  const countEl = $('#entry-count', st.root);
  if (countEl) countEl.textContent = fmtNum(list.length);
  const note = $('#entry-note', st.root);
  if (note) {
    if (list.length > MAX) note.textContent = `匹配 ${fmtNum(list.length)} 条，只显示前 ${fmtNum(MAX)} 条`;
    else note.textContent = `显示 ${fmtNum(shown.length)} / ${fmtNum((d.entries || []).length)} 条 · 数据大小 ${fmtBytes(d.data_size)}`;
  }
}

/* --------------------------------------------------------------------------
   数据加载
   -------------------------------------------------------------------------- */
async function load(path) {
  st.path = path;
  st.data = null;
  st.error = '';
  st.q = '';
  st.ext = '';
  st.loading = true;
  renderBody();
  try {
    const res = await api.inspect(path);
    st.data = res;
    st.loading = false;
    renderBody();
  } catch (e) {
    st.loading = false;
    st.error = e.message || '读取失败';
    renderBody();
    toast('error', `读取失败：${st.error}`);
  }
}

function renderBody() {
  const body = $('#inspect-body', st.root);
  if (!body) return;
  if (st.loading) {
    body.innerHTML = loadingView();
    return;
  }
  if (st.error) {
    body.innerHTML = errorView();
    return;
  }
  if (!st.data) {
    body.innerHTML = emptyView();
    return;
  }
  body.innerHTML = readyView(st.data);
  renderRows();
}

/* --------------------------------------------------------------------------
   动作
   -------------------------------------------------------------------------- */
async function pickPkg() {
  try {
    const res = await api.pick('pkg', { title: '选择要查看的 .pkg' });
    if (res && res.path) {
      const next = `#/inspect?path=${encodeURIComponent(res.path)}`;
      if (location.hash === next) load(res.path);
      else location.hash = next;
    }
  } catch (e) {
    toast('error', `选择失败：${e.message}`);
  }
}

/* --------------------------------------------------------------------------
   挂载
   -------------------------------------------------------------------------- */
export default {
  id: 'inspect',
  label: '包信息',
  icon: 'info',
  title: '包信息',
  subtitle: '不用解包看清单',

  async mount(root, ctx) {
    st.root = root;
    st.data = null;
    st.error = '';
    st.loading = false;
    st.q = '';
    st.ext = '';
    st.sortKey = 'path';
    st.sortDir = 1;
    st.projectOpen = false;
    st.path = '';

    root.innerHTML = shell();
    renderBody();

    const initial = ctx.params && ctx.params.path;
    if (initial) await load(initial);

    /* 选择 / 重试 / 解包等 */
    unsubs.push(
      delegate(root, '[data-act]', 'click', async (e, node) => {
        const act = node.dataset.act;
        if (act === 'pick') {
          e.preventDefault();
          return pickPkg();
        }
        if (act === 'retry') {
          e.preventDefault();
          return load(st.path);
        }
        if (act === 'demo-broken') {
          e.preventDefault();
          if (mockMeta) await load(mockMeta.brokenSample);
          return;
        }
        if (act === 'extract') {
          e.preventDefault();
          if (!st.path) return;
          location.hash = `#/extract?path=${encodeURIComponent(st.path)}`;
          return;
        }
        if (act === 'pack-this') {
          e.preventDefault();
          const dir = (st.data && st.data.path ? st.data.path : '').replace(/[\\/][^\\/]+$/, '');
          location.hash = `#/pack?dir=${encodeURIComponent(dir)}`;
          return;
        }
        if (act === 'reveal') {
          e.preventDefault();
          try {
            await api.reveal(st.path);
          } catch (err) {
            toast('error', `打开失败：${err.message}`);
          }
          return;
        }
        if (act === 'copy-path') {
          e.preventDefault();
          const ok = await copyText(st.path);
          toast(ok ? 'ok' : 'warn', ok ? '路径已复制' : '复制失败');
          return;
        }
        if (act === 'copy-json') {
          e.preventDefault();
          const json = JSON.stringify((st.data.project && st.data.project.raw) || st.data.project, null, 2);
          const ok = await copyText(json);
          toast(ok ? 'ok' : 'warn', ok ? 'project.json 已复制' : '复制失败');
          return;
        }
        if (act === 'toggle-proj') {
          e.preventDefault();
          st.projectOpen = !st.projectOpen;
          const acc = $('#proj-acc', root);
          if (acc) acc.dataset.open = st.projectOpen ? 'true' : 'false';
          return;
        }
        if (act === 'copy-all') {
          e.preventDefault();
          const text = filteredEntries()
            .map((x) => x.path)
            .join('\n');
          const ok = await copyText(text);
          toast(ok ? 'ok' : 'warn', ok ? `已复制 ${fmtNum(filteredEntries().length)} 条路径` : '复制失败');
          return;
        }
      })
    );

    /* 拖入 pkg */
    const onDrop = async (e) => {
      const dz = $('#inspect-dz', root);
      if (!dz) return;
      e.preventDefault();
      dz.classList.remove('is-over');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      if (!/\.pkg$/i.test(file.name)) {
        toast('error', '只支持 .pkg 文件');
        return;
      }
      try {
        const up = await api.upload(file);
        await load(up.path);
      } catch (err) {
        toast('error', `读取失败：${err.message}`);
      }
    };
    const onDragOver = (e) => {
      const dz = $('#inspect-dz', root);
      if (!dz) return;
      e.preventDefault();
      dz.classList.add('is-over');
    };
    const onDragLeave = (e) => {
      const dz = $('#inspect-dz', root);
      if (!dz) return;
      if (!dz.contains(e.relatedTarget)) dz.classList.remove('is-over');
    };
    listen(root, 'dragover', onDragOver);
    listen(root, 'dragleave', onDragLeave);
    listen(root, 'drop', onDrop);
    const prevent = (e) => e.preventDefault();
    listen(window, 'dragover', prevent);
    listen(window, 'drop', prevent);

    /* 空态点击拖放区 */
    listen(root, 'click', (e) => {
      const dz = e.target.closest('#inspect-dz');
      if (dz && !e.target.closest('button')) {
        const body = $('#inspect-body', root);
        if (body && body.contains(dz)) pickPkg();
      }
    });

    /* 搜索 / 筛选 / 排序（委托在 root 上，重建后依然生效） */
    listen(root, 'input', (e) => {
      if (e.target && e.target.id === 'entry-q') {
        st.q = e.target.value;
        renderRows();
      }
    });
    listen(root, 'change', (e) => {
      if (e.target && e.target.id === 'entry-ext') {
        st.ext = e.target.value;
        renderRows();
      }
    });
    listen(root, 'click', (e) => {
      const sortBtn = e.target.closest('[data-sort]');
      if (sortBtn) {
        e.preventDefault();
        const key = sortBtn.dataset.sort;
        if (st.sortKey === key) st.sortDir = -st.sortDir;
        else {
          st.sortKey = key;
          st.sortDir = key === 'size' ? -1 : 1;
        }
        renderBody();
        return;
      }
      const tr = e.target.closest('tr[data-path]');
      if (tr) {
        copyText(tr.dataset.path).then((ok) => {
          if (ok) toast('ok', '路径已复制');
          else toast('warn', '复制失败');
        });
      }
    });
    listen(root, 'keydown', (e) => {
      const dz = e.target.closest && e.target.closest('#inspect-dz');
      if (dz && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        pickPkg();
      }
    });

    return () => {
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
