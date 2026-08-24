import type { WorkspaceState } from '../domain/types'
import {
  applyExploreTopicMigration,
  createPersonalWorkspace,
  EXPLORE_TOPIC_MIGRATION_KEY,
  importWorkspaceJson,
  mergeWorkspaceSeed,
  STORAGE_KEY,
} from './storage'

const WORKSPACE_URL = '/api/workspace'

export interface FileStorageOptions {
  fetch?: typeof fetch
  storage?: Storage
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function parseWorkspaceResponse(
  response: Response,
  operation: '读取' | '保存',
): Promise<WorkspaceState> {
  try {
    const payload = await response.json() as { workspace?: unknown }
    return importWorkspaceJson(JSON.stringify(payload.workspace))
  } catch {
    throw new Error(`本地文件${operation}失败：服务返回的数据无效`)
  }
}

async function readWorkspace(
  fetchImpl: typeof fetch,
): Promise<{ status: 'ok'; workspace: WorkspaceState } | { status: 'missing' }> {
  let response: Response
  try {
    response = await fetchImpl(WORKSPACE_URL)
  } catch {
    throw new Error('本地文件读取失败：无法连接本地服务')
  }
  if (response.status === 404) return { status: 'missing' }
  if (!response.ok) {
    throw new Error(`本地文件读取失败：服务返回状态码 ${response.status}`)
  }
  return { status: 'ok', workspace: await parseWorkspaceResponse(response, '读取') }
}

function canonicalJson(value: unknown): string {
  const normalize = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(normalize)
    if (!entry || typeof entry !== 'object') return entry
    return Object.fromEntries(
      Object.entries(entry)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalize(child)]),
    )
  }
  return JSON.stringify(normalize(value))
}

export async function savePrimaryWorkspace(
  state: WorkspaceState,
  options: FileStorageOptions = {},
): Promise<WorkspaceState> {
  const fetchImpl = options.fetch ?? fetch
  let response: Response
  try {
    response = await fetchImpl(WORKSPACE_URL, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(state),
    })
  } catch {
    throw new Error('本地文件保存失败：无法连接本地服务')
  }
  if (!response.ok) {
    throw new Error(`本地文件保存失败：服务返回状态码 ${response.status}`)
  }
  const saved = await parseWorkspaceResponse(response, '保存')
  if (canonicalJson(saved) !== canonicalJson(state)) {
    throw new Error('本地文件保存失败：服务返回的数据与提交内容不一致')
  }
  return saved
}

export async function loadPrimaryWorkspace(
  options: FileStorageOptions = {},
): Promise<WorkspaceState> {
  const fetchImpl = options.fetch ?? fetch
  const result = await readWorkspace(fetchImpl)
  if (result.status === 'ok') return result.workspace

  const storage = options.storage ?? localStorage
  let legacyRaw: string | null
  try {
    legacyRaw = storage.getItem(STORAGE_KEY)
  } catch {
    throw new Error('本地文件初始化失败：旧浏览器数据无法读取')
  }

  let initial: WorkspaceState
  if (legacyRaw === null) {
    initial = createPersonalWorkspace()
  } else {
    try {
      const seed = createPersonalWorkspace()
      const merged = mergeWorkspaceSeed(importWorkspaceJson(legacyRaw), seed)
      initial = storage.getItem(EXPLORE_TOPIC_MIGRATION_KEY) === '1'
        ? merged
        : applyExploreTopicMigration(merged, seed)
    } catch {
      throw new Error('本地文件初始化失败：旧浏览器数据无法读取，原数据已保留')
    }
  }

  try {
    await savePrimaryWorkspace(initial, { fetch: fetchImpl })
    const readback = await readWorkspace(fetchImpl)
    if (readback.status === 'missing') {
      throw new Error('写入后未找到工作区文件')
    }
    if (canonicalJson(readback.workspace) !== canonicalJson(initial)) {
      throw new Error('写入后读回的数据不一致')
    }
    return readback.workspace
  } catch (error) {
    throw new Error(`本地文件初始化失败：${messageOf(error)}`)
  }
}
