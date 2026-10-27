/* ==========================================================================
   store.js —— 全局状态 + SSE 事件分发
   ========================================================================== */

import { api } from './api.js';
import { toast, STATUS } from './ui.js';

export const S = {
  ready: false,
  app: null,
  repkg: null,
  settings: {},
  recent: [],
  jobs: [],
  counts: { running: 0, queued: 0 },
  workshop: null,
  conn: 'connecting',
  hint: '就绪',
  theme: 'moe',
  lastError: null,
};

const bus = new Map();

export function on(topic, fn) {
  if (!bus.has(topic)) bus.set(topic, new Set());
  bus.get(topic).add(fn);
  return () => {
    const set = bus.get(topic);
    if (set) set.delete(fn);
  };
}

function fire(topic, payload) {
  const set = bus.get(topic);
  if (!set) return;
  for (const fn of Array.from(set)) {
    try {
      fn(payload);
    } catch (e) {
      console.error('[store] listener error', e);
    }
  }
}

export function jobsOf(kind) {
  return kind ? S.jobs.filter((j) => j.kind === kind) : S.jobs.slice();
}

export function countRunning() {
  return S.jobs.filter((j) => j.status === 'running' || j.status === 'queued').length;
}

function sortJobs() {
  // 进行中 → 排队 → 其它（按开始时间倒序）
  const rank = { running: 0, queued: 1, error: 2, done: 3, cancelled: 4 };
  S.jobs.sort((a, b) => {
    const ra = rank[a.status] == null ? 9 : rank[a.status];
    const rb = rank[b.status] == null ? 9 : rank[b.status];
    if (ra !== rb) return ra - rb;
    return new Date(b.started_at || 0) - new Date(a.started_at || 0);
  });
}

function setJobs(list) {
  S.jobs = Array.isArray(list) ? list.slice() : [];
  sortJobs();
  fire('jobs');
}

function upsertJob(job) {
  if (!job || !job.id) return;
  const prev = S.jobs.find((x) => x.id === job.id);
  const i = S.jobs.findIndex((x) => x.id === job.id);
  const changedStatus = !prev || prev.status !== job.status;
  if (i >= 0) S.jobs[i] = { ...S.jobs[i], ...job };
  else S.jobs.push({ ...job });
  sortJobs();
  if (changedStatus) {
    const label = (STATUS[job.status] && STATUS[job.status].label) || job.status;
    S.hint = `${job.title || '任务'} · ${label}`;
    fire('hint', S.hint);
  }
  fire('job', job);
  fire('jobs');
}

function applyState(st) {
  if (!st) return;
  if (st.app) S.app = st.app;
  if (st.repkg) S.repkg = st.repkg;
  if (st.settings) S.settings = { ...st.settings };
  if (Array.isArray(st.recent)) S.recent = st.recent;
  if (st.jobs && typeof st.jobs === 'object') {
    S.counts = { running: st.jobs.running || 0, queued: st.jobs.queued || 0 };
  }
  if (st.settings && (st.settings.theme === 'moe' || st.settings.theme === 'pro')) {
    S.theme = st.settings.theme;
  }
  fire('state');
}

function handleEvent(ev) {
  if (!ev || !ev.type) return;
  switch (ev.type) {
    case 'job':
      upsertJob(ev.job);
      break;
    case 'log':
      fire('log', ev);
      break;
    case 'toast':
      if (ev.text) {
        toast(ev.level || 'info', ev.text);
        S.hint = ev.text;
        fire('hint', S.hint);
      }
      break;
    case 'state':
      applyState(ev.state);
      break;
    case 'workshop':
      S.workshop = ev.data || null;
      fire('workshop', S.workshop);
      break;
    case 'gallery':
      fire('gallery', ev.dir);
      break;
    case '__conn':
      S.conn = ev.status;
      fire('conn', S.conn);
      break;
    default:
      break;
  }
}

export async function init() {
  const st = await api.getState();
  applyState(st);
  const jl = await api.getJobs();
  setJobs(jl && jl.jobs);
  S.ready = true;
  fire('ready');
  api.subscribe(handleEvent);
  if (api.isMock) {
    S.hint = '演示模式：数据均为本地模拟';
    fire('hint', S.hint);
  }
}

export async function refreshJobs() {
  try {
    const jl = await api.getJobs();
    setJobs(jl && jl.jobs);
  } catch (e) {
    toast('error', `任务列表刷新失败：${e.message}`);
  }
}

export function setThemeLocal(theme) {
  S.theme = theme === 'pro' ? 'pro' : 'moe';
  document.documentElement.dataset.theme = S.theme;
  try {
    localStorage.setItem('nekorepkg.theme', S.theme);
  } catch (e) {
    /* ignore */
  }
  fire('theme', S.theme);
}

export async function setTheme(theme) {
  if (theme !== 'moe' && theme !== 'pro') return;
  if (theme === S.theme) return;
  const prev = S.theme;
  setThemeLocal(theme);
  try {
    const res = await api.saveSettings({ theme });
    if (res && res.settings) {
      S.settings = { ...S.settings, ...res.settings };
      fire('state');
    }
  } catch (e) {
    setThemeLocal(prev);
    toast('error', `主题切换失败：${e.message}`);
  }
}

export async function saveSettings(patch) {
  const prev = { ...S.settings };
  S.settings = { ...S.settings, ...patch };
  fire('state');
  try {
    const res = await api.saveSettings(patch);
    if (res && res.settings) S.settings = { ...res.settings };
    fire('state');
    return true;
  } catch (e) {
    S.settings = prev;
    fire('state');
    toast('error', `保存设置失败：${e.message}`);
    return false;
  }
}

export function setHint(text) {
  S.hint = text;
  fire('hint', text);
}

export { api };
