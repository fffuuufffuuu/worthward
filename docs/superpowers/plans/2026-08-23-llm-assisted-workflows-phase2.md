# 所向：LLM 辅助工作流 Implementation Plan — 第二阶段 AI 自动标签

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在新增记录和卡片详情的主题标签旁提供“AI 自动标签”：用户点击后才调用模型，复用现有主题（最多 3 个）并让新标签（最多 2 个）经确认后才加入。

**Architecture:** 浏览器只发送当前卡片草稿。本机服务读取工作区中的主题名称与使用次数、已保存的接口设置和本机密钥，调用 OpenAI 兼容接口，并在返回前按目录校正重名/近义。界面只改当前表单，保存仍由原有按钮完成。

**Tech Stack:** React 19、TypeScript、Vitest、Testing Library、本机 Node 服务、已有 `completeStructured`。

## Global Constraints

- 不点击按钮就不调用 LLM。
- 不发送其他卡片正文；不修改类别或探索/创造板块。
- 新标签必须确认；近义标签提示复用，不直接创建。
- 失败不改变当前标签。
- 密钥不进入请求日志和界面。
- 当前目录不是 Git 仓库；以测试代替提交。

---

### Task 1: 主题目录与建议校正

**Files:**
- Create: `src/domain/autoTag.ts`
- Create: `src/domain/autoTag.test.ts`

**Interfaces:**
- `topicUsage(state) -> { name, count }[]`
- `normalizeTopicKey(name)`：去空白、小写、去掉常见分隔符
- `matchExistingTopic(catalog, name)`：精确（含大小写/空格）或 `near`
- `sanitizeAutoTagResult(raw, catalog, selected) -> { existing, proposed }`
  - existing ≤ 3，名称必须落在目录中
  - proposed ≤ 2；与目录精确相同则改入 existing
  - 近义则 `proposed[].reuse = 现有名称`，不直接创建
  - 已选中的标签不再重复加入 existing

- [ ] 写失败测试：计数、精确复用、近义提示、截断 3+2、空结果合法
- [ ] 运行 RED
- [ ] 最小实现
- [ ] GREEN

---

### Task 2: 本机 `/api/ai/topics`

**Files:**
- Create: `server/ai-topics.mjs`
- Create: `server/ai-topics.test.ts`
- Modify: `server/local-server.mjs`
- Modify: `server/local-server.test.ts`

**Interfaces:**
- `POST /api/ai/topics` body: `{ title, description, board, category, selectedTopics }`
- 从 `store.read()` 取 `settings.ai.endpoint/model` 和 `topicUsage`
- 无密钥 → `missing_key`；无接口地址 → `not_configured`
- 使用独立提示和 `AUTO_TAG_SHAPE`
- 返回 `{ ok: true, existing, proposed }`，不含密钥和其他卡片正文

- [ ] 写失败测试：注入 completeStructured、校正 existing、不调用直到 POST、无密钥
- [ ] RED
- [ ] 实现路由与提示
- [ ] GREEN

---

### Task 3: 前端客户端与主题编辑器

**Files:**
- Modify: `src/data/aiClient.ts`
- Modify: `src/data/aiClient.test.ts`
- Create: `src/components/AiTopicEditor.tsx`
- Create: `src/components/AiTopicEditor.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- `AiClient.suggestTopics(input)`
- `AiTopicEditor`：主题旁“AI 自动标签”；状态文案；新标签确认/复用；加载中忽略过期响应
- Capture 与详情编辑都使用它
- 缺密钥时按钮仍在，点击提示去设置

- [ ] 写失败测试：未点击不请求；现有标签自动加入；新标签需确认；失败不改标签
- [ ] RED
- [ ] 实现并接入 Capture/Detail
- [ ] 全量测试 GREEN
