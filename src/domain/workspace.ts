import type {
  ActiveStage,
  AttentionItem,
  Board,
  CaptureInput,
  DomainEnv,
  MoveOptions,
  MoveResult,
  ReviewComboDraft,
  Stage,
  TransitionMode,
  WorkspaceEvent,
  WorkspaceState,
} from './types'

const browserEnv: DomainEnv = {
  now: () => new Date().toISOString(),
  id: () => crypto.randomUUID(),
}

function countStage(state: WorkspaceState, stage: Stage): number {
  return Object.values(state.items).filter((item) => item.stage === stage)
    .length
}

function limitFor(state: WorkspaceState, stage: Stage): number | null {
  if (stage === 'focus') return state.settings.focusWipLimit
  if (stage === 'engage') return state.settings.engageWipLimit
  return null
}

function applyStageChange(
  state: WorkspaceState,
  itemId: string,
  toStage: Stage,
  mode: TransitionMode,
  reason: string | undefined,
  env: DomainEnv,
): WorkspaceState {
  const item = state.items[itemId]
  const occurredAt = env.now()
  const event: WorkspaceEvent = {
    id: env.id(),
    type: 'stage_changed',
    itemId,
    fromStage: item.stage,
    toStage,
    transitionMode: mode,
    reason,
    occurredAt,
  }

  return {
    ...state,
    items: {
      ...state.items,
      [itemId]: {
        ...item,
        stage: toStage,
        stageEnteredAt: occurredAt,
        lastTouchedAt: occurredAt,
        version: item.version + 1,
      },
    },
    events: [...state.events, event],
  }
}

export function captureItem(
  state: WorkspaceState,
  input: CaptureInput,
  env: DomainEnv = browserEnv,
): { state: WorkspaceState; itemId: string } {
  const title = input.title.trim()
  if (!title) throw new Error('标题不能为空')

  const itemId = env.id()
  const occurredAt = env.now()
  const item: AttentionItem = {
    id: itemId,
    title,
    description: input.description ?? '',
    board: input.board,
    category: input.category ?? null,
    topics: [...(input.topics ?? [])],
    stage: 'radar',
    capturedAt: occurredAt,
    stageEnteredAt: occurredAt,
    lastTouchedAt: occurredAt,
    lastProgressAt: null,
    version: 1,
  }

  return {
    itemId,
    state: {
      ...state,
      items: { ...state.items, [itemId]: item },
      events: [
        ...state.events,
        {
          id: env.id(),
          type: 'stage_changed',
          itemId,
          fromStage: null,
          toStage: 'radar',
          transitionMode: 'capture',
          occurredAt,
        },
      ],
    },
  }
}

export function moveItem(
  state: WorkspaceState,
  itemId: string,
  target: Stage,
  options: MoveOptions = {},
  env: DomainEnv = browserEnv,
): MoveResult {
  const item = state.items[itemId]
  if (!item) {
    return { state, ok: false, enteredEngage: false, reason: 'item_not_found' }
  }
  if (item.stage === target) {
    return { state, ok: false, enteredEngage: false, reason: 'same_stage' }
  }

  const limit = limitFor(state, target)
  const current = countStage(state, target)
  const replacement = options.replaceItemId
    ? state.items[options.replaceItemId]
    : undefined
  const validReplacement =
    replacement && replacement.id !== itemId && replacement.stage === target
  const displaceTarget = options.displaceTarget === 'focus' ? 'focus' : 'radar'

  if (validReplacement && displaceTarget === 'focus') {
    const focusLimit = state.settings.focusWipLimit
    const focusCount = countStage(state, 'focus')
    if (focusCount >= focusLimit && !options.overrideWip) {
      return {
        state,
        ok: false,
        enteredEngage: false,
        reason: 'wip_limit',
        target: 'focus',
        current: focusCount,
        limit: focusLimit,
      }
    }
  }

  if (
    limit !== null &&
    current >= limit &&
    !options.overrideWip &&
    !validReplacement
  ) {
    return {
      state,
      ok: false,
      enteredEngage: false,
      reason: 'wip_limit',
      target,
      current,
      limit,
    }
  }

  let next = state
  if (validReplacement) {
    next = applyStageChange(
      next,
      replacement.id,
      displaceTarget,
      'move',
      undefined,
      env,
    )
  }
  next = applyStageChange(
    next,
    itemId,
    target,
    options.transitionMode ?? 'move',
    options.reason,
    env,
  )

  return {
    state: next,
    ok: true,
    enteredEngage: target === 'engage' && item.stage !== 'engage',
  }
}

export function archiveItem(
  state: WorkspaceState,
  itemId: string,
  mode: 'drop' | 'archive',
  reason?: string,
  env: DomainEnv = browserEnv,
): MoveResult {
  return moveItem(
    state,
    itemId,
    'archive',
    { transitionMode: mode, reason },
    env,
  )
}

function cleanComboDrafts(
  comboDrafts: Partial<Record<'radar_focus' | 'focus_engage', ReviewComboDraft>> | undefined,
  itemId: string,
): Partial<Record<'radar_focus' | 'focus_engage', ReviewComboDraft>> | undefined {
  if (!comboDrafts) return undefined
  const cleaned: Partial<Record<'radar_focus' | 'focus_engage', ReviewComboDraft>> = {}
  for (const kind of ['radar_focus', 'focus_engage'] as const) {
    const draft = comboDrafts[kind]
    if (!draft) continue
    cleaned[kind] = {
      ...draft,
      promotions: draft.promotions.filter((entry) => entry.itemId !== itemId),
      displacements: draft.displacements.filter((entry) => entry.itemId !== itemId),
      extraIds: draft.extraIds.filter((id) => id !== itemId),
    }
  }
  return cleaned
}

export function deleteArchivedItem(
  state: WorkspaceState,
  itemId: string,
): { state: WorkspaceState; ok: boolean; reason?: 'item_not_found' | 'not_archived' } {
  const item = state.items[itemId]
  if (!item) return { state, ok: false, reason: 'item_not_found' }
  if (item.stage !== 'archive') return { state, ok: false, reason: 'not_archived' }

  const { [itemId]: removed, ...items } = state.items
  void removed
  const referencesItem = (event: WorkspaceEvent) =>
    event.itemId === itemId || ('childItemId' in event && event.childItemId === itemId)

  return {
    ok: true,
    state: {
      ...state,
      items,
      events: state.events.filter((event) => !referencesItem(event)),
      relations: state.relations.filter((relation) =>
        relation.parentItemId !== itemId && relation.childItemId !== itemId),
      exportReceipts: state.exportReceipts.filter((receipt) => receipt.itemId !== itemId),
      reviews: state.reviews.map((review) => ({
        ...review,
        adjustments: review.adjustments.map((adjustment) => ({
          ...adjustment,
          promotions: adjustment.promotions.filter((id) => id !== itemId),
          displacements: adjustment.displacements.filter((entry) => entry.itemId !== itemId),
        })),
        comboDrafts: cleanComboDrafts(review.comboDrafts, itemId),
      })),
    },
  }
}

export function restoreItem(
  state: WorkspaceState,
  itemId: string,
  target: ActiveStage,
  options: MoveOptions = {},
  env: DomainEnv = browserEnv,
): MoveResult {
  if (state.items[itemId]?.stage !== 'archive') {
    return { state, ok: false, enteredEngage: false, reason: 'invalid_source' }
  }
  return moveItem(
    state,
    itemId,
    target,
    { ...options, transitionMode: 'restore' },
    env,
  )
}

export function spawnItem(
  state: WorkspaceState,
  parentItemId: string,
  input: CaptureInput,
  env: DomainEnv = browserEnv,
): { state: WorkspaceState; itemId: string } {
  if (!state.items[parentItemId]) throw new Error('原卡片不存在')
  const captured = captureItem(state, input, env)
  const occurredAt = env.now()
  return {
    itemId: captured.itemId,
    state: {
      ...captured.state,
      events: [
        ...captured.state.events,
        {
          id: env.id(),
          type: 'card_spawned',
          itemId: parentItemId,
          childItemId: captured.itemId,
          occurredAt,
        },
      ],
      relations: [
        ...captured.state.relations,
        {
          parentItemId,
          childItemId: captured.itemId,
          type: 'spawned_from',
        },
      ],
    },
  }
}

export function updateItem(
  state: WorkspaceState,
  itemId: string,
  patch: Partial<
    Pick<AttentionItem, 'title' | 'description' | 'board' | 'category' | 'topics'>
  >,
  env: DomainEnv = browserEnv,
): { state: WorkspaceState } {
  const item = state.items[itemId]
  if (!item) return { state }
  const occurredAt = env.now()
  const nextItem: AttentionItem = {
    ...item,
    ...patch,
    title: patch.title === undefined ? item.title : patch.title.trim(),
    topics: patch.topics === undefined ? item.topics : [...patch.topics],
    lastTouchedAt: occurredAt,
    version: item.version + 1,
  }
  return {
    state: {
      ...state,
      items: { ...state.items, [itemId]: nextItem },
      events: [
        ...state.events,
        {
          id: env.id(),
          type:
            patch.description === undefined
              ? 'property_changed'
              : 'description_updated',
          itemId,
          occurredAt,
        },
      ],
    },
  }
}

export function setWipLimit(
  state: WorkspaceState,
  stage: 'focus' | 'engage',
  limit: number,
  env: DomainEnv = browserEnv,
): { state: WorkspaceState } {
  const normalized = Math.max(1, Math.floor(limit))
  const key = stage === 'focus' ? 'focusWipLimit' : 'engageWipLimit'
  return {
    state: {
      ...state,
      settings: { ...state.settings, [key]: normalized },
      events: [
        ...state.events,
        {
          id: env.id(),
          type: 'wip_limit_changed',
          occurredAt: env.now(),
          field: key,
          previousValue: state.settings[key],
          nextValue: normalized,
        },
      ],
    },
  }
}

export function countByStage(
  state: WorkspaceState,
  stage: Stage,
  board?: Board,
): number {
  return Object.values(state.items).filter(
    (item) => item.stage === stage && (!board || item.board === board),
  ).length
}
