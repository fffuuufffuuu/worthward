export interface TickTickCliStatus {
  ok: boolean
  installed?: boolean
  loggedIn?: boolean
  code?: string
  error?: string
  projectName?: string
}

export interface TickTickCliCreateRequest {
  title: string
  content: string
  listName: string
  steps?: Array<{
    title: string
    notes: string
    children: Array<{ title: string; notes: string }>
  }>
}

export interface TickTickCliCreateResult {
  ok: boolean
  code?: string
  error?: string
  taskId?: string
}

export interface TickTickCliClient {
  status(listName?: string): Promise<TickTickCliStatus>
  create(request: TickTickCliCreateRequest): Promise<TickTickCliCreateResult>
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

export function createBrowserTickTickCli(fetchImpl: typeof fetch = fetch): TickTickCliClient {
  return {
    async status(listName) {
      try {
        const response = await fetchImpl('/api/ticktick/cli/test', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ listName: listName ?? '' }),
        })
        const payload = await readJson(response)
        return {
          ok: payload.ok === true,
          installed: payload.installed === true,
          loggedIn: payload.loggedIn === true,
          code: typeof payload.code === 'string' ? payload.code : undefined,
          error: typeof payload.error === 'string' ? payload.error : undefined,
          projectName: typeof payload.projectName === 'string' ? payload.projectName : undefined,
        }
      } catch {
        return { ok: false, code: 'network', error: '无法连接本地服务。' }
      }
    },
    async create(request) {
      try {
        const response = await fetchImpl('/api/ticktick/cli/create', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
        })
        const payload = await readJson(response)
        if (payload.ok === true) {
          return {
            ok: true,
            taskId: typeof payload.taskId === 'string' ? payload.taskId : undefined,
          }
        }
        return {
          ok: false,
          code: typeof payload.code === 'string' ? payload.code : 'create_failed',
          error: typeof payload.error === 'string' ? payload.error : 'dida CLI 创建任务失败。',
        }
      } catch {
        return { ok: false, code: 'network', error: '无法连接本地服务。' }
      }
    },
  }
}

export function createMemoryTickTickCli(): TickTickCliClient {
  return {
    async status() {
      return { ok: false, installed: false, loggedIn: false, code: 'cli_missing', error: '测试环境未连接 dida CLI。' }
    },
    async create() {
      return { ok: false, code: 'cli_missing', error: '测试环境未连接 dida CLI。' }
    },
  }
}
