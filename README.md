# ことば · Japanese Notes

一个适合慢慢阅读的日语笔记 Web App。以 Apple Books 的书架和阅读体验为参考：暖纸色背景、衬线日文字体、三本不同颜色的笔记集，以及浅色 / 深色主题。

React + TypeScript + Vite 构建界面；Cloudflare Worker 提供 API 和静态文件；Cloudflare D1 持久保存笔记。通过 Cloudflare 连接此 GitHub 仓库，推送 `main` 后自动部署。

![书库预览](docs/library.png)

## 已实现

- **单词**：词条、平假名读音、声调数字（含 `0` 调）、词性、中文释义，可选例句。
- **拟声拟态词**：词条、中文释义、日语例句。
- **语法**：语法表达、中文释义、日语例句。
- 分类书架、全文关键词搜索、卡片 / 列表切换、排序、分页和独立阅读窗口。
- 手机、平板、桌面布局；深色主题和显示方式保存在当前浏览器。
- 粘贴 JSON 或选择 `.json` 文件，检查格式、预览类型与数量，再批量上传。
- 整批校验、事务写入、自动跳过完全重复的笔记，并返回新增 / 跳过数量。

首次数据库迁移会加入项目需求中的三条示例：`多彩`、`あたふた`、`だけあって`。后续部署不会再次加入示例，也不会清空已有笔记。

## iPhone 与添加到主屏幕

针对 iPhone 优先设计：底部「书库 / 搜索 / 导入」导航、44px 以上的主要触控区域、放大的词条 / 释义 / 例句，以及整屏纸页阅读。阅读正文单独滚动，顶部关闭与底部翻页控件固定；大字号设置会保留。刘海、横屏左右边缘和底部手势区通过安全区适配，输入框使用至少 16px 字号。

<img src="docs/iphone-library.png" width="300" alt="iPhone 书库界面" /> <img src="docs/iphone-reader.png" width="300" alt="iPhone 整屏阅读界面" />

添加方法：

1. 在 iPhone 的 Safari 中打开部署后的 **HTTPS** 网址。
2. 点击「分享」→「添加到主屏幕」，名称可保留为「日语笔记」。如果系统显示「作为 Web App 打开」，请开启。
3. 点击「添加」，以后从主屏幕图标进入，会以独立窗口打开。

已提供 180px 的 Apple Touch Icon、192px / 512px 的 Web App 图标、独立的 maskable 图标、Safari 固定标签页图标以及 SVG / PNG / ICO 标签页图标。图标来自项目自带的书本矢量稿；iOS 会应用系统的图标圆角。已添加旧快捷方式时，可移除旧图标后重新添加，以获取更新后的图标。

首次启动跟随系统的浅色 / 深色偏好，也可以点击页面右上角切换；后续启动保留手动选择。应用通过联网访问 D1 读取、导入笔记。

浏览器测试覆盖 WebKit 引擎的 320 / 375 / 393 / 430px iPhone 模拟视口、横屏、模拟安全区、整屏阅读、长例句滚动、字号保留、导入以及图标文件尺寸。这些是模拟测试，不代表已经在实体 iPhone 上逐项验证系统状态栏和软件键盘。

图标源文件：[public/icons/app-icon.svg](./public/icons/app-icon.svg)。需要更新图标时，修改矢量稿后运行：

```bash
npx playwright install chromium
npm run icons
```

参考：[Apple 的添加主屏幕说明](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios)、[WebKit 安全区说明](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)。

## 连接 GitHub 部署到 Cloudflare

这是一套 **Workers + Static Assets + D1** 应用。请创建 **Worker**，使用 Cloudflare 的 GitHub 集成部署。

### 1. 创建 D1 数据库

在 Cloudflare 控制台的 **Storage & databases → D1 → Create database** 中创建：

```text
japanese-notes-db
```

复制数据库的 **Database ID**。编辑仓库根目录的 [wrangler.jsonc](./wrangler.jsonc)，将全零占位值替换为这个 ID，并提交到 `main`：

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "japanese-notes-db",
    "database_id": "这里填写真实的 Database ID",
    "migrations_dir": "migrations"
  }
]
```

绑定名必须是 `DB`。数据库名称如有修改，也请同步修改配置。Database ID 是资源标识，可以提交到仓库；导入密钥请按第 3 步配置。

### 2. 连接 GitHub 并部署

进入 **Workers & Pages → Create application → Import a repository / Connect GitHub**，选择 `jiojioinjapan-png/Japanese-notes`。

按下表设置：

| 配置项         | 值                                                              |
| -------------- | --------------------------------------------------------------- |
| Worker 名称    | `japanese-notes`（与 `wrangler.jsonc` 中的 `name` 一致）        |
| 生产分支       | `main`                                                          |
| 根目录         | 仓库根目录 `/`                                                  |
| Build command  | `npm run build`                                                 |
| Deploy command | `npm run deploy`                                                |
| Node.js        | `22` 或更新的 LTS；如需显式指定，添加构建变量 `NODE_VERSION=22` |

Cloudflare 会根据 `package-lock.json` 安装依赖。`npm run deploy` 会先对远程 D1 应用尚未执行的迁移，再部署 Worker 与前端文件。每次推送 `main` 都会重新执行这个流程。

构建使用的 Cloudflare API token 需要目标账户的 **D1 Edit** 和 **Workers Scripts Edit** 权限；如果迁移出现权限错误，在 Worker 的 **Settings → Build → API token** 中选择具有这些权限的 token。

此配置连接生产 D1。先仅启用 `main` 的生产部署；如果要开启其他分支的预览，请为预览单独配置 Worker / D1，以免预览使用生产数据。

### 3. 设置导入密钥

在 Worker 的 **Settings → Variables and Secrets** 中添加运行时 **Secret**：

```text
名称：ADMIN_TOKEN
值：你自己生成的一段较长的随机字符串
```

保存并应用配置（控制台提示部署时完成部署）。这是 **Worker 运行时 Secret**，不需要设置成 `VITE_*`，也不应填写在仓库文件里。

打开部署生成的 `https://japanese-notes.<你的子域>.workers.dev`，点击「导入笔记」，输入这个密钥即可上传。不设置密钥时可以阅读，导入 API 会返回 `503`，不会接受写入。

**访问范围：阅读页面和读取 API 默认公开；密钥仅保护导入。** 如果需要私人访问，可在 Cloudflare 中为站点配置 Access。

## JSON 导入格式

根对象只有一个 `notes` 数组，可以在同一批中混合三种笔记。可直接复制以下内容：

```json
{
  "notes": [
    {
      "type": "word",
      "term": "多彩",
      "reading": "たさい",
      "accent": 0,
      "partOfSpeech": "形动",
      "meaning": "丰富多彩"
    },
    {
      "type": "onomatopoeia",
      "term": "あたふた",
      "meaning": "慌慌张张",
      "example": "あたふたと資料を探してしまい恥ずかしかった。",
      "exampleTranslation": "慌慌张张地找资料，觉得很不好意思。"
    },
    {
      "type": "grammar",
      "term": "だけあって",
      "meaning": "不愧是……",
      "example": "彼は留学経験があるだけあって、英語が上手だ。",
      "exampleTranslation": "他不愧有过留学经历，英语说得很好。"
    }
  ]
}
```

上例也保存在 [examples/notes.json](./examples/notes.json) 中。界面中的「填入示例」使用三条最小示例。

| 字段                 | 类型   | 适用范围与要求                                                                 |
| -------------------- | ------ | ------------------------------------------------------------------------------ |
| `type`               | 字符串 | 必填。`word` 单词 / `onomatopoeia` 拟声拟态词 / `grammar` 语法                 |
| `term`               | 字符串 | 所有类型必填，最多 200 字符                                                    |
| `meaning`            | 字符串 | 所有类型必填，中文释义，最多 2000 字符                                         |
| `reading`            | 字符串 | 单词必填，平假名读音，最多 200 字符；允许长音符号 `ー`、间隔号 `・` 和空格     |
| `accent`             | 数字   | 单词必填，`0`～`99` 的整数，`0` 表示平板型；请填写数字 `0`，而不是字符串 `"0"` |
| `partOfSpeech`       | 字符串 | 单词必填，如 `名`、`动`、`形`、`形动`，最多 100 字符                           |
| `example`            | 字符串 | 拟声拟态词 / 语法必填，单词可选，最多 2000 字符                                |
| `exampleTranslation` | 字符串 | 所有类型可选，例句中文翻译，最多 2000 字符                                     |

规则：

- 每批 **1～500 条**，JSON 的 UTF-8 大小不超过 **1 MiB**；超出时请拆成多批。
- 必填字符串不能为空；可选字段不需要时直接省略，不能填写 `null` 或空字符串。
- 字段名区分大小写；未知字段会报错，避免拼写错误导致信息丢失。拟声拟态词 / 语法不接受单词专用的 `reading`、`accent`、`partOfSpeech`。
- 内容会去除首尾空白，并进行 Unicode NFC 规范化；正文和例句中的换行会保留。
- 任何一条数据不合法，**本批全部不写入**，错误会标出第几条笔记及字段。数据库执行失败时，整个事务回滚。
- 所有内容字段完全相同时才视为重复。同词条的不同释义、声调、词性、例句或例句翻译会新增一条，不会覆盖旧笔记。并发上传也由数据库唯一索引保证去重。
- 上传成功后，书库和分类计数会自动刷新。笔记保存在 D1，可跨浏览器、跨设备访问。

使用方法：点击「导入笔记」→ 粘贴 JSON 或选择文件 → 查看格式检查与内容预览 → 输入导入密钥 → 点击「上传笔记」。

## 本地开发

需要 Node.js `>=22.12.0`。

```bash
npm ci
cp .dev.vars.example .dev.vars
```

修改 `.dev.vars` 中的 `ADMIN_TOKEN`，然后初始化本地 D1：

```bash
npm run db:migrate
npm run build
npm run dev:worker
```

打开 `http://localhost:8787`。本地 D1 保存在 `.wrangler/`，不会改动线上数据库。仅本地运行时可以保留全零的 Database ID。

前端开发如需热更新，保持 Worker 运行，再开一个终端：

```bash
npm run dev
```

打开 Vite 输出的网址。开发时 `/api` 会代理到 `127.0.0.1:8787`；生产环境由同一个 Worker 提供静态资源与 API。

验证：

```bash
npm run check
npm test
npx playwright install --with-deps chromium webkit
npm run test:e2e
```

集成测试在独立的 Miniflare D1 中验证实际 SQL、500 条导入、去重和事务回滚。浏览器测试会自动构建并启动本地 Worker，每次重建 `.wrangler/e2e` 的独立测试数据库，使用公开的测试专用密钥，不影响开发 / 生产数据库。GitHub Actions 会自动运行测试与构建。

## API

| 请求                     | 用途                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `GET /api/notes`         | 分页读取笔记，并返回各分类总数                                                           |
| `POST /api/notes/import` | 批量导入，要求 `Authorization: Bearer <ADMIN_TOKEN>` 和 `Content-Type: application/json` |

读取接口的可选参数：`category=all\|word\|onomatopoeia\|grammar`、`q=关键词`（最多 200 字符）、`sort=recent\|oldest\|term`、`page=1`、`pageSize=24`（范围 1～100）。关键词匹配词条、读音、词性、中文释义、例句与翻译；`%`、`_` 等按普通文字处理。`term` 排序使用数据库字符顺序。

导入成功返回 HTTP `201`：

```json
{ "inserted": 10, "skipped": 2, "total": 12 }
```

错误状态：`400` JSON / 字段 / 参数错误，`401` 密钥错误，`403` 跨站请求，`413` 超出大小限制，`415` 非 JSON 内容类型，`503` 尚未设置导入密钥。服务端也会重复验证输入，不能通过绕过浏览器检查写入非法笔记。

## 项目结构

```text
src/                     React 界面、iPhone 布局、阅读与导入交互
shared/notes.ts          三类笔记的数据类型和前后端共享校验
worker/index.ts         Worker API、鉴权、D1 查询与事务导入
migrations/             D1 数据库迁移与首次示例数据
examples/notes.json      可上传的 JSON 示例
public/                  主屏幕 manifest、图标及静态资源
scripts/                 图标生成和隔离测试服务器
tests/                  输入校验、真实 D1 集成测试、浏览器测试
wrangler.jsonc          Worker、静态资源与 D1 绑定配置
.github/workflows/      GitHub 自动检查
```

Cloudflare 参考文档：[Git 构建配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)、[静态资源与 SPA 路由](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)、[D1 迁移](https://developers.cloudflare.com/d1/reference/migrations/)。
