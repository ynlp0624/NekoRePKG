## NekoRePKG · 猫羽解包器 v1.1.0

Wallpaper Engine 壁纸的图形化 **解包 / 浏览 / 重新打包** 工具。双击即用，全中文，完全离线。

### v1.1.0 更新

- **解包输出自动按包建子文件夹**，不再把不同壁纸的文件堆在同一个目录里：
  - 工坊包（`...\workshop\content\431960\2595877264\scene.pkg`）直接用工坊 **ID** 当文件夹名 → `2595877264`
  - 普通包用 `project.json` 里的**精简作品名**：去掉 `[4K]`、`[长英文副标题]` 这类标签，清掉非法字符，最多 40 字
  - 例如 `[4K]Win11娘 鼠标特效+音频可视化+日期时间[Mouse Effect+Visualizer+Date&time]` → `Win11娘 鼠标特效+音频可视化+日期时间`
- 解包页「高级选项 → 输出子文件夹命名」可选：**自动 / 工坊 ID / 精简作品名 / ID + 名称 / 包文件名 / 不建子文件夹**（默认自动）
- 「打开输出目录」「去画廊」、任务结果都会指向该子文件夹；批量解包时每个包各占一个文件夹
- 打包页的「排除转换出的 PNG」（v1.0.1 加入）继续保留

### 内置 RePKG 0.4.0（无需另外下载）

**下载即用，不需要自己找 RePKG。** 解包内核 RePKG 0.4.0 已经打包在发行版里：

- 单文件版：运行时自动解压到临时目录（`_MEIxxxx\resources\RePKG.exe`）
- 文件夹版：`resources\RePKG.exe`（就在程序目录里）
- 「设置 → RePKG 内核」可以看到它的版本与路径，也可以换成自己编译的版本

RePKG 项目主页：<https://github.com/NotScuffed/RePKG> （MIT，作者 NotScuffed）

### 亮点

- **解包**：拖入 `.pkg`（支持多选、整个文件夹），贴图自动转 PNG，全部选项可视化
- **包信息**：不解包就能看条目表、扩展名统计、`project.json` 与封面
- **重新打包**：自研 pkg 写入器把文件夹回封成 `.pkg`（RePKG 本身不支持），封完自动回读校验
- **创意工坊**：自动发现 Steam 工坊目录（431960），封面墙多选批量解包
- **画廊**：缩略图墙 + 灯箱大图（缩放 / 左右切换 / 打开原图）
- **任务队列**：1–4 并发、实时进度与日志、可取消
- **双主题**：萌系（默认）/ 简洁，设置里一键切换
- 自带 Python 运行库，**不需要 Python / .NET 环境**，全程不联网

### 下载

| 文件 | 说明 | 大小 |
|---|---|---|
| `NekoRePKG.exe` | 单文件版，双击即用 | 约 21 MB |
| `NekoRePKG-win64.zip` | 文件夹版，启动更快 | 约 21 MB |

### 签名与校验

- Authenticode 签名者：`CN=猫羽雫, OU=签名部, O=自家工房, C=CN`（SHA-256 + DigiCert 时间戳）
- SHA-256（单文件版）：`B5B08D28402893E1CB8EDB6594F76A61A896BC5965B3525CBB8F0FBB15F47370`
- 自签名证书只在本机受信任；其他电脑导入 `root.cer` / `leaf.cer` 后显示为可信（见官网 FAQ）
- SmartScreen 仍按信誉判断，首次运行点「更多信息 → 仍要运行」

### 系统要求

Windows 10 / 11 · x64

### 链接

- 官网：<https://ynlp0624.github.io/NekoRePKG/>
- 源码：<https://github.com/ynlp0624/NekoRePKG>
- 国内镜像：<https://gitcode.com/gcw_YiSvwnI0/NekoRePKG>
