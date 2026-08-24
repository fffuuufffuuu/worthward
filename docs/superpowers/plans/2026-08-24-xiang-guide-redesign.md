# 「所向」软件说明网页改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有安装手册式页面改造成面向首次接触者、理念先行、可离线阅读并随绿色版安全分发的「所向」产品说明网页。

**Architecture:** `guide/使用说明.html` 是唯一内容源，包含语义化 HTML、内嵌 CSS 和少量内嵌 JavaScript；根目录与绿色版副本仅从该文件同步。`work/guide_acceptance.cjs` 负责检查内容、离线依赖、响应式与可访问性标志，浏览器截图负责验证真实视觉。

**Tech Stack:** 单文件 HTML5、CSS3、原生 JavaScript、Node.js 断言脚本、现有 PowerShell 绿色版打包流程。

## Global Constraints

- 页面受众是第一次接触「所向」的其他用户。
- 页面首先说明项目意义、用户帮助和工具边界，再说明功能与启动。
- 页面完全离线可用，不加载在线字体、图片、脚本或样式。
- 页面不得包含真实卡片、API 密钥、个人迁移内容或开发者个人路径。
- 页面中的软件展示只能使用虚构示例内容。
- 本次不修改「所向」应用功能、工作区数据、密钥、种子数据或业务界面。
- 颜色固定使用深海蓝 `#173341`、雾白 `#F3F6F5`、矿物灰 `#C9D4D5`、聚焦绿 `#50C5A7`、行动珊瑚 `#E56B55`。
- `guide/使用说明.html` 是唯一内容源；根目录和绿色版说明页必须与它一致。
- 项目不是 Git 仓库；每个任务以哈希、回读、测试或截图代替 Git 提交。

---

### Task 1: 建立说明页内容验收

**Files:**
- Create: `work/guide_acceptance.cjs`
- Test: `guide/使用说明.html`

**Interfaces:**
- Consumes: 已确认的说明页设计文档。
- Produces: 命令 `node work/guide_acceptance.cjs guide/使用说明.html`，成功时输出 `GUIDE_ACCEPTANCE=PASS`。

- [ ] **Step 1: 写入会失败的内容验收脚本**

```js
const fs = require('node:fs');
const file = process.argv[2];
if (!file) throw new Error('guide path required');
const html = fs.readFileSync(file, 'utf8');
const required = [
  '事情很多，真正值得投入的很少',
  '什么值得我现在投入注意力',
  'Radar', 'Focus', 'Engage', 'Outcome & Review',
  '探索', '创造', '注意力梳理', 'AI 辅助', '滴答清单',
  '双击', '所向.exe', '%LOCALAPPDATA%\\所向\\workspace.json',
  'http://127.0.0.1:5174', 'prefers-reduced-motion', '@media'
];
for (const text of required) {
  if (!html.includes(text)) throw new Error(`missing: ${text}`);
}
if (/https?:\/\/(?!127\.0\.0\.1:5174)/.test(html)) {
  throw new Error('remote dependency found');
}
if (!/<main\b/.test(html) || !/<nav\b/.test(html) || !/<footer\b/.test(html)) {
  throw new Error('semantic structure missing');
}
if (!/focus-visible/.test(html)) throw new Error('keyboard focus style missing');
console.log('GUIDE_ACCEPTANCE=PASS');
```

- [ ] **Step 2: 运行验收并确认旧页面失败**

Run: `node work/guide_acceptance.cjs guide/使用说明.html`

Expected: FAIL，至少报告缺少核心命题、软件帮助内容或本机字体/离线要求。

- [ ] **Step 3: 记录旧页面哈希作为可恢复检查点**

Run: `Get-FileHash -Algorithm SHA256 -LiteralPath guide\使用说明.html`

Expected: 输出旧页面 SHA256，实施记录中保留该值。

---

### Task 2: 实现理念先行的单文件说明页

**Files:**
- Modify: `guide/使用说明.html`
- Test: `work/guide_acceptance.cjs`

**Interfaces:**
- Consumes: Task 1 的静态验收命令。
- Produces: 可离线双击打开的单文件说明页；锚点 `#why`、`#method`、`#features`、`#start`、`#privacy`；工作台链接 `http://127.0.0.1:5174`。

- [ ] **Step 1: 写入完整语义内容**

页面使用 `<nav>`、`<main>`、分节 `<section>`、`<footer>`，包含：首屏立论、工具边界、四阶段生命周期、探索/创造/洞察示例、在途限制、注意力梳理、AI 辅助、滴答交接、三分钟启动、数据隐私与常见问题。

示例卡片只使用虚构内容：

```html
<article class="demo-card">
  <span class="demo-card__kind">探索</span>
  <h4>理解生成式 AI 如何改变备课</h4>
  <p>先放进 Radar，不急着承诺投入。</p>
</article>
```

- [ ] **Step 2: 实现固定视觉系统**

在 `:root` 中只定义确认过的五个品牌色及其透明派生值。标题、正文、等宽信息使用本机字体回退栈：

```css
:root {
  --deep: #173341;
  --mist: #F3F6F5;
  --mineral: #C9D4D5;
  --focus: #50C5A7;
  --signal: #E56B55;
}
.display { font-family: "Iowan Old Style", Baskerville, "Songti SC", SimSun, serif; }
body { font-family: "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif; }
.utility { font-family: "Cascadia Mono", Consolas, monospace; }
```

- [ ] **Step 3: 实现唯一标志性动效**

使用 CSS 同心环表现注意力收束。仅首屏环和内容进入视野有动效；减少动态效果时停用：

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
```

- [ ] **Step 4: 实现响应式与键盘焦点**

桌面使用不对称首屏和横向生命周期；小于 `760px` 时切换单列、隐藏次要导航、缩小环形展示并保持正文不横向溢出。所有链接、按钮和 FAQ `<summary>` 必须有 `:focus-visible` 样式。

- [ ] **Step 5: 加入克制的页面交互**

只使用原生 JavaScript 添加导航滚动状态和进入视野类名；脚本不存在或被禁用时，全部内容仍然可读，FAQ 使用原生 `<details>`。

- [ ] **Step 6: 运行静态验收**

Run: `node work/guide_acceptance.cjs guide/使用说明.html`

Expected: `GUIDE_ACCEPTANCE=PASS`

- [ ] **Step 7: 回读核心内容并记录新哈希**

Run: `rg -n "事情很多|什么值得|Radar|三分钟|workspace.json|prefers-reduced-motion" guide\使用说明.html`

Expected: 每个核心区域均有命中。

Run: `Get-FileHash -Algorithm SHA256 -LiteralPath guide\使用说明.html`

Expected: 新哈希与 Task 1 旧哈希不同。

---

### Task 3: 实际浏览器视觉检查与修正

**Files:**
- Modify if needed: `guide/使用说明.html`
- Create: `work/guide-desktop.png`
- Create: `work/guide-mobile.png`

**Interfaces:**
- Consumes: Task 2 的单文件页面。
- Produces: 桌面与手机两张新截图，以及经过视觉复核的最终源文件。

- [ ] **Step 1: 在真实浏览器打开源页面**

打开 `D:\Project\个人工作台\guide\使用说明.html`，确认无网络依赖报错，首屏核心命题和收束环同时出现在首个视口。

- [ ] **Step 2: 检查桌面视口**

使用约 `1440 × 1000` 视口，检查导航、首屏、四阶段、三种产品能力、启动步骤与 FAQ。保存 `work/guide-desktop.png`。

- [ ] **Step 3: 检查手机视口**

使用约 `390 × 844` 视口，检查无横向滚动、文字无重叠、生命周期为纵向、按钮可点击、FAQ 可展开。保存 `work/guide-mobile.png`。

- [ ] **Step 4: 对抗性视觉复核**

检查并直接修正：是否像通用模板、是否装饰过多、是否启动信息仍抢在意义之前、是否真实特色被埋没、是否 CTA 暗示能启动尚未运行的软件、是否对比度或字号过低。

- [ ] **Step 5: 修正后重新运行验收**

Run: `node work/guide_acceptance.cjs guide/使用说明.html`

Expected: `GUIDE_ACCEPTANCE=PASS`

---

### Task 4: 同步副本并重新生成干净绿色版

**Files:**
- Modify: `使用说明.html`
- Generate: `release/xiang-portable-<timestamp>/使用说明.html`
- Generate: `release/xiang-portable-<timestamp>.zip`

**Interfaces:**
- Consumes: Task 3 已通过视觉和静态验收的 `guide/使用说明.html`。
- Produces: 哈希一致的根目录说明页、绿色版说明页和干净压缩包。

- [ ] **Step 1: 同步根目录副本**

Run: `Copy-Item -LiteralPath guide\使用说明.html -Destination 使用说明.html -Force`

Expected: 命令成功。

- [ ] **Step 2: 回读验证两个源副本一致**

Run: `Get-FileHash -Algorithm SHA256 -LiteralPath guide\使用说明.html,使用说明.html`

Expected: 两个 SHA256 完全一致。

- [ ] **Step 3: 运行现有干净打包流程**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\pack-clean.ps1`

Expected: 构建、个人数据扫描和压缩均成功，输出新的 `release\xiang-portable-*.zip`。

- [ ] **Step 4: 检查最新绿色版内容**

查找最新生成目录与压缩包，确认目录包含 `所向.exe`、`使用说明.html`、`node`、`dist`、`server` 和快捷方式脚本；不包含 `ai-credential.dpapi`、`workspace.json` 或个人迁移残留。

- [ ] **Step 5: 验证绿色版说明页哈希**

Run: 对 `guide\使用说明.html` 和最新绿色版目录中的 `使用说明.html` 执行 SHA256。

Expected: 两个 SHA256 完全一致。

- [ ] **Step 6: 启动检查**

从最新绿色版目录运行 `所向.exe`，确认 `http://127.0.0.1:5174` 可打开；不要修改或清除现有 `%LOCALAPPDATA%\所向` 数据。

- [ ] **Step 7: 最终报告**

报告新说明页路径、新压缩包路径、静态验收结果、桌面/手机截图、三份哈希一致性与启动检查边界。明确区分“文件和浏览器已验证”与任何未执行的外部电脑验证。
