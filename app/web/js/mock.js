/* ==========================================================================
   mock.js —— 纯前端演示数据与服务（?mock=1）
   · 不发起任何网络请求、不加载外部资源（图片全部是 data: SVG）
   · 数据结构严格对齐 SPEC 第 6 节，接后端时无需改页面代码
   ========================================================================== */

const j = (...parts) => parts.join('\\');

const OUT_DIR = j('E:', 'repkg', 'output');
const WS_ROOT = j('C:', 'Program Files (x86)', 'Steam', 'steamapps', 'workshop', 'content', '431960');
const WS_ROOT2 = j('D:', 'SteamLibrary', 'steamapps', 'workshop', 'content', '431960');
const SAMPLE_DIR = j('E:', 'Wallpaper Engine', 'projects', 'myprojects');
const INBOX = j('C:', 'Users', 'mynlp', 'AppData', 'Local', 'Temp', 'NekoRePKG', '_inbox');
const CONFIG_DIR = j('C:', 'Users', 'mynlp', 'AppData', 'Roaming', 'NekoRePKG');
const LOG_DIR = j(CONFIG_DIR, 'logs');
const REPKG_EXE = j('E:', 'repkg', 'RePKG-GUI', 'resources', 'RePKG.exe');

const pad2 = (n) => String(n).padStart(2, '0');
const PAD3 = (n) => String(n).padStart(3, '0');

function isoOf(d) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const oh = pad2(Math.floor(Math.abs(off) / 60));
  const om = pad2(Math.abs(off) % 60);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}:${pad2(d.getSeconds())}${sign}${oh}:${om}`;
}
const isoAgo = (ms) => isoOf(new Date(Date.now() - ms));
const clockNow = () => {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

function baseName(p) {
  const parts = String(p || '').split(/[\\/]/);
  return parts[parts.length - 1] || String(p || '');
}
function dirOf(p) {
  const s = String(p || '').replace(/[\\/]+$/, '');
  const i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/'));
  return i > 0 ? s.slice(0, i) : '';
}
function extOf(p) {
  const name = baseName(p);
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i).toLowerCase() : '';
}

/* --------------------------------------------------------------------------
   内置占位插画（data: SVG，不联网）
   -------------------------------------------------------------------------- */
const PALETTES = [
  ['#16233f', '#3f6ea8', '#bcd8ff', '#eef6ff'],
  ['#2a1836', '#6d3d7f', '#ffc0dd', '#fff3f9'],
  ['#0d2a30', '#2c6f74', '#9df0da', '#eafcf7'],
  ['#3a2317', '#8d5a30', '#ffd2a1', '#fff5e8'],
  ['#0e0f1a', '#2d2f4d', '#9db4ff', '#e9eeff'],
  ['#260f2c', '#7c2d5f', '#ff9fc6', '#ffe9f3'],
  ['#102418', '#3d7a52', '#c6f3ab', '#f3ffee'],
  ['#23121a', '#6d2a37', '#ffb28c', '#fff1e7'],
];

function artSvg(index, w, h) {
  const p = PALETTES[index % PALETTES.length];
  const variant = index % 3;
  const seed = (index * 977) % 100;
  const moonX = Math.round(w * (0.2 + seed / 260));
  const moonY = Math.round(h * 0.3);
  const moonR = Math.round(Math.min(w, h) * 0.14);

  let scene = '';
  if (variant === 0) {
    scene = `
      <circle cx="${moonX}" cy="${moonY}" r="${moonR}" fill="${p[3]}" opacity=".92"/>
      <circle cx="${moonX}" cy="${moonY}" r="${moonR * 1.9}" fill="${p[2]}" opacity=".16"/>
      <path d="M0 ${h * 0.72} Q ${w * 0.24} ${h * 0.56} ${w * 0.5} ${h * 0.7} T ${w} ${h * 0.64} V ${h} H0 Z" fill="${p[1]}" opacity=".85"/>
      <path d="M0 ${h * 0.84} Q ${w * 0.3} ${h * 0.7} ${w * 0.62} ${h * 0.82} T ${w} ${h * 0.78} V ${h} H0 Z" fill="${p[0]}" opacity=".9"/>`;
  } else if (variant === 1) {
    scene = `
      <circle cx="${w * 0.68}" cy="${h * 0.42}" r="${Math.min(w, h) * 0.3}" fill="${p[2]}" opacity=".22"/>
      <circle cx="${w * 0.68}" cy="${h * 0.42}" r="${Math.min(w, h) * 0.18}" fill="${p[3]}" opacity=".3"/>
      <path d="M${w * 0.08} ${h * 0.86} C ${w * 0.3} ${h * 0.5}, ${w * 0.6} ${h * 0.9}, ${w * 0.96} ${h * 0.54}" fill="none" stroke="${p[3]}" stroke-width="${Math.max(2, w * 0.006)}" opacity=".5"/>
      <path d="M${w * 0.04} ${h * 0.72} C ${w * 0.34} ${h * 0.4}, ${w * 0.58} ${h * 0.78}, ${w * 0.98} ${h * 0.44}" fill="none" stroke="${p[2]}" stroke-width="${Math.max(1.5, w * 0.003)}" opacity=".45"/>`;
  } else {
    scene = `
      <rect x="0" y="${h * 0.55}" width="${w}" height="${h * 0.45}" fill="${p[0]}" opacity=".55"/>
      <path d="M0 ${h * 0.62} L ${w * 0.18} ${h * 0.44} L ${w * 0.34} ${h * 0.62} L ${w * 0.52} ${h * 0.38} L ${w * 0.74} ${h * 0.62} L ${w} ${h * 0.46} V ${h} H0 Z" fill="${p[1]}" opacity=".8"/>
      <circle cx="${w * 0.76}" cy="${h * 0.26}" r="${Math.min(w, h) * 0.1}" fill="${p[3]}" opacity=".85"/>`;
  }

  const stars = Array.from({ length: 9 })
    .map((_, k) => {
      const sx = ((seed * 13 + k * 149) % 1000) / 1000;
      const sy = ((seed * 29 + k * 233) % 1000) / 1000;
      const r = 0.7 + ((k * 7) % 5) * 0.4;
      return `<circle cx="${(sx * w).toFixed(1)}" cy="${(sy * h * 0.8).toFixed(1)}" r="${r}" fill="${p[3]}" opacity="${0.25 + (k % 3) * 0.2}"/>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${p[0]}"/><stop offset="1" stop-color="${p[1]}"/>
      </linearGradient>
      <radialGradient id="v" cx="0.5" cy="0.42" r="0.7">
        <stop offset="0" stop-color="${p[2]}" stop-opacity=".28"/><stop offset="1" stop-color="${p[2]}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <rect width="${w}" height="${h}" fill="url(#v)"/>
    ${stars}
    ${scene}
    <rect y="${h * 0.9}" width="${w}" height="${h * 0.1}" fill="${p[0]}" opacity=".5"/>
  </svg>`;
}

const dataUri = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function coverSvg(index, w, h) {
  const p = PALETTES[(index + 3) % PALETTES.length];
  const variant = index % 3;
  const moonX = w * (0.18 + ((index * 7) % 5) * 0.11);
  const moonY = h * (0.24 + ((index * 3) % 4) * 0.05);
  const moonR = h * (0.1 + (index % 3) * 0.035);
  const k = w * 0.005;

  let scene = '';
  if (variant === 0) {
    scene = `
      <circle cx="${moonX}" cy="${moonY}" r="${moonR}" fill="${p[3]}" opacity=".92"/>
      <circle cx="${moonX}" cy="${moonY}" r="${moonR * 2.3}" fill="${p[2]}" opacity=".13"/>
      <path d="M0 ${h * 0.7} Q ${w * 0.22} ${h * 0.53} ${w * 0.47} ${h * 0.68} T ${w} ${h * 0.63} V ${h} H0 Z" fill="${p[1]}" opacity=".9"/>
      <path d="M0 ${h * 0.85} Q ${w * 0.3} ${h * 0.72} ${w * 0.64} ${h * 0.84} T ${w} ${h * 0.79} V ${h} H0 Z" fill="${p[0]}" opacity=".92"/>`;
  } else if (variant === 1) {
    scene = `
      <circle cx="${w * 0.7}" cy="${h * 0.44}" r="${h * 0.36}" fill="${p[2]}" opacity=".16"/>
      <circle cx="${w * 0.7}" cy="${h * 0.44}" r="${h * 0.21}" fill="${p[3]}" opacity=".26"/>
      <circle cx="${w * 0.7}" cy="${h * 0.44}" r="${h * 0.28}" fill="none" stroke="${p[3]}" stroke-width="1.4" opacity=".3"/>
      <path d="M${w * 0.05} ${h * 0.82} C ${w * 0.28} ${h * 0.44}, ${w * 0.6} ${h * 0.88}, ${w * 0.95} ${h * 0.5}" fill="none" stroke="${p[3]}" stroke-width="${Math.max(2, k)}" opacity=".45"/>
      <path d="M${w * 0.02} ${h * 0.68} C ${w * 0.3} ${h * 0.36}, ${w * 0.58} ${h * 0.74}, ${w * 0.98} ${h * 0.42}" fill="none" stroke="${p[2]}" stroke-width="${Math.max(1.4, k * 0.6)}" opacity=".4"/>`;
  } else {
    scene = `
      <rect y="${h * 0.6}" width="${w}" height="${h * 0.4}" fill="${p[0]}" opacity=".5"/>
      <path d="M0 ${h * 0.7} L ${w * 0.16} ${h * 0.42} L ${w * 0.31} ${h * 0.66} L ${w * 0.49} ${h * 0.34} L ${w * 0.7} ${h * 0.66} L ${w * 0.86} ${h * 0.44} L ${w} ${h * 0.62} V ${h} H0 Z" fill="${p[1]}" opacity=".85"/>
      <circle cx="${w * 0.79}" cy="${h * 0.25}" r="${h * 0.11}" fill="${p[3]}" opacity=".85"/>`;
  }

  const stars = Array.from({ length: 10 })
    .map((_, n) => {
      const sx = (((index * 37 + n * 149) % 1000) / 1000) * w;
      const sy = (((index * 91 + n * 233) % 1000) / 1000) * h * 0.72;
      const r = 0.7 + ((n * 5 + index) % 4) * 0.4;
      return `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${r}" fill="${p[3]}" opacity="${0.2 + (n % 3) * 0.18}"/>`;
    })
    .join('');

  const pawScale = Math.min(w, h) / 560;
  const paw = `<g fill="${p[3]}" opacity=".3" transform="translate(${w * 0.8} ${h * 0.12}) scale(${pawScale})">
      <ellipse cx="24" cy="38" rx="8.5" ry="11.5" transform="rotate(-18 24 38)"/>
      <ellipse cx="43" cy="26" rx="8.5" ry="11.5"/>
      <ellipse cx="63" cy="27" rx="8.5" ry="11.5" transform="rotate(7 63 27)"/>
      <ellipse cx="80" cy="41" rx="8.5" ry="11.5" transform="rotate(20 80 41)"/>
      <path d="M52 50c14.5 0 27 9.5 27 21 0 10.5-8.5 16.5-18 16.5-4.8 0-6.5-2.2-9-2.2s-4.2 2.2-9 2.2c-9.5 0-18-6-18-16.5 0-11.5 12.5-21 27-21z"/>
    </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${p[0]}"/><stop offset="1" stop-color="${p[1]}"/>
      </linearGradient>
      <radialGradient id="r" cx="0.5" cy="0.4" r="0.7">
        <stop offset="0" stop-color="${p[2]}" stop-opacity=".26"/><stop offset="1" stop-color="${p[2]}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <rect width="${w}" height="${h}" fill="url(#r)"/>
    ${stars}
    ${scene}
    ${paw}
  </svg>`;
}

/* --------------------------------------------------------------------------
   包解析数据（125 条目，含 project.json）
   -------------------------------------------------------------------------- */
const PROJECT_RAW = {
  title: '星海少女 · 4K',
  type: 'scene',
  file: 'scene.pkg',
  preview: 'preview.jpg',
  tags: ['Anime', 'Fantasy', '4K'],
  workshopid: '2169432',
  description: '深蓝色的星海与漂浮的少女。适合 16:9 竖屏以外的所有屏幕。',
  general: { properties: { sizing: 'cover', alignment: 'center' } },
};

function makeEntries() {
  const list = [];
  const push = (path, size) => {
    const name = baseName(path);
    const ext = extOf(path);
    list.push({
      path,
      name,
      dir: dirOf(path),
      ext,
      type: ext === '.tex' ? 'texture' : 'binary',
      size,
      offset: 0,
    });
  };

  for (let i = 1; i <= 24; i += 1) push(j('materials', 'materials', `mat_${pad2(i)}.json`), 2600 + ((i * 173) % 1800));
  for (let i = 1; i <= 52; i += 1) push(j('materials', 'materials', `tex_${pad2(i)}.tex`), 420000 + ((i * 39371) % 620000));
  for (let i = 1; i <= 3; i += 1) push(j('materials', 'materials', `ui_icon_${i}.png`), 180000 + i * 9200);
  for (let i = 0; i < 8; i += 1) push(j('models', pad2(i), 'model.json'), 3400 + i * 210);
  for (let i = 1; i <= 6; i += 1) push(j('shaders', `shader_${pad2(i)}.glsl`), 1800 + i * 90);
  for (let i = 1; i <= 4; i += 1) push(j('models', `mesh_${i}.obj`), 160000 + i * 12000);
  for (let i = 1; i <= 5; i += 1) push(j('scripts', `script_${i}.json`), 1200 + i * 130);
  for (let i = 1; i <= 10; i += 1) push(j('particles', `p_${pad2(i)}.json`), 900 + i * 80);
  for (let i = 1; i <= 2; i += 1) push(j('video', `loop_${i}.mp4`), 7600000 + i * 480000);
  for (let i = 1; i <= 2; i += 1) push(j('video', `bg_${i}.webm`), 4600000 + i * 320000);
  for (let i = 1; i <= 3; i += 1) push(j('audio', `amb_${i}.mp3`), 1100000 + i * 96000);
  for (let i = 1; i <= 2; i += 1) push(j('fonts', `font_${i}.ttf`), 480000 + i * 24000);
  push('scene.json', 8600);
  push('project.json', 1420);
  push('preview.jpg', 268000);
  push(j('preview', 'preview.webm'), 2100000);
  push(j('materials', 'materials', 'tex_atlas.tex'), 2380000);

  let offset = 64;
  for (const e of list) {
    e.offset = offset;
    offset += e.size;
  }
  return list;
}

function makeByExt(entries) {
  const map = new Map();
  for (const e of entries) {
    const cur = map.get(e.ext) || { ext: e.ext, count: 0, size: 0 };
    cur.count += 1;
    cur.size += e.size;
    map.set(e.ext, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count || b.size - a.size);
}

/* --------------------------------------------------------------------------
   画廊 / 工坊
   -------------------------------------------------------------------------- */
const GALLERY_DIR = j(OUT_DIR, '星海少女');
const GALLERY_FILES = Array.from({ length: 24 }, (_, i) => {
  const n = i + 1;
  const ext = i % 7 === 3 ? '.jpg' : '.png';
  const name = `wp_${pad2(n)}${ext}`;
  return {
    path: j(GALLERY_DIR, name),
    name,
    ext,
    size: ext === '.jpg' ? 240000 + ((n * 31211) % 900000) : 320000 + ((n * 51277) % 1400000),
    mtime: isoAgo((n * 37 + 4) * 60000),
    thumb: dataUri(artSvg(i, 480, 300)),
    full: dataUri(artSvg(i, 1280, 800)),
  };
});
const GALLERY_MAP = new Map(GALLERY_FILES.map((g) => [g.path, g]));

const WS_TITLES = [
  ['星海少女 · 4K', 'scene', ['Anime', 'Fantasy'], '深蓝星海与漂浮的少女，带缓慢视差。'],
  ['雨夜咖啡屋', 'scene', ['Anime', 'Rain'], '雨滴打在玻璃上，店内暖光缓慢呼吸。'],
  ['猫耳电台', 'video', ['Anime', 'Music'], '猫耳少女的午夜电台，lo-fi 循环视频。'],
  ['樱花下落的速度', 'scene', ['Anime', 'Sakura'], '五厘米的风，花瓣与光斑一起飘。'],
  ['深夜霓虹 · 循环', 'video', ['Cyberpunk', 'City'], '雨夜霓虹街道，无缝 12 秒循环。'],
  ['极光观测站', 'scene', ['Nature', 'Night'], '雪原上的极光与自动气象站。'],
  ['像素小镇', 'web', ['Pixel', 'Cute'], '可点击的像素小镇，支持音量联动。'],
  ['静谧书房', 'scene', ['Cozy', 'Study'], '午后书房，尘埃在光线里漂浮。'],
  ['星轨列车', 'video', ['Anime', 'Space'], '穿过星轨的夜间列车，4K 60fps。'],
  ['月下神社', 'scene', ['Anime', 'Shrine'], '月下的鸟居与石阶，萤火点点。'],
  ['机械之心', 'scene', ['Mecha', 'Sci-Fi'], '缓慢转动的机械心脏，带引擎低鸣。'],
  ['蒸汽波海岸', 'web', ['Retro', 'Vaporwave'], '交互式蒸汽波海岸，滚轮改变潮汐。'],
];

const WS_ITEMS = WS_TITLES.map((t, i) => {
  const id = String(2169432 + i * 137);
  const dir = j(i % 4 === 3 ? WS_ROOT2 : WS_ROOT, id);
  return {
    id,
    dir,
    title: t[0],
    type: t[1],
    preview: j(dir, 'preview.jpg'),
    preview_url: dataUri(coverSvg(i, 640, 360)),
    pkg: j(dir, 'scene.pkg'),
    pkg_count: 1 + (i % 2),
    size: (78 + i * 23) * 1024 * 1024 + i * 9137,
    mtime: isoAgo((i * 11 + 2) * 3600000 * 6),
    tags: t[2],
    description: t[3],
  };
});

/* --------------------------------------------------------------------------
   任务与日志
   -------------------------------------------------------------------------- */
const LOG_TEMPLATES = [
  ['info', '### Extracting package: scene.pkg'],
  ['info', '* Reading package header (PKGV0021)'],
  ['info', '* Entries: 126  Data: 71.5 MB'],
  ['info', '### Extracting textures...'],
  ['info', '* Extracting: materials\\materials\\tex_01.tex'],
  ['info', '* Extracting: materials\\materials\\tex_02.tex'],
];

const LOG_FILES = [
  'materials\\materials\\mat_03.json',
  'materials\\materials\\tex_12.tex',
  'materials\\materials\\tex_13.tex',
  'materials\\materials\\tex_14.tex',
  'models\\02\\model.json',
  'shaders\\shader_02.glsl',
  'particles\\p_04.json',
  'materials\\materials\\tex_15.tex',
  'audio\\amb_1.mp3',
  'preview\\preview.webm',
  'scripts\\script_2.json',
  'materials\\materials\\tex_atlas.tex',
];
let logCursor = 0;

const logs = new Map();

function pushLog(jobId, level, text) {
  const list = logs.get(jobId) || [];
  const line = { i: list.length, t: clockNow(), level, text };
  list.push(line);
  logs.set(jobId, list);
  return line;
}

function seedLog(job) {
  logs.set(job.id, []);
  for (const [level, text] of LOG_TEMPLATES.slice(0, 4)) pushLog(job.id, level, text);

  const count = job.status === 'running' ? 5 : job.status === 'done' ? 9 : 0;
  for (let i = 0; i < count; i += 1) {
    const rel = LOG_FILES[i % LOG_FILES.length];
    if (i === 3) pushLog(job.id, 'warn', `* Skipping, already exists: ${rel}`);
    else pushLog(job.id, 'info', `* Extracting: ${rel}`);
  }

  if (job.status === 'error') {
    pushLog(job.id, 'error', '! 读取包头部失败：magic 不是 PKGV00xx');
    pushLog(job.id, 'error', '! 该文件可能不是 Wallpaper Engine 的 .pkg，或已损坏');
  }
  if (job.status === 'done') {
    pushLog(job.id, 'ok', `* Done. ${job.result ? job.result.files : 0} files written`);
  }
}

function makeJob(over) {
  return {
    id: over.id,
    kind: over.kind || 'extract',
    title: over.title || 'scene.pkg',
    input: over.input || j(SAMPLE_DIR, '星海少女', 'scene.pkg'),
    output_dir: over.output_dir || OUT_DIR,
    status: over.status || 'queued',
    progress: over.progress || { done: 0, total: 0, phase: '排队中', percent: 0 },
    started_at: over.started_at || null,
    ended_at: over.ended_at || null,
    elapsed: over.elapsed == null ? 0 : over.elapsed,
    error: over.error || null,
    result: over.result || null,
    exit_code: over.exit_code == null ? null : over.exit_code,
  };
}

const runningJob = makeJob({
  id: 'j_7f2a',
  title: 'scene.pkg',
  input: j(SAMPLE_DIR, '星海少女', 'scene.pkg'),
  status: 'running',
  progress: { done: 41, total: 125, phase: '正在解包 materials\\materials\\tex_28.tex', percent: 32.8 },
  started_at: isoAgo(6200),
  elapsed: 6.2,
});

const jobs = [
  runningJob,
  makeJob({
    id: 'j_6c19',
    title: '雨夜咖啡屋.pkg',
    input: j(SAMPLE_DIR, '雨夜咖啡屋', 'scene.pkg'),
    status: 'done',
    progress: { done: 88, total: 88, phase: '完成', percent: 100 },
    started_at: isoAgo(240000),
    ended_at: isoAgo(227000),
    elapsed: 12.8,
    result: { files: 88, bytes: 48234567, output_dir: j(OUT_DIR, '雨夜咖啡屋') },
    exit_code: 0,
  }),
  makeJob({
    id: 'j_5b03',
    title: 'broken_scene.pkg',
    input: j(SAMPLE_DIR, '存档损坏', 'broken_scene.pkg'),
    status: 'error',
    progress: { done: 0, total: 0, phase: '读取包头部失败', percent: 0 },
    started_at: isoAgo(400000),
    ended_at: isoAgo(399600),
    elapsed: 0.4,
    error: '文件损坏：pkg 头部 magic 不正确（缺少 PKGV0021）',
    exit_code: 1,
  }),
  makeJob({
    id: 'j_3c55',
    title: '猫耳电台.pkg',
    input: j(SAMPLE_DIR, '猫耳电台', 'scene.pkg'),
    status: 'cancelled',
    progress: { done: 17, total: 42, phase: '已取消', percent: 40.5 },
    started_at: isoAgo(600000),
    ended_at: isoAgo(596000),
    elapsed: 4.1,
    result: { files: 17, bytes: 8213999, output_dir: j(OUT_DIR, '猫耳电台') },
  }),
  makeJob({
    id: 'j_4a88',
    kind: 'pack',
    title: 'scene_new.pkg',
    input: j(OUT_DIR, '星海少女'),
    output_dir: OUT_DIR,
    status: 'done',
    progress: { done: 125, total: 125, phase: '校验通过', percent: 100 },
    started_at: isoAgo(960000),
    ended_at: isoAgo(940000),
    elapsed: 18.6,
    result: {
      files: 122,
      bytes: 65432100,
      output_dir: OUT_DIR,
      output_pkg: j(OUT_DIR, 'scene_new.pkg'),
      verify: { ok: true, files: 122, bytes: 65432100, message: '条目数与总字节一致' },
    },
  }),
];

for (const job of jobs) seedLog(job);

/* --------------------------------------------------------------------------
   状态
   -------------------------------------------------------------------------- */
const THEME_KEY = 'nekorepkg.theme';
function readStoredTheme() {
  try {
    const q = new URLSearchParams(location.search).get('theme');
    if (q === 'moe' || q === 'pro') return q;
    const t = localStorage.getItem(THEME_KEY);
    if (t === 'moe' || t === 'pro') return t;
  } catch (e) {
    /* ignore */
  }
  return 'moe';
}

const settings = {
  theme: readStoredTheme(),
  default_output: OUT_DIR,
  concurrency: 2,
  repkg_path: null,
  open_after_extract: false,
  workshop_dirs: [WS_ROOT, WS_ROOT2],
  recent_limit: 20,
  sound_after_extract: false,
};

const repkg = {
  path: REPKG_EXE,
  version: '0.4.0',
  ok: true,
  source: 'bundled',
  error: null,
};

let recent = [
  { path: j(SAMPLE_DIR, '星海少女', 'scene.pkg'), kind: 'pkg', name: 'scene.pkg', when: isoAgo(6200), size: 66432100 },
  { path: j(SAMPLE_DIR, '雨夜咖啡屋', 'scene.pkg'), kind: 'pkg', name: '雨夜咖啡屋.pkg', when: isoAgo(240000), size: 48234567 },
  { path: j(OUT_DIR, '星海少女'), kind: 'folder', name: '星海少女', when: isoAgo(300000), size: 0 },
  { path: j(WS_ROOT, '2169432', 'scene.pkg'), kind: 'pkg', name: '2169432\\scene.pkg', when: isoAgo(3600000), size: 123456789 },
];

function stateSnapshot() {
  return {
    ok: true,
    app: {
      name: 'NekoRePKG',
      version: '1.0.1',
      platform: 'windows',
      log_dir: LOG_DIR,
      config_path: j(CONFIG_DIR, 'config.json'),
      modes: ['extract', 'pack', 'inspect', 'gallery', 'workshop'],
    },
    repkg: { ...repkg },
    settings: { ...settings, workshop_dirs: settings.workshop_dirs.slice() },
    recent: recent.slice(),
    jobs: {
      running: jobs.filter((x) => x.status === 'running').length,
      queued: jobs.filter((x) => x.status === 'queued').length,
    },
  };
}

/* --------------------------------------------------------------------------
   SSE 模拟
   -------------------------------------------------------------------------- */
const subscribers = new Set();
let engineTimer = null;
const pendingStart = new Map();

function emit(evt) {
  for (const fn of Array.from(subscribers)) {
    try {
      fn(evt);
    } catch (e) {
      /* 演示层吞掉，避免打断其它订阅者 */
    }
  }
}

const PHASES = [
  '正在解包 materials\\materials\\tex_{n}.tex',
  '正在解包 materials\\materials\\mat_{n}.json',
  '正在转换贴图 tex_{n}.tex → png',
  '正在写入 models\\{n}\\model.json',
  '正在复制 project.json 与 preview',
];

function nextPhase(total, done) {
  const n = pad2(1 + (done % 52));
  return PHASES[done % PHASES.length].replace('{n}', n);
}

function tickJobs() {
  const now = Date.now();
  let changed = false;

  for (const job of jobs) {
    if (job.status === 'queued' && pendingStart.has(job.id)) {
      const at = pendingStart.get(job.id);
      if (now >= at) {
        pendingStart.delete(job.id);
        job.status = 'running';
        job.started_at = isoOf(new Date());
        job.progress = { done: 0, total: job.progress.total || 96, phase: '准备中…', percent: 0 };
        pushLog(job.id, 'info', '### Extracting package: ' + job.title);
        emit({ type: 'job', job: { ...job } });
        emit({ type: 'log', job_id: job.id, lines: logs.get(job.id).slice() });
        changed = true;
      }
      continue;
    }

    if (job.status !== 'running') continue;

    const total = job.progress.total || 96;
    const step = 2 + ((job.progress.done + jobs.length) % 4);
    const done = Math.min(total, job.progress.done + step);
    job.progress = {
      done,
      total,
      phase: done >= total ? '完成' : nextPhase(total, done),
      percent: Math.round((done / total) * 1000) / 10,
    };
    job.elapsed = Math.round((now - new Date(job.started_at).getTime()) / 100) / 10;

    const rel = LOG_FILES[(logCursor += 1) % LOG_FILES.length];
    const isWarn = logCursor % 11 === 0;
    const line =
      done >= total
        ? pushLog(job.id, 'ok', `* Done. ${total} files written`)
        : pushLog(job.id, isWarn ? 'warn' : 'info', `${isWarn ? '* Skipping, already exists' : '* Extracting'}: ${rel}`);
    emit({ type: 'log', job_id: job.id, lines: [line] });

    if (done >= total) {
      job.status = 'done';
      job.ended_at = isoOf(new Date());
      job.exit_code = 0;
      job.result = {
        files: total,
        bytes: job.kind === 'pack' ? 65432100 : total * 512000 + 4096,
        output_dir: job.output_dir,
        ...(job.kind === 'pack'
          ? { output_pkg: job.input.replace(/[\\/][^\\/]+$/, '') + '\\scene_new.pkg', verify: { ok: true, files: total, bytes: 65432100, message: '条目数与总字节一致' } }
          : {}),
      };
      recent.unshift({ path: job.input, kind: 'pkg', name: job.title, when: isoOf(new Date()), size: total * 512000 + 4096 });
      /* 完成提示由前端页面统一弹（带「打开目录 / 去画廊」按钮），这里不再重复发 toast */
    }
    emit({ type: 'job', job: { ...job } });
    changed = true;
  }

  if (changed) emit({ type: 'state', state: stateSnapshot() });
}

function ensureEngine() {
  if (engineTimer) return;
  engineTimer = setInterval(tickJobs, 900);
}

/* --------------------------------------------------------------------------
   工坊扫描
   -------------------------------------------------------------------------- */
let workshopState = {
  ok: true,
  scanning: true,
  steam_root: j('C:', 'Program Files (x86)', 'Steam'),
  dirs: [WS_ROOT, WS_ROOT2],
  items: [],
  updated_at: isoAgo(1000),
  error: null,
};
let scanTimer = null;

function finishScan(delay = 2100) {
  if (scanTimer) return;
  scanTimer = setTimeout(() => {
    scanTimer = null;
    workshopState = {
      ...workshopState,
      scanning: false,
      items: WS_ITEMS.map((it, i) => ({ ...it, mtime: isoAgo((i + 1) * 5400000) })),
      updated_at: isoOf(new Date()),
    };
    emit({ type: 'workshop', data: JSON.parse(JSON.stringify(workshopState)) });
  }, delay);
}

/* --------------------------------------------------------------------------
   工具：筛选/排序
   -------------------------------------------------------------------------- */
function matchQuery(name, q) {
  if (!q) return true;
  return String(name).toLowerCase().includes(String(q).toLowerCase());
}

/* --------------------------------------------------------------------------
   对外 API
   -------------------------------------------------------------------------- */
export function createMockApi() {
  ensureEngine();

  const api = {
    isMock: true,

    async getState() {
      return stateSnapshot();
    },

    async getJobs() {
      return { ok: true, jobs: jobs.map((x) => ({ ...x })) };
    },

    async getJobLog(id, after = 0) {
      const list = logs.get(id) || [];
      const lines = list.filter((l) => l.i >= after);
      return { ok: true, lines, next: list.length };
    },

    async extract(payload) {
      const inputs = (payload && payload.inputs) || [];
      const out = (payload && payload.output_dir) || settings.default_output;
      const ids = [];
      const rejected = [];
      inputs.forEach((input, idx) => {
        if (!/\.pkg$/i.test(input) && !(payload.options && payload.options.recursive)) {
          rejected.push({ input, reason: '不是 .pkg 文件' });
          return;
        }
        const id = `j_${Math.random().toString(16).slice(2, 6)}`;
        const job = makeJob({
          id,
          title: baseName(input),
          input,
          output_dir: out,
          status: 'queued',
          progress: { done: 0, total: 96 + (idx % 3) * 16, phase: '排队中', percent: 0 },
        });
        seedLog(job);
        jobs.unshift(job);
        pendingStart.set(id, Date.now() + 1200 + idx * 700);
        ids.push(id);
        emit({ type: 'job', job: { ...job } });
      });
      emit({ type: 'state', state: stateSnapshot() });
      return { ok: true, job_ids: ids, rejected };
    },

    async pack(payload) {
      const src = (payload && payload.source_dir) || j(OUT_DIR, '星海少女');
      const outPkg = (payload && payload.output_pkg) || j(OUT_DIR, 'scene_new.pkg');
      const id = `j_${Math.random().toString(16).slice(2, 6)}`;
      const job = makeJob({
        id,
        kind: 'pack',
        title: baseName(outPkg),
        input: src,
        output_dir: dirOf(outPkg),
        status: 'queued',
        progress: { done: 0, total: 122, phase: '排队中', percent: 0 },
      });
      seedLog(job);
      jobs.unshift(job);
      pendingStart.set(id, Date.now() + 1000);
      emit({ type: 'job', job: { ...job } });
      return { ok: true, job_id: id };
    },

    async tex(payload) {
      const inputs = (payload && payload.inputs) || [];
      const id = `j_${Math.random().toString(16).slice(2, 6)}`;
      const job = makeJob({
        id,
        kind: 'tex',
        title: baseName(inputs[0] || 'tex'),
        input: inputs[0],
        output_dir: (payload && payload.output_dir) || OUT_DIR,
        status: 'queued',
        progress: { done: 0, total: 32, phase: '排队中', percent: 0 },
      });
      seedLog(job);
      jobs.unshift(job);
      pendingStart.set(id, Date.now() + 800);
      emit({ type: 'job', job: { ...job } });
      return { ok: true, job_ids: [id] };
    },

    async cancelJob(id) {
      const job = jobs.find((x) => x.id === id);
      if (!job) throw new Error('任务不存在');
      if (job.status === 'running' || job.status === 'queued') {
        pendingStart.delete(id);
        job.status = 'cancelled';
        job.ended_at = isoOf(new Date());
        job.progress = { ...job.progress, phase: '已取消' };
        pushLog(id, 'warn', '! 任务已取消');
        emit({ type: 'job', job: { ...job } });
        emit({ type: 'state', state: stateSnapshot() });
      }
      return { ok: true };
    },

    async removeJob(id) {
      const i = jobs.findIndex((x) => x.id === id);
      if (i >= 0) {
        if (jobs[i].status === 'running') throw new Error('运行中的任务不能移除');
        jobs.splice(i, 1);
        logs.delete(id);
        emit({ type: 'state', state: stateSnapshot() });
      }
      return { ok: true };
    },

    async clearJobs(ids) {
      if (ids == null) {
        for (let i = jobs.length - 1; i >= 0; i -= 1) {
          if (jobs[i].status !== 'running' && jobs[i].status !== 'queued') jobs.splice(i, 1);
        }
      } else {
        for (const id of ids) {
          const i = jobs.findIndex((x) => x.id === id);
          if (i >= 0 && jobs[i].status !== 'running') jobs.splice(i, 1);
        }
      }
      return { ok: true };
    },

    async openOutput(id) {
      if (!jobs.find((x) => x.id === id)) throw new Error('任务不存在');
      return { ok: true };
    },

    async inspect(path) {
      await new Promise((r) => setTimeout(r, 420));
      if (/broken|损坏/i.test(String(path))) {
        const err = new Error('文件损坏：pkg 头部 magic 不正确（缺少 PKGV0021）');
        err.code = 'BAD_MAGIC';
        throw err;
      }
      const entries = makeEntries();
      const byExt = makeByExt(entries);
      const dataSize = entries.reduce((s, e) => s + e.size, 0);
      const project = {
        title: PROJECT_RAW.title,
        type: PROJECT_RAW.type,
        file: PROJECT_RAW.file,
        preview: PROJECT_RAW.preview,
        tags: PROJECT_RAW.tags,
        workshopid: PROJECT_RAW.workshopid,
        description: PROJECT_RAW.description,
        raw: PROJECT_RAW,
      };
      return {
        ok: true,
        path,
        name: baseName(path),
        size: Math.round(dataSize * 1.013) + 8192,
        magic: 'PKGV0021',
        entry_count: entries.length,
        data_size: dataSize,
        warnings: entries.some((e) => e.ext === '.tex') ? [] : [],
        entries,
        by_ext: byExt,
        project,
        preview_url: dataUri(artSvg(1, 800, 500)),
      };
    },

    async gallery(dir, opts = {}) {
      await new Promise((r) => setTimeout(r, 260));
      if (/not-exist|不存在/i.test(String(dir))) {
        throw new Error('目录不存在或没有访问权限');
      }
      if (/empty|空/i.test(String(dir))) {
        return { ok: true, dir, total: 0, images: [] };
      }
      const q = opts.q || '';
      const sort = opts.sort || 'name';
      let list = GALLERY_FILES.filter((g) => matchQuery(g.name, q));
      if (sort === 'size') list = list.slice().sort((a, b) => b.size - a.size);
      else if (sort === 'mtime') list = list.slice().sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
      else list = list.slice().sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
      const offset = opts.offset || 0;
      const limit = opts.limit || 200;
      return {
        ok: true,
        dir,
        total: list.length,
        images: list.slice(offset, offset + limit).map((g) => ({
          path: g.path,
          name: g.name,
          ext: g.ext,
          size: g.size,
          mtime: g.mtime,
          thumb: g.thumb,
        })),
      };
    },

    imageUrl(path) {
      const g = GALLERY_MAP.get(path);
      return g ? g.full : dataUri(artSvg(0, 1280, 800));
    },

    async workshop() {
      if (workshopState.scanning && !scanTimer) finishScan(2100);
      return JSON.parse(JSON.stringify(workshopState));
    },

    async refreshWorkshop() {
      workshopState = { ...workshopState, scanning: true };
      emit({ type: 'workshop', data: JSON.parse(JSON.stringify(workshopState)) });
      if (scanTimer) {
        clearTimeout(scanTimer);
        scanTimer = null;
      }
      finishScan(1900);
      return { ok: true };
    },

    async addWorkshopDir(dir) {
      if (!String(dir || '').trim()) throw new Error('目录不能为空');
      if (!settings.workshop_dirs.includes(dir)) {
        settings.workshop_dirs = settings.workshop_dirs.concat([dir]);
        workshopState.dirs = settings.workshop_dirs.slice();
      }
      await api.refreshWorkshop();
      emit({ type: 'state', state: stateSnapshot() });
      return { ok: true };
    },

    async pick(kind) {
      await new Promise((r) => setTimeout(r, 220));
      if (kind === 'folder') {
        return { ok: true, path: Math.random() > 0.5 ? OUT_DIR : j(SAMPLE_DIR, '星海少女') };
      }
      if (kind === 'save') {
        return { ok: true, path: j(OUT_DIR, 'scene_new.pkg') };
      }
      if (kind === 'workshop') {
        return { ok: true, path: j('C:', 'Program Files (x86)', 'Steam', 'steamapps', 'workshop', 'content', '431960') };
      }
      const picks = [
        j(SAMPLE_DIR, '星海少女', 'scene.pkg'),
        j(SAMPLE_DIR, '雨夜咖啡屋', 'scene.pkg'),
        j(SAMPLE_DIR, '猫耳电台', 'scene.pkg'),
        j(WS_ROOT, '2169432', 'scene.pkg'),
      ];
      const idx = (api._pickIndex = ((api._pickIndex || 0) + 1) % picks.length);
      return { ok: true, path: picks[idx] };
    },

    async reveal() {
      return { ok: true };
    },

    async open() {
      return { ok: true };
    },

    async saveSettings(patch) {
      const next = { ...settings, ...(patch || {}) };
      if (next.theme !== 'moe' && next.theme !== 'pro') throw new Error('未知主题');
      if (next.concurrency != null) {
        next.concurrency = Math.max(1, Math.min(4, Number(next.concurrency) || 1));
      }
      Object.assign(settings, next);
      try {
        localStorage.setItem(THEME_KEY, settings.theme);
      } catch (e) {
        /* ignore */
      }
      emit({ type: 'state', state: stateSnapshot() });
      return { ok: true, settings: { ...settings, workshop_dirs: settings.workshop_dirs.slice() } };
    },

    async setRepkg(path) {
      if (!/RePKG\.exe$/i.test(String(path || ''))) {
        throw new Error('这不是 RePKG.exe，请重新指定');
      }
      repkg.path = path;
      repkg.source = 'custom';
      repkg.ok = true;
      repkg.error = null;
      emit({ type: 'state', state: stateSnapshot() });
      return { ok: true, repkg: { ...repkg } };
    },

    async autodetect() {
      repkg.path = REPKG_EXE;
      repkg.version = '0.4.0';
      repkg.ok = true;
      repkg.source = 'bundled';
      repkg.error = null;
      emit({ type: 'state', state: stateSnapshot() });
      return { ok: true, repkg: { ...repkg } };
    },

    async clearData(what) {
      if (what === 'recent') recent = [];
      emit({ type: 'state', state: stateSnapshot() });
      return { ok: true };
    },

    async upload(file) {
      const safe = String(file && file.name ? file.name : 'file.pkg').replace(/[\\/:*?"<>|]/g, '_');
      return { ok: true, path: j(INBOX, `${Date.now()}_${safe}`) };
    },

    subscribe(fn) {
      subscribers.add(fn);
      ensureEngine();
      setTimeout(() => fn({ type: '__conn', status: 'live' }), 240);
      return () => subscribers.delete(fn);
    },

    /* 仅供演示页使用的额外信息 */
    mockMeta: {
      galleryDir: GALLERY_DIR,
      brokenSample: j(SAMPLE_DIR, '存档损坏', 'broken_scene.pkg'),
    },
  };

  return api;
}
