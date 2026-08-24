import { CONNECTION_TEST_SHAPE, validateJsonShape } from './ai-schema.mjs'

export const DEFAULT_AI_TIMEOUT_MS = 90_000

const ERROR_MESSAGES = {
  missing_key: '尚未保存 API 密钥。',
  unauthorized: '密钥或接口未被接受。',
  rate_limited: '接口请求过于频繁，请稍后重试。',
  timeout: '连接超时，请稍后重试。',
  network: '无法连接到模型接口。',
  invalid_format: '模型返回的内容无法使用。',
}

function fail(code, extra = {}) {
  return { ok: false, code, error: ERROR_MESSAGES[code], ...extra }
}

export function redact(text, secret) {
  const source = String(text ?? '')
  const key = String(secret ?? '').trim()
  if (!key) return source
  return source.split(key).join('[redacted]')
}

export function chatCompletionsUrl(endpoint) {
  const trimmed = String(endpoint ?? '').trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  if (trimmed.endsWith('/chat/completions')) return trimmed
  return `${trimmed}/chat/completions`
}

function extractContent(payload) {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('')
  }
  return ''
}

function parseJsonContent(content) {
  const trimmed = String(content ?? '').trim()
  if (!trimmed) return { ok: false }
  try {
    return { ok: true, value: JSON.parse(trimmed) }
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return { ok: true, value: JSON.parse(trimmed.slice(start, end + 1)) }
      } catch {
        return { ok: false }
      }
    }
    return { ok: false }
  }
}

function mapHttpStatus(status) {
  if (status === 401 || status === 403) return 'unauthorized'
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'network'
  return 'invalid_format'
}

async function postCompletion({ url, model, apiKey, messages, fetchImpl, timeoutMs, abortSignal }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  abortSignal?.addEventListener('abort', onAbort, { once: true })

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    })
    const raw = await response.text()
    let payload = null
    try {
      payload = raw ? JSON.parse(raw) : null
    } catch {
      payload = { raw }
    }
    return { status: response.status, payload, raw }
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { code: abortSignal?.aborted && !controller.signal.reason ? 'timeout' : 'timeout' }
    }
    return { code: 'network' }
  } finally {
    clearTimeout(timer)
    abortSignal?.removeEventListener('abort', onAbort)
  }
}

export async function completeStructured(options) {
  const apiKey = String(options.apiKey ?? '').trim()
  if (!apiKey) return fail('missing_key')

  const url = chatCompletionsUrl(options.endpoint)
  if (!url) return fail('network')

  const model = String(options.model ?? '').trim()
  const shape = options.shape ?? CONNECTION_TEST_SHAPE
  const fetchImpl = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS
  const baseMessages = Array.isArray(options.messages) ? options.messages : []

  const attempts = [
    baseMessages,
    [
      ...baseMessages,
      {
        role: 'user',
        content: 'The previous reply was not valid JSON for the required object. Reply with JSON only.',
      },
    ],
  ]

  let lastCode = 'invalid_format'
  for (const messages of attempts) {
    const result = await postCompletion({
      url,
      model,
      apiKey,
      messages,
      fetchImpl,
      timeoutMs,
      abortSignal: options.abortSignal,
    })

    if (result.code) {
      lastCode = result.code
      if (result.code === 'timeout' || result.code === 'network' || result.code === 'missing_key') {
        return fail(result.code)
      }
      continue
    }

    if (result.status !== 200) {
      lastCode = mapHttpStatus(result.status)
      if (lastCode !== 'invalid_format') {
        return fail(lastCode)
      }
      continue
    }

    const parsed = parseJsonContent(extractContent(result.payload))
    if (!parsed.ok) {
      lastCode = 'invalid_format'
      continue
    }
    const checked = validateJsonShape(parsed.value, shape)
    if (checked.ok) return { ok: true, value: checked.value }
    lastCode = 'invalid_format'
  }

  return fail(lastCode)
}

export { CONNECTION_TEST_SHAPE, ERROR_MESSAGES }
