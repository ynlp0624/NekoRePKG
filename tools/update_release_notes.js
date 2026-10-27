// 用 docs/release-notes.md 更新 GitHub / GitCode 的 v1.0.0 Release 说明
const fs = require('fs');
const path = require('path');

const GH = process.env.GH_TOKEN;
const GC = process.env.GITCODE_TOKEN;
const REPO = 'NekoRePKG';
const TAG = 'v1.0.1';
const NOTES = fs.readFileSync(path.resolve(__dirname, '..', 'docs', 'release-notes.md'), 'utf8');

async function fetchJson(url, headers, method, body) {
  const res = await fetch(url, {
    method,
    headers: { ...headers, 'Content-Type': 'application/json', 'User-Agent': 'nekorepkg-dsh' },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

(async () => {
  if (GH) {
    const ghHeaders = { Authorization: `Bearer ${GH}`, Accept: 'application/vnd.github+json' };
    const rel = await fetchJson(`https://api.github.com/repos/ynlp0624/${REPO}/releases/tags/${TAG}`, ghHeaders, 'GET');
    await fetchJson(`https://api.github.com/repos/ynlp0624/${REPO}/releases/${rel.id}`, ghHeaders, 'PATCH', { body: NOTES });
    console.log('github release notes updated:', rel.html_url);
  }
  if (GC) {
    const gcHeaders = { 'PRIVATE-TOKEN': GC };
    await fetchJson(`https://api.gitcode.com/api/v5/repos/gcw_YiSvwnI0/${REPO}/releases/${TAG}`, gcHeaders, 'PATCH', {
      name: 'v1.0.0 · 首发',
      body: NOTES
    });
    console.log('gitcode release notes updated');
  }
})();
