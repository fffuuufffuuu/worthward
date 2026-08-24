import { describe, expect, it } from 'vitest'
import { createInitialWorkspace } from './defaults'
import { captureItem, moveItem } from './workspace'
import {
  applyReviewCombo,
  sanitizeReviewSuggestion,
  selectRadarCandidates,
  projectedWip,
  WIP_FULL_REMINDER,
} from './reviewPlan'

const env = {
  now: () => '2026-08-24T00:00:00.000Z',
  id: (() => {
    let value = 0
    return () => `id-${++value}`
  })(),
}

function seed() {
  let state = createInitialWorkspace()
  const titles = ['雷达甲', '雷达乙', '专注甲', '投入甲']
  const ids: string[] = []
  for (const title of titles) {
    const captured = captureItem(state, { title, board: 'explore', topics: ['注意力'] }, env)
    ids.push(captured.itemId)
    state = captured.state
  }
  state = moveItem(state, ids[2], 'focus', {}, env).state
  state = moveItem(state, ids[3], 'engage', {}, env).state
  return { state, ids }
}

describe('review plan', () => {
  it('keeps all radar cards when there are 30 or fewer', () => {
    const { state } = seed()
    const result = selectRadarCandidates(state, [], env.now())
    expect(result.total).toBe(2)
    expect(result.selected.map((item) => item.title)).toEqual(['雷达甲', '雷达乙'])
  })

  it('drops unknown ids and keeps evidence for valid promotions', () => {
    const { state, ids } = seed()
    const plan = sanitizeReviewSuggestion({
      promotions: [
        { itemId: ids[0], evidence: '近期反复出现', relation: '与注意力方向相关', risk: '可能只是新鲜感' },
        { itemId: 'missing', evidence: '应被丢掉' },
        { itemId: ids[2], evidence: '已经在 Focus' },
      ],
      displacements: [{ itemId: ids[2], to: 'archive', reason: '给新卡让位' }],
      summary: '先把雷达甲拉进 Focus',
    }, state, 'radar_focus')

    expect(plan.promotions).toEqual([
      {
        itemId: ids[0],
        evidence: '近期反复出现',
        relation: '与注意力方向相关',
        risk: '可能只是新鲜感',
        selected: true,
      },
    ])
    expect(plan.displacements).toEqual([
      { itemId: ids[2], to: 'radar', reason: '给新卡让位', selected: true },
    ])
    expect(WIP_FULL_REMINDER).toContain('聚焦重点')
  })

  it('applies promotions and displacements together or not at all', () => {
    const { state, ids } = seed()
    state.settings.focusWipLimit = 1
    const overflowing = applyReviewCombo(state, {
      kind: 'radar_focus',
      promotions: [{ itemId: ids[0], evidence: '', relation: '', risk: '', selected: true }],
      displacements: [],
      summary: '',
      analyzedCount: 2,
      totalCount: 2,
      extraIds: [],
    })
    expect(overflowing.ok).toBe(false)
    expect(overflowing.state.items[ids[0]].stage).toBe('radar')

    const applied = applyReviewCombo(state, {
      kind: 'radar_focus',
      promotions: [{ itemId: ids[0], evidence: '', relation: '', risk: '', selected: true }],
      displacements: [{ itemId: ids[2], to: 'radar', reason: '让位', selected: true }],
      summary: '',
      analyzedCount: 2,
      totalCount: 2,
      extraIds: [],
    }, {}, env)
    expect(applied.ok).toBe(true)
    expect(applied.state.items[ids[0]].stage).toBe('focus')
    expect(applied.state.items[ids[2]].stage).toBe('radar')
    expect(projectedWip(state, {
      kind: 'radar_focus',
      promotions: [{ itemId: ids[0], evidence: '', relation: '', risk: '', selected: true }],
      displacements: [{ itemId: ids[2], to: 'radar', reason: '', selected: true }],
      summary: '',
      analyzedCount: 2,
      totalCount: 2,
      extraIds: [],
    })).toMatchObject({ focus: 1, overflow: null })
  })
})
