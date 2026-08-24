import { describe, expect, it, vi } from 'vitest'
import { createBrowserAiClient } from './aiClient'

describe('createBrowserAiClient', () => {
  it('reads status from the local AI API', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ hasKey: true }), { status: 200 })) as typeof fetch
    const client = createBrowserAiClient(fetchImpl)

    await expect(client.status()).resolves.toEqual({ hasKey: true })
    expect(fetchImpl).toHaveBeenCalledWith('/api/ai/status')
  })

  it('saves a credential without returning the key', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ apiKey: 'sk-test' })
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as typeof fetch
    const client = createBrowserAiClient(fetchImpl)

    await expect(client.saveCredential('sk-test')).resolves.toEqual({ ok: true })
  })

  it('returns a missing_key error from test connection', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, code: 'missing_key', error: '尚未保存 API 密钥。' }), { status: 400 }),
    ) as typeof fetch
    const client = createBrowserAiClient(fetchImpl)

    await expect(
      client.testConnection({ endpoint: 'https://example.test/v1', model: 'demo' }),
    ).resolves.toEqual({ ok: false, code: 'missing_key', error: '尚未保存 API 密钥。' })
  })

  it('posts the current card draft to suggest topics', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('/api/ai/topics')
      expect(JSON.parse(String(init?.body))).toMatchObject({
        title: '做所向',
        board: 'create',
        selectedTopics: [],
      })
      return new Response(JSON.stringify({
        ok: true,
        existing: [{ name: 'AI 与智能体', reason: '在做智能体产品' }],
        proposed: [],
      }), { status: 200 })
    }) as typeof fetch
    const client = createBrowserAiClient(fetchImpl)

    await expect(client.suggestTopics({
      title: '做所向',
      description: '接入 LLM',
      board: 'create',
      category: '产品 / 项目',
      selectedTopics: [],
    })).resolves.toEqual({
      ok: true,
      existing: [{ name: 'AI 与智能体', reason: '在做智能体产品' }],
      proposed: [],
    })
  })
})
