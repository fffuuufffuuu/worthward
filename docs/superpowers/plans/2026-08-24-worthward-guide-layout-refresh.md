# WORTHWARD Guide Layout Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将说明页统一为 WORTHWARD 品牌，删除失效风险较高的本机工作台链接，并用多样但统一的章节布局重新组织整页。

**Architecture:** 继续以 `guide/使用说明.html` 作为唯一源文件，用单文件 HTML、内嵌 CSS 和原生 JavaScript完成。根目录副本只在验收后同步；现有静态验收脚本扩充品牌、按钮缺失和关键启动文案检查。

**Tech Stack:** HTML5、CSS3、原生 JavaScript、Node.js 静态断言、现有 PowerShell 打包脚本。

## Global Constraints

- 品牌固定为 `所向 · WORTHWARD`、`Attention, directed.`、`让注意力，朝向真正值得的事。`。
- 删除所有“打开所向”“打开工作台”和 `http://127.0.0.1:5174` 链接。
- 保持完全离线、单文件、无外部资源。
- 不修改应用业务功能、用户数据或 AI 密钥。
- `guide/使用说明.html` 是唯一内容源。
- 项目不是 Git 仓库，以回读、哈希、测试与截图代替提交。

---

### Task 1: 扩充品牌与启动边界验收

**Files:**
- Modify: `work/guide_acceptance.cjs`
- Test: `guide/使用说明.html`

**Interfaces:**
- Consumes: 单文件 HTML 路径。
- Produces: 成功时输出 `GUIDE_ACCEPTANCE=PASS`，不符合品牌或仍有启动链接时退出失败。

- [ ] **Step 1: 加入必需品牌文案**

把 `WORTHWARD`、`Attention, directed.`、`让注意力，朝向真正值得的事。`、`创建桌面快捷方式` 加入 `required`。

- [ ] **Step 2: 加入禁止内容断言**

```js
for (const text of ['打开所向', '打开工作台', '127.0.0.1:5174']) {
  if (html.includes(text)) throw new Error(`forbidden: ${text}`);
}
```

- [ ] **Step 3: 运行并确认旧页面失败**

Run: `node work/guide_acceptance.cjs guide/使用说明.html`

Expected: FAIL，报告缺少 WORTHWARD 品牌或仍包含禁止的按钮文字。

### Task 2: 重构品牌和章节布局

**Files:**
- Modify: `guide/使用说明.html`
- Test: `work/guide_acceptance.cjs`

**Interfaces:**
- Consumes: 现有内容、颜色和交互。
- Produces: 具有宣言首屏、承诺阶梯、特色拼贴、启动路线和本地保险箱布局的单文件说明页。

- [ ] **Step 1: 更新页头与首屏品牌**

导航标识加入 `WORTHWARD`；首屏加入完整中英文标语，保留“开始认识所向”页内锚点。

- [ ] **Step 2: 删除所有本机链接按钮**

删除导航和启动区的 `.open-app` 元素及不再使用的 `.launch-box` 样式。

- [ ] **Step 3: 把生命周期改为承诺阶梯**

四层容器依次收窄，并在移动端恢复全宽纵向排列。

- [ ] **Step 4: 把特色改为一大四小拼贴**

主块强调用户选择权；其余块展示注意力梳理、AI 主动触发、日历接力和本地优先。

- [ ] **Step 5: 把开始使用改为路线图**

四步沿一条路径排列，另设醒目的“不要在压缩包内运行”提醒；保留创建桌面快捷方式。

- [ ] **Step 6: 调整响应式与减少动态效果**

在 `760px` 以下将拼贴和路线改成单列，确保收窄阶梯不造成溢出。

- [ ] **Step 7: 运行静态验收**

Run: `node work/guide_acceptance.cjs guide/使用说明.html`

Expected: `GUIDE_ACCEPTANCE=PASS`

### Task 3: 同步、浏览器复核与打包

**Files:**
- Modify: `使用说明.html`
- Generate: `work/guide-worthward-desktop.png`
- Generate: `work/guide-worthward-mobile.png`
- Generate: `release/xiang-portable-<timestamp>.zip`

**Interfaces:**
- Consumes: Task 2 已通过静态验收的源页面。
- Produces: 哈希一致的两个说明页、桌面/手机视觉证据和新的干净绿色版压缩包。

- [ ] **Step 1: 同步并核对哈希**

Run: `Copy-Item -LiteralPath guide\使用说明.html -Destination 使用说明.html -Force`

Run: `Get-FileHash -Algorithm SHA256 -LiteralPath guide\使用说明.html,使用说明.html`

Expected: 两个哈希一致。

- [ ] **Step 2: 检查桌面和手机视口**

确认首屏、承诺阶梯、特色拼贴和启动路线具有不同构图；无横向溢出、文字遮挡或不可访问控件。

- [ ] **Step 3: 对抗性复核并修正**

重点检查页面是否仍像重复模板、是否仍有可能误导启动能力的文字、品牌是否一致。

- [ ] **Step 4: 运行完整静态和项目测试**

Run: `node work/guide_acceptance.cjs guide/使用说明.html`

Run: 项目现有测试命令。

Expected: 静态验收通过；项目测试零失败。

- [ ] **Step 5: 运行干净打包流程并检查内容**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\pack-clean.ps1`

Expected: 新压缩包生成，说明页与唯一源哈希一致，不包含工作区或密钥文件。

## Self-Review

- 规格覆盖：品牌、按钮删除、全页多样化布局、响应式、离线与打包均有对应任务。
- 占位符检查：无 TBD、TODO 或未定义的后续实现。
- 一致性检查：唯一源文件、验收命令和最终副本路径前后一致。

