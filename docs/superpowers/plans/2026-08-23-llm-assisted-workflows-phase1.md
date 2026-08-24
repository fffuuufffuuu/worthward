# 所向：LLM 辅助工作流 Implementation Plan — 第一阶段 AI 基础连接

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在设置页接入通用 OpenAI 兼容接口：本机保存密钥、测试连接、结构校验；工作区导出中不得出现密钥。

**Architecture:** 浏览器只读写非敏感设置（接口地址、模型、最近测试结果）。API 密钥由本机 Node 服务写入 `%LOCALAPPDATA%\所向\ai-credential.dpapi`（Windows DPAPI / CurrentUser；测试中注入假保护器）。本机服务作为唯一网关调用模型；模型输出必须通过本机 JSON 结构检查，不合格时最多格式修正一次。三个后续功能共用这个网关，本阶段只暴露「测试连接」。

**Tech Stack:** React 19、TypeScript、Vitest、Testing Library、Node.js 22、本机 HTTP、Windows DPAPI。

## Global Constraints

- 所有 AI 调用由用户点击触发；打开设置页本身不调用模型。
- API 密钥不得进入 `workspace.json`、备份、`personal-seed.json`、前端持久化、日志和界面错误文案。
- 本机服务只监听 `127.0.0.1`，固定端口 `5174`。
- AI 请求默认最多等待 90 秒。
- 测试使用模拟密钥和模拟模型；不读取用户真实密钥。
- 不实现自动标签、Engage 拆解、本周回顾（第二至四切片）。
- 当前目录不是 Git 仓库；以逐任务测试和改动复读代替提交。
- 现有 96 张卡片必须无损迁移；`schemaVersion` 保持 `1`，缺失的 `settings.ai` 由迁移补齐。

---

## 文件地图

- Create: `src/domain/ai.ts` — 默认 AI 设置、状态文案、结构类型
- Modify: `src/domain/types.ts` — `AiSettings` 并入 `WorkspaceSettings`
- Modify: `src/domain/defaults.ts` — 默认值与迁移
- Modify: `src/data/storage.ts` — 导入仍接受旧文件
- Create: `server/ai-credentials.mjs` — 本机密钥存取
- Create: `server/ai-gateway.mjs` — OpenAI 兼容调用、超时、一次格式修正、结构检查
- Modify: `server/local-server.mjs` — `/api/ai/status`、`/api/ai/credential`、`/api/ai/test`
- Create: `src/data/aiClient.ts` — 前端调用本机 AI API
- Create: `src/components/AiSettingsCard.tsx` — 设置页「AI 服务」
- Modify: `src/App.tsx` — 挂上设置卡片
- Modify: `README.md` — 去掉「当前没有 AI」表述，说明本机网关

---

### Task 1: AI 设置类型、默认值与无损迁移

**Files:**
- Modify: `src/domain/types.ts`
- Create: `src/domain/ai.ts`
- Modify: `src/domain/defaults.ts`
- Modify: `src/domain/defaults.test.ts`
- Modify: `src/data/storage.test.ts`

**Interfaces:**
- Produces: `AiConnectionStatus = 'unknown' | 'ok' | 'missing_key' | 'error'`
- Produces: `AiSettings { endpoint: string; model: string; lastTestedAt: string | null; lastTestStatus: AiConnectionStatus; lastTestMessage: string }`
- Produces: `DEFAULT_AI_SETTINGS`、`migrateAiSettings(settings)`、`aiConnectionMessage(status, fallback)`
- `WorkspaceSettings.ai` 成为必填字段；旧 JSON 导入后自动补齐，不得丢失原有卡片。

- [x] **Step 1: 写失败测试**

在 `src/domain/defaults.test.ts` 增加：

```ts
import { DEFAULT_AI_SETTINGS } from './ai'
import { migrateWorkspaceSettings } from './defaults'

it('adds empty AI settings to a legacy workspace without touching items', () => {
  const workspace = createInitialWorkspace()
  const { ai: _ignored, ...settingsWithoutAi } = workspace.settings as typeof workspace.settings & { ai?: unknown }
  const legacy = { ...workspace, settings: settingsWithoutAi }

  const migrated = migrateWorkspaceSettings(legacy as typeof workspace)

  expect(migrated.settings.ai).toEqual(DEFAULT_AI_SETTINGS)
  expect(migrated.items).toEqual(workspace.items)
})
```

新工作区断言补上 `settings.ai` 等于 `DEFAULT_AI_SETTINGS`。

在 `src/data/storage.test.ts` 增加：导出 JSON 字符串不包含 `apiKey` / `sk-`；旧文件缺 `ai` 时 `importWorkspaceJson` 仍成功。

- [x] **Step 2: 运行确认 RED**

Run: `npm.cmd run test:run -- src/domain/defaults.test.ts src/data/storage.test.ts`

Expected: FAIL，因为 `settings.ai` 尚不存在。

- [x] **Step 3: 最小实现**

`types.ts` 增加 `AiConnectionStatus`、`AiSettings`，并在 `WorkspaceSettings` 加入 `ai: AiSettings`。

`src/domain/ai.ts`：

```ts
import type { AiConnectionStatus, AiSettings } from './types'

export const AI_PROMPT_VERSION = '2026-08-23.1'

export const DEFAULT_AI_SETTINGS: AiSettings = {
  endpoint: '',
  model: '',
  lastTestedAt: null,
  lastTestStatus: 'unknown',
  lastTestMessage: '',
}

export function isAiSettings(value: unknown): value is AiSettings {
  if (!value || typeof value !== 'object') return false
  const candidate = value as AiSettings
  return (
    typeof candidate.endpoint === 'string' &&
    typeof candidate.model === 'string' &&
    (candidate.lastTestedAt === null || typeof candidate.lastTestedAt === 'string') &&
    ['unknown', 'ok', 'missing_key', 'error'].includes(candidate.lastTestStatus) &&
    typeof candidate.lastTestMessage === 'string'
  )
}

export function migrateAiSettings(value: unknown): AiSettings {
  if (!isAiSettings(value)) return { ...DEFAULT_AI_SETTINGS }
  return {
    endpoint: value.endpoint.trim(),
    model: value.model.trim(),
    lastTestedAt: value.lastTestedAt,
    lastTestStatus: value.lastTestStatus,
    lastTestMessage: value.lastTestMessage,
  }
}

export function aiConnectionMessage(status: AiConnectionStatus, detail = ''): string {
  if (status === 'ok') return '连接成功。'
  if (status === 'missing_key') return '尚未保存 API 密钥。'
  if (status === 'error') return detail || '无法完成连接测试。'
  return '尚未测试连接。'
}
```

`migrateWorkspaceSettings` 始终写入 `ai: migrateAiSettings(state.settings.ai)`。`createInitialWorkspace` 带上默认 `ai`。

- [x] **Step 4: 重跑聚焦测试，确认 GREEN**

Run: `npm.cmd run test:run -- src/domain/defaults.test.ts src/data/storage.test.ts`

---

### Task 2: 本机密钥凭据存储

**Files:**
- Create: `server/ai-credentials.mjs`
- Create: `server/ai-credentials.test.ts`

**Interfaces:**
- Produces: `createCredentialStore({ directory, fileSystem, protect, unprotect })`
- `save(secret)` / `read()` / `clear()` / `has()`
- 默认文件：`{directory}/ai-credential.dpapi`
- 生产 `protect`/`unprotect` 使用 Windows DPAPI（CurrentUser）；测试注入恒等编解码。
- 空密钥拒绝保存。读不到或解密失败时视为无密钥，不抛出明文。

- [x] **Step 1: 写失败测试**

```ts
// @vitest-environment node
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { createCredentialStore } from './ai-credentials.mjs'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

async function store() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xiang-cred-'))
  roots.push(directory)
  return createCredentialStore({
    directory,
    protect: async (plain) => Buffer.from(`enc:${plain}`, 'utf8'),
    unprotect: async (blob) => Buffer.from(blob).toString('utf8').replace(/^enc:/, ''),
  })
}

test('saves and reads back a key without writing plaintext', async () => {
  const credentials = await store()
  await credentials.save('sk-test-secret')
  await expect(credentials.has()).resolves.toBe(true)
  await expect(credentials.read()).resolves.toBe('sk-test-secret')
  const raw = await fs.readFile(credentials.file, 'utf8')
  expect(raw).not.toContain('sk-test-secret')
})

test('clear removes the credential file', async () => {
  const credentials = await store()
  await credentials.save('sk-test-secret')
  await credentials.clear()
  await expect(credentials.has()).resolves.toBe(false)
  await expect(credentials.read()).resolves.toBe(null)
})

test('rejects a blank key', async () => {
  const credentials = await store()
  await expect(credentials.save('   ')).rejects.toThrow(/empty/i)
})
```

- [x] **Step 2: 运行确认 RED**

Run: `npm.cmd run test:run -- server/ai-credentials.test.ts`

- [x] **Step 3: 最小实现 `createCredentialStore`**

用临时文件写入后替换；`protect` 失败不得留下明文文件。默认 DPAPI 通过 PowerShell `ProtectedData`，密钥经 stdin 传入，不出现在命令行参数。非 Windows 且未注入 protect 时，`save` 抛出明确错误（测试始终注入）。

- [x] **Step 4: 重跑确认 GREEN**

---

### Task 3: OpenAI 兼容调用、超时、一次格式修正、结构检查

**Files:**
- Create: `server/ai-schema.mjs`
- Create: `server/ai-schema.test.ts`
- Create: `server/ai-gateway.mjs`
- Create: `server/ai-gateway.test.ts`

**Interfaces:**
- Produces: `validateJsonShape(value, shape) -> { ok: true, value } | { ok: false, error }`
- 本阶段连接测试 shape：`{ type: 'object', required: ['ok'], properties: { ok: { const: true } } }`
- Produces: `completeStructured({ endpoint, model, apiKey, messages, shape, fetch, now, timeoutMs, abortSignal })`
- URL：若 `endpoint` 已以 `/chat/completions` 结尾则原样使用，否则拼接 `/chat/completions`（去掉末尾多余 `/`）。
- 请求体：`{ model, messages, temperature: 0, response_format: { type: 'json_object' } }`
- Header：`Authorization: Bearer …`；失败映射不得包含密钥原文。
- 超时默认 90_000。
- JSON 或 shape 失败时，追加一条 user 消息要求只返回符合结构的 JSON，再请求一次；仍失败则 `code: 'invalid_format'`。
- 错误码：`missing_key` / `unauthorized` / `rate_limited` / `timeout` / `network` / `invalid_format`。

- [x] **Step 1: 写失败测试**

`ai-schema.test.ts`：`{ok:true}` 通过；缺字段、`ok:false`、非对象失败。

`ai-gateway.test.ts` 用本地 `http.createServer` 模拟 OpenAI：

1. 正确 JSON `{ok:true}` → 成功。
2. 第一次非法 JSON、第二次合法 → 只允许第二次成功，且共 2 次请求。
3. 两次都非法 → `invalid_format`。
4. HTTP 401 → `unauthorized`，响应体和错误对象都不含密钥。
5. HTTP 429 → `rate_limited`。
6. 超过 timeoutMs 不响应 → `timeout`。
7. 空密钥不发请求 → `missing_key`。

- [x] **Step 2: 运行确认 RED**

Run: `npm.cmd run test:run -- server/ai-schema.test.ts server/ai-gateway.test.ts`

- [x] **Step 3: 最小实现 schema 校验与 `completeStructured`**

解析 `choices[0].message.content` 为 JSON。错误消息使用固定中文，并用 `redact(text, apiKey)` 去掉密钥子串。

- [x] **Step 4: 重跑确认 GREEN**

---

### Task 4: 本机 AI HTTP 接口

**Files:**
- Modify: `server/local-server.mjs`
- Modify: `server/local-server.test.ts`

**Interfaces:**
- `GET /api/ai/status` → `{ hasKey: boolean }`，无密钥明文。
- `PUT /api/ai/credential` body `{ apiKey: string }` → 保存；空值 400。
- `DELETE /api/ai/credential` → 删除。
- `POST /api/ai/test` body `{ endpoint: string, model: string, apiKey?: string }`
  - 若 body 带非空 `apiKey`，先保存再测试。
  - 否则读取已存密钥。
  - 返回 `{ ok: true } | { ok: false, code, error }`
  - 成功或失败都不把密钥写进响应。
- `createLocalServer` 增加可选 `credentials` 与 `completeStructured`，测试注入假实现。

- [x] **Step 1: 写失败测试**

沿用现有 `fixture()`，传入注入的 credential store 和 `completeStructured`：

```ts
test('test connection saves a new key and never returns it', async () => {
  const { baseUrl } = await fixture()
  const response = await fetch(`${baseUrl}/api/ai/test`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      endpoint: 'https://example.test/v1',
      model: 'demo-model',
      apiKey: 'sk-live-should-not-leak',
    }),
  })
  const body = await response.text()
  expect(response.status).toBe(200)
  expect(body).not.toContain('sk-live-should-not-leak')
  expect(JSON.parse(body)).toEqual({ ok: true })

  const status = await fetch(`${baseUrl}/api/ai/status`)
  await expect(status.json()).resolves.toEqual({ hasKey: true })
})
```

再覆盖：无密钥 → 400/409 且 `code: 'missing_key'`；注入的 complete 抛出的错误码原样返回。

- [x] **Step 2: 运行确认 RED**

Run: `npm.cmd run test:run -- server/local-server.test.ts`

- [x] **Step 3: 在 `handleRequest` 中增加三条路由**；未知 `/api/ai/*` 仍 404。

- [x] **Step 4: 重跑 `server/local-server.test.ts`，新旧用例都 GREEN**

---

### Task 5: 前端客户端与设置页「AI 服务」

**Files:**
- Create: `src/data/aiClient.ts`
- Create: `src/data/aiClient.test.ts`
- Create: `src/components/AiSettingsCard.tsx`
- Create: `src/components/AiSettingsCard.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles/app.css`（仅当现有 settings 样式不够）

**Interfaces:**
- `AiClient`: `status()`、`saveCredential(apiKey)`、`clearCredential()`、`testConnection({ endpoint, model, apiKey? })`
- `createBrowserAiClient(fetchImpl?)` 调用 `/api/ai/*`
- `AiSettingsCard` props：`workspace`、`onChange`、`aiClient`、`now?: () => string`
- 字段：接口地址、模型名称、API 密钥（password）、测试连接、最近一次连接结果。
- 已有密钥时密钥框为空，placeholder 为「已保存密钥」。
- 点击「测试连接」才发请求；成功后把 `endpoint`/`model`/`lastTest*` 写入 `settings.ai`。
- 失败也更新 `lastTestStatus/Message`，不写密钥。
- 导出按钮沿用现有 `exportWorkspaceJson`，测试断言导出文本不含用户输入的密钥。

- [x] **Step 1: 写失败测试**

`AiSettingsCard.test.tsx`：

1. 渲染设置卡片，不调用 `testConnection`。
2. 填写地址、模型、密钥后点击测试，调用一次 `testConnection`。
3. 成功后 `onChange` 的 `settings.ai.endpoint/model/lastTestStatus === 'ok'`，且 `exportWorkspaceJson` 不含密钥。
4. `hasKey: true` 时输入框 type=password 且值为空。
5. 失败时展示中文错误，不含密钥。

`App.test.tsx`：打开设置可见「AI 服务」标题。

- [x] **Step 2: 运行确认 RED**

Run: `npm.cmd run test:run -- src/components/AiSettingsCard.test.tsx src/App.test.tsx src/data/aiClient.test.ts`

- [x] **Step 3: 实现客户端与卡片，并在 `SettingsPage` 加入该卡片。** 浏览器模式下也使用同一 `aiClient`（测试注入假客户端；默认真实 fetch）。App 增加可选 `aiClient` prop，默认 `createBrowserAiClient()`。

- [x] **Step 4: 重跑 GREEN**，并跑全量 `npm.cmd run test:run` 与 `npm.cmd run typecheck`

---

### Task 6: 说明文档与切片收口

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-23-llm-assisted-workflows-design.md` 状态行改为第一阶段已实现

- [x] 把 README 中「当前版本没有用占位功能伪装实现」改为：已提供本机 AI 网关和连接测试；自动标签、Engage 拆解、本周回顾尚未实现。
- [x] 说明密钥保存在 `%LOCALAPPDATA%\所向\ai-credential.dpapi`，不进入工作区备份。
- [x] 运行 `npm.cmd run test:run`、`npm.cmd run typecheck`

---

## 本切片验收对照

| 规格 | 任务 |
|---|---|
| 正确配置可以通过连接测试 | Task 3–5 |
| 缺失密钥、错误接口、超时、限流有可理解提示 | Task 3–5 |
| 导出文件中不存在 API 密钥 | Task 1、5 |
| 模型切换不需要改三个功能的界面 | Task 3 网关与设置分离 |
| 打开页面不调用 LLM | Task 5 |
| 密钥不进工作区/日志 | Task 2、4 |
