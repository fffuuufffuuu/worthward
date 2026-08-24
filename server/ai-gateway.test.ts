// @vitest-environment node

import http from 'node:http'
import { afterEach, describe, expect, test } from 'vitest'
import { completeStructured } from './ai-gateway.mjs'

const connectionShape = {
  type: 'object',
  required: ['ok'],
  properties: {
    ok: { const: true },
  },
}

const running: http.Server[] = []

afterEach(async () => {
  await Promise.all(
    running.splice(0).map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  )
})

function openaiMessage(content: string) {
  return {
    choices: [{ message: { content } }],
  }
}

async function mockOpenAi(handler: (request: { url: string; body: unknown; authorization: string }) => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>) {
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const raw = Buffer.concat(chunks).toString('utf8')
    const result = await handler({
      url: request.url ?? '',
      body: raw ? JSON.parse(raw) : null,
      authorization: String(request.headers.authorization ?? ''),
    })
    const text = JSON.stringify(result.body)
    response.writeHead(result.status, { 'content-type': 'application/json' })
    response.end(text)
  })
  running.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected TCP address')
  return `http://127.0.0.1:${address.port}/v1`
}

describe('completeStructured', () => {
  test('returns parsed JSON from a valid chat completion', async () => {
    const endpoint = await mockOpenAi(() => ({
      status: 200,
      body: openaiMessage('{"ok":true}'),
    }))

    await expect(
      completeStructured({
        endpoint,
        model: 'demo',
        apiKey: 'sk-test',
        messages: [{ role: 'user', content: 'ping' }],
        shape: connectionShape,
      }),
    ).resolves.toEqual({ ok: true, value: { ok: true } })
  })

  test('retries once when the first payload is invalid', async () => {
    let calls = 0
    const endpoint = await mockOpenAi(() => {
      calls += 1
      return {
        status: 200,
        body: openaiMessage(calls === 1 ? 'not-json' : '{"ok":true}'),
      }
    })

    await expect(
      completeStructured({
        endpoint,
        model: 'demo',
        apiKey: 'sk-test',
        messages: [{ role: 'user', content: 'ping' }],
        shape: connectionShape,
      }),
    ).resolves.toEqual({ ok: true, value: { ok: true } })
    expect(calls).toBe(2)
  })

  test('returns invalid_format after two bad payloads', async () => {
    const endpoint = await mockOpenAi(() => ({
      status: 200,
      body: openaiMessage('not-json'),
    }))

    const result = await completeStructured({
      endpoint,
      model: 'demo',
      apiKey: 'sk-test',
      messages: [{ role: 'user', content: 'ping' }],
      shape: connectionShape,
    })
    expect(result).toMatchObject({ ok: false, code: 'invalid_format' })
  })

  test('maps 401 without leaking the api key', async () => {
    const endpoint = await mockOpenAi(() => ({
      status: 401,
      body: { error: { message: 'bad sk-live-should-not-leak' } },
    }))

    const result = await completeStructured({
      endpoint,
      model: 'demo',
      apiKey: 'sk-live-should-not-leak',
      messages: [{ role: 'user', content: 'ping' }],
      shape: connectionShape,
    })
    expect(result).toMatchObject({ ok: false, code: 'unauthorized' })
    expect(JSON.stringify(result)).not.toContain('sk-live-should-not-leak')
  })

  test('maps 429 to rate_limited', async () => {
    const endpoint = await mockOpenAi(() => ({
      status: 429,
      body: { error: { message: 'slow down' } },
    }))

    await expect(
      completeStructured({
        endpoint,
        model: 'demo',
        apiKey: 'sk-test',
        messages: [{ role: 'user', content: 'ping' }],
        shape: connectionShape,
      }),
    ).resolves.toMatchObject({ ok: false, code: 'rate_limited' })
  })

  test('times out when the provider never answers', async () => {
    const server = http.createServer(() => {
      // Intentionally hang until the client aborts.
    })
    running.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected TCP address')

    const result = await completeStructured({
      endpoint: `http://127.0.0.1:${address.port}/v1`,
      model: 'demo',
      apiKey: 'sk-test',
      messages: [{ role: 'user', content: 'ping' }],
      shape: connectionShape,
      timeoutMs: 50,
    })
    expect(result).toMatchObject({ ok: false, code: 'timeout' })
  })

  test('does not call the provider when the key is missing', async () => {
    let calls = 0
    const endpoint = await mockOpenAi(() => {
      calls += 1
      return { status: 200, body: openaiMessage('{"ok":true}') }
    })

    const result = await completeStructured({
      endpoint,
      model: 'demo',
      apiKey: '   ',
      messages: [{ role: 'user', content: 'ping' }],
      shape: connectionShape,
    })
    expect(result).toMatchObject({ ok: false, code: 'missing_key' })
    expect(calls).toBe(0)
  })
})
