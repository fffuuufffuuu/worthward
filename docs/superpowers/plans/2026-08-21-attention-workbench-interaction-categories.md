# Attention Workbench Interaction and Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify card progression, make preview the default, separate optional TickTick handoff from Engage entry, replace time and conversion reporting with current attention structure, and migrate all cards to six stable categories.

**Architecture:** Keep the existing local React workspace and event model. Add one focused category module for allowed values and legacy migration; keep state transitions in the existing domain module; make the UI consume current `stageCounts` rather than reconstructing historical funnel conversion. Preserve legacy time fields in old backups for compatibility, but remove every path that creates, displays, aggregates, or uses them.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, dnd-kit, localStorage, existing TickTick URL handoff.

## Global Constraints

- Do not add dependencies.
- Workbench remains local-first and does not modify Feishu or Obsidian sources.
- TickTick is opened only when the user selects “移入并创建滴答任务”; there is no ongoing synchronization.
- New categories are single-select and board-specific; “未分类” remains allowed.
- Existing title, description, topics, stage, timestamps, relations, reviews, and receipts must be preserved.
- The working directory is not a Git repository, so commit steps are intentionally omitted.

---

### Task 1: Stable categories and legacy migration

**Files:**
- Create: `src/domain/categories.ts`
- Create: `src/domain/categories.test.ts`
- Modify: `src/data/storage.ts`
- Modify: `src/data/storage.test.ts`
- Modify: `src/data/personal-seed.test.ts`

**Interfaces:**
- Produces: `CATEGORY_OPTIONS: Record<Board, readonly string[]>`
- Produces: `categoryOptionsFor(board: Board): readonly string[]`
- Produces: `normalizeCategory(item: Pick<AttentionItem, 'board' | 'title' | 'category'>): string | null`
- Produces: `normalizeWorkspaceCategories(state: WorkspaceState): WorkspaceState`

- [ ] **Step 1: Write category tests that fail before the module exists**

```ts
expect(categoryOptionsFor('explore')).toEqual(['主题 / 问题', '书籍 / 影音', '课程 / 体验'])
expect(categoryOptionsFor('create')).toEqual(['产品 / 项目', '写作 / 表达', '活动 / 组织'])
expect(normalizeCategory({ board: 'explore', title: '《可见的学习》', category: '教育教学' })).toBe('书籍 / 影音')
expect(normalizeCategory({ board: 'explore', title: '腾讯云黑客松', category: '好奇看看' })).toBe('课程 / 体验')
expect(normalizeCategory({ board: 'explore', title: '注意力残留', category: '知识概念' })).toBe('主题 / 问题')
expect(normalizeCategory({ board: 'create', title: '教育AI的设计原则', category: '教育思考' })).toBe('写作 / 表达')
expect(normalizeCategory({ board: 'create', title: '直观化换算器', category: '教学工具' })).toBe('产品 / 项目')
expect(normalizeCategory({ board: 'create', title: '未来工作坊', category: '活动 / 组织' })).toBe('活动 / 组织')
expect(normalizeCategory({ board: 'create', title: '无法判断', category: null })).toBeNull()
```

- [ ] **Step 2: Run the focused test and verify the expected missing-module failure**

Run: `npm.cmd test -- --run src/domain/categories.test.ts`  
Expected: FAIL because `./categories` does not exist.

- [ ] **Step 3: Implement the minimal category module**

```ts
export const CATEGORY_OPTIONS = {
  explore: ['主题 / 问题', '书籍 / 影音', '课程 / 体验'],
  create: ['产品 / 项目', '写作 / 表达', '活动 / 组织'],
} as const

export function categoryOptionsFor(board: Board): readonly string[] {
  return CATEGORY_OPTIONS[board]
}

export function normalizeCategory(item: Pick<AttentionItem, 'board' | 'title' | 'category'>): string | null {
  if (!item.category) return null
  if (categoryOptionsFor(item.board).includes(item.category)) return item.category
  if (item.board === 'create') {
    return /思考|表达/.test(item.category) ? '写作 / 表达' : '产品 / 项目'
  }
  if (/[《》«»]|TED演讲/i.test(item.title)) return '书籍 / 影音'
  if (/课程|讲座|展览|参访|活动|比赛|挑战赛|大师赛|黑客松|培养计划/.test(item.title)) return '课程 / 体验'
  return '主题 / 问题'
}
```

`normalizeWorkspaceCategories` must return the original state object when no category changes and otherwise return a state with only `items` replaced. It must not create activity events or alter timestamps because this is schema migration, not user behavior.

- [ ] **Step 4: Run category tests and verify they pass**

Run: `npm.cmd test -- --run src/domain/categories.test.ts`  
Expected: PASS.

- [ ] **Step 5: Write failing storage tests for both seed and existing localStorage migration**

```ts
const migrated = normalizeWorkspaceCategories(workspaceWithLegacyCategories)
expect(migrated.items.book.category).toBe('书籍 / 影音')
expect(migrated.items.tool.category).toBe('产品 / 项目')
expect(migrated.items.book.title).toBe(workspaceWithLegacyCategories.items.book.title)
expect(migrated.events).toBe(workspaceWithLegacyCategories.events)

const personal = createPersonalWorkspace()
expect(Object.values(personal.items).every((item) =>
  item.category === null || categoryOptionsFor(item.board).includes(item.category)
)).toBe(true)
```

- [ ] **Step 6: Run storage and seed tests and verify they fail on legacy categories**

Run: `npm.cmd test -- --run src/data/storage.test.ts src/data/personal-seed.test.ts`  
Expected: FAIL because load/create functions still return old free-text categories.

- [ ] **Step 7: Apply normalization at all workspace load boundaries**

Wrap `createPersonalWorkspace`, `loadPersonalWorkspace`, `loadWorkspace`, and imported JSON validation results with `normalizeWorkspaceCategories`. Do not modify `personal-seed.json` mechanically; the load migration must also handle already-saved browser data.

- [ ] **Step 8: Run the storage and seed tests and verify they pass**

Run: `npm.cmd test -- --run src/domain/categories.test.ts src/data/storage.test.ts src/data/personal-seed.test.ts`  
Expected: PASS.

---

### Task 2: Remove time tracking and historical conversion reporting

**Files:**
- Modify: `src/domain/workspace.ts`
- Modify: `src/domain/workspace.test.ts`
- Modify: `src/domain/insights.ts`
- Modify: `src/domain/insights.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: existing `InsightSnapshot.stageCounts`
- Produces: stalled calculation anchored exclusively on `AttentionItem.lastTouchedAt`
- Removes from live behavior: `logProgress` and `InsightSnapshot.loggedMinutes`, `funnel`, `bypassCount`, `dropRate`

- [ ] **Step 1: Rewrite insight tests around current state and Last Touched**

```ts
const insight = buildInsights(state, '2026-08-21T00:00:00.000Z')
expect(insight.stageCounts).toEqual({ radar: 1, focus: 1, engage: 1, outcome: 1, archive: 1 })
expect(insight).not.toHaveProperty('loggedMinutes')
expect(insight).not.toHaveProperty('funnel')
expect(insight).not.toHaveProperty('bypassCount')
expect(insight).not.toHaveProperty('dropRate')
expect(insight.stalled).toContainEqual({ itemId: 'engage-old-touch', ageDays: 51 })
```

- [ ] **Step 2: Run the focused test and verify it fails on legacy insight fields and progress anchoring**

Run: `npm.cmd test -- --run src/domain/insights.test.ts`  
Expected: FAIL because historical funnel and time totals are still returned and Engage aging uses `lastProgressAt`.

- [ ] **Step 3: Simplify the insight calculation**

Remove stage-event traversal and time aggregation from `buildInsights`. Keep `stageCounts`, `boardCounts`, `topicCounts`, and `stalled`. Calculate every stalled age from `item.lastTouchedAt`.

```ts
const stalled = items
  .filter((item) => item.stage === 'radar' || item.stage === 'focus' || item.stage === 'engage')
  .map((item) => ({ itemId: item.id, ageDays: daysBetween(item.lastTouchedAt, now), item }))
```

- [ ] **Step 4: Remove the live progress-writing API and its tests**

Delete the exported `logProgress` function and the workspace test that invokes it. Keep legacy `progress_logged`, `minutes`, `note`, and `lastProgressAt` type fields so old JSON remains readable, but leave them unused by production behavior.

- [ ] **Step 5: Run domain tests and verify they pass**

Run: `npm.cmd test -- --run src/domain/workspace.test.ts src/domain/insights.test.ts`  
Expected: PASS.

---

### Task 3: Preview-first detail, next-stage action, and optional TickTick handoff

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/App.workflow.test.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes: `categoryOptionsFor(board)` from Task 1
- Produces UI helper: `nextStageFor(stage: ActiveStage): ActiveStage | 'archive'`
- Changes internal move call to: `executeMove(itemId, target, { overrideWip?, createTickTick? })`
- Extends pending WIP state with: `createTickTick: boolean`

- [ ] **Step 1: Add failing tests for preview-first detail and controlled categories**

```tsx
await user.click(screen.getByRole('button', { name: /打开卡片/ }))
expect(screen.getByRole('tab', { name: '预览' })).toHaveAttribute('aria-selected', 'true')
expect(screen.getByText('探索', { selector: '.metadata-chip' })).toBeInTheDocument()
expect(screen.getByText('主题 / 问题', { selector: '.metadata-chip' })).toBeInTheDocument()
expect(screen.queryByLabelText('说明（支持 Markdown）')).not.toBeInTheDocument()
await user.click(screen.getByRole('tab', { name: '编辑' }))
expect(screen.getByLabelText('类别标签')).toHaveRole('combobox')
```

- [ ] **Step 2: Add failing tests for next-stage controls**

For a Radar card expect `进入 Focus`; after clicking, expect the card in Focus and the button text `进入 Engage`. For Engage expect `进入 Outcome & Review`. For Outcome expect `完成并归档`, and clicking it must create an archive transition rather than a drop transition.

- [ ] **Step 3: Add failing tests for the three Engage choices**

```tsx
await user.click(screen.getByRole('button', { name: '进入 Engage' }))
expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument()
expect(screen.getByRole('button', { name: '仅移入' })).toBeInTheDocument()
expect(screen.getByRole('button', { name: '移入并创建滴答任务' })).toBeInTheDocument()

await user.click(screen.getByRole('button', { name: '仅移入' }))
expect(openExternal).not.toHaveBeenCalled()
expect(currentWorkspace.exportReceipts).toHaveLength(0)
```

A separate test chooses `移入并创建滴答任务` and expects one external open and one receipt. Re-entering Engage with an existing receipt expects the creation button to be disabled and labelled `已发起创建`.

- [ ] **Step 4: Run the UI tests and verify all three behavior groups fail for the expected missing controls**

Run: `npm.cmd test -- --run src/App.test.tsx src/App.workflow.test.tsx`  
Expected: FAIL on preview default, next-stage button, and missing `仅移入` action.

- [ ] **Step 5: Implement controlled category selects**

Replace free-text category inputs in capture and edit with a select:

```tsx
<select aria-label="类别标签" value={category} onChange={(event) => setCategory(event.target.value)}>
  <option value="">未分类</option>
  {categoryOptionsFor(board).map((value) => <option key={value}>{value}</option>)}
</select>
```

When the board changes, retain the category only if it belongs to the new board; otherwise set it to an empty value.

- [ ] **Step 6: Implement preview-first detail mode**

Initialize `editing` to `false`. Render metadata chips and sanitized Markdown in preview. Render fields only in edit mode. Add `取消编辑` to reset local fields from `item`; after `onSave`, set `editing` back to `false`. Only show `保存修改` while editing.

- [ ] **Step 7: Implement next-stage action**

```ts
function nextStageFor(stage: ActiveStage): ActiveStage | 'archive' {
  return ({ radar: 'focus', focus: 'engage', engage: 'outcome', outcome: 'archive' } as const)[stage]
}
```

Use `requestMove` for active targets. For Outcome, call `archiveItem(workspace, itemId, 'archive')`, close the drawer, and show `已完成并归档`.

- [ ] **Step 8: Implement Engage choice without automatic handoff**

Change `executeMove` so TickTick preparation occurs only when `createTickTick === true`. Create a dedicated Engage dialog with three buttons. Store `createTickTick` in the WIP override request so the selected intent survives an over-limit confirmation.

```ts
if (result.enteredEngage && options.createTickTick) {
  const handoff = prepareTickTickHandoff(next, itemId)
  next = handoff.state
  if (!handoff.alreadyHandedOff) openExternal(handoff.receipt.url ?? '')
}
```

- [ ] **Step 9: Remove time controls from the detail and top insight metrics**

Delete the progress input, progress callback, and `logProgress` import. Replace “累计投入” with `等待 Review` and `insight.stageCounts.outcome`.

- [ ] **Step 10: Run UI tests and verify they pass**

Run: `npm.cmd test -- --run src/App.test.tsx src/App.workflow.test.tsx`  
Expected: PASS.

---

### Task 4: Current-stage distribution and icon topic cards

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles/app.css`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: `InsightSnapshot.stageCounts` and `topicCounts`
- Produces UI helper: `topicIconKind(topic: string): 'ai' | 'education' | 'tool' | 'writing' | 'growth' | 'communication' | 'generic'`

- [ ] **Step 1: Add failing insight-page tests**

```tsx
expect(screen.getByRole('heading', { name: '当前阶段分布' })).toBeInTheDocument()
expect(screen.getByLabelText('Radar：76 张，占 79%')).toBeInTheDocument()
expect(screen.queryByText('绕过 Focus', { exact: false })).not.toBeInTheDocument()
expect(screen.getByRole('heading', { name: '当前关注领域' })).toBeInTheDocument()
expect(screen.getByLabelText('AI教育：29 张卡片')).toContainElement(
  screen.getByTestId('topic-icon-AI教育'),
)
```

- [ ] **Step 2: Run the UI test and verify it fails on old funnel and topic cloud**

Run: `npm.cmd test -- --run src/App.test.tsx`  
Expected: FAIL because headings, actual-count bars, and topic icons do not exist.

- [ ] **Step 3: Render current distribution bars**

Calculate `activeTotal` from the four active stage counts. Render one labelled row per stage with count, percentage, and a track whose fill width equals the percentage. Keep the count outside the fill so a zero or small value remains readable.

- [ ] **Step 4: Render semantic topic icon cards**

Implement keyword mapping with a generic fallback. Render compact inline SVGs so there is no dependency or platform-specific emoji rendering. Each card must retain visible topic text and count plus an accessible label.

- [ ] **Step 5: Add responsive styles**

Replace `.funnel` and `.topic-cloud` rules with `.stage-distribution`, `.stage-distribution-row`, `.distribution-track`, `.topic-grid`, `.topic-card`, and `.topic-icon`. Use a two-column topic grid on desktop and one column under the existing mobile breakpoint. Preserve visible keyboard focus.

- [ ] **Step 6: Run the focused UI test and verify it passes**

Run: `npm.cmd test -- --run src/App.test.tsx`  
Expected: PASS.

---

### Task 5: Full regression and browser acceptance

**Files:**
- Modify: `README.md`
- Modify: `work/import_browser_acceptance.cjs`

**Interfaces:**
- Verifies all earlier tasks; produces no new production interface.

- [ ] **Step 1: Update the project README**

Document the six categories, preview-first detail, optional TickTick handoff, and the fact that imported legacy categories are normalized without modifying source systems. Remove any statement that the app tracks invested time or always opens TickTick on Engage.

- [ ] **Step 2: Update browser acceptance checks**

The browser script must assert:

```js
await page.getByRole('button', { name: '打开卡片：注意力残留' }).click()
await page.getByRole('tab', { name: '预览' }).waitFor()
await page.getByText('主题 / 问题', { exact: true }).waitFor()
await page.getByRole('tab', { name: '编辑' }).click()
await page.getByLabel('类别标签').selectOption('主题 / 问题')
await page.getByRole('button', { name: '进入 Focus' }).waitFor()
await page.getByRole('heading', { name: '当前阶段分布' }).waitFor()
await page.getByRole('heading', { name: '当前关注领域' }).waitFor()
```

Also check desktop and 390×844 layouts and fail on unexpected console errors.

- [ ] **Step 3: Run the full automated suite**

Run: `npm.cmd test -- --run`  
Expected: all tests pass with zero failures.

- [ ] **Step 4: Run static and production checks**

Run: `npm.cmd run typecheck`  
Expected: exit code 0.

Run: `npm.cmd run build`  
Expected: exit code 0. The existing bundle-size warning is acceptable because the personal seed is embedded intentionally.

- [ ] **Step 5: Run browser acceptance against a fresh production build**

Run the preview server on an unused explicit port, point `work/import_browser_acceptance.cjs` to that port, then run: `node work/import_browser_acceptance.cjs`.  
Expected: `IMPORT_BROWSER_ACCEPTANCE=PASS` with refreshed desktop and mobile screenshots.

- [ ] **Step 6: Inspect the screenshots**

Confirm that metadata is visible without editing, next-stage and free-move controls are adjacent, current-stage bars reflect actual counts, topic icons remain legible, and no horizontal clipping occurs at 390 px.

