/* ==========================================================================
   pages/pack.js —— 打包（回封 .pkg）
   ========================================================================== */

import { api } from '../api.js';
import { S, on, refreshJobs } from '../store.js';
import {
  $,
  el,
  on as delegate,
  icon,
  toast,
  fmtBytes,
  fmtNum,
  fmtElapsed,
  fmtPercent,
  midEllipsis,
  baseName,
  statusBadge,
  emptyState,
  setLoading,
  copyText,
  esc,
} from '../ui.js';

const DEFAULT_EXCLUDE = 'project.json, preview.jpg, preview.png, *.tex-json';
const MAGICS = ['PKGV0021', 'PKGV0020', 'PKGV0019'];

const st = {
  source: '',
  output: '',
  exclude: DEFAULT_EXCLUDE,
  magic: 'PKGV0021',
  verify: true,
  excludeConverted: true,
  starting: false,
  expanded: false,
  root: null,
  logs: new Map(),
};

const unsubs = [];

function template() {
  return `
  <div class="page page--compact">
    <div class="page-head">
      <div>
        <h1>打包</h1>
        <p class="page-sub">把素材文件夹重新封成 <span class="mono">.pkg</span>，用于替换 scene.json 或素材。</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost btn-sm" data-act="open-src" type="button">${icon('folder', 15)}打开源文件夹</button>
      </div>
    </div>

    <div class="split">
      <div class="col">
        <section class="card">
          <div class="card-head">
            <div class="card-head-l">
              <div class="card-title">${icon('folder', 17)}源文件夹</div>
              <div class="card-desc">通常就是解包出来的那个目录</div>
            </div>
          </div>

          <div class="dropzone is-compact" id="pd-z" role="button" tabindex="0" aria-label="选择要打包的文件夹">
            <div class="dz-icon">${icon('folder-search', 22)}</div>
            <div class="dz-text">
              <div class="dz-title">拖入文件夹 / 或点击选择</div>
              <div class="dz-hint">浏览器拖放拿不到文件夹本身，推荐点右侧按钮</div>
            </div>
            <div class="dz-foot">
              <button class="btn btn-soft btn-sm" data-act="pick-src" type="button">${icon('plus', 14)}选择文件夹</button>
            </div>
          </div>

          <div class="row" style="margin-top:var(--s3);gap:6px">
            <input class="input is-mono" id="src-dir" type="text" placeholder="例如 E:\repkg\output\星海少女" spellcheck="false" />
            <button class="btn btn-ghost btn-icon" data-act="open-src" type="button" title="打开源文件夹" aria-label="打开源文件夹">${icon('external', 16)}</button>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-head-l">
              <div class="card-title">${icon('save', 17)}输出 .pkg</div>
              <div class="card-desc">默认与源文件夹同名，保存在默认输出目录</div>
            </div>
          </div>

          <div class="stack-form">
            <div class="field">
              <label class="field-label" for="out-pkg">目标文件</label>
              <div class="row" style="gap:6px">
                <input class="input is-mono" id="out-pkg" type="text" placeholder="例如 E:\repkg\output\scene_new.pkg" spellcheck="false" />
                <button class="btn btn-ghost" data-act="save-as" type="button">另存为…</button>
              </div>
            </div>

            <div class="field">
              <label class="field-label" for="exclude">排除规则</label>
              <input class="input is-mono" id="exclude" type="text" spellcheck="false" value="${esc(DEFAULT_EXCLUDE)}" />
              <span class="field-hint">逗号分隔，支持通配符 <span class="mono">*</span>，默认跳过 project.json 与预览图</span>
            </div>

            <div class="field">
              <span class="field-label">转换出来的贴图</span>
              <label class="switch">
                <input type="checkbox" id="exclude-converted" checked />
                <span class="switch-track"></span>
                <span class="switch-txt"><b>排除转换出的 PNG</b><span>同目录存在同名 <span class="mono">.tex</span> 时，跳过解包生成的图片</span></span>
              </label>
            </div>

            <div class="form-row">
              <div class="field">
                <label class="field-label" for="magic">魔数（magic）</label>
                <input class="input is-mono" id="magic" type="text" list="magic-list" spellcheck="false" value="${esc(MAGICS[0])}" />
                <datalist id="magic-list">${MAGICS.map((m) => `<option value="${m}"></option>`).join('')}</datalist>
              </div>
              <div class="field">
                <span class="field-label">打包后校验</span>
                <label class="switch">
                  <input type="checkbox" id="verify" checked />
                  <span class="switch-track"></span>
                  <span class="switch-txt"><b>开启</b><span>再解一遍对比条目数</span></span>
                </label>
              </div>
            </div>
          </div>
        </section>

        <div class="row row-wrap" style="gap:10px">
          <button class="btn btn-primary btn-lg" id="pack-start" type="button">${icon('pack', 16)}开始打包</button>
          <span class="queue-hint" id="pack-hint"></span>
          <span class="spacer"></span>
          <span class="text-xs muted">打包在后台队列里执行，可以先去别的页面</span>
        </div>
      </div>

      <aside class="col">
        <section class="card" id="pack-result">
          <div class="card-head">
            <div class="card-head-l">
              <div class="card-title">${icon('shield', 17)}打包结果</div>
              <div class="card-desc">最近一次回封的质量校验</div>
            </div>
          </div>
          <div id="pack-result-body"></div>
        </section>

        <section class="card">
          <div class="card-head">
            <div class="card-head-l">
              <div class="card-title">${icon('alert-triangle', 17)}打包前须知</div>
            </div>
          </div>
          <div class="notice">
            ${icon('alert-triangle', 17)}
            <div>
              <b>回封的 pkg 只适合替换 <span class="mono">scene.json</span> / 素材。</b>
              贴图不要指望从 png 转回 tex —— 引擎读取的是 RePKG 解出来的 png，回封时贴图质量不会还原。
            </div>
          </div>
          <div class="col" style="gap:8px;margin-top:var(--s3)">
            <div class="text-sm dim">· 源文件夹里最好保留 <span class="mono">scene.json</span>，否则壁纸加载会失败。</div>
            <div class="text-sm dim">· 解包生成的 PNG 默认不参与回封（同目录有同名 <span class="mono">.tex</span> 时自动跳过，可在上方关闭）。</div>
            <div class="text-sm dim">· 想验证效果：打包完成后用「解包」把新 pkg 拆出来对比。</div>
            <div class="text-sm dim">· 打包与解包共用同一个并发队列。</div>
          </div>
        </section>
      </aside>
    </div>
  </div>`;
}

/* --------------------------------------------------------------------------
   结果面板
   -------------------------------------------------------------------------- */
function packJobs() {
  return S.jobs.filter((j) => j.kind === 'pack');
}

function resultBody() {
  const jobs = packJobs();
  const job = jobs[0];
  if (!job) {
    return emptyState({
      inline: true,
      title: '还没有打包任务喵~',
      text: '选好源文件夹后点「开始打包」。',
    });
  }

  const pct = job.progress && job.progress.percent != null ? job.progress.percent : 0;
  const verify = job.result && job.result.verify;
  const verifyBadge = verify
    ? `<span class="badge ${verify.ok ? 'badge-ok' : 'badge-warn'}">${icon(verify.ok ? 'check' : 'alert-triangle', 11)}${verify.ok ? '校验通过' : '校验有差异'}</span>`
    : '';

  if (job.status === 'running' || job.status === 'queued') {
    return `<div class="result-card">
      <div class="result-head">
        <span class="result-title">${esc(job.title)}</span>
        ${statusBadge(job.status)}
        <span class="spacer"></span>
        <span class="job-pct">${pct.toFixed(1)}%</span>
      </div>
      <div class="progress"><div class="progress-bar" style="width:${Math.max(2, pct)}%"></div></div>
      <div class="job-phase">${esc((job.progress && job.progress.phase) || '准备中…')}</div>
      <div class="job-meta"><span>${fmtNum((job.progress && job.progress.done) || 0)}/${fmtNum(
      (job.progress && job.progress.total) || 0
    )}</span><span class="dot">·</span><span>${fmtElapsed(job.elapsed || 0)}</span></div>
    </div>`;
  }

  if (job.status === 'error') {
    return `<div class="result-card">
      <div class="result-head"><span class="result-title">${esc(job.title)}</span>${statusBadge('error')}</div>
      <div class="notice is-err">${icon('alert-circle', 16)}<div>${esc(job.error || '打包失败')}</div></div>
      <div class="result-actions">
        <button class="btn btn-xs btn-ghost" data-act="pack-log" type="button">${icon('terminal', 12)}查看日志</button>
      </div>
    </div>`;
  }

  if (job.status === 'cancelled') {
    return `<div class="result-card">
      <div class="result-head"><span class="result-title">${esc(job.title)}</span>${statusBadge('cancelled')}</div>
      <div class="text-sm muted">任务已取消，已写出的文件保留。</div>
    </div>`;
  }

  const outPkg = (job.result && job.result.output_pkg) || st.output || '';
  return `<div class="result-card">
    <div class="result-head">
      <span class="result-title">${esc(job.title)}</span>
      ${statusBadge('done')}
      ${verifyBadge}
    </div>
    <div class="info-grid">
      <div class="info-item"><span class="info-k">条目数</span><span class="info-v num">${fmtNum(
        (job.result && job.result.files) || 0
      )}</span></div>
      <div class="info-item"><span class="info-k">总大小</span><span class="info-v num">${fmtBytes(
        (job.result && job.result.bytes) || 0
      )}</span></div>
      <div class="info-item"><span class="info-k">耗时</span><span class="info-v num">${fmtElapsed(job.elapsed || 0)}</span></div>
    </div>
    <div class="result-path" title="${esc(outPkg)}">${esc(midEllipsis(outPkg, 74))}</div>
    ${
      ((job.result && job.result.excluded_converted) || 0) > 0
        ? `<div class="text-sm muted">${icon('check', 12)} 已排除 ${fmtNum(job.result.excluded_converted)} 张由 <span class="mono">.tex</span> 转换出的图片（原始 .tex 保留）</div>`
        : ''
    }
    ${
      verify
        ? `<div class="notice ${verify.ok ? 'is-info' : ''}" style="padding:8px 10px">
             ${icon(verify.ok ? 'check' : 'alert-triangle', 15)}
             <div>${esc(verify.message || (verify.ok ? '条目数与总字节一致' : '条目数或总字节不一致'))}</div>
           </div>`
        : '<div class="text-sm muted">未执行校验（本次打包关闭了「打包后校验」）</div>'
    }
    <div class="result-actions">
      <button class="btn btn-sm btn-soft" data-act="open-pkg-dir" data-path="${esc(outPkg)}" type="button">${icon('folder', 13)}打开所在文件夹</button>
      <button class="btn btn-sm btn-ghost" data-act="copy-pkg-path" data-path="${esc(outPkg)}" type="button">${icon('copy', 13)}复制路径</button>
    </div>
  </div>`;
}

function renderResult() {
  const body = $('#pack-result-body', st.root);
  if (body) body.innerHTML = resultBody();
}

function updateHint() {
  const hint = $('#pack-hint', st.root);
  if (!hint) return;
  const active = S.jobs.filter((j) => j.kind === 'pack' && (j.status === 'running' || j.status === 'queued')).length;
  hint.innerHTML = active ? `${icon('cpu', 12)} 队列中还有 ${fmtNum(active)} 个打包任务` : '';
}

/* --------------------------------------------------------------------------
   动作
   -------------------------------------------------------------------------- */
function guessOutput(src) {
  if (!src) return '';
  const def = (S.settings && S.settings.default_output) || '';
  const name = baseName(src) || 'output';
  return `${def || ''}${def ? '\\' : ''}${name}.pkg`;
}

async function pickSource() {
  try {
    const res = await api.pick('folder', { title: '选择要打包的文件夹' });
    if (res && res.path) {
      st.source = res.path;
      const srcInput = $('#src-dir', st.root);
      if (srcInput) srcInput.value = st.source;
      if (!st.output.trim() || st.output.trim() === guessOutput(st.lastSource || '')) {
        st.output = guessOutput(st.source);
        const outInput = $('#out-pkg', st.root);
        if (outInput) outInput.value = st.output;
      }
      st.lastSource = st.source;
    }
  } catch (e) {
    toast('error', `选择文件夹失败：${e.message}`);
  }
}

async function saveAs() {
  try {
    const res = await api.pick('save', {
      title: '另存为 .pkg',
      default_dir: (S.settings && S.settings.default_output) || '',
      default_name: st.source ? `${baseName(st.source)}.pkg` : 'scene.pkg',
    });
    if (res && res.path) {
      st.output = res.path;
      const outInput = $('#out-pkg', st.root);
      if (outInput) outInput.value = st.output;
    }
  } catch (e) {
    toast('error', `选择保存位置失败：${e.message}`);
  }
}

async function startPack() {
  if (st.starting) return;
  if (!st.source.trim()) {
    toast('warn', '先选一个源文件夹喵~');
    const el2 = $('#src-dir', st.root);
    if (el2) el2.focus();
    return;
  }
  if (!st.output.trim() || !/\.pkg$/i.test(st.output.trim())) {
    toast('warn', '输出文件必须是 .pkg');
    const el2 = $('#out-pkg', st.root);
    if (el2) el2.focus();
    return;
  }
  const btn = $('#pack-start', st.root);
  st.starting = true;
  setLoading(btn, true);
  try {
    const exclude = st.exclude
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await api.pack({
      source_dir: st.source.trim(),
      output_pkg: st.output.trim(),
      options: {
        exclude,
        magic: st.magic.trim() || 'PKGV0021',
        verify: st.verify,
        exclude_converted_pngs: st.excludeConverted,
      },
    });
    if (res && res.job_id) {
      toast('ok', '已加入打包队列');
      await refreshJobs();
      renderResult();
    } else {
      toast('error', '打包任务创建失败');
    }
  } catch (e) {
    toast('error', `打包失败：${e.message}`);
  } finally {
    st.starting = false;
    setLoading(btn, false);
  }
}

/* --------------------------------------------------------------------------
   挂载
   -------------------------------------------------------------------------- */
export default {
  id: 'pack',
  label: '打包',
  icon: 'pack',
  title: '打包',
  subtitle: '把素材回封成 .pkg',

  async mount(root, ctx) {
    st.root = root;
    st.source = '';
    st.output = '';
    st.exclude = DEFAULT_EXCLUDE;
    st.magic = MAGICS[0];
    st.verify = true;
    st.excludeConverted = true;
    st.starting = false;
    st.lastSource = '';

    root.innerHTML = template();

    const srcInput = $('#src-dir', root);
    const outInput = $('#out-pkg', root);
    const excludeInput = $('#exclude', root);
    const magicInput = $('#magic', root);
    const verifyInput = $('#verify', root);
    const excludeConvertedInput = $('#exclude-converted', root);

    if (ctx.params && ctx.params.dir) {
      st.source = ctx.params.dir;
      if (srcInput) srcInput.value = st.source;
      st.output = guessOutput(st.source);
      if (outInput) outInput.value = st.output;
    }

    srcInput &&
      srcInput.addEventListener('input', () => {
        st.source = srcInput.value;
      });
    outInput &&
      outInput.addEventListener('input', () => {
        st.output = outInput.value;
      });
    excludeInput &&
      excludeInput.addEventListener('input', () => {
        st.exclude = excludeInput.value;
      });
    magicInput &&
      magicInput.addEventListener('input', () => {
        st.magic = magicInput.value;
      });
    verifyInput &&
      verifyInput.addEventListener('change', () => {
        st.verify = verifyInput.checked;
      });
    excludeConvertedInput &&
      excludeConvertedInput.addEventListener('change', () => {
        st.excludeConverted = excludeConvertedInput.checked;
      });

    const dz = $('#pd-z', root);
    if (dz) {
      dz.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        pickSource();
      });
      dz.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pickSource();
        }
      });
      dz.addEventListener('dragover', (e) => {
        e.preventDefault();
        dz.classList.add('is-over');
      });
      dz.addEventListener('dragleave', () => dz.classList.remove('is-over'));
      dz.addEventListener('drop', (e) => {
        e.preventDefault();
        dz.classList.remove('is-over');
        toast('warn', '拖放拿不到文件夹，请点「选择文件夹」喵~');
      });
    }

    const prevent = (e) => e.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);

    unsubs.push(
      delegate(root, '[data-act]', 'click', async (e, node) => {
        const act = node.dataset.act;
        if (act === 'pick-src') {
          e.preventDefault();
          return pickSource();
        }
        if (act === 'save-as') {
          e.preventDefault();
          return saveAs();
        }
        if (act === 'open-src') {
          e.preventDefault();
          if (!st.source) return toast('warn', '还没有选择源文件夹');
          try {
            await api.open(st.source);
          } catch (err) {
            toast('error', `打开失败：${err.message}`);
          }
          return;
        }
        if (act === 'open-pkg-dir') {
          e.preventDefault();
          const p = node.dataset.path;
          try {
            await api.reveal(p);
          } catch (err) {
            toast('error', `打开失败：${err.message}`);
          }
          return;
        }
        if (act === 'copy-pkg-path') {
          e.preventDefault();
          const ok = await copyText(node.dataset.path || '');
          toast(ok ? 'ok' : 'warn', ok ? '路径已复制' : '复制失败');
          return;
        }
        if (act === 'pack-log') {
          e.preventDefault();
          const job = packJobs()[0];
          if (!job) return;
          try {
            const res = await api.getJobLog(job.id, 0);
            const lines = (res && res.lines) || [];
            const text = lines.map((l) => `[${l.t}] ${l.text}`).join('\n');
            const ok = await copyText(text || '暂无日志');
            toast(ok ? 'ok' : 'warn', ok ? '日志已复制到剪贴板' : '复制失败');
          } catch (err) {
            toast('error', `读取日志失败：${err.message}`);
          }
          return;
        }
      })
    );

    const startBtn = $('#pack-start', root);
    if (startBtn) startBtn.addEventListener('click', startPack);

    const statusSeen = new Map();
    S.jobs.forEach((job) => statusSeen.set(job.id, job.status));

    const checkPackDone = () => {
      for (const job of S.jobs) {
        if (job.kind !== 'pack') continue;
        const prev = statusSeen.get(job.id);
        if (prev && prev !== job.status && job.status === 'done') {
          const outPkg = (job.result && job.result.output_pkg) || '';
          const verifyOk = !(job.result && job.result.verify) || job.result.verify.ok !== false;
          toast(verifyOk ? 'ok' : 'warn', `打包完成：${job.title}${verifyOk ? '' : '（校验有差异）'}`, {
            duration: 9000,
            actions: outPkg
              ? [
                  {
                    label: '打开所在文件夹',
                    onClick: async () => {
                      try {
                        await api.reveal(outPkg);
                      } catch (e) {
                        toast('error', `打开失败：${e.message}`);
                      }
                    },
                  },
                ]
              : [],
          });
        }
        statusSeen.set(job.id, job.status);
      }
    };

    unsubs.push(
      on('jobs', () => {
        renderResult();
        updateHint();
        checkPackDone();
      })
    );

    renderResult();
    updateHint();

    return () => {
      st.root = null;
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
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
