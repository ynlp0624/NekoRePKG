/* ==========================================================================
   pages/settings.js —— 设置
   ========================================================================== */

import { api, IS_MOCK } from '../api.js';
import { S, on, setTheme, saveSettings } from '../store.js';
import {
  $,
  $$,
  on as delegate,
  icon,
  toast,
  fmtBytes,
  fmtNum,
  fmtTime,
  confirmDialog,
  openModal,
  setLoading,
  esc,
} from '../ui.js';

const st = {
  root: null,
  busy: false,
};

const unsubs = [];

/** 注册事件并在卸载时移除（#view 跨页面复用） */
function listen(target, type, fn, opts) {
  target.addEventListener(type, fn, opts);
  unsubs.push(() => target.removeEventListener(type, fn, opts));
}

function template() {
  const s = S.settings || {};
  const r = S.repkg || {};
  const app = S.app || {};
  const custom = !!s.repkg_path;

  return `<div class="page">
    <div class="page-head">
      <div>
        <h1>设置</h1>
        <p class="page-sub">主题、内核路径与默认输出都会自动保存。</p>
      </div>
      <div class="page-actions">
        <span class="text-xs muted">配置文件：<span class="mono">${esc(app.config_path || '—')}</span></span>
      </div>
    </div>

    <div class="settings-grid">
      <section class="card">
        <div class="card-head">
          <div class="card-head-l">
            <div class="card-title">${icon('sparkle', 17)}外观</div>
            <div class="card-desc">切换后立即生效，也会记住你的选择</div>
          </div>
        </div>
        <div class="theme-cards">
          <button class="theme-card ${S.theme === 'moe' ? 'is-active' : ''}" data-theme-pick="moe" type="button" aria-pressed="${S.theme === 'moe'}">
            <span class="theme-preview" data-tp="moe">
              <span class="tp-side"></span>
              <span class="tp-main">
                <span class="tp-bar"></span>
                <span class="tp-row"><span class="tp-blk"></span><span class="tp-blk is-accent"></span></span>
                <span class="tp-row"><span class="tp-blk is-soft"></span><span class="tp-blk"></span></span>
              </span>
            </span>
            <span class="theme-name">萌系（moe）<span class="theme-tick">${icon('check', 11)}</span></span>
            <span class="theme-desc">猫耳、圆角与一点粉色</span>
          </button>
          <button class="theme-card ${S.theme === 'pro' ? 'is-active' : ''}" data-theme-pick="pro" type="button" aria-pressed="${S.theme === 'pro'}">
            <span class="theme-preview" data-tp="pro">
              <span class="tp-side"></span>
              <span class="tp-main">
                <span class="tp-bar"></span>
                <span class="tp-row"><span class="tp-blk"></span><span class="tp-blk is-accent"></span></span>
                <span class="tp-row"><span class="tp-blk is-soft"></span><span class="tp-blk"></span></span>
              </span>
            </span>
            <span class="theme-name">简洁（pro）<span class="theme-tick">${icon('check', 11)}</span></span>
            <span class="theme-desc">冷静的深色工作台</span>
          </button>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div class="card-head-l">
            <div class="card-title">${icon('cpu', 17)}RePKG 内核</div>
            <div class="card-desc">解包 / 贴图转换依赖它，通常用内置的就够了</div>
          </div>
          <div class="card-actions">
            <span class="badge ${r.ok ? 'badge-ok' : 'badge-error'}" id="repkg-state">${r.ok ? '可用' : '不可用'}</span>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="repkg-path">RePKG.exe 路径</label>
          <div class="row" style="gap:6px">
            <input class="input is-mono" id="repkg-path" type="text" spellcheck="false" value="${esc(r.path || '')}" placeholder="选择或自动检测 RePKG.exe" />
            <button class="btn btn-ghost" data-act="repkg-browse" type="button">浏览…</button>
            <button class="btn btn-soft" data-act="repkg-auto" type="button">${icon('refresh', 14)}自动检测</button>
          </div>
          <div class="row" style="gap:8px;margin-top:2px">
            <span class="text-xs muted">版本 <b class="mono">${esc(r.version || '未知')}</b></span>
            <span class="text-xs muted">·</span>
            <span class="text-xs muted">来源 <b>${custom ? '自定义' : '内置'}</b></span>
          </div>
          ${
            r.ok
              ? ''
              : `<div class="notice is-err" style="margin-top:var(--s3)">${icon('alert-circle', 16)}<div>未找到 RePKG.exe，请重新指定；否则无法解包贴图。</div></div>`
          }
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div class="card-head-l">
            <div class="card-title">${icon('save', 17)}输出与队列</div>
            <div class="card-desc">解包 / 打包的默认去处</div>
          </div>
        </div>

        <div class="stack-form">
          <div class="field">
            <label class="field-label" for="default-out">默认输出目录</label>
            <div class="row" style="gap:6px">
              <input class="input is-mono" id="default-out" type="text" spellcheck="false" value="${esc(s.default_output || '')}" placeholder="例如 E:\repkg\output" />
              <button class="btn btn-ghost" data-act="out-pick" type="button">选择…</button>
              <button class="btn btn-ghost btn-icon" data-act="out-open" type="button" title="打开目录" aria-label="打开目录">${icon('external', 16)}</button>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-label">
              <b>并发任务数</b>
              <span>同时跑几个解包 / 打包任务（1–4）</span>
            </div>
            <div class="segmented" id="conc">
              ${[1, 2, 3, 4]
                .map(
                  (n) =>
                    `<button type="button" data-conc="${n}" class="${(s.concurrency || 2) === n ? 'is-active' : ''}">${n}</button>`
                )
                .join('')}
            </div>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div class="card-head-l">
            <div class="card-title">${icon('activity', 17)}行为</div>
            <div class="card-desc">让工具更贴合你的习惯</div>
          </div>
        </div>

        <div class="setting-row">
          <label class="switch">
            <input type="checkbox" id="opt-open" ${s.open_after_extract ? 'checked' : ''} />
            <span class="switch-track"></span>
            <span class="switch-txt">
              <b>完成后自动打开输出目录</b>
              <span>解包结束时弹出资源管理器</span>
            </span>
          </label>
        </div>
        <div class="setting-row">
          <label class="switch">
            <input type="checkbox" id="opt-sound" ${s.sound_after_extract ? 'checked' : ''} />
            <span class="switch-track"></span>
            <span class="switch-txt">
              <b>完成后播放提示音</b>
              <span>长任务挂机时提醒你一声</span>
            </span>
          </label>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div class="card-head-l">
            <div class="card-title">${icon('hard-drive', 17)}数据</div>
            <div class="card-desc">配置、日志与缓存</div>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-label"><b>配置与日志</b><span>排查问题时会用到</span></div>
          <div class="row" style="gap:6px">
            <button class="btn btn-sm btn-ghost" data-act="open-config" type="button">${icon('folder', 13)}配置目录</button>
            <button class="btn btn-sm btn-ghost" data-act="open-logs" type="button">${icon('folder', 13)}日志目录</button>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-label"><b>最近记录</b><span id="recent-count">${fmtNum((S.recent || []).length)} 条</span></div>
          <button class="btn btn-sm btn-danger" data-act="clear-recent" type="button">${icon('trash', 13)}清空最近记录</button>
        </div>

        <div class="setting-row">
          <div class="setting-label"><b>缩略图缓存</b><span>画廊与工坊的缩略图</span></div>
          <div class="row" style="gap:6px">
            <span class="badge" title="缓存占用由后端统计，清理会删除全部缩略图">—</span>
            <button class="btn btn-sm btn-ghost" data-act="clear-thumbs" type="button">${icon('trash', 13)}清理缓存</button>
          </div>
        </div>
      </section>

      <section class="card settings-span">
        <div class="card-head">
          <div class="card-head-l">
            <div class="card-title">${icon('info', 17)}关于</div>
          </div>
          <div class="card-actions">
            ${IS_MOCK ? '<span class="badge badge-warn">演示模式</span>' : ''}
          </div>
        </div>

        <div class="about-wrap">
          <div>
            <div class="about-brand">
              <img src="assets/logo.svg" alt="" />
              <div class="about-brand-txt">
                <b>NekoRePKG · 猫羽解包器</b>
                <span>面向不会命令行的 Wallpaper Engine 用户的 pkg 工具</span>
              </div>
            </div>

            <div class="about-list">
              <div class="about-row"><span class="k">版本</span><span class="mono">${esc(app.version || '1.0.0')}</span></div>
              <div class="about-row"><span class="k">内核</span><span>RePKG ${esc(r.version || '0.4.0')} · by NotScuffed（MIT）</span></div>
              <div class="about-row"><span class="k">运行平台</span><span>Windows · pywebview + WebView2</span></div>
              <div class="about-row">
                <span class="k">第三方许可</span>
                <button class="btn btn-link" data-act="licenses" type="button">查看 THIRD-PARTY-NOTICES.txt</button>
              </div>
              <div class="about-row">
                <span class="k">当前时间</span><span class="mono">${esc(fmtTime(new Date()))}</span>
              </div>
            </div>
          </div>
          <img class="about-mascot" src="assets/mascot.svg" alt="" draggable="false" />
        </div>
      </section>
    </div>
  </div>`;
}

function syncThemeCards() {
  if (!st.root) return;
  $$('[data-theme-pick]', st.root).forEach((btn) => {
    const on_ = btn.dataset.themePick === S.theme;
    btn.classList.toggle('is-active', on_);
    btn.setAttribute('aria-pressed', on_ ? 'true' : 'false');
  });
}

function syncRepkg() {
  if (!st.root) return;
  const r = S.repkg || {};
  const input = $('#repkg-path', st.root);
  if (input && document.activeElement !== input) input.value = r.path || '';
  const badge = $('#repkg-state', st.root);
  if (badge) {
    badge.className = `badge ${r.ok ? 'badge-ok' : 'badge-error'}`;
    badge.textContent = r.ok ? '可用' : '不可用';
  }
}

async function applyRepkg(path) {
  if (!path) return;
  try {
    const res = await api.setRepkg(path);
    toast('ok', `已切换 RePKG：${(res.repkg && res.repkg.version) || ''}`);
  } catch (e) {
    toast('error', e.message);
    syncRepkg();
  }
}

export default {
  id: 'settings',
  label: '设置',
  icon: 'settings',
  title: '设置',
  subtitle: '主题、内核与输出',

  async mount(root) {
    st.root = root;
    root.innerHTML = template();

    /* 主题卡片 */
    listen(root, 'click', (e) => {
      const btn = e.target.closest('[data-theme-pick]');
      if (!btn) return;
      setTheme(btn.dataset.themePick);
      setTimeout(syncThemeCards, 0);
    });

    /* RePKG 路径 */
    const repkgInput = $('#repkg-path', root);
    if (repkgInput) {
      repkgInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyRepkg(repkgInput.value.trim());
        }
      });
      repkgInput.addEventListener('change', () => applyRepkg(repkgInput.value.trim()));
    }

    /* 默认输出 */
    const outInput = $('#default-out', root);
    if (outInput) {
      const commit = async () => {
        const v = outInput.value.trim();
        if (v === (S.settings.default_output || '')) return;
        const ok = await saveSettings({ default_output: v });
        if (ok) toast('ok', '默认输出目录已保存');
      };
      outInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      });
      outInput.addEventListener('change', commit);
    }

    /* 行为开关 */
    const openOpt = $('#opt-open', root);
    if (openOpt) {
      openOpt.addEventListener('change', async () => {
        const ok = await saveSettings({ open_after_extract: openOpt.checked });
        if (ok) toast('ok', openOpt.checked ? '完成后会自动打开目录' : '已关闭自动打开目录');
      });
    }
    const soundOpt = $('#opt-sound', root);
    if (soundOpt) {
      soundOpt.addEventListener('change', async () => {
        const ok = await saveSettings({ sound_after_extract: soundOpt.checked });
        if (ok) toast('ok', soundOpt.checked ? '完成后会响一声' : '已关闭提示音');
      });
    }

    /* 并发 */
    const conc = $('#conc', root);
    if (conc) {
      conc.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-conc]');
        if (!btn) return;
        const n = Number(btn.dataset.conc);
        conc.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b === btn));
        const ok = await saveSettings({ concurrency: n });
        if (ok) toast('ok', `并发任务数已设为 ${n}`);
      });
    }

    /* 按钮动作 */
    unsubs.push(
      delegate(root, '[data-act]', 'click', async (e, node) => {
        const act = node.dataset.act;
        e.preventDefault();
        if (act === 'repkg-browse') {
          try {
            const res = await api.pick('pkg', { title: '选择 RePKG.exe' });
            if (res && res.path) {
              const input = $('#repkg-path', root);
              if (input) input.value = res.path;
              await applyRepkg(res.path);
            }
          } catch (err) {
            toast('error', `选择失败：${err.message}`);
          }
          return;
        }
        if (act === 'repkg-auto') {
          setLoading(node, true);
          try {
            const res = await api.autodetect();
            const input = $('#repkg-path', root);
            if (input && res.repkg) input.value = res.repkg.path || '';
            toast('ok', `已找到 RePKG ${(res.repkg && res.repkg.version) || ''}`);
            syncRepkg();
          } catch (err) {
            toast('error', `自动检测失败：${err.message}`);
          } finally {
            setLoading(node, false);
          }
          return;
        }
        if (act === 'out-pick') {
          try {
            const res = await api.pick('folder', { title: '选择默认输出目录', default_dir: S.settings.default_output || '' });
            if (res && res.path) {
              const input = $('#default-out', root);
              if (input) input.value = res.path;
              const ok = await saveSettings({ default_output: res.path });
              if (ok) toast('ok', '默认输出目录已保存');
            }
          } catch (err) {
            toast('error', `选择失败：${err.message}`);
          }
          return;
        }
        if (act === 'out-open') {
          const dir = (S.settings && S.settings.default_output) || '';
          if (!dir) return toast('warn', '还没有设置默认输出目录');
          try {
            await api.open(dir);
          } catch (err) {
            toast('error', `打开失败：${err.message}`);
          }
          return;
        }
        if (act === 'open-config' || act === 'open-logs') {
          const app = S.app || {};
          const target = act === 'open-config' ? (app.config_path || '').replace(/[\\/][^\\/]+$/, '') : app.log_dir || '';
          if (!target) return toast('warn', '路径未知');
          try {
            await api.open(target);
          } catch (err) {
            toast('error', `打开失败：${err.message}`);
          }
          return;
        }
        if (act === 'clear-recent') {
          const ok = await confirmDialog({
            title: '清空最近记录',
            text: '会清掉最近打开/解包的记录列表，不影响已经解包出来的文件。',
            okText: '清空',
            danger: true,
          });
          if (!ok) return;
          try {
            await api.clearData('recent');
            toast('ok', '最近记录已清空');
          } catch (err) {
            toast('error', `清空失败：${err.message}`);
          }
          return;
        }
        if (act === 'clear-thumbs') {
          const ok = await confirmDialog({
            title: '清理缩略图缓存',
            text: '删除缓存的缩略图，下次打开画廊/工坊会重新生成。',
            okText: '清理',
            danger: true,
          });
          if (!ok) return;
          try {
            await api.clearData('thumbs');
            toast('ok', '缩略图缓存已清理');
          } catch (err) {
            toast('error', `清理失败：${err.message}`);
          }
          return;
        }
        if (act === 'licenses') {
          try {
            await api.open('THIRD-PARTY-NOTICES.txt');
          } catch (err) {
            openModal({
              title: '第三方许可',
              body: `<div class="notice">${icon('info', 16)}<div>第三方许可文件位于程序目录：<span class="mono">THIRD-PARTY-NOTICES.txt</span>。</div></div>
                <p style="margin-top:12px">核心解包能力来自 <b>RePKG 0.4.0</b>（作者 NotScuffed，MIT 许可）；界面与打包实现为 NekoRePKG 自有代码。</p>`,
              actions: [{ label: '知道了', primary: true }],
            });
          }
          return;
        }
      })
    );

    unsubs.push(
      on('state', () => {
        syncRepkg();
        syncThemeCards();
        const rc = $('#recent-count', st.root);
        if (rc) rc.textContent = `${fmtNum((S.recent || []).length)} 条`;
      })
    );
    unsubs.push(on('theme', syncThemeCards));

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
