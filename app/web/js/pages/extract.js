/* ==========================================================================
   pages/extract.js —— 解包（首页）
   ========================================================================== */

import { api } from '../api.js';
import { S, on, refreshJobs } from '../store.js';
import {
  $,
  $$,
  el,
  on as delegate,
  icon,
  toast,
  statusBadge,
  fmtBytes,
  fmtTime,
  fmtTimeShort,
  fmtElapsed,
  fmtNum,
  fmtPercent,
  midEllipsis,
  baseName,
  emptyState,
  setLoading,
  copyText,
  esc,
} from '../ui.js';

const DEFAULT_OPTIONS = {
  only_exts: '',
  ignore_exts: '',
  single_dir: false,
  recursive: true,
  copy_project: true,
  use_name: false,
  no_tex_convert: false,
  overwrite: false,
};

const st = {
  files: [],
  output: '',
  options: { ...DEFAULT_OPTIONS },
  advancedOpen: false,
  expanded: new Set(),
  paused: new Set(),
  logs: new Map(),
  starting: false,
  root: null,
};

const unsubs = [];

function template() {
  return `
  <div class="page">
    <div class="page-head">
      <div>
        <h1>解包</h1>
        <p class="page-sub">把 Wallpaper Engine 的 <span class="mono">.pkg</span> 拆成素材文件夹，可批量、可队列。</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost btn-sm" data-act="open-default" type="button">${icon('folder', 15)}打开输出目录</button>
      </div>
    </div>

    <div class="split">
      <div class="col">
        <section class="card">
          <div class="card-head">
            <div class="card-head-l">
              <div class="card-title">${icon('archive', 17)}选择 .pkg <span class="badge-count" id="file-count">0</span></div>
              <div class="card-desc">一次可以选多个包，也可以把文件直接拖进窗口</div>
            </div>
            <div class="card-actions">
              <button class="btn btn-xs btn-ghost" data-act="clear-files" type="button" ${st.files.length ? '' : 'disabled'}>${icon('trash', 13)}清空</button>
            </div>
          </div>

          <div class="dropzone" id="dz" role="button" tabindex="0" aria-label="拖入或选择 .pkg 文件">
            <div class="dz-icon">${icon('archive', 28)}</div>
            <div class="dz-title">把 .pkg 拖进来 / 或点击选择</div>
            <div class="dz-hint">拖文件夹不会生效，请用下面的「选择文件夹」；支持一次选多个包</div>
            <div class="dz-foot">
              <button class="btn btn-soft btn-sm" data-act="pick" type="button">${icon('plus', 14)}选择文件</button>
              <button class="btn btn-ghost btn-sm" data-act="pick-folder" type="button">${icon('folder', 14)}选择文件夹</button>
            </div>
          </div>

          <div id="file-wrap" style="margin-top:var(--s3)"></div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-head-l">
              <div class="card-title">${icon('save', 17)}输出与选项</div>
              <div class="card-desc">每个包会在输出目录下单独建一个文件夹</div>
            </div>
          </div>

          <div class="stack-form">
            <div class="field">
              <div class="row" style="gap:6px">
                <span class="field-label">输出目录</span>
                <span class="spacer"></span>
                <button class="btn btn-link text-xs" data-act="use-default" type="button">用默认目录</button>
              </div>
              <div class="row" style="gap:6px">
                <input class="input is-mono" id="out-dir" type="text" placeholder="例如 E:\repkg\output" spellcheck="false" />
                <button class="btn btn-ghost" data-act="pick-out" type="button">选择…</button>
                <button class="btn btn-ghost btn-icon" data-act="open-out" type="button" title="在资源管理器打开" aria-label="在资源管理器打开">${icon('external', 16)}</button>
              </div>
              <div class="field-hint" id="out-hint"></div>
            </div>

            <div class="divider"></div>

            <div class="row row-wrap" style="gap:10px">
              <button class="btn btn-primary btn-lg" id="start" type="button">${icon('play', 16)}开始解包</button>
              <span class="queue-hint" id="q-hint"></span>
              <span class="spacer"></span>
              <span class="text-xs muted">并发数可在设置里调整</span>
            </div>

            <div class="accordion" id="adv" data-open="${st.advancedOpen ? 'true' : 'false'}">
              <button class="accordion-head" id="adv-head" type="button" aria-expanded="false">
                ${icon('settings', 16)}
                <span>高级选项</span>
                <span class="badge" id="adv-badge">默认</span>
                <span class="chev">${icon('chevron-down', 16)}</span>
              </button>
              <div class="accordion-body">
                <div class="form-row" style="margin-bottom:var(--s3)">
                  <div class="field">
                    <label class="field-label" for="only-exts">仅提取这些扩展名</label>
                    <input class="input is-mono" id="only-exts" type="text" placeholder=".json, .tex, .png" spellcheck="false" />
                    <span class="field-hint">留空表示全部提取</span>
                  </div>
                  <div class="field">
                    <label class="field-label" for="ignore-exts">忽略这些扩展名</label>
                    <input class="input is-mono" id="ignore-exts" type="text" placeholder=".mp4, .webm" spellcheck="false" />
                    <span class="field-hint">逗号分隔，会自动补上「.」</span>
                  </div>
                </div>
                <div class="opt-grid">
                  <label class="checkbox"><input type="checkbox" data-opt="single_dir" /> 全部输出到单目录</label>
                  <label class="checkbox"><input type="checkbox" data-opt="recursive" checked /> 递归处理文件夹</label>
                  <label class="checkbox"><input type="checkbox" data-opt="copy_project" checked /> 复制 project.json 与 preview</label>
                  <label class="checkbox"><input type="checkbox" data-opt="use_name" /> 用作品名做文件夹名</label>
                  <label class="checkbox"><input type="checkbox" data-opt="no_tex_convert" /> 不转换贴图（不跑 tex→png）</label>
                  <label class="checkbox"><input type="checkbox" data-opt="overwrite" /> 覆盖已存在的文件</label>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <aside class="col">
        <section class="card" id="task-card">
          <div class="card-head">
            <div class="card-head-l">
              <div class="card-title">${icon('activity', 17)}任务 <span class="badge-count" id="job-count">0</span></div>
              <div class="card-desc">实时进度与日志</div>
            </div>
            <div class="card-actions">
              <button class="btn btn-xs btn-ghost" data-act="clear-done" type="button" title="清掉所有已结束的任务">${icon('trash', 13)}清理</button>
            </div>
          </div>
          <div id="job-list" class="job-list"></div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-head-l">
              <div class="card-title">${icon('clock', 17)}最近</div>
              <div class="card-desc">点一下重新载入这份包</div>
            </div>
          </div>
          <div id="recent-list" class="recent-list"></div>
        </section>
      </aside>
    </div>
  </div>`;
}

/* --------------------------------------------------------------------------
   文件列表
   -------------------------------------------------------------------------- */
function renderFiles() {
  const wrap = $('#file-wrap', st.root);
  if (!wrap) return;
  const count = $('#file-count', st.root);
  if (count) count.textContent = String(st.files.length);

  const clearBtn = st.root.querySelector('[data-act="clear-files"]');
  if (clearBtn) clearBtn.disabled = st.files.length === 0;

  if (!st.files.length) {
    wrap.innerHTML = '';
    return;
  }

  wrap.innerHTML = `<div class="file-list">${st.files
    .map(
      (f, i) => `<div class="file-row" data-index="${i}" title="${esc(f.path)}">
        <span class="file-ico">${icon(f.dir ? 'folder' : 'file', 16)}</span>
        <span class="file-main">
          <span class="file-name">${esc(f.name)}</span>
          <span class="file-path">${esc(midEllipsis(f.path, 58))}</span>
        </span>
        ${f.size ? `<span class="file-size">${fmtBytes(f.size)}</span>` : ''}
        <button class="btn btn-xs btn-icon btn-ghost" data-act="remove-file" data-index="${i}" type="button" title="移除" aria-label="移除 ${esc(f.name)}">${icon('x', 13)}</button>
      </div>`
    )
    .join('')}</div>`;
}

function addPath(path, size, dir, label) {
  if (!path) return;
  if (!dir && !/\.pkg$/i.test(path)) {
    toast('warn', '只能解包 .pkg 文件喵~');
    return;
  }
  if (st.files.some((f) => f.path === path)) {
    toast('info', '这个包已经在列表里了');
    return;
  }
  const name = label || baseName(path).replace(/^\d{10,}_/, '');
  st.files.push({ path, name, size: size || 0, dir: !!dir });
  renderFiles();
  updateQueueHint();
}

function updateQueueHint() {
  const hint = $('#q-hint', st.root);
  if (!hint) return;
  if (!st.files.length) {
    hint.innerHTML = '';
    return;
  }
  hint.innerHTML = `${icon('cpu', 12)} 将创建 <b>${fmtNum(st.files.length)}</b> 个任务 · 并发 ${fmtNum(
    (S.settings && S.settings.concurrency) || 2
  )}`;
}

/* --------------------------------------------------------------------------
   任务面板
   -------------------------------------------------------------------------- */
function jobLog(jobId) {
  return st.logs.get(jobId) || [];
}

async function loadLog(jobId) {
  if (st.logs.has(jobId)) return;
  st.logs.set(jobId, []);
  try {
    const res = await api.getJobLog(jobId, 0);
    if (res && Array.isArray(res.lines)) {
      st.logs.set(jobId, res.lines.slice());
      const body = st.root.querySelector(`.log-body[data-log="${jobId}"]`);
      if (body) {
        renderLogBody(body, jobId);
        scrollLog(body);
      }
    }
  } catch (e) {
    /* 日志读取失败不阻塞其它操作 */
  }
}

function logHtml(lines) {
  if (!lines || !lines.length) return '<div class="log-empty">等待日志…</div>';
  return lines
    .map(
      (l) =>
        `<div class="log-line" data-level="${esc(l.level || 'info')}"><span class="t">${esc(l.t || '')}</span><span class="txt">${esc(
          l.text || ''
        )}</span></div>`
    )
    .join('');
}

function renderLogBody(body, jobId) {
  body.innerHTML = logHtml(jobLog(jobId));
  body.scrollTop = body.scrollHeight;
}

function scrollLog(body) {
  const jobId = body.dataset.log;
  if (!jobId || st.paused.has(jobId)) return;
  body.scrollTop = body.scrollHeight;
}

function jobActions(job) {
  const parts = [];
  if (job.status === 'running' || job.status === 'queued') {
    parts.push(`<button class="btn btn-xs btn-ghost" data-act="cancel" data-id="${esc(job.id)}" type="button">${icon('stop', 12)}取消</button>`);
  }
  if (job.status === 'done') {
    parts.push(`<button class="btn btn-xs btn-soft" data-act="showout" data-id="${esc(job.id)}" type="button">${icon('folder', 12)}打开目录</button>`);
    parts.push(`<button class="btn btn-xs btn-ghost" data-act="gallery" data-id="${esc(job.id)}" type="button">${icon('gallery', 12)}去画廊</button>`);
  }
  if (job.status === 'error' && job.error) {
    parts.push(`<button class="btn btn-xs btn-ghost" data-act="copyerr" data-id="${esc(job.id)}" type="button">${icon('copy', 12)}复制错误</button>`);
  }
  if (job.status !== 'running' && job.status !== 'queued') {
    parts.push(`<button class="btn btn-xs btn-ghost" data-act="remove" data-id="${esc(job.id)}" type="button">${icon('trash', 12)}移除</button>`);
  }
  parts.push(
    `<button class="btn btn-xs btn-ghost" data-act="toggle-log" data-id="${esc(job.id)}" type="button">${icon('terminal', 12)}${
      st.expanded.has(job.id) ? '收起日志' : '日志'
    }</button>`
  );
  return parts.join('');
}

function jobCard(job) {
  const total = (job.progress && job.progress.total) || 0;
  const done = (job.progress && job.progress.done) || 0;
  const pct = job.progress && job.progress.percent != null ? job.progress.percent : fmtPercent(done, total);
  const expanded = st.expanded.has(job.id);
  const isPaused = st.paused.has(job.id);
  const elapsed = job.elapsed != null ? job.elapsed : 0;
  const phase =
    job.status === 'error'
      ? job.error || (job.progress && job.progress.phase) || '失败'
      : (job.progress && job.progress.phase) || '等待开始';

  return `<article class="job" data-status="${esc(job.status)}" data-id="${esc(job.id)}">
    <div class="job-head">
      <span class="job-title" title="${esc(job.title)}">${esc(job.title)}</span>
      ${statusBadge(job.status)}
      <span class="spacer"></span>
    </div>
    <div class="job-input" title="${esc(job.input)}">${esc(midEllipsis(job.input, 52))}</div>
    <div class="job-progress">
      <div class="progress"><div class="progress-bar" style="width:${Math.max(1.5, Math.min(100, pct))}%"></div></div>
      <span class="job-pct">${pct.toFixed(1)}%</span>
    </div>
    <div class="job-meta">
      <span>${fmtNum(done)}/${fmtNum(total)}</span>
      <span class="dot">·</span>
      <span>${fmtElapsed(elapsed)}</span>
      ${job.result && job.result.files ? `<span class="dot">·</span><span>${fmtNum(job.result.files)} 文件</span>` : ''}
    </div>
    <div class="job-phase" title="${esc(phase)}">${esc(midEllipsis(phase, 54))}</div>
    <div class="job-actions">${jobActions(job)}</div>
    ${
      expanded
        ? `<div class="log">
             <div class="log-head">
               <span class="log-head-title">实时日志</span>
               <button class="log-btn ${isPaused ? '' : 'is-active'}" data-act="pause-log" data-id="${esc(job.id)}" type="button" title="暂停 / 继续自动滚动">${icon(
                 isPaused ? 'play' : 'pause',
                 12
               )}${isPaused ? '已暂停' : '跟随'}</button>
               <button class="log-btn" data-act="copy-log" data-id="${esc(job.id)}" type="button" title="复制全部日志">${icon('copy', 12)}复制</button>
             </div>
             <div class="log-body" data-log="${esc(job.id)}">${logHtml(jobLog(job.id))}</div>
           </div>`
        : ''
    }
  </article>`;
}

function renderJobs() {
  const list = $('#job-list', st.root);
  if (!list) return;
  const jobs = S.jobs.filter((j) => j.kind === 'extract' || j.kind === 'tex');
  const count = $('#job-count', st.root);
  if (count) count.textContent = String(jobs.length);

  if (!jobs.length) {
    list.innerHTML = emptyState({
      inline: true,
      title: '还没有任务喵~',
      text: '选好 .pkg，然后点「开始解包」。',
    });
    return;
  }

  list.innerHTML = jobs.map(jobCard).join('');

  // 恢复展开的日志并滚动到底
  $$('.log-body', list).forEach((body) => {
    const jobId = body.dataset.log;
    if (!jobId) return;
    if (st.expanded.has(jobId)) {
      if (!st.logs.has(jobId)) loadLog(jobId);
      else scrollLog(body);
    }
  });
}

function renderRecent() {
  const wrap = $('#recent-list', st.root);
  if (!wrap) return;
  const items = (S.recent || []).filter((r) => r.kind === 'pkg' || true).slice(0, 8);
  if (!items.length) {
    wrap.innerHTML = `<div class="empty empty-inline" style="min-height:96px">
      <p class="text-sm muted" style="margin:0">还没有历史记录</p>
    </div>`;
    return;
  }
  wrap.innerHTML = items
    .map(
      (r, i) => `<button class="recent-row" data-recent="${i}" type="button" title="${esc(r.path)}">
        <span>${icon(/\.pkg$/i.test(r.path) ? 'archive' : 'folder', 14)}</span>
        <span class="recent-name">${esc(r.name || baseName(r.path))}</span>
        <span class="recent-when">${esc(fmtTimeShort(r.when))}</span>
      </button>`
    )
    .join('');
}

function updateAll() {
  renderJobs();
  renderRecent();
  updateQueueHint();
}

/* --------------------------------------------------------------------------
   事件
   -------------------------------------------------------------------------- */
async function pickFiles() {
  try {
    const res = await api.pick('pkg', { title: '选择要解包的 .pkg' });
    if (res && res.path) addPath(res.path);
  } catch (e) {
    toast('error', `选择文件失败：${e.message}`);
  }
}

async function pickFolder() {
  try {
    const res = await api.pick('folder', { title: '选择包含 .pkg 的文件夹' });
    if (res && res.path) addPath(res.path, 0, true);
  } catch (e) {
    toast('error', `选择文件夹失败：${e.message}`);
  }
}

async function pickOutput() {
  try {
    const res = await api.pick('folder', { title: '选择输出目录', default_dir: st.output });
    if (res && res.path) {
      st.output = res.path;
      const input = $('#out-dir', st.root);
      if (input) input.value = st.output;
      renderOutHint();
    }
  } catch (e) {
    toast('error', `选择目录失败：${e.message}`);
  }
}

function renderOutHint() {
  const hint = $('#out-hint', st.root);
  if (!hint) return;
  const def = (S.settings && S.settings.default_output) || '';
  if (!st.output) hint.innerHTML = '<span class="is-err">请先选择输出目录</span>';
  else if (def && st.output === def) hint.textContent = '使用设置里的默认输出目录';
  else hint.textContent = '每个包会在该目录下新建同名文件夹';
}

async function startExtract() {
  if (st.starting) return;
  const btn = $('#start', st.root);
  if (!st.files.length) {
    toast('warn', '先选一个 .pkg 吧喵~');
    const dz = $('#dz', st.root);
    if (dz) dz.focus();
    return;
  }
  if (!st.output.trim()) {
    toast('warn', '请先选择输出目录');
    const input = $('#out-dir', st.root);
    if (input) input.focus();
    return;
  }

  st.starting = true;
  setLoading(btn, true);
  try {
    const res = await api.extract({
      inputs: st.files.map((f) => f.path),
      output_dir: st.output.trim(),
      options: { ...st.options },
    });
    if (res && res.rejected && res.rejected.length) {
      toast('warn', `${res.rejected.length} 个文件被跳过：${res.rejected[0].reason}`);
    }
    if (res && res.job_ids && res.job_ids.length) {
      toast('ok', `已加入队列：${res.job_ids.length} 个任务`);
      await refreshJobs();
      renderJobs();
      const card = $('#task-card', st.root);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      toast('error', '没有任务被创建，请检查选项');
    }
  } catch (e) {
    toast('error', `解包失败：${e.message}`);
  } finally {
    st.starting = false;
    setLoading(btn, false);
  }
}

async function jobAction(act, id, node) {
  const job = S.jobs.find((j) => j.id === id);
  if (!job) return;
  try {
    if (act === 'cancel') {
      await api.cancelJob(id);
      toast('info', `已取消：${job.title}`);
      await refreshJobs();
    } else if (act === 'remove') {
      await api.removeJob(id);
      await refreshJobs();
    } else if (act === 'showout') {
      await api.openOutput(id);
    } else if (act === 'gallery') {
      const dir = (job.result && job.result.output_dir) || job.output_dir;
      window.location.hash = `#/gallery?dir=${encodeURIComponent(dir)}`;
    } else if (act === 'copyerr') {
      const ok = await copyText(job.error || '未知错误');
      toast(ok ? 'ok' : 'warn', ok ? '错误信息已复制' : '复制失败，请手动选择文本');
    } else if (act === 'toggle-log') {
      if (st.expanded.has(id)) {
        st.expanded.delete(id);
        renderJobs();
      } else {
        st.expanded.add(id);
        renderJobs();
        await loadLog(id);
        const body = st.root.querySelector(`.log-body[data-log="${id}"]`);
        if (body) scrollLog(body);
      }
    } else if (act === 'pause-log') {
      if (st.paused.has(id)) st.paused.delete(id);
      else st.paused.add(id);
      renderJobs();
    } else if (act === 'copy-log') {
      const text = jobLog(id)
        .map((l) => `[${l.t}] ${l.text}`)
        .join('\n');
      const ok = await copyText(text || '（暂无日志）');
      toast(ok ? 'ok' : 'warn', ok ? '日志已复制' : '复制失败');
    }
  } catch (e) {
    toast('error', `操作失败：${e.message}`);
  }
}

/* --------------------------------------------------------------------------
   挂载
   -------------------------------------------------------------------------- */
export default {
  id: 'extract',
  label: '解包',
  icon: 'extract',
  title: '解包',
  subtitle: '把 .pkg 拆成素材',

  async mount(root, ctx) {
    st.root = root;
    st.files = [];
    st.options = { ...DEFAULT_OPTIONS };
    st.expanded = new Set();
    st.paused = new Set();
    st.logs = new Map();
    st.starting = false;
    st.output = (S.settings && S.settings.default_output) || '';

    root.innerHTML = template();

    const outInput = $('#out-dir', root);
    if (outInput) outInput.value = st.output;
    renderOutHint();
    renderFiles();
    updateAll();

    /* 路由带入的参数 */
    const p = ctx.params || {};
    if (p.path) addPath(p.path);
    if (p.batch) {
      try {
        const arr = JSON.parse(decodeURIComponent(p.batch));
        if (Array.isArray(arr)) arr.forEach((x) => addPath(x));
      } catch (e) {
        /* 忽略坏参数 */
      }
    }
    if (p.output) {
      st.output = p.output;
      if (outInput) outInput.value = p.output;
      renderOutHint();
    }

    /* 拖放 */
    const dz = $('#dz', root);
    let dragDepth = 0;
    const onDragOver = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };
    const onDragEnter = (e) => {
      e.preventDefault();
      dragDepth += 1;
      dz.classList.add('is-over');
    };
    const onDragLeave = () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) dz.classList.remove('is-over');
    };
    const onDrop = async (e) => {
      e.preventDefault();
      dragDepth = 0;
      dz.classList.remove('is-over');
      const dt = e.dataTransfer;
      if (!dt) return;
      const entries = Array.from(dt.items || [])
        .map((it) => {
          try {
            return it.webkitGetAsEntry && it.webkitGetAsEntry();
          } catch (err) {
            return null;
          }
        })
        .filter(Boolean);
      if (entries.some((ent) => ent.isDirectory)) {
        toast('warn', '文件夹请用「选择文件夹」按钮喵~');
        return;
      }
      const files = Array.from(dt.files || []);
      if (!files.length) return;
      const pkgs = files.filter((f) => /\.pkg$/i.test(f.name));
      if (!pkgs.length) {
        toast('error', '拖进来的不是 .pkg 文件');
        return;
      }
      if (pkgs.length < files.length) toast('warn', `已忽略 ${files.length - pkgs.length} 个非 .pkg 文件`);
      for (const f of pkgs) {
        try {
          const r = await api.upload(f);
          if (r && r.path) addPath(r.path, f.size, false, f.name);
        } catch (err) {
          toast('error', `「${f.name}」上传失败：${err.message}`);
        }
      }
    };
    dz.addEventListener('dragover', onDragOver);
    dz.addEventListener('dragenter', onDragEnter);
    dz.addEventListener('dragleave', onDragLeave);
    dz.addEventListener('drop', onDrop);
    dz.addEventListener('dragend', () => dz.classList.remove('is-over'));

    const preventWindowDrop = (e) => {
      e.preventDefault();
    };
    window.addEventListener('dragover', preventWindowDrop);
    window.addEventListener('drop', preventWindowDrop);

    dz.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      pickFiles();
    });
    dz.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pickFiles();
      }
    });

    /* 事件委托 */
    unsubs.push(
      delegate(root, '[data-act]', 'click', async (e, node) => {
        e.preventDefault();
        const act = node.dataset.act;
        if (act === 'pick') return pickFiles();
        if (act === 'pick-folder') return pickFolder();
        if (act === 'pick-out') return pickOutput();
        if (act === 'open-out') {
          const dir = st.output.trim() || (S.settings && S.settings.default_output);
          if (!dir) return toast('warn', '还没有输出目录');
          try {
            await api.reveal(dir);
          } catch (err) {
            toast('error', `打开失败：${err.message}`);
          }
          return;
        }
        if (act === 'open-default') {
          const dir = (S.settings && S.settings.default_output) || '';
          if (!dir) return toast('warn', '还没有设置默认输出目录');
          try {
            await api.open(dir);
          } catch (err) {
            toast('error', `打开失败：${err.message}`);
          }
          return;
        }
        if (act === 'use-default') {
          st.output = (S.settings && S.settings.default_output) || '';
          const input = $('#out-dir', root);
          if (input) input.value = st.output;
          renderOutHint();
          return;
        }
        if (act === 'clear-files') {
          if (!st.files.length) return;
          st.files = [];
          renderFiles();
          updateQueueHint();
          return;
        }
        if (act === 'remove-file') {
          const i = Number(node.dataset.index);
          if (Number.isInteger(i)) {
            st.files.splice(i, 1);
            renderFiles();
            updateQueueHint();
          }
          return;
        }
        if (act === 'clear-done') {
          try {
            await api.clearJobs(null);
            await refreshJobs();
          } catch (err) {
            toast('error', `清理失败：${err.message}`);
          }
          return;
        }
        if (
          act === 'cancel' ||
          act === 'remove' ||
          act === 'showout' ||
          act === 'gallery' ||
          act === 'copyerr' ||
          act === 'toggle-log' ||
          act === 'pause-log' ||
          act === 'copy-log'
        ) {
          return jobAction(act, node.dataset.id, node);
        }
      })
    );

    /* 最近记录 */
    unsubs.push(
      delegate(root, '[data-recent]', 'click', (e, node) => {
        const i = Number(node.dataset.recent);
        const item = (S.recent || [])[i];
        if (!item) return;
        addPath(item.path, item.size, /\.pkg$/i.test(item.path) ? false : true);
      })
    );

    /* 输出目录输入 */
    if (outInput) {
      outInput.addEventListener('input', () => {
        st.output = outInput.value;
        renderOutHint();
      });
    }

    /* 高级选项 */
    const adv = $('#adv', root);
    const advHead = $('#adv-head', root);
    const syncAdv = () => {
      adv.dataset.open = st.advancedOpen ? 'true' : 'false';
      advHead.setAttribute('aria-expanded', st.advancedOpen ? 'true' : 'false');
    };
    syncAdv();
    if (advHead) {
      advHead.addEventListener('click', () => {
        st.advancedOpen = !st.advancedOpen;
        syncAdv();
      });
    }

    const optInputs = $$('[data-opt]', root);
    optInputs.forEach((input) => {
      input.checked = !!st.options[input.dataset.opt];
      input.addEventListener('change', () => {
        st.options[input.dataset.opt] = input.checked;
        updateAdvBadge();
      });
    });
    const onlyExts = $('#only-exts', root);
    const ignoreExts = $('#ignore-exts', root);
    if (onlyExts) {
      onlyExts.value = st.options.only_exts;
      onlyExts.addEventListener('input', () => {
        st.options.only_exts = onlyExts.value;
        updateAdvBadge();
      });
    }
    if (ignoreExts) {
      ignoreExts.value = st.options.ignore_exts;
      ignoreExts.addEventListener('input', () => {
        st.options.ignore_exts = ignoreExts.value;
        updateAdvBadge();
      });
    }
    const updateAdvBadge = () => {
      const badge = $('#adv-badge', root);
      if (!badge) return;
      const changed =
        !!st.options.only_exts ||
        !!st.options.ignore_exts ||
        st.options.single_dir ||
        !st.options.recursive ||
        !st.options.copy_project ||
        st.options.use_name ||
        st.options.no_tex_convert ||
        st.options.overwrite;
      badge.textContent = changed ? '已修改' : '默认';
      badge.className = changed ? 'badge badge-running' : 'badge';
    };
    updateAdvBadge();

    /* 开始按钮 */
    const startBtn = $('#start', root);
    if (startBtn) startBtn.addEventListener('click', startExtract);

    /* 快捷键：Ctrl+O 时触发选择文件 */
    const onPickShortcut = () => pickFiles();
    window.addEventListener('nekorepkg:pick', onPickShortcut);

    /* store 订阅 */
    const statusSeen = new Map();
    S.jobs.forEach((job) => statusSeen.set(job.id, job.status));

    const checkCompletions = () => {
      for (const job of S.jobs) {
        if (job.kind !== 'extract' && job.kind !== 'tex') {
          statusSeen.set(job.id, job.status);
          continue;
        }
        const prev = statusSeen.get(job.id);
        if (prev && prev !== job.status && job.status === 'done') {
          const n = (job.result && job.result.files) || (job.progress && job.progress.total) || 0;
          const outDir = (job.result && job.result.output_dir) || job.output_dir;
          toast('ok', `解包完成，共 ${fmtNum(n)} 个文件`, {
            duration: 10000,
            actions: [
              {
                label: '打开目录',
                onClick: async () => {
                  try {
                    await api.openOutput(job.id);
                  } catch (e) {
                    toast('error', `打开失败：${e.message}`);
                  }
                },
              },
              {
                label: '去画廊',
                onClick: () => {
                  location.hash = `#/gallery?dir=${encodeURIComponent(outDir || '')}`;
                },
              },
            ],
          });
        }
        statusSeen.set(job.id, job.status);
      }
    };

    unsubs.push(
      on('jobs', () => {
        renderJobs();
        checkCompletions();
      })
    );
    unsubs.push(
      on('log', (ev) => {
        if (!ev || !ev.job_id) return;
        const buf = st.logs.get(ev.job_id);
        if (!buf) return;
        let added = false;
        for (const line of ev.lines || []) {
          if (!buf.some((x) => x.i === line.i)) {
            buf.push(line);
            added = true;
          }
        }
        if (!added) return;
        const body = st.root.querySelector(`.log-body[data-log="${ev.job_id}"]`);
        if (body) {
          const stick = !st.paused.has(ev.job_id);
          body.insertAdjacentHTML('beforeend', `${(ev.lines || []).map((l) =>
            `<div class="log-line" data-level="${esc(l.level || 'info')}"><span class="t">${esc(l.t || '')}</span><span class="txt">${esc(
              l.text || ''
            )}</span></div>`
          ).join('')}`);
          while (body.querySelectorAll('.log-line').length > 400) body.firstElementChild.remove();
          if (stick) body.scrollTop = body.scrollHeight;
        }
      })
    );
    unsubs.push(
      on('state', () => {
        renderRecent();
        updateQueueHint();
      })
    );

    updateQueueHint();

    return () => {
      st.root = null;
      window.removeEventListener('dragover', preventWindowDrop);
      window.removeEventListener('drop', preventWindowDrop);
      window.removeEventListener('nekorepkg:pick', onPickShortcut);
      while (unsubs.length) {
        const fn = unsubs.pop();
        try {
          fn();
        } catch (e) {
          /* ignore */
        }
      }
    };
  },
};
