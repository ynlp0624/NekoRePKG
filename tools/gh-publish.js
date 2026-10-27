// 发布 NekoRePKG：创建仓库、推送源码、开启 GitHub Pages（main / docs）、创建 Release 并上传 exe/zip
// 用法：set GH_TOKEN=... && node tools/gh-publish.js [--no-release] [--no-push]
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.GH_TOKEN;
const OWNER = 'ynlp0624';
const REPO = 'NekoRePKG';
const ROOT = path.resolve(__dirname, '..');
const SITE_URL = `https://${OWNER}.github.io/${REPO}/`;
const REPO_URL = `https://github.com/${OWNER}/${REPO}`;
const VERSION = 'v1.0.0';

if (!TOKEN) {
  console.error('GH_TOKEN missing');
  process.exit(1);
}

const SKIP_DIRS = new Set(['.git', '.venv', '__pycache__', 'dist', 'shots', '_work']);
const SKIP_FILE = [
  /^build\/work-onefile\//,
  /^build\/work-onedir\//,
  /^build\/dist-onedir\//,
  /^build\/[^/]+\.spec$/,
  /\.pyc$/,
  /\.log$/
];

async function api(method, url, body, base = 'https://api.github.com') {
  const res = await fetch(base + url, {
    method,
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'nekorepkg-dsh'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`${method} ${url} -> ${res.status}: ${text.slice(0, 500)}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return text ? JSON.parse(text) : {};
}

function walk(dir, base, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = base ? base + '/' + entry.name : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, rel, out);
    } else if (entry.isFile()) {
      const norm = rel.split(path.sep).join('/');
      if (SKIP_FILE.some((re) => re.test(norm))) continue;
      out.push({ rel: norm, full });
    }
  }
  return out;
}

const RELEASE_BODY = `## NekoRePKG · 猫羽解包器 v1.0.0

Wallpaper Engine 壁纸的图形化 **解包 / 浏览 / 重新打包** 工具。RePKG 的 GUI 版，双击即用，全中文，完全离线。

### 亮点
- **解包**：拖入 \`.pkg\`（支持多选、整个文件夹），贴图自动转 PNG，全部选项可视化
- **包信息**：不解包就能看条目表、扩展名统计、\`project.json\` 与封面
- **重新打包**：自研 pkg 写入器把文件夹回封成 \`.pkg\`（RePKG 本身不支持），封完自动回读校验
- **创意工坊**：自动发现 Steam 工坊目录（431960），封面墙多选批量解包
- **画廊**：缩略图墙 + 灯箱大图（缩放 / 左右切换 / 打开原图）
- **任务队列**：1–4 并发、实时进度与日志、可取消
- **双主题**：萌系（默认）/ 简洁，设置里一键切换
- 内置 RePKG 0.4.0（MIT, NotScuffed），无需 Python / .NET 运行库，全程不联网

### 下载
| 文件 | 说明 | 大小 |
|---|---|---|
| \`NekoRePKG.exe\` | 单文件版，双击即用 | 21.4 MB |
| \`NekoRePKG-win64.zip\` | 文件夹版，启动更快 | 约 21 MB |

### 签名与校验
- Authenticode 签名者：\`CN=猫羽雫, OU=签名部, O=自家工房, C=CN\`（SHA-256 + DigiCert 时间戳）
- SHA-256（单文件版）：\`BA97844D65398ED1DE2A877D43840D2CFDB35BBF48AF5C472FEE9D94D6941907\`
- 自签名证书只在本机受信任；其他电脑导入 \`root.cer\` / \`leaf.cer\` 后显示为可信（见官网 FAQ）
- SmartScreen 仍按信誉判断，首次运行点「更多信息 → 仍要运行」

### 系统要求
Windows 10 / 11 · x64

### 链接
- 官网：${SITE_URL}
- 源码：${REPO_URL}
`;

async function ensureRepo() {
  try {
    const repo = await api('GET', `/repos/${OWNER}/${REPO}`);
    console.log('repo exists:', repo.full_name, 'default_branch=' + repo.default_branch);
    return repo;
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  const repo = await api('POST', '/user/repos', {
    name: REPO,
    description: 'NekoRePKG · 猫羽解包器 — Wallpaper Engine .pkg 解包 / 包信息 / 重新打包 GUI（RePKG 的图形界面版）',
    homepage: SITE_URL,
    private: false,
    has_issues: true,
    has_wiki: false,
    auto_init: false
  });
  console.log('repo created:', repo.full_name);
  return repo;
}

async function pushTree(files) {
  console.log(`files to push: ${files.length}`);
  // 空仓库种子提交
  let base = null;
  try {
    const ref = await api('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/main`);
    base = ref.object.sha;
    console.log('existing main:', base);
  } catch (e) {
    if (e.status !== 404 && e.status !== 409) throw e;
  }

  const tree = [];
  let done = 0;

  // 空仓库：先用 contents API 做一次种子提交，否则 git/blobs 会 409
  if (!base) {
    const seedBuf = fs.readFileSync(path.join(ROOT, 'README.md'));
    const seed = await api('PUT', `/repos/${OWNER}/${REPO}/contents/README.md`, {
      message: 'chore: 初始化仓库',
      content: seedBuf.toString('base64')
    });
    base = seed.commit.sha;
    console.log('seed commit:', base);
  }

  for (const f of files) {
    const buf = fs.readFileSync(f.full);
    let blob;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        blob = await api('POST', `/repos/${OWNER}/${REPO}/git/blobs`, {
          content: buf.toString('base64'),
          encoding: 'base64'
        });
        break;
      } catch (e) {
        if (attempt === 4) throw e;
        await new Promise((r) => setTimeout(r, 700 * attempt));
      }
    }
    tree.push({ path: f.rel, mode: '100644', type: 'blob', sha: blob.sha });
    done += 1;
    if (done % 10 === 0 || done === files.length) console.log(`  blobs ${done}/${files.length}`);
  }

  const treeRes = await api('POST', `/repos/${OWNER}/${REPO}/git/trees`, { tree });
  const commit = await api('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
    message: 'release: NekoRePKG v1.0.0（源码 + 官网 docs/）',
    tree: treeRes.sha,
    parents: base ? [base] : []
  });
  console.log('commit:', commit.sha);
  if (base) {
    await api('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/main`, { sha: commit.sha, force: true });
  } else {
    await api('POST', `/repos/${OWNER}/${REPO}/git/refs`, { ref: 'refs/heads/main', sha: commit.sha });
  }
  await api('PATCH', `/repos/${OWNER}/${REPO}`, { default_branch: 'main' });
  console.log('pushed main');
}

async function enablePages() {
  try {
    await api('POST', `/repos/${OWNER}/${REPO}/pages`, {
      source: { branch: 'main', path: '/docs' },
      build_type: 'legacy'
    });
    console.log('pages enabled (main /docs)');
  } catch (e) {
    if (e.status === 409) {
      console.log('pages already enabled');
    } else {
      console.log('pages enable failed:', e.message);
    }
  }
  for (let i = 0; i < 20; i++) {
    try {
      const p = await api('GET', `/repos/${OWNER}/${REPO}/pages`);
      console.log('  pages:', p.status, p.html_url || '');
      if (p.status === 'built') break;
    } catch (e) {
      if (e.status !== 404) console.log('  pages status error:', e.status);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function uploadAsset(releaseId, filePath, name) {
  const buf = fs.readFileSync(filePath);
  const url = `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`;
  const started = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(buf.length),
      'User-Agent': 'nekorepkg-dsh'
    },
    body: buf
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`upload ${name} -> ${res.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text);
  console.log(`  uploaded ${name} (${(buf.length / 1024 / 1024).toFixed(2)} MB, ${((Date.now() - started) / 1000).toFixed(1)}s)`);
  return json;
}

async function ensureRelease() {
  let release;
  try {
    release = await api('GET', `/repos/${OWNER}/${REPO}/releases/tags/${VERSION}`);
    console.log('release exists:', release.id);
  } catch (e) {
    if (e.status !== 404) throw e;
    release = await api('POST', `/repos/${OWNER}/${REPO}/releases`, {
      tag_name: VERSION,
      target_commitish: 'main',
      name: `${VERSION} · 首发`,
      body: RELEASE_BODY,
      draft: false,
      prerelease: false
    });
    console.log('release created:', release.html_url);
  }
  const assets = [
    [path.join(ROOT, 'dist/NekoRePKG.exe'), 'NekoRePKG.exe'],
    [path.join(ROOT, 'dist/NekoRePKG-win64.zip'), 'NekoRePKG-win64.zip']
  ];
  const existing = (release.assets || []).map((a) => a.name);
  for (const [file, name] of assets) {
    if (existing.includes(name)) { console.log('  skip existing:', name); continue; }
    if (!fs.existsSync(file)) { console.log('  missing:', file); continue; }
    try {
      await uploadAsset(release.id, file, name);
    } catch (e) {
      console.error('  upload failed:', e.message);
    }
  }
  return release;
}

(async () => {
  const argv = process.argv.slice(2);
  const noPush = argv.includes('--no-push');
  const noRelease = argv.includes('--no-release');

  await ensureRepo();
  if (!noPush) {
    const files = walk(ROOT, '', []);
    await pushTree(files);
  }
  await enablePages();
  if (!noRelease) await ensureRelease();

  console.log('\nDONE');
  console.log('  repo :', REPO_URL);
  console.log('  site :', SITE_URL);
  console.log('  rel  :', `${REPO_URL}/releases/tag/${VERSION}`);
})();
