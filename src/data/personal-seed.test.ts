import { describe, expect, it } from 'vitest'
import { createPersonalWorkspace } from './storage'

describe('demo onboarding seed', () => {
  const workspace = createPersonalWorkspace()
  const items = Object.values(workspace.items)

  it('ships five sample cards for onboarding', () => {
    expect(items).toHaveLength(5)
    expect(items.filter((item) => item.board === 'explore')).toHaveLength(4)
    expect(items.filter((item) => item.board === 'create')).toHaveLength(1)
    expect(new Set(items.map((item) => item.id)).size).toBe(5)
  })

  it('places one explore card in each active stage', () => {
    const explore = items.filter((item) => item.board === 'explore')
    expect(explore.map((item) => item.stage).sort()).toEqual(['engage', 'focus', 'outcome', 'radar'])
    expect(explore.every((item) => item.description.length > 40)).toBe(true)
  })

  it('keeps a create radar card that explains the two boards', () => {
    const guide = items.find((item) => item.id === 'demo-create-radar')
    expect(guide).toMatchObject({ board: 'create', stage: 'radar' })
    expect(guide?.description).toContain('探索')
    expect(guide?.description).toContain('创造')
  })

  it('marks sample cards as import history', () => {
    expect(workspace.events).toHaveLength(5)
    expect(workspace.events.every((event) => event.type === 'stage_changed' && event.transitionMode === 'import')).toBe(true)
  })
})
