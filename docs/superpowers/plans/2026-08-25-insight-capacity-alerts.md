# Insight Capacity Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在洞察页的 Focus 与 Engage 容量卡片上，用文字和颜色区分正常、已达上限和超出上限三种状态。

**Architecture:** 保留现有洞察指标结构和工作区数据流，在 `InsightPage` 内用一个纯函数把当前数量与上限映射为状态类和状态文字。视觉规则追加到现有 `refresh.css`；单元测试验证状态逻辑，独立的 test-mode 浏览器脚本验证桌面和手机端的真实呈现。

**Tech Stack:** React 19、TypeScript、CSS、Vitest、Testing Library、Playwright 本地浏览器验收。

## Global Constraints

- 只修改洞察页“正在 Focus”和“正在 Engage”两张容量卡片。
- 当前数量小于上限时保持中性卡片，不显示状态文字。
- 当前数量等于上限时使用浅琥珀提示并显示“已达上限”。
- 当前数量大于上限时使用浅珊瑚红提示并显示准确的“超出 N 项”。
- 状态不能只靠颜色表达，不使用闪烁、脉冲或自动动画。
- 不修改容量上限、晋级、拖动、任性加入、每周梳理或数据保存逻辑。
- 不修改 Radar 和 Outcome 指标卡片。
- 新依赖数量为 0。

---

### Task 1: 洞察容量状态、视觉提醒与隔离验收

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles/refresh.css`
- Test: `src/App.test.tsx`
- Create: `work/capacity_alert_browser_acceptance.cjs`

**Interfaces:**
- Consumes: `insight.stageCounts.focus`、`insight.stageCounts.engage`、`workspace.settings.focusWipLimit`、`workspace.settings.engageWipLimit`。
- Produces: `capacityAlert(current: number, limit: number): { className: 'capacity-normal' | 'capacity-full' | 'capacity-over'; label: string | null }`。
- Produces: `.capacity-metric`、`.capacity-status` 与三个容量状态类，仅供洞察指标卡片使用。

- [ ] **Step 1: 写入三种状态的失败测试**

在 `src/App.test.tsx` 顶部辅助函数区域加入：

```tsx
function saveCapacityWorkspace(
  focusCount: number,
  engageCount: number,
  focusLimit = 2,
  engageLimit = 2,
) {
  const state = createInitialWorkspace()
  const timestamp = '2026-08-25T00:00:00.000Z'
  const items: WorkspaceState['items'] = {}
  const addItems = (stage: 'focus' | 'engage', count: number) => {
    for (let index = 0; index < count; index += 1) {
      const id = `${stage}-${index + 1}`
      items[id] = {
        id,
        title: `${stage} ${index + 1}`,
        description: '',
        board: index % 2 ? 'create' : 'explore',
        category: null,
        topics: [],
        stage,
        capturedAt: timestamp,
        stageEnteredAt: timestamp,
        lastTouchedAt: timestamp,
        lastProgressAt: null,
        version: 1,
      }
    }
  }
  addItems('focus', focusCount)
  addItems('engage', engageCount)
  saveWorkspace({
    ...state,
    items,
    settings: { ...state.settings, focusWipLimit: focusLimit, engageWipLimit: engageLimit },
  })
}
```

在洞察测试区域加入：

```tsx
it('distinguishes full and over capacity in insight metrics', async () => {
  saveCapacityWorkspace(2, 3)
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: '洞察' }))

  const focusMetric = screen.getByText('正在 Focus').closest('div')!
  const engageMetric = screen.getByText('正在 Engage').closest('div')!
  expect(focusMetric).toHaveClass('capacity-metric', 'capacity-full')
  expect(within(focusMetric).getByText('已达上限')).toBeVisible()
  expect(engageMetric).toHaveClass('capacity-metric', 'capacity-over')
  expect(within(engageMetric).getByText('超出 1 项')).toBeVisible()
})

it('keeps capacity metrics neutral below their limits', async () => {
  saveCapacityWorkspace(1, 1)
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: '洞察' }))

  const focusMetric = screen.getByText('正在 Focus').closest('div')!
  const engageMetric = screen.getByText('正在 Engage').closest('div')!
  expect(focusMetric).toHaveClass('capacity-metric', 'capacity-normal')
  expect(engageMetric).toHaveClass('capacity-metric', 'capacity-normal')
  expect(screen.queryByText('已达上限')).toBeNull()
  expect(screen.queryByText(/超出 \d+ 项/)).toBeNull()
})
```

- [ ] **Step 2: 运行聚焦测试并确认失败**

Run: `npm.cmd run test:run -- src/App.test.tsx`

Expected: FAIL，因为容量卡片尚未包含 `.capacity-metric`、状态类和状态文字。

- [ ] **Step 3: 实现最小容量状态映射**

在 `src/App.tsx` 的 `InsightPage` 之前加入：

```tsx
function capacityAlert(current: number, limit: number) {
  if (current > limit) {
    return { className: 'capacity-over' as const, label: `超出 ${current - limit} 项` }
  }
  if (current === limit) {
    return { className: 'capacity-full' as const, label: '已达上限' }
  }
  return { className: 'capacity-normal' as const, label: null }
}
```

在 `InsightPage` 返回 JSX 前计算：

```tsx
const focusCapacity = capacityAlert(insight.stageCounts.focus, workspace.settings.focusWipLimit)
const engageCapacity = capacityAlert(insight.stageCounts.engage, workspace.settings.engageWipLimit)
```

将 Focus 与 Engage 两个指标卡片改为：

```tsx
<div className={`capacity-metric ${focusCapacity.className}`}>
  <small>正在 Focus</small>
  <strong>{insight.stageCounts.focus}</strong>
  <span>/ {workspace.settings.focusWipLimit}</span>
  {focusCapacity.label && <em className="capacity-status">{focusCapacity.label}</em>}
</div>
<div className={`capacity-metric ${engageCapacity.className}`}>
  <small>正在 Engage</small>
  <strong>{insight.stageCounts.engage}</strong>
  <span>/ {workspace.settings.engageWipLimit}</span>
  {engageCapacity.label && <em className="capacity-status">{engageCapacity.label}</em>}
</div>
```

Radar 与 Outcome 指标保持原结构。

- [ ] **Step 4: 加入局部、无动画的容量样式**

在 `src/styles/refresh.css` 的洞察样式区域加入：

```css
.metric-strip > .capacity-metric {
  position: relative;
}

.metric-strip > .capacity-metric.capacity-full {
  border-color: #c9a227;
  background: #fff8e8;
  box-shadow: inset 0 3px #c9a227;
}

.metric-strip > .capacity-metric.capacity-over {
  border-color: #b54b3f;
  background: #fff2ef;
  box-shadow: inset 0 3px #b54b3f;
}

.capacity-status {
  display: block;
  margin-top: 10px;
  color: #735900;
  font: 700 11px/1.35 "Microsoft YaHei", sans-serif;
  font-style: normal;
}

.capacity-over .capacity-status,
.capacity-over strong {
  color: #8e3a28;
}
```

- [ ] **Step 5: 运行聚焦测试并确认通过**

Run: `npm.cmd run test:run -- src/App.test.tsx`

Expected: PASS；已满、超限和正常三种状态均被覆盖。

- [ ] **Step 6: 新增完全隔离的浏览器验收脚本**

创建 `work/capacity_alert_browser_acceptance.cjs`。脚本必须要求显式的 `WORTHWARD_URL`，只修改当前 test-mode 浏览器上下文的 `localStorage`，不得调用 `/api`：

```js
const path = require('path')
const { chromium } = require('C:/Users/sheng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

const url = process.env.WORTHWARD_URL
if (!url) throw new Error('WORTHWARD_URL is required for isolated capacity alert acceptance')

;(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(url)
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => localStorage.getItem('attention-workbench:v1') !== null)
  await page.evaluate(() => {
    const key = 'attention-workbench:v1'
    const state = JSON.parse(localStorage.getItem(key))
    const timestamp = '2026-08-25T00:00:00.000Z'
    state.items = {}
    const add = (stage, count) => {
      for (let index = 0; index < count; index += 1) {
        const id = `${stage}-${index + 1}`
        state.items[id] = {
          id,
          title: `${stage} ${index + 1}`,
          description: '',
          board: index % 2 ? 'create' : 'explore',
          category: null,
          topics: [],
          stage,
          capturedAt: timestamp,
          stageEnteredAt: timestamp,
          lastTouchedAt: timestamp,
          lastProgressAt: null,
          version: 1,
        }
      }
    }
    add('focus', 2)
    add('engage', 3)
    state.settings.focusWipLimit = 2
    state.settings.engageWipLimit = 2
    localStorage.setItem(key, JSON.stringify(state))
  })
  await page.reload()
  await page.getByRole('button', { name: '洞察' }).click()
  const focus = page.locator('.capacity-metric').filter({ hasText: '正在 Focus' })
  const engage = page.locator('.capacity-metric').filter({ hasText: '正在 Engage' })
  if (!(await focus.getAttribute('class')).includes('capacity-full')) throw new Error('Focus full state missing')
  if (!(await engage.getAttribute('class')).includes('capacity-over')) throw new Error('Engage over state missing')
  await focus.getByText('已达上限').waitFor()
  await engage.getByText('超出 1 项').waitFor()
  await page.screenshot({ path: path.join(__dirname, 'capacity-alerts-desktop.png'), fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) {
    throw new Error('Capacity alert mobile layout overflow')
  }
  await page.screenshot({ path: path.join(__dirname, 'capacity-alerts-mobile.png'), fullPage: true })
  await browser.close()
  console.log('CAPACITY_ALERT_ACCEPTANCE=PASS')
})().catch((error) => { console.error(error); process.exit(1) })
```

- [ ] **Step 7: 构建 test-mode 页面并运行浏览器验收**

Run: `npm.cmd run typecheck`

Run: `node_modules\.bin\vite.cmd build --mode test`

Run in background: `node_modules\.bin\vite.cmd preview --host 127.0.0.1 --port 4174`

Run: `$env:WORTHWARD_URL='http://127.0.0.1:4174'; node work\capacity_alert_browser_acceptance.cjs`

Expected: `CAPACITY_ALERT_ACCEPTANCE=PASS`；生成桌面与手机截图，且不会访问或修改 5174 的真实工作区服务。

完成后停止 4174 临时服务，并运行 `npm.cmd run build` 恢复生产构建。

- [ ] **Step 8: 运行完整回归并提交**

Run: `npm.cmd run test:run`

Expected: 32 个测试文件、231 项或更多测试全部 PASS。

Run: `npm.cmd run typecheck`

Run: `npm.cmd run build`

Expected: 类型检查与生产构建 exit code 0；既有约 500 kB 主包警告可以保留。

检查 `work/capacity-alerts-desktop.png` 与 `work/capacity-alerts-mobile.png`：已满为琥珀色、超限为珊瑚红，状态文字清晰，手机布局无溢出。

```bash
git add src/App.tsx src/App.test.tsx src/styles/refresh.css work/capacity_alert_browser_acceptance.cjs
git commit -m "feat: show insight capacity alerts"
```
