const fs = require('fs');
const NOTES = fs.readFileSync('tools/_notes.txt','utf8');
const TOKEN = process.env.GITCODE_TOKEN;
(async () => {
  const res = await fetch('https://api.gitcode.com/api/v5/repos/gcw_YiSvwnI0/NekoRePKG/releases/v1.0.0', {
    method: 'PATCH',
    headers: {'PRIVATE-TOKEN': TOKEN, 'Content-Type':'application/json'},
    body: JSON.stringify({ name: 'v1.0.0 · 首发', body: NOTES })
  });
  console.log(res.status, (await res.text()).slice(0, 300));
})();
