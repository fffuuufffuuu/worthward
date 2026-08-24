import type { AttentionItem, Stage, WorkspaceState } from './types'

const STAGE_ORDER: Record<Stage, number> = {
  radar: 0,
  focus: 1,
  engage: 2,
  outcome: 3,
  archive: 4,
}

const RECENT_DAYS = 30

export interface InsightSnapshot {
  stageCounts: Record<Stage, number>
  boardCounts: { explore: number; create: number }
  topicCounts: Array<[string, number]>
  recentTopicCounts: Array<[string, number]>
  stalled: Array<{ itemId: string; ageDays: number }>
}

function daysBetween(older: string, newer: string): number {
  return Math.floor(
    Math.max(0, new Date(newer).getTime() - new Date(older).getTime()) /
      86_400_000,
  )
}

function recentItemIds(state: WorkspaceState, now: string): Set<string> {
  const cutoff = new Date(new Date(now).getTime() - RECENT_DAYS * 86_400_000)
  const itemIds = new Set<string>()
  for (const event of state.events) {
    if (event.type !== 'stage_changed') continue
    if (new Date(event.occurredAt) < cutoff) continue
    const isCapture = event.transitionMode === 'capture' && event.toStage === 'radar'
    const isForward =
      (event.transitionMode === 'move' || event.transitionMode === 'archive') &&
      event.fromStage !== null &&
      STAGE_ORDER[event.toStage] > STAGE_ORDER[event.fromStage]
    if (isCapture || isForward) itemIds.add(event.itemId)
  }
  return itemIds
}

function orderItems(items: AttentionItem[]): AttentionItem[] {
  return items.sort(
    (left, right) =>
      (left.board === 'explore' ? 0 : 1) - (right.board === 'explore' ? 0 : 1) ||
      left.title.localeCompare(right.title, 'zh-CN') ||
      left.id.localeCompare(right.id),
  )
}

export function itemsForCurrentTopic(
  state: WorkspaceState,
  topic: string,
): AttentionItem[] {
  return orderItems(
    Object.values(state.items).filter(
      (item) => item.stage !== 'archive' && item.topics.includes(topic),
    ),
  )
}

export function itemsForRecentTopic(
  state: WorkspaceState,
  topic: string,
  now = new Date().toISOString(),
): AttentionItem[] {
  const itemIds = recentItemIds(state, now)
  return orderItems(
    [...itemIds]
      .map((itemId) => state.items[itemId])
      .filter((item): item is AttentionItem => Boolean(item && item.topics.includes(topic))),
  )
}

export function buildInsights(
  state: WorkspaceState,
  now = new Date().toISOString(),
): InsightSnapshot {
  const items = Object.values(state.items)
  const stageCounts: Record<Stage, number> = {
    radar: 0,
    focus: 0,
    engage: 0,
    outcome: 0,
    archive: 0,
  }
  const boardCounts = { explore: 0, create: 0 }
  const topics = new Map<string, number>()

  for (const item of items) {
    stageCounts[item.stage] += 1
    if (item.stage !== 'archive') {
      boardCounts[item.board] += 1
      for (const topic of item.topics) topics.set(topic, (topics.get(topic) ?? 0) + 1)
    }
  }

  const stalled = items
    .filter((item) => item.stage === 'radar' || item.stage === 'focus' || item.stage === 'engage')
    .map((item) => ({ itemId: item.id, ageDays: daysBetween(item.lastTouchedAt, now), item }))
    .filter(({ item, ageDays }) => ageDays >= state.settings.stalledDays[item.stage as 'radar' | 'focus' | 'engage'])
    .map(({ itemId, ageDays }) => ({ itemId, ageDays }))
    .sort((left, right) => right.ageDays - left.ageDays)

  // 近 30 天关注领域：新进入 Radar（capture）或向前推进（move / archive）的卡片，
  // 同一卡片只计一次；普通编辑、导入、停止关注、恢复均不计入。
  const recentIds = recentItemIds(state, now)
  const recentTopics = new Map<string, number>()
  for (const itemId of recentIds) {
    const item = state.items[itemId]
    if (!item) continue
    for (const topic of new Set(item.topics)) {
      recentTopics.set(topic, (recentTopics.get(topic) ?? 0) + 1)
    }
  }

  return {
    stageCounts,
    boardCounts,
    topicCounts: [...topics.entries()].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'),
    ),
    recentTopicCounts: [...recentTopics.entries()].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'),
    ),
    stalled,
  }
}
