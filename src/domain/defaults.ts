import { DEFAULT_AI_SETTINGS, migrateAiSettings } from './ai'
import { DEFAULT_CATEGORY_DEFINITIONS } from './categories'
import type { CategoryDefinition, WeeklyReviewRecord, WorkspaceState } from './types'

function cloneDefaultCategoryDefinitions(): Record<'explore' | 'create', CategoryDefinition[]> {
  return {
    explore: DEFAULT_CATEGORY_DEFINITIONS.explore.map((category) => ({ ...category })),
    create: DEFAULT_CATEGORY_DEFINITIONS.create.map((category) => ({ ...category })),
  }
}

function isCategoryDefinitionList(value: unknown): value is CategoryDefinition[] {
  return Array.isArray(value) && value.every((category) =>
    !!category &&
    typeof category === 'object' &&
    typeof (category as CategoryDefinition).name === 'string' &&
    (category as CategoryDefinition).name.trim().length > 0 &&
    typeof (category as CategoryDefinition).color === 'string' &&
    (category as CategoryDefinition).color.trim().length > 0,
  )
}

export function migrateWeeklyReviews(state: WorkspaceState): WorkspaceState {
  let changed = false
  const reviews = state.reviews.map((review) => {
    const attentionDirection = typeof review.attentionDirection === 'string' ? review.attentionDirection : ''
    const adjustments = Array.isArray(review.adjustments) ? review.adjustments : []
    const comboDrafts = review.comboDrafts && typeof review.comboDrafts === 'object' ? review.comboDrafts : undefined
    if (
      attentionDirection === review.attentionDirection
      && adjustments === review.adjustments
      && comboDrafts === review.comboDrafts
    ) return review
    changed = true
    return { ...review, attentionDirection, adjustments, comboDrafts } satisfies WeeklyReviewRecord
  })
  return changed ? { ...state, reviews } : state
}

export function migrateWorkspace(state: WorkspaceState): WorkspaceState {
  return migrateWeeklyReviews(migrateWorkspaceSettings(state))
}

export function migrateWorkspaceSettings(state: WorkspaceState): WorkspaceState {
  const categories = state.settings.categories
  const exploreCategories = isCategoryDefinitionList(categories?.explore)
    ? categories.explore
    : cloneDefaultCategoryDefinitions().explore
  const createCategories = isCategoryDefinitionList(categories?.create)
    ? categories.create
    : cloneDefaultCategoryDefinitions().create
  const tickTickListName = state.settings.tickTickListName === 'Attention Workbench'
    ? '收集箱'
    : state.settings.tickTickListName
  const tickTickCreateMode = state.settings.tickTickCreateMode === 'cli' ? 'cli' : 'deeplink'
  const currentAi = state.settings.ai
  const ai = migrateAiSettings(currentAi)
  const categoriesChanged = exploreCategories !== categories?.explore || createCategories !== categories?.create
  const aiUnchanged = currentAi === ai || (
    currentAi?.endpoint === ai.endpoint &&
    currentAi?.model === ai.model &&
    currentAi?.lastTestedAt === ai.lastTestedAt &&
    currentAi?.lastTestStatus === ai.lastTestStatus &&
    currentAi?.lastTestMessage === ai.lastTestMessage
  )

  if (
    !categoriesChanged
    && tickTickListName === state.settings.tickTickListName
    && tickTickCreateMode === (state.settings.tickTickCreateMode ?? 'deeplink')
    && aiUnchanged
  ) {
    return state
  }

  return {
    ...state,
    settings: {
      ...state.settings,
      tickTickListName,
      tickTickCreateMode,
      categories: {
        explore: exploreCategories,
        create: createCategories,
      },
      ai,
    },
  }
}

export function createInitialWorkspace(): WorkspaceState {
  return {
    schemaVersion: 1,
    items: {},
    events: [],
    relations: [],
    reviews: [],
    exportReceipts: [],
    settings: {
      boards: ['explore', 'create'],
      focusWipLimit: 10,
      engageWipLimit: 4,
      stalledDays: {
        radar: 180,
        focus: 30,
        engage: 14,
      },
      tickTickListName: '收集箱',
      tickTickCreateMode: 'deeplink',
      categories: cloneDefaultCategoryDefinitions(),
      ai: { ...DEFAULT_AI_SETTINGS },
    },
  }
}
