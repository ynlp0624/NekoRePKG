# NekoRePKG · 猫羽解包器 —— 项目规格（SPEC）

> 面向不会命令行的用户，把 RePKG.exe（CLI）包成一个独立 GUI 工具，并在其上扩展功能。
> 本文档是前端与后端协作的唯一契约。**任何一方都不得擅自改契约**；需要改动先在 `docs/` 里改本文档并通知 Lead。

---

## 1. 产品形态

- 名称：**NekoRePKG · 猫羽解包器**（窗口标题：`NekoRePKG · 猫羽解包器`）
- 平台：Windows 10/11 x64
- 形态：独立窗口（pywebview + Edge WebView2），内部由本地 HTTP 服务承载 UI；无浏览器地址栏、无外部依赖、完全离线可用。
- 内核：调用同目录/资源目录里的 `RePKG.exe`（0.4.0，MIT，作者 NotScuffed）；对 `.pkg` 的读取与重打包由 Python 自研实现。
- 主题：**萌系（moe）** 与 **简洁（pro）** 双主题，可在设置里切换，或用顶栏按钮一键切换，选择要持久化。
- 界面语言：简体中文（少量萌系语气只出现在空状态/提示，不要影响功能文案的准确性）。

---

## 2. 技术约束（前端）

1. **纯静态**：`app/web/` 下只有 `index.html`、CSS、JS、SVG/图片。不允许 npm、打包器、框架 CDN、外部字体、外部图标库。
2. 原生 ES Modules（`<script type="module" src="js/main.js">`），现代 Chromium（WebView2，Chromium 130+）可直接运行。
3. 所有图标用内联 SVG 或 `assets/*.svg`，禁止 emoji 当功能图标（可以用在文案里）。
4. 字体只用系统字体栈：`"Microsoft YaHei UI", "Segoe UI", system-ui, sans-serif`。
5. 布局适配：窗口最小 1024×680，常规 1280×820；面板可滚动，不允许整页出现横向滚动条。
6. 键盘：Esc 关弹窗，Enter 确认，`←/→` 在画廊灯箱切换，Ctrl+O 选择文件，Ctrl+, 打开设置。
7. 数字/大小格式化：字节用 `1.2 MB` 风格（1024 进制，1 位小数）；时间用 `2026-10-27 19:40`。
8. 错误必须可见：任何 API 失败 → toast（红）+ 对应区域错误态，不允许静默失败。
9. 加载中必须可见：按钮 loading、骨架屏/占位、任务进度。
10. 主题切换用 `<html data-theme="moe|pro">`，所有颜色只从 CSS 变量取。
11. `prefers-reduced-motion` 下关闭装饰动画。
12. 无障碍：所有按钮有 `title`/`aria-label`，可 Tab 聚焦。

---

## 3. 目录与归属

```
E:\repkg\RePKG-GUI\
  app\
    main.py             # 入口：启动本地 HTTP + pywebview 窗口        [Lead]
    server.py           # 静态资源 + REST + SSE 服务                  [Lead]
    api.py              # REST 路由处理（调用 core）                  [Lead]
    core\
      pkgfmt.py         # .pkg 读/写/inspect（自研）                  [pkg-core]
      scanner.py        # Steam / Wallpaper Engine 工坊扫描           [pkg-core]
      repkg.py          # 调 RePKG.exe、解析输出、进度                 [Lead]
      jobs.py           # 任务队列、并发、取消、日志                   [Lead]
      config.py         # 设置/最近记录持久化（%APPDATA%\NekoRePKG）    [Lead]
      paths.py          # 资源定位（开发/打包）、缩略图缓存            [Lead]
    web\                                                   [frontend-neko]
      index.html
      css\theme.css     # 设计变量、两套主题、基础排版
      css\app.css       # 布局与组件
      js\main.js        # 路由 + 初始化
      js\api.js         # 统一 API 层（真实 / mock 自动切换）
      js\mock.js        # mock 数据与模拟任务
      js\store.js       # 全局状态 + SSE 订阅
      js\ui.js          # toast / modal / 格式化 / 图标 / 组件
      js\pages\*.js     # extract / pack / inspect / workshop / gallery / settings
      assets\logo.svg, mascot.svg, ...
  resources\RePKG.exe, THIRD-PARTY-NOTICES.txt
  build\build.ps1, icon.ico, spec
  docs\SPEC.md
  tests\ (pkg-core: test_pkgfmt.py / make_fixture.py；Lead: 其它)
```

**写入范围**：frontend-neko 只写 `app/web/**`；pkg-core 只写 `app/core/pkgfmt.py`、`app/core/scanner.py`、`tests/test_pkgfmt.py`、`tests/make_fixture.py`；其余由 Lead 写。不要改别人的文件，需要对方配合就在任务里说明。

Python 解释器：`E:\repkg\.venv\Scripts\python.exe`（已装 pywebview 6.2.1 / pythonnet 3.2.1 / pyinstaller 6.22.3 / Pillow 13）。pip 走清华镜像 `-i https://pypi.tuna.tsinghua.edu.cn/simple`。

---

## 4. 设计变量（两套主题，必须都实现）

```css
:root[data-theme="moe"] {
  --bg: #eef4ff;          /* 页面底 */
  --bg-grad: radial-gradient(1200px 600px at 15% -10%, #fde7f3 0%, transparent 60%),
             radial-gradient(900px 500px at 95% 0%, #e2f0ff 0%, transparent 55%), #eef4ff;
  --panel: #ffffff;       --panel-2: #f7faff;   --panel-3: #eef5ff;
  --border: #dbe7ff;      --border-strong: #c3d8ff;
  --text: #2a3350;        --text-2: #56648a;    --muted: #8494b4;
  --primary: #5f95ff;     --primary-hover: #4c86fb; --primary-soft: #e8f1ff; --on-primary: #ffffff;
  --accent: #ff9ec4;      --accent-soft: #ffe9f3;
  --ok: #22b47e; --ok-soft: #e3f8ef;
  --warn: #f5a623; --warn-soft: #fff4e0;
  --err: #f2556c; --err-soft: #ffe8ec;
  --shadow-sm: 0 1px 2px rgba(63, 92, 160, .08);
  --shadow: 0 8px 24px rgba(63, 92, 160, .10);
  --shadow-lg: 0 20px 48px rgba(63, 92, 160, .16);
  --radius: 18px; --radius-sm: 12px; --radius-lg: 26px;
  --font: "Microsoft YaHei UI", "Segoe UI", system-ui, sans-serif;
  --mono: "Cascadia Mono", "Consolas", monospace;
}
:root[data-theme="pro"] {
  --bg: #12141a;  --bg-grad: radial-gradient(1000px 520px at 10% -10%, #1b2130 0%, transparent 60%), #12141a;
  --panel: #1b1f28; --panel-2: #20252f; --panel-3: #262c38;
  --border: #2b3342; --border-strong: #3a4557;
  --text: #e8edf7; --text-2: #b7c2d6; --muted: #8592a8;
  --primary: #5b9dff; --primary-hover: #77adff; --primary-soft: #1d2b44; --on-primary: #07101f;
  --accent: #ffb86b; --accent-soft: #3a2c1c;
  --ok: #3ddc97; --ok-soft: #14352a;
  --warn: #ffbf5c; --warn-soft: #3a2f1a;
  --err: #ff6b81; --err-soft: #3a1d24;
  --shadow-sm: 0 1px 2px rgba(0,0,0,.4);
  --shadow: 0 10px 28px rgba(0,0,0,.35);
  --shadow-lg: 0 24px 60px rgba(0,0,0,.5);
  --radius: 14px; --radius-sm: 10px; --radius-lg: 20px;
}
```

萌系细节（只在 moe 主题生效，用 `[data-theme="moe"]` 限定，不要污染 pro）：
- logo 带猫耳形状、顶栏右下角淡淡猫爪水印；卡片 18px 圆角 + 柔和阴影。
- 空状态配 `assets/mascot.svg`（蓝色小猫，149cm 娇小 Q 版），文案「这里空空的喵~」。
- 悬停有 1.5px 位移，允许 150ms 缓动；不要花哨到影响操作。
- 强调色可以用 `--accent` 粉做少量点缀（选中、进度条尾端）。

---

## 5. 页面需求

导航（左侧 220px 固定栏，moe 主题圆角胶囊选中态）：
`解包` · `打包` · `包信息` · `创意工坊` · `画廊` · `设置`
顶部栏（高 64px）：logo + 标题 + （中间留白）+ RePKG 状态胶囊（就绪/未找到，点击跳设置）+ 主题切换按钮 + 任务计数角标（运行中任务数）。
底部状态栏（高 28px）：版本 · 当前任务数 · 最近一条 SSE 心跳/提示（很小的字）。

### 5.1 解包（首页）
- 拖放区（大，虚线圆角，paw/box 图标）：提示「把 .pkg 拖进来 / 或点击选择」，支持多选 `.pkg`、也接受文件夹（后端递归找 pkg）。
  - 浏览器拖放只拿得到文件本体：前端拿到 `File` 后调用 `POST /api/upload` 上传到临时目录再入队；**拖入文件夹**时提示「文件夹请用选择按钮」。按钮触发的原生对话框支持选文件夹。
- 已选列表：每项显示文件名、大小、完整路径（省略中间）、移除按钮；支持清空。
- 输出目录：路径输入框（只读，可编辑）+ 「选择…」+「打开」。默认取设置里的默认输出目录。
- 高级选项（可折叠，默认收起）：仅提取扩展名 / 忽略扩展名（逗号分隔，自动补 `.`）、单目录、递归、复制 project.json 与 preview、用作品名做文件夹名、不转换贴图、覆盖已存在。
- 「开始解包」主按钮：入队成功后切到任务面板，按钮 loading。
- 右侧（或下方，窄宽度时）任务面板：
  - 任务卡：标题、输入路径、状态徽章（排队/进行中/完成/失败/已取消）、进度条 + `done/total` + 当前阶段文案、耗时、操作（取消 / 打开输出目录 / 查看画廊 / 移除）。
  - 展开看实时日志（等宽、暗底、自动滚底、可暂停自动滚动、可复制全部）。
  - 全部完成时 toast：「解包完成，共 N 个文件」+ 按钮「打开目录」「去画廊」。
- 最近任务列表（来自 `/api/state` 的 recent），点击可重新载入参数。

### 5.2 打包（回封 .pkg）
- 「源文件夹」选择 + 拖入文件夹（同样只能按钮选）。
- 输出 `.pkg` 路径：默认 `源文件夹名.pkg`，放在桌面或设置里的默认输出目录；「另存为…」。
- 排除规则（默认 `project.json, preview.jpg, preview.png, *.tex-json`，可编辑逗号分隔，支持通配符 `*`）。
- 魔数（默认 `PKGV0021`，下拉可编辑：PKGV0021 / PKGV0020 / PKGV0019）。
- 选项：打包后校验（默认开）。
- 危险提示卡（moe 主题用 warn 色）：「回封的 pkg 只能用于替换 scene.json/素材等；贴图不要指望从 png 转回 tex」。勾选后开始。
- 完成后展示：条目数、总大小、文件路径、校验结果（用 RePKG 再解一遍对比），「打开所在文件夹」。

### 5.3 包信息
- 选择/拖入一个 `.pkg` → 头部信息卡：封面图（若有 preview）、标题、类型（scene/video/web）、pkg 大小、条目数、数据大小、Workshop ID（若有）、路径（可复制）。
- 统计：按扩展名聚合的条形/占比（`.json/.tex/.png/...` 各 count 与 size）。
- 条目表：全量（上限 5000 行，超出提示），列：路径 / 扩展名 / 类型（贴图/普通）/ 大小；支持搜索框（模糊）、按大小/名称排序、按扩展筛选、点击行复制路径、Ctrl 点击多选？不需要。
- project.json：折叠的格式化 JSON（`<pre>`，等宽字体），「复制」按钮；缺失时显示提示。
- 快捷按钮：「解包这个包」→ 带参跳到解包页。
- 大包解析要有 loading（>50MB 显示「正在读取…」），失败给出可读原因（非 pkg / 文件损坏 / 无权限）。

### 5.4 创意工坊
- 首次进入自动 `GET /api/workshop`；若扫描中显示进度骨架。
- 顶部：Steam 路径、workshop 目录（多个时下拉）、「重新扫描」按钮、搜索框、类型筛选（全部/scene/video/web）、排序（名称/大小/修改时间）。
- 卡片网格（封面缩略图 + 标题 + 类型徽章 + 大小 + mtime；hover 出现勾选框），支持多选、「全选筛选结果」「清空选择」。
- 底部浮动操作条：`已选 N 个 · 合计 X GB` + 「批量解包」（跳到解包页并带入输入与默认输出） + 「取消选择」。
- 空态：没找到 Steam 时给出提示与「手动选择 workshop 目录」入口（选择后写入设置 `workshop_dirs`）。
- 卡片点击可「查看信息」（打开包信息页的简化卡片，或直接弹详情抽屉）。

### 5.5 画廊
- 入口：解包完成后跳转（带 `dir` 参数），或手动选择文件夹。
- 顶栏：当前目录（可改）、图片数、「在资源管理器打开」、排序（名称/时间/大小）、缩略图大小滑块（128–320px）。
- 网格：懒加载缩略图（`/api/thumb?path=...&w=`），hover 显示文件名；点击打开灯箱。
- 灯箱：大图（`/api/image?path=...`）、文件名、尺寸/大小、上一张/下一张、缩放（滚轮 + 按钮，1x–4x）、「打开文件」「打开所在目录」、Esc 关闭。
- 加载失败显示占位图标，不阻塞其它图。

### 5.6 设置
- 外观：主题（萌系 / 简洁）单选卡片，即时预览。
- RePKG：路径输入 + 「自动检测」+「浏览…」；显示版本、来源（内置/自定义）、是否可用；不可用时红字说明（如「未找到 RePKG.exe，请重新指定」）。
- 默认输出目录：选择 + 打开。
- 并发任务数：1–4 滑块/下拉。
- 其它开关：解包完成后自动打开输出目录、解包完成后播放提示音（可选实现，默认关）。
- 数据：打开配置目录、打开日志目录、清空最近记录、缩略图缓存大小 + 清理。
- 关于：版本、RePKG 0.4.0 by NotScuffed（MIT）、「查看第三方许可」（打开 `THIRD-PARTY-NOTICES.txt`）。

---

## 6. REST 契约

本地服务：`http://127.0.0.1:<随机端口>`，仅本机。所有响应 `Content-Type: application/json; charset=utf-8`（图片端点除外）。
成功：HTTP 200 + `{"ok": true, ...}`；失败：HTTP 4xx/5xx + `{"ok": false, "error": "可读中文原因"}`。
时间戳：ISO8601 带时区，如 `2026-10-27T19:40:05+08:00`。

### 6.1 状态与会话

`GET /api/state`
```json
{
  "ok": true,
  "app": {"name":"NekoRePKG","version":"1.0.0","platform":"windows","log_dir":"C:\\Users\\x\\AppData\\Roaming\\NekoRePKG\\logs","config_path":"..."},
  "repkg": {"path":"...\\RePKG.exe","version":"0.4.0","ok":true,"source":"bundled","error":null},
  "settings": {"theme":"moe","default_output":"E:\\repkg\\output","concurrency":2,"repkg_path":null,
               "open_after_extract":false,"workshop_dirs":[],"recent_limit":20},
  "recent": [{"path":"E:\\...\\scene.pkg","kind":"pkg","name":"scene.pkg","when":"2026-10-27T19:40:05+08:00","size":123}],
  "jobs": {"running":1,"queued":0}
}
```

`POST /api/pick` body `{"kind":"pkg"|"folder"|"save","title":"...","default_dir":"...","default_name":"..."}`
→ `{"ok":true,"path":"C:\\..."|null}`（用户取消时 path 为 null）

`POST /api/reveal` `{"path":"C:\\..."}` → `{"ok":true}`（资源管理器选中）
`POST /api/open` `{"path":"C:\\..."}` → `{"ok":true}`（默认程序打开）
`POST /api/upload` — 浏览器拖放的文件：`multipart/form-data`，字段 `file`；返回 `{"ok":true,"path":"C:\\...\\_inbox\\xxx.pkg"}`

`POST /api/settings` `{"settings":{"theme":"pro", ...}}` → `{"ok":true,"settings":{...}}`（部分更新；写入成功后广播 SSE `state`）
`POST /api/repkg` `{"path":"C:\\...\\RePKG.exe"}` → `{"ok":true,"repkg":{...}}`（校验并保存；失败 400）
`POST /api/repkg/autodetect` → `{"ok":true,"repkg":{...}}`
`POST /api/data/clear` `{"what":"recent"|"thumbs"}` → `{"ok":true}`

### 6.2 包解析

`POST /api/inspect` `{"path":"C:\\...\\scene.pkg"}`
```json
{"ok":true,"path":"...","name":"scene.pkg","size":123456,"magic":"PKGV0021",
 "entry_count":128,"data_size":123000,"warnings":[],
 "entries":[{"path":"materials\\a.json","name":"a.json","dir":"materials","ext":".json","type":"binary","size":1024,"offset":0}],
 "by_ext":[{"ext":".json","count":10,"size":2048}],
 "project":{"title":"我的壁纸","type":"scene","file":"scene.pkg","preview":"preview.jpg","tags":["Anime"],
            "workshopid":"2169432","description":"...","raw":{...}},
 "preview_url":"/api/image?path=C%3A%5C...%5Cpreview.jpg"}
```
`type` 取值：`texture`（.tex）/ `binary`（其它）。`project` 缺失时为 `null`。

### 6.3 任务

Job 对象（所有任务接口统一）：
```json
{"id":"j_ab12","kind":"extract","title":"scene.pkg","input":"C:\\...\\scene.pkg",
 "output_dir":"E:\\out","status":"running",
 "progress":{"done":12,"total":128,"phase":"正在解包 materials\\a.tex","percent":9.4},
 "started_at":"2026-10-27T19:40:05+08:00","ended_at":null,"elapsed":3.2,
 "error":null,"result":{"files":12,"bytes":123456,"output_dir":"E:\\out\\scene"},
 "exit_code":null}
```
`status`：`queued` / `running` / `done` / `error` / `cancelled`。

- `POST /api/jobs/extract`
```json
{"inputs":["C:\\a\\scene.pkg","C:\\b"],"output_dir":"E:\\out",
 "options":{"only_exts":"","ignore_exts":"","single_dir":false,"recursive":true,
            "copy_project":true,"use_name":false,"no_tex_convert":false,"overwrite":false}}
```
→ `{"ok":true,"job_ids":["j_1","j_2"],"rejected":[{"input":"...","reason":"不是 .pkg 文件"}]}`
（一个输入一个任务；文件夹输入时交给 RePKG 目录模式处理，`recursive` 生效）

- `POST /api/jobs/pack`
```json
{"source_dir":"E:\\out\\scene","output_pkg":"E:\\out\\scene_new.pkg",
 "options":{"exclude":["project.json","preview.jpg","*.tex-json"],"magic":"PKGV0021","verify":true}}
```
→ `{"ok":true,"job_id":"j_3"}`

- `POST /api/jobs/tex`
```json
{"inputs":["C:\\x.tex","C:\\texdir"],"output_dir":"E:\\out","recursive":false,"overwrite":false}
```
→ `{"ok":true,"job_ids":["j_4"]}`

- `GET /api/jobs` → `{"ok":true,"jobs":[Job,...]}`（新的在前，最多 100 条）
- `POST /api/jobs/cancel` `{"id":"j_1"}` → `{"ok":true}`
- `POST /api/jobs/remove` `{"id":"j_1"}` → `{"ok":true}`（不能移除运行中任务）
- `POST /api/jobs/clear` `{"ids":null}` → `{"ok":true}`（null=清掉所有已结束任务）
- `GET /api/jobs/log?id=j_1&after=120` → `{"ok":true,"lines":[{"i":120,"t":"19:40:05","level":"info","text":"* Extracting: ..."}],"next":121}`
- `POST /api/jobs/open_output` `{"id":"j_1"}` → `{"ok":true}`

### 6.4 画廊与图片

`GET /api/gallery?dir=E%3A%5Cout&offset=0&limit=200&sort=name|mtime|size&q=`
```json
{"ok":true,"dir":"E:\\out","total":37,"images":[
  {"path":"E:\\out\\a.png","name":"a.png","ext":".png","size":1234,"mtime":"2026-10-27T19:40:05+08:00",
   "thumb":"/api/thumb?path=...&w=360"}]}
```
`GET /api/thumb?path=<urlencoded>&w=360` → `image/jpeg`（等比缩放，居中裁剪或等比均可；失败 404）
`GET /api/image?path=<urlencoded>[&download=1]` → 原图字节（带正确 Content-Type；`download=1` 时加 `Content-Disposition: attachment`）

### 6.5 创意工坊

`GET /api/workshop` →
```json
{"ok":true,"scanning":false,"steam_root":"C:\\Program Files (x86)\\Steam",
 "dirs":["C:\\...\\steamapps\\workshop\\content\\431960"],
 "items":[{"id":"2169432","dir":"...","title":"...","type":"scene",
           "preview":"C:\\...\\preview.jpg","preview_url":"/api/thumb?path=...&w=480",
           "pkg":"C:\\...\\scene.pkg","pkg_count":1,"size":1234567,
           "mtime":"2026-10-27T19:40:05+08:00","tags":["Anime"],"description":"..."}],
 "updated_at":"2026-10-27T19:40:05+08:00","error":null}
```
`POST /api/workshop/refresh` → `{"ok":true}`（异步；完成后广播 SSE `workshop`）
`POST /api/workshop/add_dir` `{"dir":"C:\\my\\workshop\\431960"}` → `{"ok":true}`（写入设置并触发扫描）

### 6.6 SSE

`GET /events`（`text/event-stream`，每 15s 一条 `: ping`）
事件格式：`data: <json>\n\n`，json 的 `type`：
- `{"type":"job","job":{...}}` — 任务创建/状态/进度变化
- `{"type":"log","job_id":"j_1","lines":[{"i":0,"t":"19:40:05","level":"info","text":"..."}]}`
- `{"type":"toast","level":"ok|info|warn|error","text":"..."}`
- `{"type":"state","state":{...}}` — 设置等变化（结构同 `/api/state`）
- `{"type":"workshop","data":{...}}` — 扫描完成
- `{"type":"gallery","dir":"E:\\out"}` — 画廊目录有更新（可选）

---

## 7. Mock 模式（前端独立开发用）

- 当 URL 带 `?mock=1` 时，`js/api.js` 走 `js/mock.js`，**不发任何真实请求**，SSE 用定时器模拟。
- mock 必须覆盖：state、inspect（100+ 条目、含 project.json）、任务（排队→运行→完成，含日志滚动、进度条）、工坊（12 个作品、封面图用内置 SVG 占位）、画廊（24 张占位图，用 `data:` SVG 生成）、设置保存。
- 图片端点用 `data:` URI 或内置 SVG；不要联网。
- 真实模式下（无 `mock=1`）走 `fetch('/api/...')` 与 `new EventSource('/events')`。

前端自测方式：
```
cd E:\repkg\RePKG-GUI\app\web
E:\repkg\.venv\Scripts\python.exe -m http.server 8848
```
用 Edge 无头截图检查：`msedge --headless=new --disable-gpu --screenshot=E:\repkg\shot.png --window-size=1440,900 "http://127.0.0.1:8848/?mock=1#/extract"`。

---

## 8. 后端行为约定（Lead 实现，前端可依赖）

- RePKG.exe 输出按 UTF-8 读取；`* Extracting:`/`* Skipping, already exists:` 计入进度；`### Extracting package:` 更新 phase；`* Reading:` 表示贴图转换阶段。
- 任务完成后 `result.files` = 实际写出的文件数（通过对比输出目录快照统计）。
- 打包任务：写入 pkg（magic + 条目头 + 数据体，路径用 `\` 分隔），`verify=true` 时用 RePKG.exe 再解到临时目录并比对文件数与总字节，结果写入 job.result.verify。
- 所有任务串行/并发由 `settings.concurrency` 控制（默认 2）。
- 取消：杀进程树，状态 `cancelled`，保留已写出的文件。
- 输出目录不存在时自动创建；磁盘/权限错误转成中文可读错误。

---

## 9. 验收清单

- [ ] 两套主题都完整（所有页面无写死颜色漏出）
- [ ] 1440×900、1280×820、1024×680 三种尺寸无溢出、无横向滚动
- [ ] mock 模式下 6 个页面都能独立演示，含空态、加载态、错误态
- [ ] 真实端到端：拖/选 pkg → 解包 → 画廊缩略图 → 打开目录
- [ ] 打包 → 校验通过
- [ ] 工坊扫描 → 多选 → 批量解包
- [ ] 设置改主题/RePKG 路径立即生效并持久化
- [ ] 关闭窗口后进程完全退出（无残留 python 进程）
- [ ] 打包后的 exe 双击可用、完全离线
