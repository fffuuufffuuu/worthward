# Archive Permanent Delete and Shared Topics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为归档卡片增加经过确认的永久删除能力，完善 CLI 说明与注意力梳理文字，并确保 AI 在探索和创造之间复用同一套主题标签。

**Architecture:** 在领域层新增唯一的归档删除函数，由界面两个入口共同调用；函数负责清理工作区内所有卡片引用，现有持久化副作用继续由 `App` 的保存流程承担。CLI 提示和占位文字保持组件内局部修改；AI 目录继续使用全工作区汇总，只强化提示规则和跨板块接口测试。

**Tech Stack:** React 19、TypeScript、Vitest、Testing Library、Vite、本地 Node HTTP 服务。

## Global Constraints

- 只有 Archive 卡片可以永久删除，活动卡片不可直接删除。
- 详情页和归档列表图标都必须先弹出“无法恢复”的确认框。
- 删除卡片不会删除相关的其他卡片，也不会删除滴答清单中的外部任务。
- “近期关注方向”的占位文字必须是“这里可以填写近阶段感兴趣或想要发展的方向。”
- DidaCLI 必须说明为独立开源工具，不得表述为滴答清单官方 CLI。
- AI 只在用户点击“AI 自动标签”后调用，类别标签仍按板块独立，主题标签全工作区共享。
- 不增加依赖、回收站、撤销、批量删除或无关重构。

## File Map

- `src/domain/workspace.ts`：提供归档卡片永久删除及关联引用清理。
- `src/domain/workspace.test.ts`：验证删除范围、活动卡片保护和不可变行为。
- `src/App.tsx`：连接归档详情、列表图标、确认框和删除结果。
- `src/App.workflow.test.tsx`：从用户视角验证两个删除入口与取消确认。
- `src/styles/app.css`：归档行双操作布局、删除图标和确认区域样式。
- `src/components/TickTickSettingsCard.tsx`：CLI 信息图标、提示和项目链接。
- `src/components/TickTickSettingsCard.test.tsx`：验证提示可悬停、可聚焦及链接正确。
- `src/components/WeeklyReviewOverlay.tsx`：更新近期关注方向占位文字。
- `src/components/WeeklyReviewOverlay.test.tsx`：锁定新文字。
- `server/ai-topics.mjs`：明确主题目录跨板块共享。
- `server/local-server.test.ts`：验证创造卡片可复用探索卡片主题且不泄露正文或密钥。

---

### Task 1: 领域层永久删除

**Files:**
- Modify: `src/domain/workspace.ts`
- Test: `src/domain/workspace.test.ts`

**Interfaces:**
- Consumes: `WorkspaceState`、现有 `items/events/relations/reviews/exportReceipts` 结构。
- Produces: `deleteArchivedItem(state: WorkspaceState, itemId: string): { state: WorkspaceState; ok: boolean; reason?: 'item_not_found' | 'not_archived' }`。

- [ ] **Step 1: 写失败测试，覆盖完整清理和活动卡片保护**

在 `workspace.test.ts` 的 import 中加入 `deleteArchivedItem`，并增加两个测试。完整清理测试应先捕获父卡和子卡，将父卡归档，再向工作区加入包含父卡 ID 的 `relations`、`events`、`exportReceipts`、`reviews.adjustments` 和 `reviews.comboDrafts`。核心断言如下：

```ts
const result = deleteArchivedItem(state, parent.itemId)

expect(result.ok).toBe(true)
expect(result.state.items[parent.itemId]).toBeUndefined()
expect(result.state.items[child.itemId]).toBeDefined()
expect(result.state.events.some((event) =>
  event.itemId === parent.itemId || ('childItemId' in event && event.childItemId === parent.itemId)
)).toBe(false)
expect(result.state.relations.some((relation) =>
  relation.parentItemId === parent.itemId || relation.childItemId === parent.itemId
)).toBe(false)
expect(result.state.exportReceipts.some((receipt) => receipt.itemId === parent.itemId)).toBe(false)
expect(result.state.reviews[0].adjustments[0].promotions).not.toContain(parent.itemId)
expect(result.state.reviews[0].adjustments[0].displacements).not.toContainEqual(
  expect.objectContaining({ itemId: parent.itemId }),
)
expect(result.state.reviews[0].comboDrafts?.radar_focus?.promotions).not.toContainEqual(
  expect.objectContaining({ itemId: parent.itemId }),
)
```

活动卡片保护测试：

```ts
const captured = withItem('仍在关注')
const result = deleteArchivedItem(captured.state, captured.itemId)

expect(result).toMatchObject({ ok: false, reason: 'not_archived' })
expect(result.state).toBe(captured.state)
```

- [ ] **Step 2: 运行领域测试并确认正确失败**

Run: `npm.cmd run test:run -- src/domain/workspace.test.ts`

Expected: FAIL，因为 `deleteArchivedItem` 尚未导出；修正任何测试装配错误，直到失败原因只剩缺少新行为。

- [ ] **Step 3: 实现最小删除函数**

在 `workspace.ts` 中新增函数。实现必须先检查卡片存在且处于 `archive`，再以不可变方式构造新状态：

```ts
export function deleteArchivedItem(
  state: WorkspaceState,
  itemId: string,
): { state: WorkspaceState; ok: boolean; reason?: 'item_not_found' | 'not_archived' } {
  const item = state.items[itemId]
  if (!item) return { state, ok: false, reason: 'item_not_found' }
  if (item.stage !== 'archive') return { state, ok: false, reason: 'not_archived' }

  const { [itemId]: removed, ...items } = state.items
  void removed
  const referencesItem = (event: WorkspaceEvent) =>
    event.itemId === itemId || ('childItemId' in event && event.childItemId === itemId)

  return {
    ok: true,
    state: {
      ...state,
      items,
      events: state.events.filter((event) => !referencesItem(event)),
      relations: state.relations.filter((relation) =>
        relation.parentItemId !== itemId && relation.childItemId !== itemId),
      exportReceipts: state.exportReceipts.filter((receipt) => receipt.itemId !== itemId),
      reviews: state.reviews.map((review) => ({
        ...review,
        adjustments: review.adjustments.map((adjustment) => ({
          ...adjustment,
          promotions: adjustment.promotions.filter((id) => id !== itemId),
          displacements: adjustment.displacements.filter((entry) => entry.itemId !== itemId),
        })),
        comboDrafts: cleanComboDrafts(review.comboDrafts, itemId),
      })),
    },
  }
}
```

同文件增加局部 `cleanComboDrafts`，同时过滤每个草稿的 `promotions`、`displacements` 和 `extraIds`，并在输入为 `undefined` 时返回 `undefined`。不要新增删除事件，因为永久删除后事件本身也不应引用已删除卡片。

- [ ] **Step 4: 运行领域测试并确认通过**

Run: `npm.cmd run test:run -- src/domain/workspace.test.ts`

Expected: PASS，领域测试零失败。

- [ ] **Step 5: 提交领域层改动**

```powershell
git add -- src/domain/workspace.ts src/domain/workspace.test.ts
git commit -m "feat: delete archived cards permanently"
```

---

### Task 2: 归档详情与列表删除入口

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles/app.css`
- Test: `src/App.workflow.test.tsx`

**Interfaces:**
- Consumes: Task 1 的 `deleteArchivedItem`。
- Produces: `ArchivePage` 的 `onDelete(item)` 回调、`DetailDrawer` 的 `onDelete()` 回调、统一的 `pendingDeleteId` 确认状态。

- [ ] **Step 1: 写失败的用户流程测试**

新增三个测试：详情入口确认删除、列表图标确认删除、取消确认保留卡片。列表入口测试的关键步骤：

```ts
await capture('准备永久删除')
await user.click(screen.getByRole('button', { name: '打开卡片：准备永久删除' }))
await user.click(screen.getByRole('button', { name: '停止关注' }))
await user.click(screen.getByRole('button', { name: '确认停止关注' }))
await user.click(screen.getByRole('button', { name: '打开归档' }))

await user.click(screen.getByRole('button', { name: '永久删除卡片：准备永久删除' }))
expect(screen.getByRole('heading', { name: '永久删除卡片' })).toBeVisible()
expect(screen.getByText(/准备永久删除/)).toBeVisible()
expect(screen.getByText(/无法恢复/)).toBeVisible()
await user.click(screen.getByRole('button', { name: '确认永久删除' }))

expect(screen.queryByRole('button', { name: '打开卡片：准备永久删除' })).toBeNull()
expect(screen.getByText('已永久删除')).toBeVisible()
```

详情入口从归档列表打开卡片后断言详情底部存在“永久删除”；取消测试点击“取消”后断言列表卡片仍存在。

- [ ] **Step 2: 运行流程测试并确认正确失败**

Run: `npm.cmd run test:run -- src/App.workflow.test.tsx`

Expected: FAIL，因为删除按钮和确认流程尚不存在。

- [ ] **Step 3: 实现统一删除状态和确认逻辑**

在 `App.tsx`：

```ts
const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
const pendingDeleteItem = pendingDeleteId ? workspace.items[pendingDeleteId] : undefined

function confirmPermanentDelete() {
  if (!pendingDeleteId) return
  const result = deleteArchivedItem(workspace, pendingDeleteId)
  setPendingDeleteId(null)
  if (!result.ok) return
  setWorkspace(result.state)
  if (selectedId === pendingDeleteId) setSelectedId(null)
  setToast('已永久删除')
}
```

给归档详情底部传入 `onDelete={() => setPendingDeleteId(selectedItem.id)}`，只在 `item.stage === 'archive'` 时显示危险按钮。确认框使用现有 `ConfirmDialog`：标题“永久删除卡片”、确认文字“确认永久删除”，正文必须包含卡片标题和“永久删除后无法恢复”。

- [ ] **Step 4: 把归档行拆成两个可访问操作**

将单一 `.archive-row` 按钮改为容器，内部保留打开按钮，并增加独立图标按钮：

```tsx
<article className="archive-row" key={item.id}>
  <button className="archive-open" onClick={() => onOpen(item)} aria-label={`打开卡片：${item.title}`}>
    <span>{item.board === 'explore' ? '探索' : '创造'}</span>
    <strong>{item.title}</strong>
    <small>{new Date(item.lastTouchedAt).toLocaleDateString('zh-CN')}</small>
  </button>
  <button
    type="button"
    className="archive-delete"
    aria-label={`永久删除卡片：${item.title}`}
    onClick={() => onDelete(item)}
  >
    <span aria-hidden="true">⌫</span>
  </button>
</article>
```

在 `app.css` 中让 `.archive-open` 继承原行的三列布局，让 `.archive-delete` 位于最右侧并具有清晰的危险色 hover/focus 状态；移动端仍隐藏日期但保留删除图标。

- [ ] **Step 5: 运行流程测试和类型检查**

Run: `npm.cmd run test:run -- src/App.workflow.test.tsx`

Expected: PASS。

Run: `npm.cmd run typecheck`

Expected: exit 0，无 TypeScript 错误。

- [ ] **Step 6: 提交归档界面改动**

```powershell
git add -- src/App.tsx src/App.workflow.test.tsx src/styles/app.css
git commit -m "feat: add archive delete controls"
```

---

### Task 3: CLI 信息提示与注意力梳理文字

**Files:**
- Modify: `src/components/TickTickSettingsCard.tsx`
- Modify: `src/components/TickTickSettingsCard.test.tsx`
- Modify: `src/components/WeeklyReviewOverlay.tsx`
- Modify: `src/components/WeeklyReviewOverlay.test.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes: 现有设置卡和回顾侧栏，无新增公共接口。
- Produces: 可悬停/聚焦的 CLI 说明与精确的新占位文字。

- [ ] **Step 1: 写失败测试**

在 `TickTickSettingsCard.test.tsx` 中切换到 CLI 后，悬停并聚焦信息按钮：

```ts
const info = screen.getByRole('button', { name: '了解滴答清单 CLI' })
await user.hover(info)
expect(screen.getByRole('tooltip')).toHaveTextContent('独立开源')
expect(screen.getByRole('tooltip')).toHaveTextContent('并非滴答清单官方产品')
expect(screen.getByRole('link', { name: '查看 DidaCLI 项目说明' })).toHaveAttribute(
  'href',
  'https://github.com/DeliciousBuding/dida-cli',
)
info.focus()
expect(screen.getByRole('tooltip')).toBeVisible()
```

在 `WeeklyReviewOverlay.test.tsx` 中将旧占位文字断言替换为：

```ts
expect(screen.getByPlaceholderText('这里可以填写近阶段感兴趣或想要发展的方向。')).toBeVisible()
```

- [ ] **Step 2: 运行两个组件测试并确认正确失败**

Run: `npm.cmd run test:run -- src/components/TickTickSettingsCard.test.tsx src/components/WeeklyReviewOverlay.test.tsx`

Expected: FAIL，因为信息按钮和新占位文字尚不存在。

- [ ] **Step 3: 实现 CLI 信息提示**

在 CLI 单选项文字后加入 `.cli-info` 包裹层：

```tsx
<span className="cli-info">
  <button type="button" className="cli-info-trigger" aria-label="了解滴答清单 CLI" aria-describedby="dida-cli-tooltip">i</button>
  <span className="cli-info-tooltip" id="dida-cli-tooltip" role="tooltip">
    DidaCLI 是独立开源的本机命令行工具，可用于读取和创建滴答清单任务，并非滴答清单官方产品。
    <a href="https://github.com/DeliciousBuding/dida-cli" target="_blank" rel="noopener noreferrer">查看 DidaCLI 项目说明</a>
  </span>
</span>
```

CSS 默认隐藏提示；`.cli-info:hover` 和 `.cli-info:focus-within` 时显示。提示区域也属于包裹层，鼠标移向链接时不得消失。

- [ ] **Step 4: 更新占位文字**

将 `attentionDirectionHint` 精确改为：

```ts
const attentionDirectionHint = '这里可以填写近阶段感兴趣或想要发展的方向。'
```

不修改说明文字或 AI 请求时机。

- [ ] **Step 5: 运行组件测试并确认通过**

Run: `npm.cmd run test:run -- src/components/TickTickSettingsCard.test.tsx src/components/WeeklyReviewOverlay.test.tsx`

Expected: PASS，两个组件测试零失败。

- [ ] **Step 6: 提交设置与文字改动**

```powershell
git add -- src/components/TickTickSettingsCard.tsx src/components/TickTickSettingsCard.test.tsx src/components/WeeklyReviewOverlay.tsx src/components/WeeklyReviewOverlay.test.tsx src/styles/app.css
git commit -m "feat: clarify DidaCLI integration"
```

---

### Task 4: 加固 AI 跨板块主题复用

**Files:**
- Modify: `server/ai-topics.mjs`
- Test: `server/local-server.test.ts`

**Interfaces:**
- Consumes: 现有 `catalogFromWorkspace(workspace)` 全工作区目录。
- Produces: `buildAutoTagMessages(card, catalog)` 中明确的 `topicsSharedAcrossBoards: true` 规则和跨板块回归证据。

- [ ] **Step 1: 把现有接口测试改成明确的跨板块失败测试**

在测试工作区的 `other` 卡片中补齐合法的探索板块字段，并在捕获的消息中断言共享规则：

```ts
items: {
  other: {
    id: 'other',
    title: '探索中的卡片',
    description: '其他卡片的私人说明',
    board: 'explore',
    category: '主题 / 问题',
    topics: ['AI 与智能体', '注意力与个人系统'],
    stage: 'radar',
    capturedAt: '2026-08-23T00:00:00.000Z',
    stageEnteredAt: '2026-08-23T00:00:00.000Z',
    lastTouchedAt: '2026-08-23T00:00:00.000Z',
    lastProgressAt: null,
    version: 1,
  },
},
```

请求继续使用 `board: 'create'`，再断言：

```ts
const sent = JSON.stringify(captured.messages)
expect(sent).toContain('AI 与智能体')
expect(sent).toContain('topicsSharedAcrossBoards')
expect(sent).not.toContain('其他卡片的私人说明')
expect(JSON.parse(body)).toMatchObject({
  ok: true,
  existing: [{ name: 'AI 与智能体' }],
})
```

- [ ] **Step 2: 运行接口测试并确认正确失败**

Run: `npm.cmd run test:run -- server/local-server.test.ts`

Expected: FAIL，仅因为消息中还没有 `topicsSharedAcrossBoards` 明确规则；已有跨板块目录断言应通过。

- [ ] **Step 3: 最小强化 AI 规则**

在 `buildAutoTagMessages` 的 `rules` 中加入：

```js
topicsSharedAcrossBoards: true,
```

并在 system 消息加入：

```js
'existingTopics is shared by explore and create cards. Board never limits topic reuse.',
```

不改变目录生成、匹配阈值、最多 3 个已有标签和最多 2 个新建议的规则。

- [ ] **Step 4: 运行接口测试并确认通过**

Run: `npm.cmd run test:run -- server/local-server.test.ts`

Expected: PASS，且正文和密钥不出现在模型消息或响应中。

- [ ] **Step 5: 提交 AI 加固改动**

```powershell
git add -- server/ai-topics.mjs server/local-server.test.ts
git commit -m "test: enforce shared AI topic catalog"
```

---

### Task 5: 全量验证与界面检查

**Files:**
- Verify only; only fix failures directly caused by Tasks 1–4.

**Interfaces:**
- Consumes: Tasks 1–4 的全部结果。
- Produces: 可复现的测试、类型检查、构建和浏览器证据。

- [ ] **Step 1: 运行完整自动化验证**

Run: `npm.cmd run test:run`

Expected: 全部测试通过，零失败。

Run: `npm.cmd run typecheck`

Expected: exit 0，无 TypeScript 错误。

Run: `npm.cmd run build`

Expected: exit 0，Vite 成功生成生产构建。

- [ ] **Step 2: 启动本地应用并做浏览器核验**

Run: `npm.cmd run dev`

在浏览器中逐项检查：

1. 归档列表的打开区域与删除图标互不误触；
2. 列表图标和详情按钮都出现同一确认框，取消不删除、确认后列表立即移除；
3. 详情底部在窄屏下按钮不重叠；
4. CLI 信息提示悬停、键盘聚焦和链接移动均不消失；
5. 注意力梳理新占位文字完整显示；
6. 控制台没有新错误或警告。

- [ ] **Step 3: 检查最终变更范围**

Run: `git status --short`

Expected: 只保留用户原有的 `?? %SystemDrive%/`，没有本任务遗漏的未提交文件。

Run: `git log -5 --oneline`

Expected: 能看到本计划、领域删除、归档界面、设置文字和 AI 加固对应的提交。
