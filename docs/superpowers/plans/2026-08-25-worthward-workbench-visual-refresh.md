# WORTHWARD Workbench Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将工作台与说明页统一为“所向 · WORTHWARD / CashewLab”品牌，在不改变业务逻辑的前提下提高桌面与手机端的阅读效率，并把真实 GitHub 仓库链接加入页脚。

**Architecture:** 保留 `App.tsx` 中现有视图和数据流，新增一个只负责品牌常量的模块与一个无状态页脚组件；视觉改版放入独立的 `refresh.css`，在原样式之后加载，避免重写业务组件。说明页仍是可独立打开的单文件 HTML，并同步到根目录副本。

**Tech Stack:** React 19、TypeScript、Vite、CSS、Vitest、Testing Library、Playwright 本地浏览器验收、Git/GitHub CLI。

## Global Constraints

- 中文名固定为“所向”，英文名固定为“WORTHWARD”，标语固定为 `Attention, directed.`。
- 作者固定为 `CashewLab`。
- GitHub 地址固定为 `https://github.com/fffuuufffuuu/worthward`。
- 软件版本显示为 `0.1.0`，与 `package.json` 当前版本一致。
- 顶部不显示 Focus / Engage 数量；看板列只显示当前板块内的当前卡片数，不显示全局容量上限。
- 不改变拖动、晋级、WIP 判断、AI、滴答清单、复盘、筛选、归档、数据保存或导入导出逻辑。
- AI 仍然只能由用户点击触发，并在用户确认后修改工作区。
- 不新增“关于所向”页面或设置卡片。
- 页脚位于页面内容末尾，不固定在视口。
- 新依赖数量为 0。
- 每个实现提交都必须建立在已推送的基线提交 `d0b984d3fae6914a50f2eb8087828d66ec7cdec5` 之后。

---

### Task 1: 品牌常量、顶部品牌与全局页脚

**Files:**
- Create: `src/brand.ts`
- Create: `src/components/AppFooter.tsx`
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces: `BRAND` 常量，字段为 `chineseName`、`englishName`、`tagline`、`author`、`version`、`githubUrl`。
- Produces: `AppFooter(): JSX.Element`，供 `App` 在所有主视图之后渲染。
- Consumes: `package.json` 当前版本语义；本任务直接使用固定值 `0.1.0`，不引入构建期注入。

- [ ] **Step 1: 写入失败的品牌与页脚测试**

在 `src/App.test.tsx` 的品牌测试中加入：

```tsx
const { container } = render(<App />)

const brand = screen.getByRole('button', { name: '所向首页' })
expect(within(brand).getByText('所向')).toBeVisible()
expect(within(brand).getByText('WORTHWARD')).toBeVisible()
expect(within(brand).getByText('ATTENTION, DIRECTED.')).toBeVisible()
expect(container.querySelector('.wip-readout')).toBeNull()

const footer = screen.getByRole('contentinfo')
expect(within(footer).getByText('CashewLab')).toBeVisible()
expect(within(footer).getByText('v0.1.0')).toBeVisible()
expect(within(footer).getByRole('link', { name: 'GitHub' })).toHaveAttribute(
  'href',
  'https://github.com/fffuuufffuuu/worthward',
)
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm.cmd run test:run -- src/App.test.tsx`

Expected: FAIL，因为页面尚未显示 `WORTHWARD`、CashewLab 和真实 GitHub 页脚，且顶部仍存在 `.wip-readout`。

- [ ] **Step 3: 新增统一品牌常量**

创建 `src/brand.ts`：

```ts
export const BRAND = {
  chineseName: '所向',
  englishName: 'WORTHWARD',
  tagline: 'ATTENTION, DIRECTED.',
  author: 'CashewLab',
  version: '0.1.0',
  githubUrl: 'https://github.com/fffuuufffuuu/worthward',
} as const
```

- [ ] **Step 4: 创建无状态页脚组件**

创建 `src/components/AppFooter.tsx`：

```tsx
import { BRAND } from '../brand'

export function AppFooter() {
  return (
    <footer className="app-footer">
      <div className="app-footer-brand">
        <strong>{BRAND.chineseName} · {BRAND.englishName}</strong>
        <span>{BRAND.tagline}</span>
      </div>
      <div className="app-footer-meta">
        <span>作者 {BRAND.author}</span>
        <span>v{BRAND.version}</span>
        <a href={BRAND.githubUrl} target="_blank" rel="noreferrer">GitHub</a>
      </div>
    </footer>
  )
}
```

- [ ] **Step 5: 更新顶部品牌并移除顶部容量读数**

在 `src/App.tsx` 导入 `BRAND` 与 `AppFooter`，将顶部品牌内容改为：

```tsx
<button className="brand" onClick={() => setView('explore')} aria-label="所向首页">
  <BrandLogo />
  <span className="brand-copy">
    <span className="brand-title-row">
      <strong>{BRAND.chineseName}</strong>
      <b>{BRAND.englishName}</b>
    </span>
    <small>{BRAND.tagline}</small>
  </span>
</button>
```

删除顶部区域中的：

```tsx
<span className="wip-readout"><b>F</b> ... <b>E</b> ...</span>
```

在所有主视图条件渲染之后、弹窗条件渲染之前加入：

```tsx
<AppFooter />
```

- [ ] **Step 6: 运行品牌测试并确认通过**

Run: `npm.cmd run test:run -- src/App.test.tsx`

Expected: PASS；顶部无 `.wip-readout`，页脚包含 CashewLab、版本与真实 GitHub 地址。

- [ ] **Step 7: 提交品牌结构改动**

```bash
git add src/brand.ts src/components/AppFooter.tsx src/App.tsx src/App.test.tsx
git commit -m "feat: add Worthward brand footer"
```

---

### Task 2: 安静的注意力仪表台与看板层级

**Files:**
- Create: `src/styles/refresh.css`
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`
- Local browser check: `work/browser_acceptance.cjs`

**Interfaces:**
- Consumes: Task 1 的 `.brand-copy`、`.brand-title-row`、`.app-footer` 结构。
- Produces: `refresh.css`，作为现有 `tokens.css` 与 `app.css` 之后的视觉覆盖层。
- Preserves: `BoardColumn`、`BoardFilters`、`DndContext` 和 `requestMove` 的签名与行为。

- [ ] **Step 1: 写入看板数量与结构测试**

在 `src/App.test.tsx` 加入：

```tsx
it('shows only current board counts in stage headers', () => {
  const { container } = render(<App />)
  expect(container.querySelector('.wip-readout')).toBeNull()
  const stages = screen.getAllByRole('region').filter((node) => node.classList.contains('stage-column'))
  expect(stages).toHaveLength(4)
  for (const stage of stages) {
    expect(stage.querySelector('.count-badge')).not.toBeNull()
  }
  expect(screen.queryByText(/\d+\s*\/\s*10/)).toBeNull()
  expect(screen.queryByText(/\d+\s*\/\s*4/)).toBeNull()
})
```

- [ ] **Step 2: 运行测试并确认失败或暴露旧容量文本**

Run: `npm.cmd run test:run -- src/App.test.tsx`

Expected: 在 Task 1 未完成时 FAIL；Task 1 完成后数量测试 PASS，证明此任务只改视觉而不改计数逻辑。

- [ ] **Step 3: 建立视觉覆盖层并在入口导入**

在 `src/main.tsx` 的 `app.css` 之后加入：

```ts
import './styles/refresh.css'
```

创建 `src/styles/refresh.css`，先写入统一变量与页面框架：

```css
:root {
  --canvas: #f3f6f5;
  --paper: #ffffff;
  --ink: #173341;
  --muted: #657983;
  --line: #c9d4d5;
  --navy: #173341;
  --focus: #50c5a7;
  --engage: #e56b55;
  --review: #4b8279;
  --shadow: 0 18px 48px rgba(23, 51, 65, .10);
}

.app-shell { min-height: 100vh; display: flex; flex-direction: column; }
.workspace-main { flex: 1; width: min(100%, 1600px); margin: 0 auto; padding: 38px 30px 64px; }
.topbar { min-height: 76px; padding: 0 30px; border-bottom-color: rgba(23, 51, 65, .12); background: rgba(243, 246, 245, .94); backdrop-filter: blur(18px); }
.brand-logo { width: 40px; height: 40px; }
.brand-title-row { display: flex; align-items: baseline; gap: 10px; }
.brand-title-row strong { font-size: 19px; }
.brand-title-row b { color: rgba(23, 51, 65, .48); font: 700 9px/1 "Cascadia Mono", Consolas, monospace; letter-spacing: .14em; }
.brand small { margin-top: 4px; font: 700 8px/1 "Cascadia Mono", Consolas, monospace; letter-spacing: .15em; }
.main-nav button.active { color: var(--ink); border-bottom-color: var(--focus); }
.primary-button { background: var(--navy); }
.primary-button:hover:not(:disabled) { background: #244b58; }
```

- [ ] **Step 4: 收紧标题与筛选工具栏**

继续在 `refresh.css` 写入：

```css
.workspace-heading { align-items: end; gap: 28px; margin-bottom: 26px; }
.workspace-heading h1 { max-width: 720px; font-size: clamp(38px, 4.1vw, 58px); line-height: 1.06; letter-spacing: -.035em; }
.workspace-heading > p { max-width: 440px; }
.board-heading { grid-template-columns: minmax(340px, .8fr) minmax(560px, 1.2fr); }
.board-filters { align-self: end; padding: 14px 16px; border-color: rgba(23, 51, 65, .16); background: rgba(255, 255, 255, .66); }
.filter-row { min-height: 38px; }
.filter-result { margin-left: auto; font-family: "Cascadia Mono", Consolas, monospace; }
```

- [ ] **Step 5: 强化四阶段与卡片阅读顺序**

继续在 `refresh.css` 写入：

```css
.board-grid { gap: 12px; }
.stage-column { border-left-width: 1px; border-top: 4px solid var(--stage-color); background: rgba(255, 255, 255, .58); }
.stage-header { top: 76px; min-height: 92px; padding: 16px 17px; background: color-mix(in srgb, var(--stage-color) 7%, rgba(255,255,255,.96)); }
.stage-header h2 { margin-bottom: 6px; font-size: 21px; }
.count-badge { border-color: color-mix(in srgb, var(--stage-color) 35%, var(--line)); background: #fff; }
.card-stack { padding: 9px; gap: 9px; }
.attention-card { border-color: rgba(23, 51, 65, .15); border-left-color: var(--category-color); background: rgba(255, 255, 255, .96); box-shadow: 0 7px 18px rgba(23, 51, 65, .055); }
.attention-card:hover { border-color: rgba(23, 51, 65, .28); box-shadow: 0 12px 26px rgba(23, 51, 65, .10); transform: translateY(-1px); }
.card-title-row strong { font-size: 15px; line-height: 1.42; }
.kind-badge { flex: none; }
.topic-list { color: var(--muted); }
```

- [ ] **Step 6: 加入桌面浏览器断言**

在 `work/browser_acceptance.cjs` 页面载入后加入：

```js
if (await page.locator('.wip-readout').count()) throw new Error('Topbar still shows WIP capacity')
if ((await page.locator('.stage-column').count()) !== 4) throw new Error('Four-stage board missing')
if ((await page.locator('.stage-column .count-badge').count()) !== 4) throw new Error('Stage counts missing')
const footer = page.getByRole('contentinfo')
await footer.getByText('CashewLab').waitFor()
if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) {
  throw new Error('Desktop horizontal overflow')
}
```

- [ ] **Step 7: 构建并运行桌面浏览器检查**

Run: `npm.cmd run build`

Run in one terminal: `npm.cmd run preview -- --host 127.0.0.1 --port 4173`

Run in another terminal: `node work/browser_acceptance.cjs`

Expected: `BROWSER_ACCEPTANCE=PASS`，桌面截图中四列同时可见，顶部无容量读数。

- [ ] **Step 8: 提交看板视觉改动**

```bash
git add src/styles/refresh.css src/main.tsx src/App.tsx src/App.test.tsx
git commit -m "style: refresh Worthward board"
```

---

### Task 3: 洞察、归档、设置、弹窗与响应式统一

**Files:**
- Modify: `src/styles/refresh.css`
- Test: `src/App.test.tsx`
- Local browser check: `work/browser_acceptance.cjs`

**Interfaces:**
- Consumes: Task 2 的颜色变量、页面宽度、页脚和按钮层级。
- Preserves: `InsightPage`、`ArchivePage`、`SettingsPage`、`DetailDrawer`、`WeeklyReviewOverlay` 的 React 结构与所有回调。
- Produces: 桌面与手机端统一的视觉样式，不新增设置分组组件。

- [ ] **Step 1: 写入跨视图页脚测试**

在 `src/App.test.tsx` 加入：

```tsx
it('keeps the Worthward footer across primary views', async () => {
  const user = userEvent.setup()
  render(<App />)
  for (const name of ['洞察', '打开归档', '打开设置']) {
    await user.click(screen.getByRole('button', { name }))
    expect(screen.getByRole('contentinfo')).toBeVisible()
    expect(within(screen.getByRole('contentinfo')).getByText('CashewLab')).toBeVisible()
  }
})
```

- [ ] **Step 2: 运行测试并确认通过结构测试**

Run: `npm.cmd run test:run -- src/App.test.tsx`

Expected: PASS。若页脚被放进某个条件视图而非全局位置，此测试 FAIL，先修正 Task 1 的挂载位置。

- [ ] **Step 3: 统一辅助页面与表单视觉**

在 `refresh.css` 加入：

```css
.insight-grid, .settings-grid { gap: 16px; }
.insight-card { border-color: rgba(23, 51, 65, .15); background: rgba(255, 255, 255, .72); }
.insight-card h2, .settings-page h2 { color: var(--ink); }
.archive-grid { border-color: rgba(23, 51, 65, .15); background: rgba(255, 255, 255, .62); }
.archive-row { min-height: 64px; border-bottom-color: rgba(23, 51, 65, .11); }
.archive-row:hover { background: rgba(80, 197, 167, .08); }
.dialog, .drawer, .topic-drilldown-dialog { background: #fbfdfc; }
.dialog input, .dialog textarea, .drawer input, .drawer textarea, .drawer select, .settings-page input { border-color: rgba(23, 51, 65, .22); border-radius: 5px; }
.secondary-button, .utility-button, .icon-button { border-color: rgba(23, 51, 65, .18); }
.toast { background: var(--navy); }
.app-footer { width: min(100% - 60px, 1540px); margin: auto auto 0; padding: 24px 0 30px; display: flex; align-items: center; justify-content: space-between; gap: 24px; border-top: 1px solid rgba(23, 51, 65, .13); color: rgba(23, 51, 65, .58); }
.app-footer-brand { display: grid; gap: 3px; }
.app-footer-brand strong { color: var(--ink); font-family: Georgia, "Songti SC", serif; }
.app-footer-brand span, .app-footer-meta { font: 700 9px/1.4 "Cascadia Mono", Consolas, monospace; letter-spacing: .1em; }
.app-footer-meta { display: flex; align-items: center; gap: 14px; }
.app-footer a { color: var(--ink); text-underline-offset: 3px; }
```

- [ ] **Step 4: 完成手机端布局与减少动画支持**

在 `refresh.css` 加入：

```css
@media (max-width: 800px) {
  .topbar { min-height: 70px; padding: 0 16px; }
  .brand-title-row b { display: none; }
  .workspace-main { padding: 28px 16px 92px; }
  .workspace-heading, .board-heading { display: flex; align-items: stretch; flex-direction: column; gap: 16px; }
  .workspace-heading h1 { font-size: 38px; }
  .board-filters { width: 100%; }
  .board-grid { scroll-padding-inline: 0; }
  .stage-column { min-width: min(86vw, 350px); }
  .app-footer { width: calc(100% - 32px); padding-bottom: 82px; align-items: flex-start; flex-direction: column; gap: 10px; }
  .app-footer-meta { flex-wrap: wrap; }
}

@media (prefers-reduced-motion: reduce) {
  .attention-card, .primary-button, .main-nav button { transition: none; }
}
```

- [ ] **Step 5: 扩充手机浏览器断言**

在 `work/browser_acceptance.cjs` 设置 `390 × 844` 后加入：

```js
if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) {
  throw new Error('Mobile page overflow outside the intended board scroller')
}
if (!(await page.getByRole('navigation', { name: '主导航' }).isVisible())) {
  throw new Error('Mobile navigation is not visible')
}
await page.getByRole('contentinfo').getByText('CashewLab').waitFor()
```

- [ ] **Step 6: 运行测试、构建与浏览器检查**

Run: `npm.cmd run test:run -- src/App.test.tsx`

Run: `npm.cmd run typecheck`

Run: `npm.cmd run build`

Run against preview server: `node work/browser_acceptance.cjs`

Expected: 全部 PASS；桌面与手机截图中洞察、归档、设置、弹窗和页脚使用同一视觉系统。

- [ ] **Step 7: 提交辅助页面与响应式改动**

```bash
git add src/styles/refresh.css src/App.test.tsx
git commit -m "style: unify Worthward supporting views"
```

---

### Task 4: 说明页品牌、文案与真实 GitHub 链接

**Files:**
- Modify: `work/guide_acceptance.cjs`
- Modify: `work/guide_browser_acceptance.cjs`
- Modify: `guide/使用说明.html`
- Modify: `使用说明.html`

**Interfaces:**
- Consumes: `https://github.com/fffuuufffuuu/worthward`、CashewLab、WORTHWARD 视觉变量。
- Produces: 两份字节一致的说明页；`guide/使用说明.html` 为规范源，根目录 `使用说明.html` 为方便直接打开的副本。

- [ ] **Step 1: 更新静态验收规则并确认失败**

在 `work/guide_acceptance.cjs` 的 `required` 中加入或替换为：

```js
'AI 提出聚焦方向建议，由你确认投入方向。',
'作者：CashewLab',
'href="https://github.com/fffuuufffuuu/worthward"',
```

在禁止内容中加入：

```js
'作者：待补充',
'aria-disabled="true" aria-label="GitHub 链接待补充"',
```

Run: `node work/guide_acceptance.cjs guide/使用说明.html`

Expected: FAIL，指出新 AI 标题、CashewLab 或真实 GitHub 链接缺失。

- [ ] **Step 2: 更新说明页文案与页脚**

在 `guide/使用说明.html`：

```html
<h3>AI 提出聚焦方向建议，<br>由你确认投入方向。</h3>
```

将页脚中作者与 GitHub 改为：

```html
<span class="footer-author">作者：CashewLab</span>
<a class="footer-github" href="https://github.com/fffuuufffuuu/worthward" target="_blank" rel="noreferrer">GitHub</a>
```

删除针对 `a[aria-disabled="true"]` 的点击拦截脚本，因为链接已经真实可用。

- [ ] **Step 3: 将“开始使用”改为深绿色主按钮**

把说明页中的按钮样式改为：

```css
.nav-links .nav-start {
  padding: 7px 13px;
  color: var(--white);
  background: var(--deep);
  border-radius: 7px;
  font-weight: 700;
  transition: background .2s ease, transform .2s ease;
}
.nav-links .nav-start:hover { background: #244b58; transform: translateY(-1px); }
```

- [ ] **Step 4: 更新浏览器验收并确认视觉行为**

在 `work/guide_browser_acceptance.cjs` 中改为断言：

```js
const startBackground = await desktop.locator('.nav-start').evaluate((element) => getComputedStyle(element).backgroundColor)
if (startBackground !== 'rgb(23, 51, 65)') throw new Error(`开始使用按钮不是深绿色: ${startBackground}`)
if ((await desktop.locator('.footer-author').innerText()) !== '作者：CashewLab') throw new Error('说明页作者错误')
if (await desktop.locator('.footer-github').getAttribute('href') !== 'https://github.com/fffuuufffuuu/worthward') throw new Error('说明页 GitHub 地址错误')
```

- [ ] **Step 5: 同步根目录副本并验证字节一致**

Run: `Copy-Item -LiteralPath 'guide\使用说明.html' -Destination '使用说明.html' -Force`

Run: `Get-FileHash -Algorithm SHA256 -LiteralPath 'guide\使用说明.html','使用说明.html'`

Expected: 两个 SHA256 完全一致。

- [ ] **Step 6: 运行说明页静态与浏览器验收**

Run: `node work/guide_acceptance.cjs guide/使用说明.html`

Run: `node work/guide_browser_acceptance.cjs`

Expected: `GUIDE_ACCEPTANCE=PASS` 与 `GUIDE_BROWSER_ACCEPTANCE=PASS`。

- [ ] **Step 7: 提交说明页改动**

```bash
git add guide/使用说明.html 使用说明.html
git commit -m "docs: sync Worthward public branding"
```

---

### Task 5: 完整回归、改版提交核验与 GitHub 推送

**Files:**
- Verify only: all tracked source files
- Local artifacts: `work/*.png`

**Interfaces:**
- Consumes: Tasks 1–4 的四个独立提交。
- Produces: GitHub `main` 上可从基线 `d0b984d` 回退、且通过完整测试的视觉改版版本。

- [ ] **Step 1: 运行完整自动化检查**

Run: `npm.cmd run test:run`

Expected: 32 个测试文件、227 项或更多测试全部 PASS。

Run: `npm.cmd run typecheck`

Expected: exit code 0。

Run: `npm.cmd run build`

Expected: Vite build 成功；现有约 500 kB 的 chunk 警告可保留，因为本次不改变加载架构。

- [ ] **Step 2: 运行两组浏览器验收**

Run against preview server: `node work/browser_acceptance.cjs`

Run: `node work/guide_browser_acceptance.cjs`

Expected: 两组均 PASS，无控制台错误或页面横向溢出。

- [ ] **Step 3: 视觉复核截图**

检查以下本地截图：

- `work/desktop-board.png`
- `work/desktop-insights.png`
- `work/mobile-board.png`
- `work/guide-worthward-desktop.png`
- `work/guide-worthward-mobile.png`

验收：顶部无容量读数；四列当前数量清晰；深绿色主按钮唯一；CashewLab 与真实 GitHub 链接位于页面底部；手机主导航与横向看板可用。

- [ ] **Step 4: 确认提交边界与工作区状态**

Run: `git log --oneline --decorate -5`

Expected: 基线之后依次存在品牌、看板、辅助页面、说明页提交。

Run: `git status --short`

Expected: 无输出。

- [ ] **Step 5: 推送并核对远程提交**

Run: `git push origin main`

Run: `git rev-parse HEAD`

Run: `git ls-remote origin refs/heads/main`

Expected: 本地 HEAD 与远程 `main` SHA 完全一致。

- [ ] **Step 6: 核对公开仓库信息**

Run: `gh repo view fffuuufffuuu/worthward --json url,visibility,defaultBranchRef`

Expected: URL 为 `https://github.com/fffuuufffuuu/worthward`，visibility 为 `PUBLIC`，默认分支为 `main`。
