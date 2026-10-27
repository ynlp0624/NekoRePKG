/* ==========================================================================
   pages/gallery.js —— 画廊 + 灯箱
   ========================================================================== */

import { api } from '../api.js';
import { S, on } from '../store.js';
import {
  $,
  on as delegate,
  el,
  icon,
  toast,
  fmtBytes,
  fmtNum,
  midEllipsis,
  baseName,
  dirName,
  emptyState,
  pushLayer,
  skeletonCards,
  esc,
} from '../ui.js';

const st = {
  dir: '',
  images: [],
  total: 0,
  loading: false,
  error: '',
  sort: 'name',
  thumb: 176,
  root: null,
  closeLightbox: null,
};

const unsubs = [];

/** 注册事件并在卸载时自动移除（root / window 会跨页面复用，必须清理） */
function listen(target, type, fn, opts) {
  target.addEventListener(type, fn, opts);
  unsubs.push(() => target.removeEventListener(type, fn, opts));
}

function shell() {
  return `<div class="page">
    <div class="page-head">
      <div>
        <h1>画廊</h1>
        <p class="page-sub">解包出来的图片都在这里，点开可以放大看细节。</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost btn-sm" data-act="pick-dir" type="button">${icon('folder-search', 15)}选择文件夹</button>
        <button class="btn btn-ghost btn-sm" data-act="open-dir" type="button">${icon('external', 15)}在资源管理器打开</button>
      </div>
    </div>

    <section class="card card-pad-sm">
      <div class="toolbar">
        <div class="input-group" style="flex:1;min-width:220px">
          ${icon('folder', 15)}
          <input class="input is-mono" id="g-dir" type="text" placeholder="图片所在目录，回车载入" spellcheck="false" />
        </div>
        <div class="select-wrap" style="width:126px">
          <select class="select" id="g-sort" aria-label="排序方式">
            <option value="name">按名称</option>
            <option value="mtime">按修改时间</option>
            <option value="size">按大小</option>
          </select>
        </div>
        <label class="row" style="gap:8px">
          <span class="text-xs muted nowrap">缩略图</span>
          <input class="range thumb-range" id="g-thumb" type="range" min="128" max="320" step="8" value="${st.thumb}" aria-label="缩略图大小" />
          <span class="text-xs mono muted" id="g-thumb-val" style="width:36px">${st.thumb}px</span>
        </label>
        <button class="btn btn-ghost btn-icon" data-act="reload" type="button" title="刷新" aria-label="刷新">${icon('refresh', 15)}</button>
      </div>
      <div class="row" style="margin-top:10px">
        <span class="text-xs muted" id="g-count">—</span>
        <span class="spacer"></span>
        <span class="text-xs muted">点击图片放大 · ←/→ 切换 · 滚轮缩放</span>
      </div>
    </section>

    <div id="g-body"></div>
  </div>`;
}

function renderGrid() {
  const body = $('#g-body', st.root);
  if (!body) return;
  const countEl = $('#g-count', st.root);

  if (st.loading) {
    if (countEl) countEl.textContent = '正在读取…';
    body.innerHTML = `<div class="gallery-grid" style="--thumb-size:${st.thumb}px">${skeletonCards(8)}</div>`;
    return;
  }

  if (st.error) {
    if (countEl) countEl.textContent = '读取失败';
    body.innerHTML = `<section class="card">
      <div class="notice is-err">${icon('alert-circle', 17)}<div>${esc(st.error)}</div></div>
      <div class="row" style="margin-top:var(--s4)">
        <button class="btn btn-primary btn-sm" data-act="reload" type="button">${icon('refresh', 14)}重试</button>
        <button class="btn btn-ghost btn-sm" data-act="pick-dir" type="button">${icon('folder-search', 14)}换个目录</button>
      </div>
    </section>`;
    return;
  }

  if (!st.dir) {
    if (countEl) countEl.textContent = '未选择目录';
    body.innerHTML = `<section class="card">${emptyState({
      title: '还没有打开文件夹喵~',
      text: '选择解包出来的目录，或者解包完成后直接点「去画廊」。',
      actions: [{ label: '选择文件夹', id: 'pick-dir', primary: true, icon: 'folder' }],
    })}</section>`;
    return;
  }

  if (!st.images.length) {
    if (countEl) countEl.textContent = '0 张图片';
    body.innerHTML = `<section class="card">${emptyState({
      title: '这里空空的喵~',
      text: '这个目录里没有可显示的图片（.png / .jpg / .jpeg / .webp / .bmp）。',
      actions: [
        { label: '重新读取', id: 'reload', icon: 'refresh' },
        { label: '换个目录', id: 'pick-dir', icon: 'folder' },
      ],
    })}</section>`;
    return;
  }

  if (countEl) countEl.textContent = `共 ${fmtNum(st.total)} 张图片 · 当前显示 ${fmtNum(st.images.length)} 张`;
  body.innerHTML = `<div class="gallery-grid" style="--thumb-size:${st.thumb}px">${st.images
    .map(
      (img, i) => `<figure class="g-card" data-index="${i}" tabindex="0" role="button" aria-label="${esc(img.name)}" title="${esc(img.name)}">
        <img src="${esc(img.thumb || api.thumbUrl(img.path, 360))}" alt="${esc(img.name)}" loading="lazy" draggable="false" />
        <div class="g-broken">${icon('image-off', 26)}</div>
        <figcaption class="g-overlay"><div class="g-overlay-txt">${esc(img.name)}</div></figcaption>
      </figure>`
    )
    .join('')}</div>`;
}

/* --------------------------------------------------------------------------
   灯箱
   -------------------------------------------------------------------------- */
function openLightbox(index) {
  if (st.closeLightbox) st.closeLightbox();
  const images = st.images;
  if (!images.length) return;
  let i = Math.max(0, Math.min(images.length - 1, index));
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let dragging = false;
  let dragX = 0;
  let dragY = 0;

  const overlay = el(`<div class="lightbox" role="dialog" aria-modal="true" aria-label="图片预览">
    <div class="lb-head">
      <span class="lb-name"></span>
      <span class="lb-sub"></span>
      <div class="lb-tools">
        <button class="lb-btn is-icon" data-lb="zoom-out" type="button" title="缩小" aria-label="缩小">${icon('zoom-out', 17)}</button>
        <span class="lb-zoom-val">100%</span>
        <button class="lb-btn is-icon" data-lb="zoom-in" type="button" title="放大" aria-label="放大">${icon('zoom-in', 17)}</button>
        <button class="lb-btn" data-lb="open-file" type="button" title="用默认程序打开">${icon('external', 15)}打开文件</button>
        <button class="lb-btn" data-lb="open-dir" type="button" title="打开所在目录">${icon('folder', 15)}所在目录</button>
        <button class="lb-btn is-icon" data-lb="close" type="button" title="关闭（Esc）" aria-label="关闭">${icon('x', 17)}</button>
      </div>
    </div>
    <div class="lb-stage">
      <button class="lb-nav lb-prev" data-lb="prev" type="button" title="上一张（←）" aria-label="上一张">${icon('chevron-left', 22)}</button>
      <img class="lb-img" alt="" draggable="false" />
      <button class="lb-nav lb-next" data-lb="next" type="button" title="下一张（→）" aria-label="下一张">${icon('chevron-right', 22)}</button>
    </div>
    <div class="lb-foot">
      <span class="lb-hint">滚轮缩放 1x–4x · 放大后可拖动 · Esc 关闭</span>
    </div>
  </div>`);

  const host = document.getElementById('overlay-host');
  host.appendChild(overlay);

  const imgEl = overlay.querySelector('.lb-img');
  const nameEl = overlay.querySelector('.lb-name');
  const subEl = overlay.querySelector('.lb-sub');
  const zoomVal = overlay.querySelector('.lb-zoom-val');
  const prevBtn = overlay.querySelector('[data-lb="prev"]');
  const nextBtn = overlay.querySelector('[data-lb="next"]');
  let dims = '';

  const apply = () => {
    imgEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    zoomVal.textContent = `${Math.round(scale * 100)}%`;
    imgEl.classList.toggle('is-panning', dragging);
  };

  const show = (nextIndex) => {
    i = (nextIndex + images.length) % images.length;
    const img = images[i];
    scale = 1;
    tx = 0;
    ty = 0;
    dims = '';
    imgEl.src = api.imageUrl(img.path);
    imgEl.alt = img.name || '';
    nameEl.textContent = img.name || baseName(img.path);
    subEl.textContent = `${i + 1} / ${images.length} · ${fmtBytes(img.size)}`;
    prevBtn.disabled = images.length < 2;
    nextBtn.disabled = images.length < 2;
    apply();
  };

  const setZoom = (v) => {
    scale = Math.max(1, Math.min(4, v));
    if (scale === 1) {
      tx = 0;
      ty = 0;
    }
    apply();
  };

  const onImgLoad = () => {
    dims = `${imgEl.naturalWidth} × ${imgEl.naturalHeight}`;
    const img = images[i];
    subEl.textContent = `${i + 1} / ${images.length} · ${dims} · ${fmtBytes(img.size)}`;
  };

  const close = () => {
    if (st.closeLightbox !== close) return;
    st.closeLightbox = null;
    unregister();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    overlay.remove();
  };
  const unregister = pushLayer(close);
  st.closeLightbox = close;

  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      show(i - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      show(i + 1);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      setZoom(scale + 0.25);
    } else if (e.key === '-') {
      e.preventDefault();
      setZoom(scale - 0.25);
    }
  };
  document.addEventListener('keydown', onKey);

  imgEl.addEventListener('load', onImgLoad);
  imgEl.addEventListener('error', () => {
    subEl.textContent = `${i + 1} / ${images.length} · 图片读取失败`;
  });

  overlay.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-lb]');
    if (btn) {
      const act = btn.dataset.lb;
      if (act === 'close') close();
      else if (act === 'prev') show(i - 1);
      else if (act === 'next') show(i + 1);
      else if (act === 'zoom-in') setZoom(scale + 0.25);
      else if (act === 'zoom-out') setZoom(scale - 0.25);
      else if (act === 'open-file') {
        try {
          await api.open(images[i].path);
        } catch (err) {
          toast('error', `打开失败：${err.message}`);
        }
      } else if (act === 'open-dir') {
        try {
          await api.open(dirName(images[i].path));
        } catch (err) {
          toast('error', `打开失败：${err.message}`);
        }
      }
      return;
    }
    if (e.target.closest('.lb-stage') === e.currentTarget.querySelector('.lb-stage') && e.target !== imgEl) {
      close();
    }
  });

  overlay.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      setZoom(scale + (e.deltaY < 0 ? 0.22 : -0.22));
    },
    { passive: false }
  );

  imgEl.addEventListener('mousedown', (e) => {
    if (scale <= 1) return;
    e.preventDefault();
    dragging = true;
    dragX = e.clientX - tx;
    dragY = e.clientY - ty;
    apply();
  });
  const onMove = (e) => {
    if (!dragging) return;
    tx = e.clientX - dragX;
    ty = e.clientY - dragY;
    apply();
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    apply();
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);

  imgEl.addEventListener('dblclick', () => {
    setZoom(scale > 1 ? 1 : 2.5);
  });

  show(i);

  return close;
}

/* --------------------------------------------------------------------------
   数据
   -------------------------------------------------------------------------- */
async function load(dir) {
  st.dir = dir;
  const input = $('#g-dir', st.root);
  if (input) input.value = dir;
  if (!dir) {
    st.images = [];
    st.total = 0;
    st.loading = false;
    st.error = '';
    renderGrid();
    return;
  }
  st.loading = true;
  st.error = '';
  renderGrid();
  try {
    const res = await api.gallery(dir, { sort: st.sort, limit: 300 });
    st.images = (res && res.images) || [];
    st.total = (res && res.total) || st.images.length;
    st.loading = false;
  } catch (e) {
    st.images = [];
    st.total = 0;
    st.loading = false;
    st.error = e.message || '读取失败';
    toast('error', `读取画廊失败：${st.error}`);
  }
  renderGrid();
}

export default {
  id: 'gallery',
  label: '画廊',
  icon: 'gallery',
  title: '画廊',
  subtitle: '浏览解包出的图片',

  async mount(root, ctx) {
    st.root = root;
    st.loading = false;
    st.error = '';
    st.images = [];
    st.total = 0;
    st.sort = 'name';
    st.thumb = Number(localStorage.getItem('nekorepkg.thumb') || 176) || 176;
    st.dir = (ctx.params && ctx.params.dir) || (S.settings && S.settings.default_output) || '';

    root.innerHTML = shell();

    const dirInput = $('#g-dir', root);
    if (dirInput) {
      dirInput.value = st.dir;
      dirInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          load(dirInput.value.trim());
        }
      });
      dirInput.addEventListener('change', () => {
        if (dirInput.value.trim() !== st.dir) load(dirInput.value.trim());
      });
    }

    const sortSel = $('#g-sort', root);
    if (sortSel) {
      sortSel.addEventListener('change', () => {
        st.sort = sortSel.value;
        load(st.dir);
      });
    }

    const thumbRange = $('#g-thumb', root);
    const thumbVal = $('#g-thumb-val', root);
    if (thumbRange) {
      thumbRange.addEventListener('input', () => {
        st.thumb = Number(thumbRange.value);
        if (thumbVal) thumbVal.textContent = `${st.thumb}px`;
        try {
          localStorage.setItem('nekorepkg.thumb', String(st.thumb));
        } catch (e) {
          /* ignore */
        }
        const grid = root.querySelector('.gallery-grid');
        if (grid) grid.style.setProperty('--thumb-size', `${st.thumb}px`);
      });
    }

    unsubs.push(
      delegate(root, '[data-act]', 'click', async (e, node) => {
        const act = node.dataset.act;
        if (act === 'pick-dir') {
          e.preventDefault();
          try {
            const res = await api.pick('folder', { title: '选择图片目录', default_dir: st.dir });
            if (res && res.path) await load(res.path);
          } catch (err) {
            toast('error', `选择目录失败：${err.message}`);
          }
          return;
        }
        if (act === 'open-dir') {
          e.preventDefault();
          if (!st.dir) return toast('warn', '还没有选择目录');
          try {
            await api.open(st.dir);
          } catch (err) {
            toast('error', `打开失败：${err.message}`);
          }
          return;
        }
        if (act === 'reload') {
          e.preventDefault();
          return load(st.dir);
        }
      })
    );

    /* 缩略图加载失败 → 占位，不阻塞其它图 */
    listen(
      root,
      'error',
      (e) => {
        const img = e.target;
        if (img && img.tagName === 'IMG' && img.closest('.g-card')) {
          img.closest('.g-card').classList.add('is-broken');
        }
      },
      true
    );

    listen(root, 'click', (e) => {
      const card = e.target.closest('.g-card');
      if (!card) return;
      openLightbox(Number(card.dataset.index) || 0);
    });
    listen(root, 'keydown', (e) => {
      const card = e.target.closest && e.target.closest('.g-card');
      if (!card) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLightbox(Number(card.dataset.index) || 0);
      }
    });

    unsubs.push(
      on('gallery', (dir) => {
        if (dir && dir === st.dir) load(st.dir);
      })
    );

    if (st.dir) await load(st.dir);
    else renderGrid();

    return () => {
      if (st.closeLightbox) {
        st.closeLightbox();
        st.closeLightbox = null;
      }
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
