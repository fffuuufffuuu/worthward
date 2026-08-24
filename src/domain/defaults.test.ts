import { describe, expect, it } from 'vitest'
import { createInitialWorkspace, migrateWorkspaceSettings } from './defaults'

const emptyAiSettings = {
  endpoint: '',
  model: '',
  lastTestedAt: null,
  lastTestStatus: 'unknown',
  lastTestMessage: '',
}

describe('createInitialWorkspace', () => {
  it('starts empty with the approved global WIP limits', () => {
    const workspace = createInitialWorkspace()

    expect(workspace.items).toEqual({})
    expect(workspace.settings.focusWipLimit).toBe(10)
    expect(workspace.settings.engageWipLimit).toBe(4)
    expect(workspace.settings.boards).toEqual(['explore', 'create'])
    expect(workspace.settings.tickTickListName).toBe('收集箱')
    expect(workspace.settings.tickTickCreateMode).toBe('deeplink')
    expect(workspace.settings.ai).toEqual(emptyAiSettings)
    expect(workspace.settings.categories).toEqual({
      explore: [
        { name: '主题 / 问题', color: '#2f6fb2' },
        { name: '书籍 / 影音', color: '#7d5ba6' },
        { name: '课程 / 体验', color: '#1e8a70' },
      ],
      create: [
        { name: '产品 / 项目', color: '#d0533c' },
        { name: '写作 / 表达', color: '#c98a12' },
        { name: '活动 / 组织', color: '#5d6f3f' },
      ],
    })
  })

  it('adds empty AI settings to a legacy workspace without touching items', () => {
    const workspace = createInitialWorkspace()
    const { ai: _ignored, ...settingsWithoutAi } = workspace.settings
    const items = { 'legacy-1': { id: 'legacy-1', title: '保留原卡片' } }
    const legacy = {
      ...workspace,
      items,
      settings: settingsWithoutAi,
    }

    const migrated = migrateWorkspaceSettings(legacy as unknown as typeof workspace)

    expect(migrated.settings.ai).toEqual(emptyAiSettings)
    expect(migrated.settings.tickTickCreateMode).toBe('deeplink')
    expect(migrated.items).toBe(items)
  })
})
