export interface AiStatus {
  hasKey: boolean
}

export interface AiTestRequest {
  endpoint: string
  model: string
  apiKey?: string
}

export interface AiTestResult {
  ok: boolean
  code?: string
  error?: string
}

export interface TopicSuggestion {
  name: string
  reason: string
  reuse?: string
}

export interface TopicSuggestionRequest {
  title: string
  description: string
  board: 'explore' | 'create'
  category: string | null
  selectedTopics: string[]
}

export type TopicSuggestionResult =
  | { ok: true; existing: TopicSuggestion[]; proposed: TopicSuggestion[] }
  | { ok: false; existing?: TopicSuggestion[]; proposed?: TopicSuggestion[]; code?: string; error?: string }

export type EngagePlanResult =
  | { ok: true; mainTitle: string; mainNotes: string; steps: unknown[] }
  | { ok: false; code?: string; error?: string }

export type ReviewPlanKind = 'radar_focus' | 'focus_engage'

export type ReviewPlanResult =
  | {
      ok: true
      kind: ReviewPlanKind
      suggestion: unknown
      analyzedCount: number
      totalCount: number
    }
  | { ok: false; code?: string; error?: string }

export interface AiClient {
  status(): Promise<AiStatus>
  saveCredential(apiKey: string): Promise<{ ok: boolean }>
  clearCredential(): Promise<{ ok: boolean }>
  testConnection(request: AiTestRequest): Promise<AiTestResult>
  suggestTopics(request: TopicSuggestionRequest): Promise<TopicSuggestionResult>
  suggestEngagePlan(request: {
    title: string
    description: string
    board: 'explore' | 'create'
    category: string | null
    topics: string[]
    mainTitle?: string
    mainNotes?: string
  }): Promise<EngagePlanResult>
  suggestReviewPlan(request: {
    kind: ReviewPlanKind
    attentionDirection: string
    candidateIds?: string[]
    extraIds?: string[]
  }): Promise<ReviewPlanResult>
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

export function createBrowserAiClient(fetchImpl: typeof fetch = fetch): AiClient {
  return {
    async status() {
      try {
        const response = await fetchImpl('/api/ai/status')
        const payload = await readJson(response)
        return { hasKey: payload.hasKey === true }
      } catch {
        return { hasKey: false }
      }
    },
    async saveCredential(apiKey: string) {
      const response = await fetchImpl('/api/ai/credential', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      })
      if (!response.ok) throw new Error('密钥未能保存')
      return { ok: true }
    },
    async clearCredential() {
      const response = await fetchImpl('/api/ai/credential', { method: 'DELETE' })
      if (!response.ok) throw new Error('密钥未能删除')
      return { ok: true }
    },
    async testConnection(request) {
      try {
        const response = await fetchImpl('/api/ai/test', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
        })
        const payload = await readJson(response)
        if (payload.ok === true) return { ok: true }
        return {
          ok: false,
          code: typeof payload.code === 'string' ? payload.code : 'network',
          error: typeof payload.error === 'string' ? payload.error : '无法完成连接测试。',
        }
      } catch {
        return { ok: false, code: 'network', error: '无法连接到模型接口。' }
      }
    },
    async suggestTopics(request) {
      try {
        const response = await fetchImpl('/api/ai/topics', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
        })
        const payload = await readJson(response)
        if (payload.ok === true) {
          return {
            ok: true,
            existing: Array.isArray(payload.existing) ? payload.existing as TopicSuggestion[] : [],
            proposed: Array.isArray(payload.proposed) ? payload.proposed as TopicSuggestion[] : [],
          }
        }
        return {
          ok: false,
          existing: [],
          proposed: [],
          code: typeof payload.code === 'string' ? payload.code : 'network',
          error: typeof payload.error === 'string' ? payload.error : '无法完成自动标签。',
        }
      } catch {
        return {
          ok: false,
          existing: [],
          proposed: [],
          code: 'network',
          error: '无法连接到模型接口。',
        }
      }
    },
    async suggestEngagePlan(request) {
      try {
        const response = await fetchImpl('/api/ai/engage-plan', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
        })
        const payload = await readJson(response)
        if (payload.ok === true) {
          return {
            ok: true,
            mainTitle: typeof payload.mainTitle === 'string' ? payload.mainTitle : '',
            mainNotes: typeof payload.mainNotes === 'string' ? payload.mainNotes : '',
            steps: Array.isArray(payload.steps) ? payload.steps : [],
          }
        }
        return {
          ok: false,
          code: typeof payload.code === 'string' ? payload.code : 'network',
          error: typeof payload.error === 'string' ? payload.error : '无法完成任务拆解。',
        }
      } catch {
        return { ok: false, code: 'network', error: '无法连接到模型接口。' }
      }
    },
    async suggestReviewPlan(request) {
      try {
        const response = await fetchImpl('/api/ai/review-plan', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
        })
        const payload = await readJson(response)
        if (payload.ok === true) {
          return {
            ok: true,
            kind: payload.kind === 'focus_engage' ? 'focus_engage' : 'radar_focus',
            suggestion: payload.suggestion,
            analyzedCount: typeof payload.analyzedCount === 'number' ? payload.analyzedCount : 0,
            totalCount: typeof payload.totalCount === 'number' ? payload.totalCount : 0,
          }
        }
        return {
          ok: false,
          code: typeof payload.code === 'string' ? payload.code : 'network',
          error: typeof payload.error === 'string' ? payload.error : '无法完成回顾建议。',
        }
      } catch {
        return { ok: false, code: 'network', error: '无法连接到模型接口。' }
      }
    },
  }
}

export function createMemoryAiClient(): AiClient {
  let key = ''
  return {
    async status() {
      return { hasKey: key.length > 0 }
    },
    async saveCredential(apiKey) {
      key = apiKey.trim()
      return { ok: true }
    },
    async clearCredential() {
      key = ''
      return { ok: true }
    },
    async testConnection() {
      return { ok: false, code: 'network', error: '测试环境未连接模型接口。' }
    },
    async suggestTopics() {
      return { ok: false, existing: [], proposed: [], code: 'network', error: '测试环境未连接模型接口。' }
    },
    async suggestEngagePlan() {
      return { ok: false, code: 'network', error: '测试环境未连接模型接口。' }
    },
    async suggestReviewPlan() {
      return { ok: false, code: 'network', error: '测试环境未连接模型接口。' }
    },
  }
}
