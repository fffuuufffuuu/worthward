import type {
  AttentionItem,
  Board,
  CategoryDefinition,
  WorkspaceSettings,
  WorkspaceState,
} from './types'

export const DEFAULT_CATEGORY_DEFINITIONS: Record<Board, readonly CategoryDefinition[]> = {
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
}

export const CATEGORY_OPTIONS: Record<Board, readonly string[]> = {
  explore: DEFAULT_CATEGORY_DEFINITIONS.explore.map((category) => category.name),
  create: DEFAULT_CATEGORY_DEFINITIONS.create.map((category) => category.name),
}

export const CATEGORY_COLOR_PALETTE = [
  '#b14e8a',
  '#2c8198',
  '#9c6b20',
  '#5f7d3a',
  '#794e9c',
  '#bc5a32',
  '#3d699d',
  '#a24e63',
  '#18806f',
  '#7b6c2d',
] as const

const GENERATED_COLOR_CANDIDATE_COUNT = 24

export type CategoryError =
  | 'blank_name'
  | 'duplicate_name'
  | 'category_not_found'
  | 'invalid_color'
  | 'replacement_required'
  | 'invalid_replacement'

export interface CategoryResult {
  state: WorkspaceState
  ok: boolean
  error?: CategoryError
}

function definitionsFor(
  board: Board,
  categories?: WorkspaceSettings['categories'],
): readonly CategoryDefinition[] {
  return categories?.[board] ?? DEFAULT_CATEGORY_DEFINITIONS[board]
}

export function categoryOptionsFor(
  board: Board,
  categories?: WorkspaceSettings['categories'],
): readonly string[] {
  if (!categories) return CATEGORY_OPTIONS[board]
  return definitionsFor(board, categories).map((category) => category.name)
}

export function categoryColorFor(
  board: Board,
  category: string | null,
  categories?: WorkspaceSettings['categories'],
): string {
  return category
    ? definitionsFor(board, categories).find((definition) => definition.name === category)?.color ?? '#7e8f9a'
    : '#7e8f9a'
}

export function countCategoryUsage(state: WorkspaceState, board: Board, name: string): number {
  return Object.values(state.items).filter((item) => item.board === board && item.category === name).length
}

export function addCategory(state: WorkspaceState, board: Board, name: string): CategoryResult {
  const normalizedName = name.trim()
  const definitions = definitionsFor(board, state.settings.categories)
  if (!normalizedName) return failed(state, 'blank_name')
  if (definitions.some((definition) => definition.name === normalizedName)) {
    return failed(state, 'duplicate_name')
  }

  return succeeded(state, board, [
    ...definitions,
    { name: normalizedName, color: nextPaletteColor(definitions) },
  ])
}

export function renameCategory(
  state: WorkspaceState,
  board: Board,
  oldName: string,
  newName: string,
): CategoryResult {
  const normalizedName = newName.trim()
  const definitions = definitionsFor(board, state.settings.categories)
  const existing = definitions.find((definition) => definition.name === oldName)
  if (!existing) return failed(state, 'category_not_found')
  if (!normalizedName) return failed(state, 'blank_name')
  if (normalizedName !== oldName && definitions.some((definition) => definition.name === normalizedName)) {
    return failed(state, 'duplicate_name')
  }

  return succeeded(
    updateItemsForCategory(state, board, oldName, normalizedName),
    board,
    definitions.map((definition) => definition === existing ? { ...definition, name: normalizedName } : definition),
  )
}

export function recolorCategory(
  state: WorkspaceState,
  board: Board,
  name: string,
  color: string,
): CategoryResult {
  const definitions = definitionsFor(board, state.settings.categories)
  const existing = definitions.find((definition) => definition.name === name)
  if (!existing) return failed(state, 'category_not_found')
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return failed(state, 'invalid_color')

  return succeeded(
    state,
    board,
    definitions.map((definition) => definition === existing ? { ...definition, color: color.toLowerCase() } : definition),
  )
}

export function removeCategory(
  state: WorkspaceState,
  board: Board,
  name: string,
  replacement?: string | null,
): CategoryResult {
  const definitions = definitionsFor(board, state.settings.categories)
  const existing = definitions.find((definition) => definition.name === name)
  if (!existing) return failed(state, 'category_not_found')

  const usage = countCategoryUsage(state, board, name)
  if (usage && replacement === undefined) return failed(state, 'replacement_required')
  if (replacement !== undefined && replacement !== null &&
    (!definitions.some((definition) => definition.name === replacement) || replacement === name)) {
    return failed(state, 'invalid_replacement')
  }

  const nextState = usage
    ? updateItemsForCategory(state, board, name, replacement ?? null)
    : state
  return succeeded(nextState, board, definitions.filter((definition) => definition !== existing))
}

function nextPaletteColor(definitions: readonly CategoryDefinition[]): string {
  const currentColors = definitions
    .map((definition) => definition.color.trim().toLowerCase())
  const candidates = [
    ...CATEGORY_COLOR_PALETTE,
    ...Array.from({ length: GENERATED_COLOR_CANDIDATE_COUNT }, (_, index) => generatedPaletteColor(index)),
  ]
  const initialChoice = chooseMostDistinctColor(currentColors, candidates)
  if (initialChoice) return initialChoice

  const usedColors = new Set(currentColors)
  let generatedIndex = GENERATED_COLOR_CANDIDATE_COUNT
  while (true) {
    const nextCandidates: string[] = []
    while (nextCandidates.length < GENERATED_COLOR_CANDIDATE_COUNT) {
      const candidate = generatedPaletteColor(generatedIndex)
      generatedIndex += 1
      if (!usedColors.has(candidate) && !nextCandidates.includes(candidate)) {
        nextCandidates.push(candidate)
      }
    }
    const nextChoice = chooseMostDistinctColor(currentColors, nextCandidates)
    if (nextChoice) return nextChoice
  }
}

export function chooseMostDistinctColor(
  existingColors: readonly string[],
  candidates: readonly string[],
): string | null {
  const normalizedExisting = existingColors.map((color) => color.trim().toLowerCase())
  const usedColors = new Set(normalizedExisting)
  const validCurrentColors = normalizedExisting.filter((color) => colorToRgb(color) !== null)
  let best: string | null = null
  let bestDistance = -1

  for (const candidate of candidates) {
    const normalizedCandidate = candidate.trim().toLowerCase()
    if (usedColors.has(normalizedCandidate) || colorToRgb(normalizedCandidate) === null) continue
    const distance = minimumColorDistance(normalizedCandidate, validCurrentColors)
    if (distance > bestDistance) {
      best = normalizedCandidate
      bestDistance = distance
    }
  }
  return best
}

export function categoryColorDistance(first: string, second: string): number {
  const firstRgb = colorToRgb(first)
  const secondRgb = colorToRgb(second)
  if (!firstRgb || !secondRgb) return 0
  return (firstRgb[0] - secondRgb[0]) ** 2
    + (firstRgb[1] - secondRgb[1]) ** 2
    + (firstRgb[2] - secondRgb[2]) ** 2
}

function minimumColorDistance(candidate: string, currentColors: readonly string[]): number {
  if (!currentColors.length) return Number.POSITIVE_INFINITY
  return Math.min(...currentColors.map((current) => categoryColorDistance(candidate, current)))
}

function colorToRgb(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(color)
  if (!match) return null
  return [
    Number.parseInt(match[1].slice(0, 2), 16),
    Number.parseInt(match[1].slice(2, 4), 16),
    Number.parseInt(match[1].slice(4, 6), 16),
  ]
}

function generatedPaletteColor(index: number): string {
  const value = (index * 0x9e3779 + 0x4f7c15) % 0x1000000
  return `#${Math.floor(value).toString(16).padStart(6, '0')}`
}

function updateItemsForCategory(
  state: WorkspaceState,
  board: Board,
  previous: string,
  next: string | null,
): WorkspaceState {
  let changed = false
  const items = Object.fromEntries(Object.entries(state.items).map(([id, item]) => {
    if (item.board !== board || item.category !== previous) return [id, item]
    changed = true
    return [id, { ...item, category: next }]
  }))
  return changed ? { ...state, items } : state
}

function succeeded(
  state: WorkspaceState,
  board: Board,
  definitions: readonly CategoryDefinition[],
): CategoryResult {
  return {
    state: {
      ...state,
      settings: {
        ...state.settings,
        categories: {
          ...state.settings.categories,
          [board]: definitions,
        },
      },
    },
    ok: true,
  }
}

function failed(state: WorkspaceState, error: CategoryError): CategoryResult {
  return { state, ok: false, error }
}

export function normalizeCategory(
  item: Pick<AttentionItem, 'board' | 'title' | 'category'>,
  categories?: WorkspaceSettings['categories'],
): string | null {
  if (!item.category) return null
  if (categoryOptionsFor(item.board, categories).includes(item.category)) return item.category
  if (item.board === 'create') {
    return /思考|表达/.test(item.category) ? '写作 / 表达' : '产品 / 项目'
  }
  if (/[《》«»]|TED演讲/i.test(item.title)) return '书籍 / 影音'
  if (/课程|讲座|展览|参访|活动|比赛|挑战赛|大师赛|黑客松|培养计划/.test(item.title)) {
    return '课程 / 体验'
  }
  return '主题 / 问题'
}

export function normalizeWorkspaceCategories(
  state: WorkspaceState,
): WorkspaceState {
  let changed = false
  const items = Object.fromEntries(
    Object.entries(state.items).map(([id, item]) => {
      const category = normalizeCategory(item, state.settings.categories)
      if (category === item.category) return [id, item]
      changed = true
      return [id, { ...item, category }]
    }),
  )
  return changed ? { ...state, items } : state
}
