import { describe, expect, it } from 'vitest'
import { createInitialWorkspace } from './defaults'
import {
  archiveItem,
  captureItem,
  moveItem,
  restoreItem,
  setWipLimit,
  spawnItem,
  updateItem,
} from './workspace'
import type { DomainEnv, WorkspaceState } from './types'

let nextId = 0

function env(at = '2026-08-21T08:00:00.000Z'): DomainEnv {
  return {
    now: () => at,
    id: () => `id-${++nextId}`,
  }
}

function withItem(
  title = '理解知识追踪',
  board: 'explore' | 'create' = 'explore',
) {
  const result = captureItem(
    createInitialWorkspace(),
    { title, board },
    env(),
  )
  return { state: result.state, itemId: result.itemId }
}

describe('attention workspace domain', () => {
  it('captures an item in Radar with one stage event and timestamps', () => {
    const result = captureItem(
      createInitialWorkspace(),
      {
        title: '  理解知识追踪  ',
        description: '# 初步想法',
        board: 'explore',
        category: '知识/概念',
        topics: ['AI', '教育'],
      },
      env(),
    )

    const item = result.state.items[result.itemId]
    expect(item).toMatchObject({
      title: '理解知识追踪',
      description: '# 初步想法',
      board: 'explore',
      stage: 'radar',
      capturedAt: '2026-08-21T08:00:00.000Z',
      stageEnteredAt: '2026-08-21T08:00:00.000Z',
      lastTouchedAt: '2026-08-21T08:00:00.000Z',
    })
    expect(result.state.events).toHaveLength(1)
    expect(result.state.events[0]).toMatchObject({
      type: 'stage_changed',
      fromStage: null,
      toStage: 'radar',
      transitionMode: 'capture',
    })
  })

  it('moves directly from Radar to Engage without fabricating Focus', () => {
    const captured = withItem()
    const result = moveItem(
      captured.state,
      captured.itemId,
      'engage',
      {},
      env('2026-08-22T08:00:00.000Z'),
    )

    expect(result.ok).toBe(true)
    expect(result.state.items[captured.itemId].stage).toBe('engage')
    expect(result.state.items[captured.itemId].stageEnteredAt).toBe(
      '2026-08-22T08:00:00.000Z',
    )
    expect(
      result.state.events.filter((event) => event.type === 'stage_changed'),
    ).toHaveLength(2)
    expect(result.enteredEngage).toBe(true)
  })

  it('rejects a Focus move at the global WIP limit without mutating state', () => {
    let state = createInitialWorkspace()
    const ids: string[] = []
    for (let index = 0; index < 11; index += 1) {
      const captured = captureItem(
        state,
        { title: `卡片 ${index}`, board: index % 2 ? 'create' : 'explore' },
        env(`2026-08-21T08:${String(index).padStart(2, '0')}:00.000Z`),
      )
      state = captured.state
      ids.push(captured.itemId)
      if (index < 10) {
        state = moveItem(state, captured.itemId, 'focus', {}, env()).state
      }
    }

    const before = state
    const result = moveItem(state, ids[10], 'focus', {}, env())

    expect(result).toMatchObject({
      ok: false,
      reason: 'wip_limit',
      target: 'focus',
      current: 10,
      limit: 10,
    })
    expect(result.state).toBe(before)
  })

  it('replaces an occupied Focus slot atomically', () => {
    const first = withItem('旧方向')
    let state = setWipLimit(first.state, 'focus', 1, env()).state
    state = moveItem(state, first.itemId, 'focus', {}, env()).state
    const second = captureItem(
      state,
      { title: '新方向', board: 'create' },
      env(),
    )

    const result = moveItem(
      second.state,
      second.itemId,
      'focus',
      { replaceItemId: first.itemId },
      env('2026-08-23T08:00:00.000Z'),
    )

    expect(result.ok).toBe(true)
    expect(result.state.items[first.itemId].stage).toBe('radar')
    expect(result.state.items[second.itemId].stage).toBe('focus')
  })

  it('demotes an occupied Engage card back to Focus in the same move', () => {
    const first = withItem('旧投入')
    let state = setWipLimit(first.state, 'engage', 1, env()).state
    state = moveItem(state, first.itemId, 'engage', {}, env()).state
    const second = captureItem(state, { title: '新投入', board: 'create' }, env())

    const result = moveItem(
      second.state,
      second.itemId,
      'engage',
      { replaceItemId: first.itemId, displaceTarget: 'focus' },
      env('2026-08-23T09:00:00.000Z'),
    )

    expect(result.ok).toBe(true)
    expect(result.state.items[first.itemId].stage).toBe('focus')
    expect(result.state.items[second.itemId].stage).toBe('engage')
  })

  it('distinguishes stop from normal archive and keeps the reason', () => {
    const captured = withItem()
    const stopped = archiveItem(
      captured.state,
      captured.itemId,
      'drop',
      '不是现在',
      env(),
    )

    expect(stopped.state.items[captured.itemId].stage).toBe('archive')
    expect(stopped.state.events.at(-1)).toMatchObject({
      transitionMode: 'drop',
      reason: '不是现在',
    })
  })

  it('restores an archived item through the target WIP rule', () => {
    const captured = withItem()
    const archived = archiveItem(
      captured.state,
      captured.itemId,
      'archive',
      undefined,
      env(),
    )
    const restored = restoreItem(
      archived.state,
      captured.itemId,
      'focus',
      {},
      env(),
    )

    expect(restored.ok).toBe(true)
    expect(restored.state.items[captured.itemId].stage).toBe('focus')
    expect(restored.state.events.at(-1)).toMatchObject({
      transitionMode: 'restore',
    })
  })

  it('spawns a related Radar card without changing the parent', () => {
    const parent = withItem()
    const result = spawnItem(
      parent.state,
      parent.itemId,
      { title: '做一个知识追踪 Demo', board: 'create' },
      env(),
    )

    expect(result.state.items[parent.itemId].stage).toBe('radar')
    expect(result.state.items[result.itemId]).toMatchObject({
      title: '做一个知识追踪 Demo',
      board: 'create',
      stage: 'radar',
    })
    expect(result.state.relations).toContainEqual({
      parentItemId: parent.itemId,
      childItemId: result.itemId,
      type: 'spawned_from',
    })
  })

  it('updates Markdown content and Last Touched without faking progress', () => {
    const captured = withItem()
    const result = updateItem(
      captured.state,
      captured.itemId,
      { description: '## 新想法\n\n先做小实验。' },
      env('2026-08-24T08:00:00.000Z'),
    )

    expect(result.state.items[captured.itemId]).toMatchObject({
      description: '## 新想法\n\n先做小实验。',
      lastTouchedAt: '2026-08-24T08:00:00.000Z',
      lastProgressAt: null,
    })
  })

})
