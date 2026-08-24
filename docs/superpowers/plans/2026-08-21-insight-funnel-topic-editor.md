# Insight Funnel and Topic Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current topic text field and insight topic cards with a chip editor, a current-stage funnel, and a topic donut while preserving all existing workflow behavior.

**Architecture:** Add one focused, controlled `TopicEditor` component and reuse it in Capture and card editing. Keep the existing insight counts as the data source; derive the six leading topic slices plus “其他” inside the insight view and render the donut without a chart dependency. Restrict layout and visual changes to the affected controls and insight cards.

**Tech Stack:** React 19, TypeScript, CSS, Vitest, Testing Library, Vite

## Global Constraints

- A card may contain multiple topics; donut percentages are based on topic-label occurrences, not mutually exclusive card shares.
- Show at most six named topics and combine every remaining occurrence into “其他”.
- `STAGES / NOW` displays current card counts only; funnel width communicates sequence, not exact proportion.
- `BALANCE` occupies the top full-width card; `STAGES / NOW` occupies the lower-left card.
- Do not add a chart library or change lifecycle, WIP, TickTick handoff, storage format, or Obsidian boundaries.
- This directory is not a Git repository, so the plan uses verified test checkpoints instead of commit steps.

## Visual Direction

The subject is a single-person attention-governance desk, and the insight page’s job is to show where attention sits now. Retain the existing paper, ink, navy, amber, coral and green palette (`#f8faf9`, `#18232d`, `#284a68`, `#e6ad38`, `#df634d`, `#4b8279`) and the existing serif/data typography roles.

```text
┌────────────────── metrics ──────────────────┐
├──────────────── BALANCE ────────────────────┤
├──────── STAGES / NOW ───────┬── TOPICS / NOW┤
│ █████ Radar           12    │    ◯  legend  │
│  ████ Focus            4    │       legend  │
│   ███ Engage           2    │       legend  │
│    ██ Outcome          1    │       legend  │
├───────────────── AGING ─────────────────────┤
```

The stepped funnel is the one signature element. The donut remains quiet and analytical; no extra icons, gradients, or decorative animation are added. This avoids turning a personal decision surface into a generic dashboard.

---

### Task 1: Controlled topic-chip editor

**Files:**
- Create: `src/components/TopicEditor.tsx`
- Create: `src/components/TopicEditor.test.tsx`

**Interfaces:**
- Consumes: `topics: string[]`, `onChange: (topics: string[]) => void`
- Produces: `TopicEditor({ topics, onChange })`

- [ ] **Step 1: Write failing interaction tests**

```tsx
function Harness({ initial = [] }: { initial?: string[] }) {
  const [topics, setTopics] = useState(initial)
  return <TopicEditor topics={topics} onChange={setTopics} />
}

it('adds trimmed unique topics and stays ready for another topic', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  await user.click(screen.getByRole('button', { name: '添加标签' }))
  const input = screen.getByRole('textbox', { name: '输入主题标签' })
  await user.type(input, '  AI教育  {Enter}AI教育{Enter}')
  expect(screen.getAllByText('AI教育')).toHaveLength(1)
  expect(input).toHaveValue('')
})

it('removes an existing topic with an accessible delete control', async () => {
  const user = userEvent.setup()
  render(<Harness initial={['人机共育']} />)
  await user.click(screen.getByRole('button', { name: '删除主题标签：人机共育' }))
  expect(screen.queryByText('人机共育')).toBeNull()
})
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm.cmd run test:run -- src/components/TopicEditor.test.tsx`  
Expected: FAIL because `TopicEditor` does not exist.

- [ ] **Step 3: Implement the controlled editor**

```tsx
import { useState } from 'react'

export function TopicEditor({ topics, onChange }: {
  topics: string[]
  onChange: (topics: string[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  function addDraft(keepOpen: boolean) {
    const topic = draft.trim()
    if (topic && !topics.includes(topic)) onChange([...topics, topic])
    setDraft('')
    setAdding(keepOpen)
  }

  return <fieldset className="topic-editor">
    <legend>主题标签</legend>
    <div className="topic-editor-list">
      {topics.map((topic) => <span className="topic-edit-chip" key={topic} tabIndex={0}>
        <span>{topic}</span>
        <button type="button" aria-label={`删除主题标签：${topic}`} onClick={() => onChange(topics.filter((value) => value !== topic))}>×</button>
      </span>)}
      {adding ? <input autoFocus aria-label="输入主题标签" value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); addDraft(true) }
          if (event.key === 'Escape') { setDraft(''); setAdding(false) }
        }}
        onBlur={() => addDraft(false)} /> :
        <button type="button" className="add-topic-button" onClick={() => setAdding(true)}>＋ 添加标签</button>}
    </div>
  </fieldset>
}
```

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `npm.cmd run test:run -- src/components/TopicEditor.test.tsx`  
Expected: both tests PASS.

---

### Task 2: Use chips in Capture and card editing

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: `TopicEditor` from Task 1
- Produces: Capture and Detail save the editor’s `string[]` directly

- [ ] **Step 1: Change the existing interface test to use chip interactions**

```tsx
await user.click(screen.getByRole('button', { name: '添加标签' }))
await user.type(screen.getByRole('textbox', { name: '输入主题标签' }), 'AI{Enter}教育{Enter}')
await user.click(screen.getByRole('button', { name: '保存到 Radar' }))
expect(screen.getByText('#AI', { selector: '.metadata-chip' })).toBeVisible()
expect(screen.getByText('#教育', { selector: '.metadata-chip' })).toBeVisible()
```

Add a detail-draft assertion:

```tsx
await user.click(screen.getByRole('tab', { name: '编辑' }))
await user.click(screen.getByRole('button', { name: '删除主题标签：教育' }))
await user.click(screen.getByRole('button', { name: '取消编辑' }))
expect(screen.getByText('#教育', { selector: '.metadata-chip' })).toBeVisible()
```

- [ ] **Step 2: Run the app interface test and confirm RED**

Run: `npm.cmd run test:run -- src/App.test.tsx`  
Expected: FAIL because Capture and Detail still expose comma-separated inputs.

- [ ] **Step 3: Integrate `TopicEditor` with array state**

In Capture:

```tsx
const [topics, setTopics] = useState<string[]>([])
<TopicEditor topics={topics} onChange={setTopics} />
```

In Detail:

```tsx
const [topics, setTopics] = useState<string[]>(item.topics)
<TopicEditor topics={topics} onChange={setTopics} />
```

Save with `topics` directly. In `cancelEditing`, restore with `setTopics(item.topics)` so cancelled deletions do not persist.

- [ ] **Step 4: Run the app interface test and confirm GREEN**

Run: `npm.cmd run test:run -- src/App.test.tsx`  
Expected: Capture, preview, cancelled topic editing and Markdown tests PASS.

---

### Task 3: Swap cards and render current-stage funnel plus topic donut

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: `buildInsights(workspace).stageCounts` and `.topicCounts`
- Produces: ordered funnel tiers and donut slices `{ label: string; count: number; color: string }[]`

- [ ] **Step 1: Replace the obsolete insight test with required semantics**

```tsx
expect(screen.getByLabelText('Radar：1 张')).toBeVisible()
expect(screen.getByLabelText('Focus：1 张')).toBeVisible()
expect(screen.queryByText(/转化率|跳转次数/)).toBeNull()
expect(screen.getByRole('img', { name: '当前关注领域，共 2 次主题标签' })).toBeVisible()
expect(screen.getByLabelText('AI教育：2 次主题标签')).toBeVisible()

const balance = screen.getByRole('heading', { name: '探索 / 创造' }).closest('section')!
const stages = screen.getByRole('heading', { name: '当前阶段分布' }).closest('section')!
expect(balance).toHaveClass('wide')
expect(balance.compareDocumentPosition(stages) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
```

Add a separate seven-topic roll-up test:

```tsx
it('groups topics beyond the leading six as other', async () => {
  const user = userEvent.setup()
  render(<App />)
  for (const [index, topic] of ['主题A', '主题B', '主题C', '主题D', '主题E', '主题F', '主题G'].entries()) {
    await user.click(screen.getByRole('button', { name: '记录想法' }))
    await user.type(screen.getByLabelText('标题'), `卡片${index + 1}`)
    await user.click(screen.getByRole('button', { name: '添加标签' }))
    await user.type(screen.getByRole('textbox', { name: '输入主题标签' }), `${topic}{Enter}`)
    await user.click(screen.getByRole('button', { name: '保存到 Radar' }))
  }
  await user.click(screen.getByRole('button', { name: '洞察' }))
expect(screen.getAllByRole('listitem', { name: /次主题标签/ })).toHaveLength(7)
expect(screen.getByLabelText('其他：1 次主题标签')).toBeVisible()
})
```

- [ ] **Step 2: Run the app interface test and confirm RED**

Run: `npm.cmd run test:run -- src/App.test.tsx`  
Expected: FAIL because the page still uses distribution bars, icon topic cards, and the old order.

- [ ] **Step 3: Implement the layout and charts without a dependency**

Derive slices inside `InsightPage`:

```tsx
const topicColors = ['#284a68', '#df634d', '#4b8279', '#e6ad38', '#765d91', '#7e8f9a', '#c3cac9']
const topicTotal = insight.topicCounts.reduce((sum, [, count]) => sum + count, 0)
const topicSlices = insight.topicCounts.slice(0, 6).map(([label, count], index) => ({ label, count, color: topicColors[index] }))
const otherCount = insight.topicCounts.slice(6).reduce((sum, [, count]) => sum + count, 0)
if (otherCount) topicSlices.push({ label: '其他', count: otherCount, color: topicColors[6] })
let angle = 0
const donutBackground = topicTotal ? `conic-gradient(${topicSlices.map((slice) => {
  const start = angle
  angle += slice.count / topicTotal * 360
  return `${slice.color} ${start}deg ${angle}deg`
}).join(', ')})` : undefined
```

Render `BALANCE` first with `wide`, a fixed-width stepped `.stage-funnel` with four labelled tiers, and a `.topic-donut-layout` containing the CSS donut plus a semantic list. Remove the obsolete topic-icon helper and markup.

- [ ] **Step 4: Run the app interface test and confirm GREEN**

Run: `npm.cmd run test:run -- src/App.test.tsx`  
Expected: funnel, order, donut, roll-up and existing interface tests PASS.

---

### Task 4: Apply the confirmed visual behavior and verify the full app

**Files:**
- Modify: `src/styles/app.css`
- Create: `work/verify_insight_ui.py`

**Interfaces:**
- Consumes: class names from Tasks 1–3
- Produces: responsive chip controls, funnel, donut and legend

- [ ] **Step 1: Add precise styles**

```css
.topic-editor{margin:16px 0;padding:0;border:0}.topic-editor legend{margin-bottom:8px;color:var(--muted);font-size:13px;font-weight:700}
.topic-editor-list{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-height:48px;padding:8px;border:1px solid var(--line);background:white}
.topic-edit-chip,.add-topic-button{min-height:34px;border:1px solid var(--line);border-radius:18px;background:#fbfcfc;color:var(--muted)}
.topic-edit-chip{display:inline-flex;align-items:center;padding-left:12px}.topic-edit-chip button{width:0;padding:0;border:0;overflow:hidden;opacity:0;background:transparent;cursor:pointer}
.topic-edit-chip:hover button,.topic-edit-chip:focus-within button{width:28px;opacity:1}.add-topic-button{padding:5px 12px;cursor:pointer}
.topic-editor-list>input{width:150px!important;min-height:34px;padding:5px 11px!important;border-radius:17px!important}
.stage-funnel{display:grid;justify-items:center;gap:5px}.funnel-tier{display:flex;justify-content:space-between;padding:11px 15px;color:white}.funnel-tier:nth-child(1){width:100%;background:var(--navy)}.funnel-tier:nth-child(2){width:86%;background:var(--focus)}.funnel-tier:nth-child(3){width:72%;background:var(--engage)}.funnel-tier:nth-child(4){width:58%;background:var(--review)}
.topic-donut-layout{display:grid;grid-template-columns:minmax(150px,210px) 1fr;align-items:center;gap:24px}.topic-donut{aspect-ratio:1;border-radius:50%;display:grid;place-items:center}.topic-donut-center{width:58%;aspect-ratio:1;border-radius:50%;display:grid;place-content:center;text-align:center;background:var(--paper)}
.topic-legend{list-style:none;margin:0;padding:0;display:grid;gap:9px}.topic-legend li{display:grid;grid-template-columns:10px 1fr auto;align-items:center;gap:8px;font-size:12px}.topic-legend-dot{width:10px;height:10px;border-radius:50%}
```

Add one mobile rule so `.topic-donut-layout` becomes a single column and the donut is centered. Remove obsolete `.stage-distribution`, `.topic-grid` and `.topic-icon` rules.

- [ ] **Step 2: Run all automated verification**

Run: `npm.cmd run test:run`  
Expected: all tests PASS.  
Run: `npm.cmd run typecheck`  
Expected: exit code 0.  
Run: `npm.cmd run build`  
Expected: exit code 0 and Vite writes `dist`.

- [ ] **Step 3: Inspect the real page at desktop and mobile widths**

First run: `python "C:\Users\sheng\.agents\skills\webapp-testing\scripts\with_server.py" --help`.

Then create a Playwright check that opens the app, navigates to 洞察, captures desktop and 390 px screenshots, checks browser console errors, opens Capture, adds and deletes a topic, and confirms the donut, funnel and responsive layout are visible.

Run the script through the provided server helper using `npm.cmd run dev -- --host 127.0.0.1` on port 5173.  
Expected: script exits 0, both screenshots exist, and no browser console errors are reported.

- [ ] **Step 4: Re-read the confirmed design against the rendered page**

Check all ten acceptance statements in `docs/superpowers/specs/2026-08-21-insight-funnel-topic-editor-design.md`. Fix any mismatch through a new failing test before changing production code.
