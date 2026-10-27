// 在 GitCode 镜像仓库创建 v1.0.0 Release 并上传 exe / zip（两步 OBS 上传）
// 用法：set GITCODE_TOKEN=... && node tools/gitcode-release.js
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.GITCODE_TOKEN;
const OWNER = 'gcw_YiSvwnI0';
const REPO = 'NekoRePKG';
const TAG = 'v1.0.0';
const ROOT = path.resolve(__dirname, '..');
const API = 'https://api.gitcode.com/api/v5';

if (!TOKEN) { console.error('GITCODE_TOKEN missing'); process.exit(1); }

async function api(method, url, body) {
  const res = await fetch(API + url, {
    method,
    headers: {
      'PRIVATE-TOKEN': TOKEN,
      'Content-Type': 'application/json',
      'User-Agent': 'nekorepkg-dsh'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

const BODY = `NekoRePKG v1.0.0 国内镜像

- 单文件版：NekoRePKG.exe（21.4 MB，已签名，含时间戳）
- 文件夹版：NekoRePKG-win64.zip

GitHub 主仓库：https://github.com/ynlp0624/NekoRePKG
官网：https://ynlp0624.github.io/NekoRePKG/

Windows 10/11 x64 · 免安装 · 完全离线 · 内置 RePKG 0.4.0（MIT, NotScuffed）`;

async function ensureRelease() {
  try {
    const rel = await api('GET', `/repos/${OWNER}/${REPO}/releases/tags/${TAG}`);
    console.log('release exists:', rel.id ?? rel.tag_name);
    return rel;
  } catch (e) {
    if (e.message.includes('404') === false && !/404/.test(e.message)) {
      // 继续尝试创建
    }
  }
  const rel = await api('POST', `/repos/${OWNER}/${REPO}/releases`, {
    tag_name: TAG,
    target_commitish: 'main',
    name: `${TAG} · 首发`,
    body: BODY,
    prerelease: false
  });
  console.log('release created:', rel.html_url || rel.id);
  return rel;
}

async function upload(filePath, fileName) {
  const buf = fs.readFileSync(filePath);
  const info = await api('GET', `/repos/${OWNER}/${REPO}/releases/${TAG}/upload_url?file_name=${encodeURIComponent(fileName)}`);
  const url = info.url || info.upload_url;
  if (!url) throw new Error('no upload url: ' + JSON.stringify(info).slice(0, 300));
  const headers = info.headers || {};
  const started = Date.now();
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      ...headers,
      'User-Agent': 'nekorepkg-dsh',
      'Content-Length': String(buf.length)
    },
    body: buf
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`PUT ${fileName} -> ${res.status}: ${text.slice(0, 300)}`);
  console.log(`  uploaded ${fileName} (${(buf.length / 1024 / 1024).toFixed(2)} MB, ${((Date.now() - started) / 1000).toFixed(1)}s)`);
}

(async () => {
  await ensureRelease();
  for (const [file, name] of [
    [path.join(ROOT, 'dist/NekoRePKG.exe'), 'NekoRePKG.exe'],
    [path.join(ROOT, 'dist/NekoRePKG-win64.zip'), 'NekoRePKG-win64.zip']
  ]) {
    try {
      await upload(file, name);
    } catch (e) {
      console.error('  failed:', e.message);
    }
  }
  console.log('\nDONE');
  console.log('  repo   :', `https://gitcode.com/${OWNER}/${REPO}`);
  console.log('  release:', `https://gitcode.com/${OWNER}/${REPO}/releases/${TAG}`);
  console.log('  exe    :', `https://gitcode.com/${OWNER}/${REPO}/releases/download/${TAG}/NekoRePKG.exe`);
})();
