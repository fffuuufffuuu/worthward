import { beforeEach, describe, expect, it } from 'vitest'
import { createInitialWorkspace } from '../domain/defaults'
import type { WorkspaceState } from '../domain/types'
import {
  createPersonalWorkspace,
  EXPLORE_TOPIC_MIGRATION_KEY,
  exportWorkspaceJson,
  STORAGE_KEY,
} from './storage'
import { loadPrimaryWorkspace, savePrimaryWorkspace } from './fileStorage'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function createLocalWorkspaceServer(initial: WorkspaceState | null = null) {
  let workspace = initial
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    if ((init?.method ?? 'GET') === 'PUT') {
      workspace = JSON.parse(String(init?.body)) as WorkspaceState
      return jsonResponse({ workspace })
    }
    return workspace
      ? jsonResponse({ workspace })
      : jsonResponse({ error: 'missing' }, 404)
  }) as typeof fetch
  return { calls, fetchImpl, getWorkspace: () => workspace }
}

describe('primary workspace file storage', () => {
  beforeEach(() => localStorage.clear())

  it('loads an existing workspace directly from the local file service', async () => {
    const workspace = createInitialWorkspace()
    const server = createLocalWorkspaceServer(workspace)

    await expect(loadPrimaryWorkspace({ fetch: server.fetchImpl, storage: localStorage }))
      .resolves.toEqual(workspace)
    expect(server.calls).toHaveLength(1)
    expect(server.calls[0]).toMatchObject({ url: '/api/workspace' })
  })

  it('migrates compatible legacy storage with PUT then GET and keeps the legacy data', async () => {
    const legacy = createInitialWorkspace()
    legacy.settings.tickTickListName = '我的旧清单'
    const rawLegacy = exportWorkspaceJson(legacy)
    localStorage.setItem(STORAGE_KEY, rawLegacy)
    const server = createLocalWorkspaceServer()

    const loaded = await loadPrimaryWorkspace({ fetch: server.fetchImpl, storage: localStorage })

    expect(server.calls.map((call) => call.init?.method ?? 'GET')).toEqual(['GET', 'PUT', 'GET'])
    expect(loaded).toEqual(server.getWorkspace())
    expect(loaded.settings.tickTickListName).toBe('我的旧清单')
    expect(localStorage.getItem(STORAGE_KEY)).toBe(rawLegacy)
  })

  it('writes and reads back the personal seed when no legacy data exists', async () => {
    const server = createLocalWorkspaceServer()

    const loaded = await loadPrimaryWorkspace({ fetch: server.fetchImpl, storage: localStorage })

    expect(server.calls.map((call) => call.init?.method ?? 'GET')).toEqual(['GET', 'PUT', 'GET'])
    expect(loaded).toEqual(createPersonalWorkspace())
    expect(server.getWorkspace()).toEqual(createPersonalWorkspace())
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('does not adopt a migration unless the GET readback matches the uploaded workspace', async () => {
    const rawLegacy = exportWorkspaceJson(createInitialWorkspace())
    localStorage.setItem(STORAGE_KEY, rawLegacy)
    let request = 0
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      request += 1
      if (request === 1) return jsonResponse({}, 404)
      if (init?.method === 'PUT') {
        return jsonResponse({ workspace: JSON.parse(String(init.body)) })
      }
      const different = createInitialWorkspace()
      different.settings.focusWipLimit = 99
      return jsonResponse({ workspace: different })
    }) as typeof fetch

    await expect(loadPrimaryWorkspace({ fetch: fetchImpl, storage: localStorage }))
      .rejects.toThrow(/中文|本地文件|读回|一致/)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(rawLegacy)
  })

  it('reports a Chinese read error for server and network failures', async () => {
    const serverFailure = (async () => jsonResponse({}, 500)) as typeof fetch
    const networkFailure = (async () => { throw new Error('offline') }) as typeof fetch

    await expect(loadPrimaryWorkspace({ fetch: serverFailure, storage: localStorage }))
      .rejects.toThrow(/本地文件.*读取失败/)
    await expect(loadPrimaryWorkspace({ fetch: networkFailure, storage: localStorage }))
      .rejects.toThrow(/本地文件.*读取失败/)
  })

  it('keeps legacy data when migration upload fails', async () => {
    const rawLegacy = exportWorkspaceJson(createInitialWorkspace())
    localStorage.setItem(STORAGE_KEY, rawLegacy)
    let request = 0
    const fetchImpl = (async () => {
      request += 1
      return request === 1 ? jsonResponse({}, 404) : jsonResponse({}, 500)
    }) as typeof fetch

    await expect(loadPrimaryWorkspace({ fetch: fetchImpl, storage: localStorage }))
      .rejects.toThrow(/本地文件.*失败/)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(rawLegacy)
    expect(localStorage.getItem(EXPLORE_TOPIC_MIGRATION_KEY)).toBeNull()
  })

  it('does not replace corrupt legacy data with the personal seed', async () => {
    const corruptLegacy = '{broken'
    localStorage.setItem(STORAGE_KEY, corruptLegacy)
    const server = createLocalWorkspaceServer()

    await expect(loadPrimaryWorkspace({ fetch: server.fetchImpl, storage: localStorage }))
      .rejects.toThrow(/旧浏览器数据.*无法读取/)
    expect(server.calls.map((call) => call.init?.method ?? 'GET')).toEqual(['GET'])
    expect(localStorage.getItem(STORAGE_KEY)).toBe(corruptLegacy)
    expect(localStorage.getItem(EXPLORE_TOPIC_MIGRATION_KEY)).toBeNull()
  })

  it('saves a workspace with PUT and returns the validated server result', async () => {
    const workspace = createInitialWorkspace()
    const server = createLocalWorkspaceServer()

    await expect(savePrimaryWorkspace(workspace, { fetch: server.fetchImpl }))
      .resolves.toEqual(workspace)
    expect(server.calls).toHaveLength(1)
    expect(server.calls[0].init).toMatchObject({
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(workspace),
    })
  })

  it('reports Chinese save errors for rejected or invalid server responses', async () => {
    const workspace = createInitialWorkspace()
    const rejected = (async () => jsonResponse({}, 500)) as typeof fetch
    const invalid = (async () => jsonResponse({ workspace: { schemaVersion: 1 } })) as typeof fetch

    await expect(savePrimaryWorkspace(workspace, { fetch: rejected }))
      .rejects.toThrow(/本地文件.*保存失败/)
    await expect(savePrimaryWorkspace(workspace, { fetch: invalid }))
      .rejects.toThrow(/本地文件.*保存失败/)
  })

  it('rejects a structurally valid PUT response that differs from the submitted workspace', async () => {
    const submitted = createInitialWorkspace()
    const different = createInitialWorkspace()
    different.settings.engageWipLimit = 99
    const fetchImpl = (async () => jsonResponse({ workspace: different })) as typeof fetch

    await expect(savePrimaryWorkspace(submitted, { fetch: fetchImpl }))
      .rejects.toThrow(/本地文件.*保存失败.*不一致/)
  })
})
