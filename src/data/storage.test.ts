import { beforeEach, describe, expect, it } from 'vitest'
import { createInitialWorkspace } from '../domain/defaults'
import { DEFAULT_CATEGORY_DEFINITIONS } from '../domain/categories'
import { captureItem } from '../domain/workspace'
import type { DomainEnv } from '../domain/types'
import {
  createPersonalWorkspace,
  exportWorkspaceJson,
  importWorkspaceJson,
  loadPersonalWorkspace,
  mergeWorkspaceSeed,
  loadWorkspace,
  saveWorkspace,
  STORAGE_KEY,
  EXPLORE_TOPIC_MIGRATION_KEY,
} from './storage'

const fixedEnv: DomainEnv = {
  now: () => '2026-08-21T08:00:00.000Z',
  id: (() => {
    let value = 0
    return () => `storage-${++value}`
  })(),
}

describe('workspace storage', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips Markdown and event history exactly', () => {
    const captured = captureItem(
      createInitialWorkspace(),
      {
        title: '上下文工程',
        board: 'explore',
        description: '# 资料\n\n- [官方文档](https://example.com)\n- **关键假设**',
      },
      fixedEnv,
    )

    saveWorkspace(captured.state)

    expect(loadWorkspace()).toEqual(captured.state)
  })

  it('falls back to a clean workspace when storage is corrupt', () => {
    localStorage.setItem(STORAGE_KEY, '{broken')

    expect(loadWorkspace()).toEqual(createInitialWorkspace())
  })

  it('exports and imports a lossless versioned JSON document', () => {
    const state = captureItem(
      createInitialWorkspace(),
      { title: '做一个原型', board: 'create', description: '保留 `code`。' },
      fixedEnv,
    ).state

    const restored = importWorkspaceJson(exportWorkspaceJson(state))

    expect(restored).toEqual(state)
  })

  it('rejects unsupported schema versions', () => {
    expect(() =>
      importWorkspaceJson(JSON.stringify({ schemaVersion: 999 })),
    ).toThrow('不支持的数据版本')
  })

  it('migrates only the previous default TickTick list name', () => {
    const legacy = JSON.parse(exportWorkspaceJson(createInitialWorkspace())) as {
      settings: { tickTickListName: string; categories?: unknown }
    }
    legacy.settings.tickTickListName = 'Attention Workbench'
    delete legacy.settings.categories

    expect(importWorkspaceJson(JSON.stringify(legacy)).settings.tickTickListName).toBe('收集箱')
  })

  it('preserves a custom TickTick list name during migration', () => {
    const legacy = JSON.parse(exportWorkspaceJson(createInitialWorkspace())) as {
      settings: { tickTickListName: string; categories?: unknown }
    }
    legacy.settings.tickTickListName = '我的行动清单'
    delete legacy.settings.categories

    expect(importWorkspaceJson(JSON.stringify(legacy)).settings.tickTickListName).toBe('我的行动清单')
  })

  it('does not put an API key into exported workspace JSON', () => {
    const state = createInitialWorkspace()
    state.settings.ai.endpoint = 'https://api.example.test/v1'
    state.settings.ai.model = 'demo-model'
    const exported = exportWorkspaceJson(state)

    expect(exported).toContain('https://api.example.test/v1')
    expect(exported).not.toMatch(/apiKey/)
    expect(exported).not.toMatch(/sk-/)
  })

  it('imports a legacy workspace that has no AI settings', () => {
    const document = JSON.parse(exportWorkspaceJson(createInitialWorkspace())) as {
      settings: { ai?: unknown }
    }
    delete document.settings.ai

    const imported = importWorkspaceJson(JSON.stringify(document))

    expect(imported.settings.ai).toEqual({
      endpoint: '',
      model: '',
      lastTestedAt: null,
      lastTestStatus: 'unknown',
      lastTestMessage: '',
    })
  })

  it('fills the six default category definitions for older JSON', () => {
    const legacy = JSON.parse(exportWorkspaceJson(createInitialWorkspace())) as {
      settings: { categories?: unknown }
    }
    delete legacy.settings.categories

    const imported = importWorkspaceJson(JSON.stringify(legacy))

    expect(imported.settings.categories).toEqual(DEFAULT_CATEGORY_DEFINITIONS)
  })

  it('preserves valid editable category definitions from imported JSON', () => {
    const existingCategories = {
      explore: [{ name: '深度研究', color: '#123456' }],
      create: [{ name: '公开分享', color: '#654321' }],
    }
    const document = JSON.parse(exportWorkspaceJson(createInitialWorkspace())) as {
      settings: Record<string, unknown>
    }
    document.settings.categories = existingCategories

    expect(importWorkspaceJson(JSON.stringify(document)).settings.categories).toEqual(existingCategories)
  })

  it('preserves a card assigned to an editable category when importing', () => {
    const customized = createInitialWorkspace()
    customized.settings.categories.explore = [{ name: '深度研究', color: '#123456' }]
    const captured = captureItem(
      customized,
      { title: '自定义分类卡片', board: 'explore', category: '深度研究' },
      fixedEnv,
    ).state

    const imported = importWorkspaceJson(exportWorkspaceJson(captured))

    expect(Object.values(imported.items)[0].category).toBe('深度研究')
  })

  it('merges the personal seed idempotently without overwriting later edits', () => {
    const seed = captureItem(
      createInitialWorkspace(),
      { title: '迁移卡片', board: 'explore' },
      fixedEnv,
    ).state
    const edited = {
      ...seed,
      items: {
        ...seed.items,
        'storage-1': { ...seed.items['storage-1'], description: '用户后来补充的说明', version: 2 },
      },
    }
    const once = mergeWorkspaceSeed(edited, seed)
    const twice = mergeWorkspaceSeed(once, seed)

    expect(twice.items['storage-1'].description).toBe('用户后来补充的说明')
    expect(twice.events).toHaveLength(seed.events.length)
  })

  it('normalizes legacy categories when loading saved data', () => {
    const captured = captureItem(
      createInitialWorkspace(),
      { title: '《可见的学习》', board: 'explore', category: '教育教学' },
      fixedEnv,
    )
    saveWorkspace(captured.state)

    const loaded = loadWorkspace()

    expect(loaded.items[captured.itemId].category).toBe('书籍 / 影音')
    expect(loaded.items[captured.itemId].title).toBe('《可见的学习》')
    expect(loaded.events).toEqual(captured.state.events)
  })

  it('creates a personal workspace containing only the new category system', () => {
    const workspace = createPersonalWorkspace()

    expect(Object.values(workspace.items).every((item) =>
      item.category === null || (
        item.board === 'explore'
          ? ['主题 / 问题', '书籍 / 影音', '课程 / 体验'].includes(item.category)
          : ['产品 / 项目', '写作 / 表达', '活动 / 组织'].includes(item.category)
      ),
    )).toBe(true)
  })

  it('rebuilds seeded Explore topics once without overwriting other edits or custom cards', () => {
    const seed = createPersonalWorkspace()
    const seededId = 'demo-explore-radar'
    const movedId = 'demo-explore-focus'
    const capturedCustom = captureItem(
      seed,
      { title: '我自己新增的探索', board: 'explore', topics: ['我的主题'] },
      fixedEnv,
    )
    const custom = capturedCustom.state
    custom.items[seededId] = {
      ...custom.items[seededId],
      description: '用户后来补充的说明',
      topics: ['旧主题'],
    }
    custom.items[movedId] = {
      ...custom.items[movedId],
      board: 'create',
      category: '产品 / 项目',
      topics: ['用户改到创造后的主题'],
    }
    saveWorkspace(custom)

    const migrated = loadPersonalWorkspace()

    expect(migrated.items[seededId].topics).toEqual(['入门示例'])
    expect(migrated.items[seededId].description).toBe('用户后来补充的说明')
    expect(migrated.items[capturedCustom.itemId].topics).toEqual(['我的主题'])
    expect(migrated.items[movedId].topics).toEqual(['用户改到创造后的主题'])
    expect(localStorage.getItem(EXPLORE_TOPIC_MIGRATION_KEY)).toBe('1')

    migrated.items[seededId] = { ...migrated.items[seededId], topics: ['用户新主题'] }
    saveWorkspace(migrated)

    expect(loadPersonalWorkspace().items[seededId].topics).toEqual(['用户新主题'])
  })
})
