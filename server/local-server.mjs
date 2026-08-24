import { promises as fs } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  WorkspaceValidationError,
  createWorkspaceStore,
} from './workspace-store.mjs'
import { EmptyCredentialError, createCredentialStore } from './ai-credentials.mjs'
import { CONNECTION_TEST_SHAPE, completeStructured as defaultCompleteStructured } from './ai-gateway.mjs'
import { AUTO_TAG_SHAPE, buildAutoTagMessages, catalogFromWorkspace, sanitizeAutoTagResult } from './ai-topics.mjs'
import { ENGAGE_PLAN_SHAPE, buildEngagePlanMessages, sanitizeEngagePlan } from './ai-engage-plan.mjs'
import { REVIEW_PLAN_SHAPE, buildReviewMessages } from './ai-review.mjs'
import { createDidaCli } from './dida-cli.mjs'

const LOOPBACK_HOST = '127.0.0.1'
const DEFAULT_PORT = 5174
const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function sendJson(response, status, body) {
  const text = JSON.stringify(body)
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(text)
}

async function readJsonBody(request, limit) {
  const declaredLength = Number(request.headers['content-length'])
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new HttpError(413, 'Request body is too large')
  }

  const chunks = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk)
    size += buffer.length
    if (size > limit) throw new HttpError(413, 'Request body is too large')
    chunks.push(buffer)
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON')
  }
}

function contentTypeFor(file) {
  switch (path.extname(file).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    default:
      return 'application/octet-stream'
  }
}

async function sendFile(response, file) {
  const body = await fs.readFile(file)
  response.writeHead(200, {
    'content-length': body.length,
    'content-type': contentTypeFor(file),
  })
  response.end(body)
}

function requestPath(request) {
  const rawPath = (request.url ?? '/').split('?', 1)[0]
  let decoded
  try {
    decoded = decodeURIComponent(rawPath)
  } catch {
    throw new HttpError(400, 'Invalid request path')
  }

  if (
    decoded.includes('\0') ||
    decoded.split(/[\\/]+/).some((segment) => segment === '..')
  ) {
    throw new HttpError(403, 'Path is not allowed')
  }
  return decoded.replace(/\\/g, '/')
}

async function sendFileInsideDist(response, file, distDirectory) {
  const [realDist, realFile] = await Promise.all([
    fs.realpath(distDirectory),
    fs.realpath(file),
  ])
  const realDistPrefix = `${realDist}${path.sep}`
  if (realFile !== realDist && !realFile.startsWith(realDistPrefix)) {
    throw new HttpError(403, 'Path is not allowed')
  }
  await sendFile(response, realFile)
}

async function serveStatic(response, pathname, distDirectory) {
  const relativePath = pathname.replace(/^[\\/]+/, '')
  const requestedFile = path.resolve(distDirectory, relativePath || 'index.html')
  const distPrefix = `${path.resolve(distDirectory)}${path.sep}`
  if (requestedFile !== path.resolve(distDirectory) && !requestedFile.startsWith(distPrefix)) {
    throw new HttpError(403, 'Path is not allowed')
  }

  try {
    const information = await fs.stat(requestedFile)
    if (information.isFile()) {
      await sendFileInsideDist(response, requestedFile, distDirectory)
      return
    }
  } catch (error) {
    if (error instanceof HttpError) throw error
    // Missing static routes fall back to the SPA entry below.
  }

  try {
    await sendFileInsideDist(response, path.join(distDirectory, 'index.html'), distDirectory)
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(404, 'Static application is unavailable')
  }
}

async function handleAi(request, response, options) {
  const pathname = requestPath(request)

  if (pathname === '/api/ai/status' && request.method === 'GET') {
    sendJson(response, 200, { hasKey: await options.credentials.has() })
    return true
  }

  if (pathname === '/api/ai/credential' && request.method === 'PUT') {
    const contentType = request.headers['content-type'] ?? ''
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
      sendJson(response, 415, { error: 'Content-Type must be application/json' })
      return true
    }
    try {
      const body = await readJsonBody(request, options.bodyLimitBytes)
      await options.credentials.save(body?.apiKey)
      sendJson(response, 200, { ok: true })
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: error.message })
      } else if (error instanceof EmptyCredentialError) {
        sendJson(response, 400, { ok: false, code: 'missing_key', error: '尚未保存 API 密钥。' })
      } else {
        sendJson(response, 500, { error: 'Credential could not be saved' })
      }
    }
    return true
  }

  if (pathname === '/api/ai/credential' && request.method === 'DELETE') {
    await options.credentials.clear()
    sendJson(response, 200, { ok: true })
    return true
  }

  if (pathname === '/api/ai/test' && request.method === 'POST') {
    const contentType = request.headers['content-type'] ?? ''
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
      sendJson(response, 415, { error: 'Content-Type must be application/json' })
      return true
    }
    try {
      const body = await readJsonBody(request, options.bodyLimitBytes)
      const incomingKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : ''
      if (incomingKey) {
        await options.credentials.save(incomingKey)
      }
      const apiKey = incomingKey || (await options.credentials.read())
      if (!apiKey) {
        sendJson(response, 400, { ok: false, code: 'missing_key', error: '尚未保存 API 密钥。' })
        return true
      }
      const result = await options.completeStructured({
        endpoint: typeof body?.endpoint === 'string' ? body.endpoint : '',
        model: typeof body?.model === 'string' ? body.model : '',
        apiKey,
        messages: [
          { role: 'system', content: 'You are a connection test. Reply with JSON only.' },
          { role: 'user', content: 'Return {"ok": true}' },
        ],
        shape: CONNECTION_TEST_SHAPE,
      })
      if (result?.ok) {
        sendJson(response, 200, { ok: true })
        return true
      }
      sendJson(response, 400, {
        ok: false,
        code: result?.code ?? 'invalid_format',
        error: result?.error ?? '无法完成连接测试。',
      })
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: error.message })
      } else if (error instanceof EmptyCredentialError) {
        sendJson(response, 400, { ok: false, code: 'missing_key', error: '尚未保存 API 密钥。' })
      } else {
        sendJson(response, 500, { error: 'Connection test failed' })
      }
    }
    return true
  }

  if (pathname === '/api/ai/topics' && request.method === 'POST') {
    const contentType = request.headers['content-type'] ?? ''
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
      sendJson(response, 415, { error: 'Content-Type must be application/json' })
      return true
    }
    try {
      const body = await readJsonBody(request, options.bodyLimitBytes)
      const apiKey = await options.credentials.read()
      if (!apiKey) {
        sendJson(response, 400, { ok: false, code: 'missing_key', error: '尚未保存 API 密钥。' })
        return true
      }

      let workspace = { items: {}, settings: {} }
      try {
        const stored = await options.store.read()
        if (stored.status !== 'missing' && stored.workspace) workspace = stored.workspace
      } catch {
        workspace = { items: {}, settings: {} }
      }

      const endpoint = String(workspace.settings?.ai?.endpoint ?? '').trim()
      const model = String(workspace.settings?.ai?.model ?? '').trim()
      if (!endpoint || !model) {
        sendJson(response, 400, {
          ok: false,
          code: 'not_configured',
          error: '请先在设置中填写接口地址和模型。',
        })
        return true
      }

      const catalog = catalogFromWorkspace(workspace)
      const selectedTopics = Array.isArray(body?.selectedTopics) ? body.selectedTopics.map(String) : []
      const result = await options.completeStructured({
        endpoint,
        model,
        apiKey,
        messages: buildAutoTagMessages({
          title: body?.title,
          description: body?.description,
          board: body?.board,
          category: body?.category ?? null,
          selectedTopics,
        }, catalog),
        shape: AUTO_TAG_SHAPE,
      })
      if (!result?.ok) {
        sendJson(response, 400, {
          ok: false,
          code: result?.code ?? 'invalid_format',
          error: result?.error ?? '模型返回的内容无法使用。',
        })
        return true
      }

      const sanitized = sanitizeAutoTagResult(result.value, catalog, selectedTopics)
      sendJson(response, 200, { ok: true, ...sanitized })
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: error.message })
      } else {
        sendJson(response, 500, { error: 'Topic suggestion failed' })
      }
    }
    return true
  }

  if (pathname === '/api/ai/engage-plan' && request.method === 'POST') {
    const contentType = request.headers['content-type'] ?? ''
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
      sendJson(response, 415, { error: 'Content-Type must be application/json' })
      return true
    }
    try {
      const body = await readJsonBody(request, options.bodyLimitBytes)
      const apiKey = await options.credentials.read()
      if (!apiKey) {
        sendJson(response, 400, { ok: false, code: 'missing_key', error: '尚未保存 API 密钥。' })
        return true
      }

      let workspace = { items: {}, settings: {} }
      try {
        const stored = await options.store.read()
        if (stored.status !== 'missing' && stored.workspace) workspace = stored.workspace
      } catch {
        workspace = { items: {}, settings: {} }
      }

      const endpoint = String(workspace.settings?.ai?.endpoint ?? '').trim()
      const model = String(workspace.settings?.ai?.model ?? '').trim()
      if (!endpoint || !model) {
        sendJson(response, 400, {
          ok: false,
          code: 'not_configured',
          error: '请先在设置中填写接口地址和模型。',
        })
        return true
      }

      const result = await options.completeStructured({
        endpoint,
        model,
        apiKey,
        messages: buildEngagePlanMessages({
          title: body?.title,
          description: body?.description,
          board: body?.board,
          category: body?.category ?? null,
          topics: body?.topics,
          mainTitle: body?.mainTitle,
          mainNotes: body?.mainNotes,
        }),
        shape: ENGAGE_PLAN_SHAPE,
      })
      if (!result?.ok) {
        sendJson(response, 400, {
          ok: false,
          code: result?.code ?? 'invalid_format',
          error: result?.error ?? '模型返回的内容无法使用。',
        })
        return true
      }

      sendJson(response, 200, { ok: true, ...sanitizeEngagePlan(result.value) })
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: error.message })
      } else {
        sendJson(response, 500, { error: 'Engage plan failed' })
      }
    }
    return true
  }

  if (pathname === '/api/ai/review-plan' && request.method === 'POST') {
    const contentType = request.headers['content-type'] ?? ''
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
      sendJson(response, 415, { error: 'Content-Type must be application/json' })
      return true
    }
    try {
      const body = await readJsonBody(request, options.bodyLimitBytes)
      const apiKey = await options.credentials.read()
      if (!apiKey) {
        sendJson(response, 400, { ok: false, code: 'missing_key', error: '尚未保存 API 密钥。' })
        return true
      }

      let workspace = { items: {}, events: [], settings: {} }
      try {
        const stored = await options.store.read()
        if (stored.status !== 'missing' && stored.workspace) workspace = stored.workspace
      } catch {
        workspace = { items: {}, events: [], settings: {} }
      }

      const endpoint = String(workspace.settings?.ai?.endpoint ?? '').trim()
      const model = String(workspace.settings?.ai?.model ?? '').trim()
      if (!endpoint || !model) {
        sendJson(response, 400, {
          ok: false,
          code: 'not_configured',
          error: '请先在设置中填写接口地址和模型。',
        })
        return true
      }

      const kind = body?.kind === 'focus_engage' ? 'focus_engage' : 'radar_focus'
      const now = new Date().toISOString()
      const items = workspace.items && typeof workspace.items === 'object' ? workspace.items : {}
      const inStage = (stage) => Object.values(items).filter((item) => item?.stage === stage)
      const extraIds = Array.isArray(body?.extraIds) ? body.extraIds.map(String) : []
      const requested = Array.isArray(body?.candidateIds) ? body.candidateIds.map(String) : []
      const radar = inStage('radar')
      const focus = inStage('focus')
      const engage = inStage('engage')
      const radarSelected = (requested.length
        ? requested.map((itemId) => items[itemId]).filter((item) => item?.stage === 'radar')
        : [...extraIds.map((itemId) => items[itemId]).filter((item) => item?.stage === 'radar'), ...radar]
      ).filter((item, index, list) => list.findIndex((entry) => entry.id === item.id) === index)
        .slice(0, 40)
      const candidates = kind === 'radar_focus' ? radarSelected : focus
      const occupying = kind === 'radar_focus' ? focus : engage
      const relatedIds = new Set([...candidates, ...occupying, ...engage].map((item) => item.id))
      const compact = (item) => ({
        id: item.id,
        title: String(item.title ?? ''),
        description: String(item.description ?? '').slice(0, 400),
        board: item.board === 'create' ? 'create' : 'explore',
        category: item.category ?? null,
        topics: Array.isArray(item.topics) ? item.topics.map(String) : [],
        stage: item.stage,
        lastTouchedAt: item.lastTouchedAt ?? '',
      })
      const cutoff = Date.now() - 30 * 86_400_000
      const recentMoves = Array.isArray(workspace.events)
        ? workspace.events
          .filter((event) => event?.type === 'stage_changed' && relatedIds.has(event.itemId) && Date.parse(event.occurredAt) >= cutoff)
          .slice(-40)
          .map((event) => ({
            itemId: event.itemId,
            fromStage: event.fromStage,
            toStage: event.toStage,
            occurredAt: event.occurredAt,
          }))
        : []
      const focusLimit = Number(workspace.settings?.focusWipLimit) || 10
      const engageLimit = Number(workspace.settings?.engageWipLimit) || 4
      const remainingCapacity = kind === 'radar_focus'
        ? Math.max(0, focusLimit - focus.length)
        : Math.max(0, engageLimit - engage.length)

      const result = await options.completeStructured({
        endpoint,
        model,
        apiKey,
        messages: buildReviewMessages({
          kind,
          attentionDirection: String(body?.attentionDirection ?? ''),
          remainingCapacity,
          wip: {
            focus: { current: focus.length, limit: focusLimit },
            engage: { current: engage.length, limit: engageLimit },
          },
          candidates: candidates.map(compact),
          occupying: occupying.map(compact),
          recentMoves,
          analyzedCount: candidates.length,
          totalCount: kind === 'radar_focus' ? radar.length : focus.length,
        }),
        shape: REVIEW_PLAN_SHAPE,
      })
      if (!result?.ok) {
        sendJson(response, 400, {
          ok: false,
          code: result?.code ?? 'invalid_format',
          error: result?.error ?? '模型返回的内容无法使用。',
        })
        return true
      }

      sendJson(response, 200, {
        ok: true,
        kind,
        suggestion: result.value,
        analyzedCount: candidates.length,
        totalCount: kind === 'radar_focus' ? radar.length : focus.length,
      })
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: error.message })
      } else {
        sendJson(response, 500, { error: 'Review plan failed' })
      }
    }
    return true
  }

  if (pathname === '/api/ai' || pathname.startsWith('/api/ai/')) {
    sendJson(response, 404, { error: 'API route not found' })
    return true
  }

  return false
}

async function handleTickTick(request, response, options) {
  const pathname = requestPath(request)

  if (pathname === '/api/ticktick/cli/status' && request.method === 'GET') {
    try {
      sendJson(response, 200, await options.didaCli.status())
    } catch {
      sendJson(response, 500, { ok: false, error: '无法检查 dida CLI。' })
    }
    return true
  }

  if (pathname === '/api/ticktick/cli/test' && request.method === 'POST') {
    const contentType = request.headers['content-type'] ?? ''
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
      sendJson(response, 415, { error: 'Content-Type must be application/json' })
      return true
    }
    try {
      const body = await readJsonBody(request, options.bodyLimitBytes)
      sendJson(response, 200, await options.didaCli.test(body?.listName))
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: error.message })
      } else {
        sendJson(response, 500, { ok: false, error: '无法测试 dida CLI。' })
      }
    }
    return true
  }

  if (pathname === '/api/ticktick/cli/create' && request.method === 'POST') {
    const contentType = request.headers['content-type'] ?? ''
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
      sendJson(response, 415, { error: 'Content-Type must be application/json' })
      return true
    }
    try {
      const body = await readJsonBody(request, options.bodyLimitBytes)
      const result = await options.didaCli.createTask({
        title: body?.title,
        content: body?.content,
        listName: body?.listName,
        steps: body?.steps,
      })
      sendJson(response, result.ok ? 200 : 400, result)
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: error.message })
      } else {
        sendJson(response, 500, { ok: false, error: 'dida CLI 创建任务失败。' })
      }
    }
    return true
  }

  if (pathname === '/api/ticktick' || pathname.startsWith('/api/ticktick/')) {
    sendJson(response, 404, { error: 'API route not found' })
    return true
  }

  return false
}

async function handleRequest(request, response, options) {
  if (await handleAi(request, response, options)) {
    return
  }
  if (await handleTickTick(request, response, options)) {
    return
  }

  const pathname = requestPath(request)

  if (pathname === '/api/health' && request.method === 'GET') {
    sendJson(response, 200, { ok: true })
    return
  }

  if (pathname === '/api/workspace' && request.method === 'GET') {
    try {
      const result = await options.store.read()
      if (result.status === 'missing') {
        sendJson(response, 404, { error: 'Workspace file is missing' })
        return
      }
      sendJson(response, 200, { workspace: result.workspace })
    } catch {
      sendJson(response, 500, { error: 'Workspace data is unreadable' })
    }
    return
  }

  if (pathname === '/api/workspace' && request.method === 'PUT') {
    const contentType = request.headers['content-type'] ?? ''
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
      sendJson(response, 415, { error: 'Content-Type must be application/json' })
      return
    }

    try {
      const workspace = await readJsonBody(request, options.bodyLimitBytes)
      const saved = await options.store.save(workspace)
      sendJson(response, 200, { workspace: saved })
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: error.message })
      } else if (error instanceof WorkspaceValidationError) {
        sendJson(response, 400, { error: 'Workspace structure is invalid' })
      } else {
        sendJson(response, 500, { error: 'Workspace could not be saved' })
      }
    }
    return
  }

  if (pathname === '/api/workspace') {
    sendJson(response, 405, { error: 'Method not allowed' })
    return
  }

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    sendJson(response, 404, { error: 'API route not found' })
    return
  }

  if (request.method !== 'GET') {
    throw new HttpError(405, 'Method not allowed')
  }

  await serveStatic(response, pathname, options.distDirectory)
}

export function createLocalServer(options = {}) {
  const store = options.store ?? createWorkspaceStore()
  const resolvedOptions = {
    store,
    credentials: options.credentials ?? createCredentialStore({ directory: store.paths.directory }),
    completeStructured: options.completeStructured ?? defaultCompleteStructured,
    didaCli: options.didaCli ?? createDidaCli(),
    distDirectory: options.distDirectory ?? path.resolve(moduleDirectory, '..', 'dist'),
    bodyLimitBytes: options.bodyLimitBytes ?? DEFAULT_BODY_LIMIT_BYTES,
  }

  return http.createServer((request, response) => {
    handleRequest(request, response, resolvedOptions).catch((error) => {
      if (response.headersSent) {
        response.destroy()
        return
      }
      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: error.message })
      } else {
        sendJson(response, 500, { error: 'Request failed' })
      }
    })
  })
}

export async function startLocalServer(options = {}) {
  const server = createLocalServer(options)
  const port = options.port ?? DEFAULT_PORT

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, LOOPBACK_HOST)
  })

  return server
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startLocalServer()
    .then(() => {
      console.log(`所向已启动：http://${LOOPBACK_HOST}:${DEFAULT_PORT}`)
    })
    .catch(() => {
      console.error('所向本地服务启动失败')
      process.exitCode = 1
    })
}
