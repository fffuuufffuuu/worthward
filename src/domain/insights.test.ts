import { describe, expect, it } from 'vitest'
import { createInitialWorkspace } from './defaults'
import { archiveItem, captureItem, moveItem, restoreItem } from './workspace'
import { buildInsights, itemsForCurrentTopic, itemsForRecentTopic } from './insights'

const clock = (time: string) => ({ now: () => time, id: () => crypto.randomUUID() })

describe('buildInsights', () => {
  it('reports the current attention structure without time or conversion fields', () => {
    let state = createInitialWorkspace()

    const radar = captureItem(state, { title: 'Radar', board: 'explore', topics: ['教育'] }, clock('2026-07-01T00:00:00.000Z'))
    state = radar.state

    const focus = captureItem(state, { title: 'Focus', board: 'explore', topics: ['AI'] }, clock('2026-07-01T00:00:00.000Z'))
    state = moveItem(focus.state, focus.itemId, 'focus', {}, clock('2026-07-02T00:00:00.000Z')).state

    const engage = captureItem(state, { title: 'Engage', board: 'create', topics: ['AI'] }, clock('2026-07-01T00:00:00.000Z'))
    state = moveItem(engage.state, engage.itemId, 'engage', {}, clock('2026-07-02T00:00:00.000Z')).state
    state.items[engage.itemId] = {
      ...state.items[engage.itemId],
      lastTouchedAt: '2026-07-01T00:00:00.000Z',
      lastProgressAt: '2026-08-20T00:00:00.000Z',
    }

    const outcome = captureItem(state, { title: 'Outcome', board: 'explore' }, clock('2026-07-03T00:00:00.000Z'))
    state = moveItem(outcome.state, outcome.itemId, 'outcome', {}, clock('2026-07-04T00:00:00.000Z')).state

    const archived = captureItem(state, { title: 'Archive', board: 'create' }, clock('2026-07-05T00:00:00.000Z'))
    state = archiveItem(archived.state, archived.itemId, 'drop', undefined, clock('2026-07-06T00:00:00.000Z')).state

    const insight = buildInsights(state, '2026-08-21T00:00:00.000Z')

    expect(insight.stageCounts).toEqual({ radar: 1, focus: 1, engage: 1, outcome: 1, archive: 1 })
    expect(insight.boardCounts).toEqual({ explore: 3, create: 1 })
    expect(insight.topicCounts).toEqual([['AI', 2], ['教育', 1]])
    expect(insight).not.toHaveProperty('loggedMinutes')
    expect(insight).not.toHaveProperty('funnel')
    expect(insight).not.toHaveProperty('bypassCount')
    expect(insight).not.toHaveProperty('dropRate')
    expect(insight.stalled).toContainEqual({ itemId: engage.itemId, ageDays: 51 })
  })

  it('counts imported current stages without requiring synthetic history', () => {
    const state = createInitialWorkspace()
    state.items.imported = {
      id: 'imported', title: '既有项目', description: '', board: 'create', category: null,
      topics: [], stage: 'engage', capturedAt: '2026-08-01T00:00:00.000Z',
      stageEnteredAt: '2026-08-01T00:00:00.000Z', lastTouchedAt: '2026-08-01T00:00:00.000Z',
      lastProgressAt: null, version: 1,
    }

    expect(buildInsights(state, '2026-08-21T00:00:00.000Z').stageCounts.engage).toBe(1)
  })

  it('ranks recent attention topics from captures and forward moves in the last 30 days', () => {
    let state = createInitialWorkspace()

    // 30 天内新进入 Radar：计入
    const fresh = captureItem(state, { title: '新想法', board: 'explore', topics: ['AI教育', '学习科学'] }, clock('2026-08-10T00:00:00.000Z'))
    state = fresh.state

    // 30 天内向前推进：计入；同一卡片再次推进只计一次
    const moving = captureItem(state, { title: '推进中', board: 'create', topics: ['AI教育'] }, clock('2026-07-01T00:00:00.000Z'))
    state = moveItem(moving.state, moving.itemId, 'focus', {}, clock('2026-08-15T00:00:00.000Z')).state
    state = moveItem(state, moving.itemId, 'engage', {}, clock('2026-08-18T00:00:00.000Z')).state

    // 30 天前的捕获：不计入
    const stale = captureItem(state, { title: '旧想法', board: 'explore', topics: ['旧主题'] }, clock('2026-07-01T00:00:00.000Z'))
    state = stale.state

    // 停止关注（drop）：不计入
    const dropped = captureItem(state, { title: '已放弃', board: 'explore', topics: ['AI教育'] }, clock('2026-07-20T00:00:00.000Z'))
    state = archiveItem(dropped.state, dropped.itemId, 'drop', undefined, clock('2026-08-19T00:00:00.000Z')).state

    // 完成归档（archive，从 outcome 前进）：计入
    const done = captureItem(state, { title: '已完成', board: 'create', topics: ['学习科学'] }, clock('2026-07-20T00:00:00.000Z'))
    state = moveItem(done.state, done.itemId, 'outcome', {}, clock('2026-08-01T00:00:00.000Z')).state
    state = archiveItem(state, done.itemId, 'archive', undefined, clock('2026-08-20T00:00:00.000Z')).state

    // 编辑说明：不产生阶段事件，不计入
    state.events.push({
      id: 'edit-1', type: 'description_updated', itemId: fresh.itemId,
      occurredAt: '2026-08-19T00:00:00.000Z',
    })

    const insight = buildInsights(state, '2026-08-21T00:00:00.000Z')

    expect(insight.recentTopicCounts.slice(0, 3)).toEqual([
      ['学习科学', 2],
      ['AI教育', 2],
    ])
    expect(insight.recentTopicCounts.some(([topic]) => topic === '旧主题')).toBe(false)
  })

  it('restores and imports do not count as recent attention', () => {
    let state = createInitialWorkspace()
    const captured = captureItem(state, { title: '往返', board: 'explore', topics: ['震荡'] }, clock('2026-07-01T00:00:00.000Z'))
    state = archiveItem(captured.state, captured.itemId, 'drop', undefined, clock('2026-08-10T00:00:00.000Z')).state
    // 恢复到 radar 是回到更早阶段，不算新进入也不算推进
    state = restoreItem(state, captured.itemId, 'radar', {}, clock('2026-08-20T00:00:00.000Z')).state

    expect(buildInsights(state, '2026-08-21T00:00:00.000Z').recentTopicCounts).toEqual([])
  })

  it('returns current topic cards without archived cards in board and title order', () => {
    let state = createInitialWorkspace()
    const create = captureItem(state, { title: 'B card', board: 'create', topics: ['主题'] }, clock('2026-08-20T00:00:00.000Z'))
    state = create.state
    const exploreB = captureItem(state, { title: 'B card', board: 'explore', topics: ['主题'] }, clock('2026-08-20T00:00:00.000Z'))
    state = exploreB.state
    const exploreA = captureItem(state, { title: 'A card', board: 'explore', topics: ['主题'] }, clock('2026-08-20T00:00:00.000Z'))
    state = exploreA.state
    const archived = captureItem(state, { title: 'Archived', board: 'explore', topics: ['主题'] }, clock('2026-08-20T00:00:00.000Z'))
    state = archiveItem(archived.state, archived.itemId, 'drop', undefined, clock('2026-08-20T00:00:00.000Z')).state
    const partialMatch = captureItem(state, { title: 'Partial', board: 'explore', topics: ['主题延伸'] }, clock('2026-08-20T00:00:00.000Z'))
    state = partialMatch.state

    expect(itemsForCurrentTopic(state, '主题').map((item) => item.id)).toEqual([
      exploreA.itemId,
      exploreB.itemId,
      create.itemId,
    ])
  })

  it('returns recent matching cards once, including archived cards, in deterministic order', () => {
    let state = createInitialWorkspace()

    const exploreB = captureItem(state, { title: 'B card', board: 'explore', topics: ['主题'] }, clock('2026-08-20T00:00:00.000Z'))
    state = exploreB.state

    const exploreA = captureItem(state, { title: 'A card', board: 'explore', topics: ['主题'] }, clock('2026-07-01T00:00:00.000Z'))
    state = moveItem(exploreA.state, exploreA.itemId, 'outcome', {}, clock('2026-08-19T00:00:00.000Z')).state
    state = moveItem(state, exploreA.itemId, 'archive', { transitionMode: 'archive' }, clock('2026-08-20T00:00:00.000Z')).state

    const createA = captureItem(state, { title: 'A card', board: 'create', topics: ['主题'] }, clock('2026-07-01T00:00:00.000Z'))
    state = moveItem(createA.state, createA.itemId, 'outcome', {}, clock('2026-08-20T00:00:00.000Z')).state
    state = moveItem(state, createA.itemId, 'archive', { transitionMode: 'archive' }, clock('2026-08-20T00:00:00.000Z')).state

    const dropped = captureItem(state, { title: 'Dropped', board: 'explore', topics: ['主题'] }, clock('2026-07-01T00:00:00.000Z'))
    state = archiveItem(dropped.state, dropped.itemId, 'drop', undefined, clock('2026-08-20T00:00:00.000Z')).state

    const restored = captureItem(state, { title: 'Restored', board: 'explore', topics: ['主题'] }, clock('2026-07-01T00:00:00.000Z'))
    state = archiveItem(restored.state, restored.itemId, 'drop', undefined, clock('2026-08-20T00:00:00.000Z')).state
    state = restoreItem(state, restored.itemId, 'radar', {}, clock('2026-08-20T00:00:00.000Z')).state

    state.items.imported = {
      id: 'imported', title: 'Imported', description: '', board: 'explore', category: null,
      topics: ['主题'], stage: 'radar', capturedAt: '2026-08-20T00:00:00.000Z',
      stageEnteredAt: '2026-08-20T00:00:00.000Z', lastTouchedAt: '2026-08-20T00:00:00.000Z',
      lastProgressAt: null, version: 1,
    }
    state.events.push({
      id: 'import-1', type: 'stage_changed', itemId: 'imported', fromStage: null,
      toStage: 'radar', transitionMode: 'import', occurredAt: '2026-08-20T00:00:00.000Z',
    })
    state.events.push({
      id: 'edit-1', type: 'description_updated', itemId: exploreB.itemId,
      occurredAt: '2026-08-20T00:00:00.000Z',
    })

    expect(itemsForRecentTopic(state, '主题', '2026-08-21T00:00:00.000Z').map((item) => item.id)).toEqual([
      exploreA.itemId,
      exploreB.itemId,
      createA.itemId,
    ])
    expect(buildInsights(state, '2026-08-21T00:00:00.000Z').recentTopicCounts).toEqual([['主题', 3]])
  })
})
