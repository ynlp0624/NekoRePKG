/* ==========================================================================
   api.js —— 统一 API 层
   · 真实模式：同源相对路径 fetch('/api/...') + EventSource('/events')
   · 演示模式：URL 带 ?mock=1 时走 js/mock.js，绝不发起网络请求
   ========================================================================== */

import { createMockApi } from './mock.js';

const params = new URLSearchParams(location.search);

export const IS_MOCK = params.get('mock') === '1';
export const IS_DEBUG = params.get('debug') === '1';

/* --------------------------------------------------------------------------
   真实实现
   -------------------------------------------------------------------------- */
const NET_ERR = '无法连接本地服务，请重新启动 NekoRePKG';

async function request(url, opts = {}) {
  let res;
  try {
    res = await fetch(url, opts);
  } catch (e) {
    throw new Error(NET_ERR);
  }
  let data = null;
  const text = await res.text().catch(() => '');
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = null;
    }
  }
  if (!res.ok || (data && data.ok === false)) {
    const msg = (data && data.error) || (res.status === 404 ? '接口不存在（可能是后端版本过旧）' : `请求失败（HTTP ${res.status}）`);
    const err = new Error(msg);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data || { ok: true };
}

function postJSON(url, body) {
  return request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body == null ? {} : body),
  });
}

const realApi = {
  isMock: false,

  getState: () => request('/api/state'),
  getJobs: () => request('/api/jobs'),
  getJobLog: (id, after = 0) => request(`/api/jobs/log?id=${encodeURIComponent(id)}&after=${Number(after) || 0}`),

  extract: (payload) => postJSON('/api/jobs/extract', payload),
  pack: (payload) => postJSON('/api/jobs/pack', payload),
  tex: (payload) => postJSON('/api/jobs/tex', payload),
  cancelJob: (id) => postJSON('/api/jobs/cancel', { id }),
  removeJob: (id) => postJSON('/api/jobs/remove', { id }),
  clearJobs: (ids) => postJSON('/api/jobs/clear', { ids: ids == null ? null : ids }),
  openOutput: (id) => postJSON('/api/jobs/open_output', { id }),

  inspect: (path) => postJSON('/api/inspect', { path }),
  gallery: (dir, opts = {}) => {
    const q = new URLSearchParams();
    q.set('dir', dir || '');
    if (opts.offset) q.set('offset', opts.offset);
    if (opts.limit) q.set('limit', opts.limit);
    if (opts.sort) q.set('sort', opts.sort);
    if (opts.q) q.set('q', opts.q);
    return request(`/api/gallery?${q.toString()}`);
  },
  imageUrl: (path, download = false) =>
    `/api/image?path=${encodeURIComponent(path || '')}${download ? '&download=1' : ''}`,
  thumbUrl: (path, w = 360) => `/api/thumb?path=${encodeURIComponent(path || '')}&w=${Number(w) || 360}`,

  workshop: () => request('/api/workshop'),
  refreshWorkshop: () => postJSON('/api/workshop/refresh', {}),
  addWorkshopDir: (dir) => postJSON('/api/workshop/add_dir', { dir }),

  pick: (kind, opts = {}) => postJSON('/api/pick', { kind, ...opts }),
  reveal: (path) => postJSON('/api/reveal', { path }),
  open: (path) => postJSON('/api/open', { path }),
  upload: (file) => {
    const fd = new FormData();
    fd.append('file', file, file.name);
    return request('/api/upload', { method: 'POST', body: fd });
  },

  saveSettings: (settings) => postJSON('/api/settings', { settings }),
  setRepkg: (path) => postJSON('/api/repkg', { path }),
  autodetect: () => postJSON('/api/repkg/autodetect', {}),
  clearData: (what) => postJSON('/api/data/clear', { what }),

  subscribe(fn) {
    let es = null;
    let closed = false;
    const open = () => {
      if (closed) return;
      try {
        es = new EventSource('/events');
      } catch (e) {
        fn({ type: '__conn', status: 'offline' });
        return;
      }
      es.onopen = () => fn({ type: '__conn', status: 'live' });
      es.onerror = () => fn({ type: '__conn', status: 'offline' });
      es.onmessage = (e) => {
        if (!e.data) return;
        try {
          fn(JSON.parse(e.data));
        } catch (err) {
          /* 忽略无法解析的事件 */
        }
      };
    };
    open();
    return () => {
      closed = true;
      if (es) es.close();
    };
  },
};

/* --------------------------------------------------------------------------
   导出
   -------------------------------------------------------------------------- */
export const api = IS_MOCK ? createMockApi() : realApi;
export const mockMeta = IS_MOCK ? api.mockMeta : null;
