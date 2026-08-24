// @vitest-environment node

import { promises as fs } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { createCredentialStore } from './ai-credentials.mjs'
import { startLocalServer } from './local-server.mjs'
import { createWorkspaceStore } from './workspace-store.mjs'

const temporaryDirectories: string[] = []
const runningServers: http.Server[] = []

function workspace(title = 'saved') {
  return {
    schemaVersion: 1,
    items: { item: { title } },
    events: [],
    relations: [],
    reviews: [],
    exportReceipts: [],
    settings: {},
  }
}

async function fixture(
  options: {
    bodyLimitBytes?: number
    store?: ReturnType<typeof createWorkspaceStore>
    completeStructured?: (...args: unknown[]) => Promise<unknown>
    didaCli?: {
      status: () => Promise<unknown>
      test: (listName?: string) => Promise<unknown>
      createTask: (request: unknown) => Promise<unknown>
    }
  } = {},
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xiang-server-'))
  temporaryDirectories.push(root)
  const distDirectory = path.join(root, 'dist')
  await fs.mkdir(distDirectory)
  await fs.writeFile(path.join(distDirectory, 'index.html'), '<h1>所向应用</h1>', 'utf8')
  await fs.writeFile(path.join(distDirectory, 'asset.txt'), 'static asset', 'utf8')
  await fs.writeFile(path.join(root, 'outside-secret.txt'), 'must not leak', 'utf8')

  const dataDirectory = path.join(root, 'data')
  const store = options.store ?? createWorkspaceStore({ directory: dataDirectory })
  const credentials = createCredentialStore({
    directory: dataDirectory,
    protect: async (plain) => Buffer.from(Buffer.from(plain, 'utf8').toString('base64'), 'utf8'),
    unprotect: async (blob) => Buffer.from(Buffer.from(blob).toString('utf8'), 'base64').toString('utf8'),
  })
  const server = await startLocalServer({
    port: 0,
    store,
    credentials,
    completeStructured: options.completeStructured ?? (async () => ({ ok: true, value: { ok: true } })),
    didaCli: options.didaCli,
    distDirectory,
    bodyLimitBytes: options.bodyLimitBytes,
  })
  runningServers.push(server)
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected a TCP address')

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    port: address.port,
    root,
    server,
    store,
    credentials,
  }
}

async function rawGet(port: number, requestPath: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = http.request(
      { host: '127.0.0.1', port, path: requestPath, method: 'GET' },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        )
      },
    )
    request.on('error', reject)
    request.end()
  })
}

afterEach(async () => {
  await Promise.all(
    runningServers.splice(0).map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  )
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  )
})

describe('local server', () => {
  test('listens only on the loopback address and reports health', async () => {
    const { baseUrl, server } = await fixture()
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected a TCP address')

    expect(address.address).toBe('127.0.0.1')
    const response = await fetch(`${baseUrl}/api/health`)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: true })
  })

  test('returns 404 JSON when the workspace file is missing', async () => {
    const { baseUrl } = await fixture()

    const response = await fetch(`${baseUrl}/api/workspace`)
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) })
  })

  test('returns an existing workspace', async () => {
    const { baseUrl, store } = await fixture()
    const saved = workspace('existing')
    await store.save(saved)

    const response = await fetch(`${baseUrl}/api/workspace`)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ workspace: saved })
  })

  test('returns 500 without exposing a local path when workspace files are unreadable', async () => {
    const { baseUrl, root, store } = await fixture()
    await fs.mkdir(store.paths.directory, { recursive: true })
    await fs.writeFile(store.paths.workspace, '{broken', 'utf8')

    const response = await fetch(`${baseUrl}/api/workspace`)
    const body = await response.text()
    expect(response.status).toBe(500)
    expect(body).not.toContain(root)
  })

  test('saves valid JSON and returns the verified workspace', async () => {
    const { baseUrl, store } = await fixture()
    const saved = workspace('from put')

    const response = await fetch(`${baseUrl}/api/workspace`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(saved),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ workspace: saved })
    await expect(store.read()).resolves.toEqual({ status: 'ok', workspace: saved })
  })

  test('rejects invalid workspace JSON without changing the current file', async () => {
    const { baseUrl, store } = await fixture()
    const original = workspace('safe')
    await store.save(original)

    const response = await fetch(`${baseUrl}/api/workspace`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...workspace('invalid'), reviews: {} }),
    })

    expect(response.status).toBe(400)
    await expect(store.read()).resolves.toEqual({ status: 'ok', workspace: original })
  })

  test('accepts only JSON request bodies', async () => {
    const { baseUrl } = await fixture()

    const response = await fetch(`${baseUrl}/api/workspace`, {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    })

    expect(response.status).toBe(415)
  })

  test('rejects request bodies over the configured limit', async () => {
    const { baseUrl } = await fixture({ bodyLimitBytes: 64 })

    const response = await fetch(`${baseUrl}/api/workspace`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(100) }),
    })

    expect(response.status).toBe(413)
  })

  test('maps unexpected save failures to 500', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xiang-failing-store-'))
    temporaryDirectories.push(root)
    const realStore = createWorkspaceStore({ directory: path.join(root, 'data') })
    const failingStore = {
      ...realStore,
      async save() {
        throw new Error(`private path: ${root}`)
      },
    }
    const { baseUrl } = await fixture({ store: failingStore })

    const response = await fetch(`${baseUrl}/api/workspace`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(workspace()),
    })
    const body = await response.text()

    expect(response.status).toBe(500)
    expect(body).not.toContain(root)
  })

  test('returns JSON 404 for unknown API routes', async () => {
    const { baseUrl } = await fixture()

    const response = await fetch(`${baseUrl}/api/not-found`)
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
  })

  test('serves static files and falls back to the SPA entry', async () => {
    const { baseUrl } = await fixture()

    const assetResponse = await fetch(`${baseUrl}/asset.txt`)
    expect(assetResponse.status).toBe(200)
    await expect(assetResponse.text()).resolves.toBe('static asset')

    const spaResponse = await fetch(`${baseUrl}/explore/item-1`)
    expect(spaResponse.status).toBe(200)
    await expect(spaResponse.text()).resolves.toContain('所向应用')
  })

  test('rejects encoded directory traversal instead of serving files outside dist', async () => {
    const { port } = await fixture()

    const response = await rawGet(port, '/%2e%2e%2foutside-secret.txt')
    expect(response.status).toBe(403)
    expect(response.body).not.toContain('must not leak')
  })

  test('does not serve a file through a link that resolves outside dist', async () => {
    const { baseUrl, root } = await fixture()
    const outsideDirectory = path.join(root, 'outside')
    const linkedDirectory = path.join(root, 'dist', 'link')
    await fs.mkdir(outsideDirectory)
    await fs.writeFile(path.join(outsideDirectory, 'secret.txt'), 'linked secret', 'utf8')
    await fs.symlink(outsideDirectory, linkedDirectory, process.platform === 'win32' ? 'junction' : 'dir')

    const response = await fetch(`${baseUrl}/link/secret.txt`)
    expect(response.status).toBe(403)
    await expect(response.text()).resolves.not.toContain('linked secret')
  })

  test('keeps encoded Windows separators inside the API routing boundary', async () => {
    const { port } = await fixture()

    const response = await rawGet(port, '/api%5cnot-found')
    expect(response.status).toBe(404)
    expect(response.body).toContain('API route not found')
    expect(response.body).not.toContain('所向应用')
  })

  test('reports whether an API key is stored without returning it', async () => {
    const { baseUrl, credentials } = await fixture()

    const empty = await fetch(`${baseUrl}/api/ai/status`)
    expect(empty.status).toBe(200)
    await expect(empty.json()).resolves.toEqual({ hasKey: false })

    await credentials.save('sk-live-should-not-leak')
    const stored = await fetch(`${baseUrl}/api/ai/status`)
    const body = await stored.text()
    expect(stored.status).toBe(200)
    expect(body).not.toContain('sk-live-should-not-leak')
    expect(JSON.parse(body)).toEqual({ hasKey: true })
  })

  test('test connection saves a new key and never returns it', async () => {
    const { baseUrl, credentials } = await fixture()
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
    await expect(credentials.read()).resolves.toBe('sk-live-should-not-leak')

    const status = await fetch(`${baseUrl}/api/ai/status`)
    await expect(status.json()).resolves.toEqual({ hasKey: true })
  })

  test('test connection without a key returns missing_key', async () => {
    const { baseUrl } = await fixture()
    const response = await fetch(`${baseUrl}/api/ai/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: 'https://example.test/v1', model: 'demo-model' }),
    })
    const payload = await response.json() as { ok: boolean; code?: string; error?: string }
    expect(response.status).toBe(400)
    expect(payload).toMatchObject({ ok: false, code: 'missing_key' })
    expect(JSON.stringify(payload)).not.toMatch(/sk-/)
  })

  test('forwards structured completion errors without leaking secrets', async () => {
    const { baseUrl } = await fixture({
      completeStructured: async () => ({
        ok: false,
        code: 'unauthorized',
        error: '密钥或接口未被接受。',
      }),
    })
    await fetch(`${baseUrl}/api/ai/credential`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey: 'sk-live-should-not-leak' }),
    })
    const response = await fetch(`${baseUrl}/api/ai/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: 'https://example.test/v1', model: 'demo-model' }),
    })
    const body = await response.text()
    expect(response.status).toBe(400)
    expect(body).not.toContain('sk-live-should-not-leak')
    expect(JSON.parse(body)).toMatchObject({ ok: false, code: 'unauthorized' })
  })

  test('deletes a stored credential', async () => {
    const { baseUrl, credentials } = await fixture()
    await credentials.save('sk-live-should-not-leak')
    const response = await fetch(`${baseUrl}/api/ai/credential`, { method: 'DELETE' })
    expect(response.status).toBe(200)
    await expect(credentials.has()).resolves.toBe(false)
  })

  test('suggests topics from the current card without sending other card bodies or the key', async () => {
    let captured: { messages?: unknown; endpoint?: string; model?: string } = {}
    const { baseUrl, store, credentials } = await fixture({
      completeStructured: async (options: { messages: unknown; endpoint: string; model: string }) => {
        captured = options
        return {
          ok: true,
          value: {
            existing: [{ name: 'ai与智能体', reason: '在谈模型' }],
            proposed: [{ name: '注意力管理', reason: '专注' }],
          },
        }
      },
    })
    await credentials.save('sk-live-should-not-leak')
    await store.save({
      schemaVersion: 1,
      items: {
        other: {
          title: '别人',
          description: '其他卡片的私人说明',
          topics: ['AI 与智能体', '注意力与个人系统'],
        },
      },
      events: [],
      relations: [],
      reviews: [],
      exportReceipts: [],
      settings: {
        ai: {
          endpoint: 'https://example.test/v1',
          model: 'demo-model',
          lastTestedAt: null,
          lastTestStatus: 'ok',
          lastTestMessage: '',
        },
      },
    })

    const response = await fetch(`${baseUrl}/api/ai/topics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: '做个人注意力工作台',
        description: '接入 LLM',
        board: 'create',
        category: '产品 / 项目',
        selectedTopics: [],
      }),
    })
    const body = await response.text()
    expect(response.status).toBe(200)
    expect(body).not.toContain('sk-live-should-not-leak')
    expect(body).not.toContain('其他卡片的私人说明')
    expect(JSON.stringify(captured.messages)).not.toContain('其他卡片的私人说明')
    expect(JSON.parse(body)).toMatchObject({
      ok: true,
      existing: [{ name: 'AI 与智能体' }],
      proposed: [{ name: '注意力管理', reuse: '注意力与个人系统' }],
    })
    expect(captured.endpoint).toBe('https://example.test/v1')
    expect(captured.model).toBe('demo-model')
  })

  test('topic suggestion without a key returns missing_key', async () => {
    const { baseUrl } = await fixture()
    const response = await fetch(`${baseUrl}/api/ai/topics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x', description: '', board: 'explore', selectedTopics: [] }),
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: 'missing_key' })
  })

  test('builds an Engage plan from the current card without sending other card bodies', async () => {
    let captured: { messages?: unknown } = {}
    const { baseUrl, store, credentials } = await fixture({
      completeStructured: async (options: { messages: unknown }) => {
        captured = options
        return {
          ok: true,
          value: {
            mainTitle: '做所向',
            mainNotes: '先能用',
            steps: [
              { title: '明确最小成果' },
              { title: '制作', children: [{ title: '写执行计划' }, { title: '第三层', children: [{ title: '应被丢掉' }] }] },
            ],
          },
        }
      },
    })
    await credentials.save('sk-live-should-not-leak')
    await store.save({
      schemaVersion: 1,
      items: {
        other: { title: '别人', description: '其他卡片的私人说明', topics: [] },
      },
      events: [],
      relations: [],
      reviews: [],
      exportReceipts: [],
      settings: {
        ai: { endpoint: 'https://example.test/v1', model: 'demo-model', lastTestedAt: null, lastTestStatus: 'ok', lastTestMessage: '' },
      },
    })

    const response = await fetch(`${baseUrl}/api/ai/engage-plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: '做所向',
        description: '接入 LLM 拆解',
        board: 'create',
        category: '产品 / 项目',
        topics: ['注意力与个人系统'],
        mainTitle: '用户改过的标题',
        mainNotes: '用户改过的说明',
      }),
    })
    const body = await response.text()
    expect(response.status).toBe(200)
    expect(body).not.toContain('sk-live-should-not-leak')
    expect(JSON.stringify(captured.messages)).not.toContain('其他卡片的私人说明')
    expect(JSON.stringify(captured.messages)).toContain('用户改过的标题')
    expect(JSON.stringify(captured.messages)).toContain('用户改过的说明')
    expect(JSON.parse(body)).toMatchObject({
      ok: true,
      mainTitle: '做所向',
      steps: [
        { title: '明确最小成果' },
        { title: '制作', children: [{ title: '写执行计划' }, { title: '第三层' }] },
      ],
    })
  })

  test('builds a weekly review combination from workspace cards without leaking secrets', async () => {
    let captured: { messages?: unknown } = {}
    const { baseUrl, store, credentials } = await fixture({
      completeStructured: async (options: { messages: unknown }) => {
        captured = options
        return {
          ok: true,
          value: {
            promotions: [{ itemId: 'radar-1', evidence: '近期反复出现', relation: '贴近方向', risk: '可能过宽' }],
            displacements: [],
            summary: '先把雷达甲拉进 Focus',
          },
        }
      },
    })
    await credentials.save('sk-live-should-not-leak')
    await store.save({
      schemaVersion: 1,
      items: {
        'radar-1': { id: 'radar-1', title: '雷达甲', description: '值得认真看', board: 'explore', stage: 'radar', topics: ['注意力'], category: '主题 / 问题', lastTouchedAt: '2026-08-20T00:00:00.000Z' },
        hidden: { id: 'hidden', title: '归档秘密', description: '不该进模型', board: 'explore', stage: 'archive', topics: [], lastTouchedAt: '2026-08-01T00:00:00.000Z' },
      },
      events: [],
      relations: [],
      reviews: [],
      exportReceipts: [],
      settings: {
        focusWipLimit: 10,
        engageWipLimit: 4,
        ai: { endpoint: 'https://example.test/v1', model: 'demo-model', lastTestedAt: null, lastTestStatus: 'ok', lastTestMessage: '' },
      },
    })

    const response = await fetch(`${baseUrl}/api/ai/review-plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'radar_focus',
        attentionDirection: '把注意力工作台做完',
        candidateIds: ['radar-1'],
      }),
    })
    const body = await response.text()
    expect(response.status).toBe(200)
    expect(body).not.toContain('sk-live-should-not-leak')
    expect(JSON.stringify(captured.messages)).toContain('雷达甲')
    expect(JSON.stringify(captured.messages)).toContain('把注意力工作台做完')
    expect(JSON.stringify(captured.messages)).not.toContain('不该进模型')
    expect(JSON.parse(body)).toMatchObject({
      ok: true,
      kind: 'radar_focus',
      analyzedCount: 1,
      suggestion: { promotions: [{ itemId: 'radar-1' }] },
    })
  })

  test('creates a TickTick task through the injected dida CLI', async () => {
    const created: unknown[] = []
    const { baseUrl } = await fixture({
      didaCli: {
        status: async () => ({ ok: true, installed: true, loggedIn: true }),
        test: async (listName?: string) => ({
          ok: true,
          installed: true,
          loggedIn: true,
          projectName: listName,
          projectId: 'proj-1',
        }),
        createTask: async (request: unknown) => {
          created.push(request)
          return { ok: true, taskId: 'task-cli' }
        },
      },
    })

    const response = await fetch(`${baseUrl}/api/ticktick/cli/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: '做所向',
        content: '先能用',
        listName: '收集箱',
        steps: [{ title: '明确最小成果', notes: '', children: [] }],
      }),
    })
    await expect(response.json()).resolves.toEqual({ ok: true, taskId: 'task-cli' })
    expect(created).toEqual([{
      title: '做所向',
      content: '先能用',
      listName: '收集箱',
      steps: [{ title: '明确最小成果', notes: '', children: [] }],
    }])
  })
})
