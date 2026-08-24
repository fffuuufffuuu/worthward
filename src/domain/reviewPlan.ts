import type {
  AttentionItem,
  DomainEnv,
  ReviewAdjustment,
  ReviewComboDraft,
  Stage,
  WorkspaceState,
} from './types'
import { countByStage, moveItem } from './workspace'

export const MAX_REVIEW_CANDIDATES = 30
export const MAX_REVIEW_EXTRAS = 10
export const WIP_FULL_REMINDER = '聚焦重点、不要贪多。晋级前请考虑替换或降级现有卡片。'

export type ReviewPlanKind = ReviewComboDraft['kind']

export type ReviewPromotion = ReviewComboDraft['promotions'][number]

export type ReviewDisplacement = ReviewComboDraft['displacements'][number]

export type ReviewComboPlan = ReviewComboDraft

const browserEnv: DomainEnv = {
  now: () => new Date().toISOString(),
  id: () => crypto.randomUUID(),
}

export function itemsInStage(state: WorkspaceState, stage: Stage): AttentionItem[] {
  return Object.values(state.items)
    .filter((item) => item.stage === stage)
    .sort((left, right) =>
      left.lastTouchedAt.localeCompare(right.lastTouchedAt) || left.id.localeCompare(right.id),
    )
}

function daysBetween(older: string, newer: string): number {
  return Math.floor(Math.max(0, new Date(newer).getTime() - new Date(older).getTime()) / 86_400_000)
}

function tokens(value: string): string[] {
  return value
    .toLocaleLowerCase('zh-CN')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2)
}

function overlap(left: string[], right: Set<string>): number {
  return left.reduce((total, token) => total + (right.has(token) ? 1 : 0), 0)
}

export function selectRadarCandidates(
  state: WorkspaceState,
  extraIds: string[] = [],
  now: string = new Date().toISOString(),
): { selected: AttentionItem[]; total: number } {
  const radar = itemsInStage(state, 'radar')
  const extras = extraIds
    .map((itemId) => state.items[itemId])
    .filter((item): item is AttentionItem => Boolean(item && item.stage === 'radar'))
    .slice(0, MAX_REVIEW_EXTRAS)
  if (radar.length <= MAX_REVIEW_CANDIDATES && extras.length === 0) {
    return { selected: radar, total: radar.length }
  }

  const contextTokens = new Set([
    ...tokens(state.reviews.find((review) => review.status === 'in_progress')?.attentionDirection ?? ''),
    ...itemsInStage(state, 'focus').flatMap((item) => item.topics.flatMap(tokens)),
    ...itemsInStage(state, 'engage').flatMap((item) => item.topics.flatMap(tokens)),
  ])
  const stalledDays = state.settings.stalledDays.radar
  const extraSet = new Set(extras.map((item) => item.id))
  const ranked = radar
    .filter((item) => !extraSet.has(item.id))
    .map((item) => {
      const touched = daysBetween(item.lastTouchedAt, now)
      const recency = touched < 7 ? 3 : touched < 30 ? 2 : touched < 90 ? 1 : 0
      const topicHits = overlap(item.topics.flatMap(tokens), contextTokens)
      const directionHits = overlap(tokens(`${item.title} ${item.description}`), contextTokens)
      const stalled = daysBetween(item.stageEnteredAt, now) >= stalledDays ? 1 : 0
      return {
        item,
        score: recency + Math.min(2, topicHits) + Math.min(2, directionHits) + stalled,
      }
    })
    .sort((left, right) =>
      right.score - left.score || right.item.lastTouchedAt.localeCompare(left.item.lastTouchedAt),
    )
    .slice(0, MAX_REVIEW_CANDIDATES)
    .map((entry) => entry.item)

  return { selected: [...extras, ...ranked], total: radar.length }
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function emptyComboPlan(
  kind: ReviewPlanKind,
  analyzedCount: number,
  totalCount: number,
  extraIds: string[] = [],
): ReviewComboPlan {
  return {
    kind,
    promotions: [],
    displacements: [],
    summary: '',
    analyzedCount,
    totalCount,
    extraIds,
  }
}

export function sanitizeReviewSuggestion(
  raw: unknown,
  state: WorkspaceState,
  kind: ReviewPlanKind,
  extraIds: string[] = [],
  now: string = new Date().toISOString(),
  candidateIds?: string[],
): ReviewComboPlan {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const sourceStage = kind === 'radar_focus' ? 'radar' : 'focus'
  const targetStage = kind === 'radar_focus' ? 'focus' : 'engage'
  const displaceTo = kind === 'radar_focus' ? 'radar' : 'focus'
  const allowedPromotionIds = new Set(
    kind === 'radar_focus'
      ? (candidateIds?.length
        ? candidateIds.filter((itemId) => state.items[itemId]?.stage === 'radar')
        : selectRadarCandidates(state, extraIds, now).selected.map((item) => item.id))
      : itemsInStage(state, 'focus').map((item) => item.id),
  )
  const allowedDisplaceIds = new Set(itemsInStage(state, targetStage).map((item) => item.id))
  const seen = new Set<string>()
  const promotions: ReviewPromotion[] = []
  for (const entry of Array.isArray(source.promotions) ? source.promotions : []) {
    const itemId = asText((entry as { itemId?: unknown }).itemId)
    if (!itemId || seen.has(itemId) || !allowedPromotionIds.has(itemId)) continue
    if (state.items[itemId]?.stage !== sourceStage) continue
    seen.add(itemId)
    promotions.push({
      itemId,
      evidence: asText((entry as { evidence?: unknown }).evidence),
      relation: asText((entry as { relation?: unknown }).relation),
      risk: asText((entry as { risk?: unknown }).risk),
      selected: true,
    })
    if (promotions.length >= 10) break
  }
  const displaceSeen = new Set<string>()
  const displacements: ReviewDisplacement[] = []
  for (const entry of Array.isArray(source.displacements) ? source.displacements : []) {
    const itemId = asText((entry as { itemId?: unknown }).itemId)
    if (!itemId || displaceSeen.has(itemId) || !allowedDisplaceIds.has(itemId)) continue
    displaceSeen.add(itemId)
    displacements.push({
      itemId,
      to: displaceTo,
      reason: asText((entry as { reason?: unknown }).reason),
      selected: true,
    })
    if (displacements.length >= 10) break
  }
  const analyzed = kind === 'radar_focus'
    ? selectRadarCandidates(state, extraIds, now)
    : { selected: itemsInStage(state, 'focus'), total: itemsInStage(state, 'focus').length }
  return {
    kind,
    promotions,
    displacements,
    summary: asText(source.summary).slice(0, 280),
    analyzedCount: analyzed.selected.length,
    totalCount: analyzed.total,
    extraIds,
  }
}

export function isPromotionSelected(plan: ReviewComboPlan | null, itemId: string): boolean {
  return plan?.promotions.some((entry) => entry.itemId === itemId && entry.selected) ?? false
}

export function isDisplacementSelected(plan: ReviewComboPlan | null, itemId: string): boolean {
  return plan?.displacements.some((entry) => entry.itemId === itemId && entry.selected) ?? false
}

export function mergeReviewComboDraft(
  existing: ReviewComboPlan | null,
  incoming: ReviewComboPlan,
): ReviewComboPlan {
  const promotionState = new Map(
    (existing?.promotions ?? []).map((entry) => [entry.itemId, entry.selected]),
  )
  const displacementState = new Map(
    (existing?.displacements ?? []).map((entry) => [entry.itemId, entry.selected]),
  )
  const incomingPromotionIds = new Set(incoming.promotions.map((entry) => entry.itemId))
  const incomingDisplacementIds = new Set(incoming.displacements.map((entry) => entry.itemId))
  return {
    ...incoming,
    promotions: [
      ...incoming.promotions.map((entry) => ({
        ...entry,
        selected: promotionState.has(entry.itemId) ? promotionState.get(entry.itemId)! : entry.selected,
      })),
      ...(existing?.promotions ?? []).filter((entry) => !incomingPromotionIds.has(entry.itemId)),
    ],
    displacements: [
      ...incoming.displacements.map((entry) => ({
        ...entry,
        selected: displacementState.has(entry.itemId) ? displacementState.get(entry.itemId)! : entry.selected,
      })),
      ...(existing?.displacements ?? []).filter((entry) => !incomingDisplacementIds.has(entry.itemId)),
    ],
    extraIds: existing?.extraIds.length ? existing.extraIds : incoming.extraIds,
  }
}

export function projectedWip(
  state: WorkspaceState,
  plan: ReviewComboPlan,
): { focus: number; engage: number; overflow: 'focus' | 'engage' | null } {
  const selectedPromotions = plan.promotions.filter((entry) => entry.selected)
  const selectedDisplacements = plan.displacements.filter((entry) => entry.selected)
  let focus = countByStage(state, 'focus')
  let engage = countByStage(state, 'engage')
  if (plan.kind === 'radar_focus') {
    focus = focus - selectedDisplacements.length + selectedPromotions.length
  } else {
    focus = focus - selectedPromotions.length + selectedDisplacements.length
    engage = engage - selectedDisplacements.length + selectedPromotions.length
  }
  const overflow = focus > state.settings.focusWipLimit
    ? 'focus'
    : engage > state.settings.engageWipLimit
      ? 'engage'
      : null
  return { focus, engage, overflow }
}

export function applyReviewCombo(
  state: WorkspaceState,
  plan: ReviewComboPlan,
  options: { overrideWip?: boolean } = {},
  env: DomainEnv = browserEnv,
): {
  ok: boolean
  state: WorkspaceState
  reason?: string
  target?: Stage
  current?: number
  limit?: number
} {
  const source = plan.kind === 'radar_focus' ? 'radar' : 'focus'
  const target = plan.kind === 'radar_focus' ? 'focus' : 'engage'
  const displaceTo = plan.kind === 'radar_focus' ? 'radar' : 'focus'
  let next = state
  for (const entry of plan.displacements.filter((item) => item.selected)) {
    if (next.items[entry.itemId]?.stage !== target) continue
    const moved = moveItem(next, entry.itemId, displaceTo, { reason: 'weekly_review' }, env)
    if (!moved.ok) {
      return {
        ok: false,
        state,
        reason: moved.reason,
        target: moved.target,
        current: moved.current,
        limit: moved.limit,
      }
    }
    next = moved.state
  }
  for (const entry of plan.promotions.filter((item) => item.selected)) {
    if (next.items[entry.itemId]?.stage !== source) continue
    const moved = moveItem(next, entry.itemId, target, {
      overrideWip: options.overrideWip,
      reason: 'weekly_review',
    }, env)
    if (!moved.ok) {
      return {
        ok: false,
        state,
        reason: moved.reason,
        target: moved.target,
        current: moved.current,
        limit: moved.limit,
      }
    }
    next = moved.state
  }
  return { ok: true, state: next }
}

export function confirmedAdjustmentFrom(
  plan: ReviewComboPlan,
  overrideWip: boolean,
  now: string,
): ReviewAdjustment {
  return {
    kind: plan.kind,
    note: plan.summary,
    promotions: plan.promotions.filter((entry) => entry.selected).map((entry) => entry.itemId),
    displacements: plan.displacements
      .filter((entry) => entry.selected)
      .map((entry) => ({ itemId: entry.itemId, to: entry.to })),
    overrideWip,
    confirmedAt: now,
  }
}

export function compactReviewCard(item: AttentionItem, now: string) {
  return {
    id: item.id,
    title: item.title,
    description: item.description.slice(0, 400),
    board: item.board,
    category: item.category,
    topics: item.topics,
    stage: item.stage,
    daysInStage: daysBetween(item.stageEnteredAt, now),
    lastTouchedDays: daysBetween(item.lastTouchedAt, now),
  }
}
