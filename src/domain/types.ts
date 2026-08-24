export type Board = 'explore' | 'create'

export type Stage =
  | 'radar'
  | 'focus'
  | 'engage'
  | 'outcome'
  | 'archive'

export type ActiveStage = Exclude<Stage, 'archive'>

export type TransitionMode =
  | 'capture'
  | 'import'
  | 'move'
  | 'drop'
  | 'archive'
  | 'restore'

export interface AttentionItem {
  id: string
  title: string
  description: string
  board: Board
  category: string | null
  topics: string[]
  stage: Stage
  capturedAt: string
  stageEnteredAt: string
  lastTouchedAt: string
  lastProgressAt: string | null
  version: number
}

export interface StageChangeEvent {
  id: string
  type: 'stage_changed'
  itemId: string
  fromStage: Stage | null
  toStage: Stage
  transitionMode: TransitionMode
  reason?: string
  occurredAt: string
}

export interface ActivityEvent {
  id: string
  type:
    | 'property_changed'
    | 'description_updated'
    | 'card_spawned'
    | 'progress_logged'
    | 'wip_limit_changed'
  itemId?: string
  occurredAt: string
  minutes?: number
  note?: string
  field?: string
  previousValue?: unknown
  nextValue?: unknown
  childItemId?: string
}

export type WorkspaceEvent = StageChangeEvent | ActivityEvent

export interface ItemRelation {
  parentItemId: string
  childItemId: string
  type: 'spawned_from'
}

export interface ReviewAdjustment {
  kind: 'radar_focus' | 'focus_engage'
  note: string
  promotions: string[]
  displacements: Array<{ itemId: string; to: 'radar' | 'focus' }>
  overrideWip: boolean
  confirmedAt: string
}

export interface ReviewComboDraft {
  kind: 'radar_focus' | 'focus_engage'
  promotions: Array<{
    itemId: string
    evidence: string
    relation: string
    risk: string
    selected: boolean
  }>
  displacements: Array<{
    itemId: string
    to: 'radar' | 'focus'
    reason: string
    selected: boolean
  }>
  summary: string
  analyzedCount: number
  totalCount: number
  extraIds: string[]
}

export interface WeeklyReviewRecord {
  id: string
  status: 'in_progress' | 'completed'
  step: number
  startedAt: string
  completedAt: string | null
  startSnapshot: { focus: number; engage: number }
  endSnapshot: { focus: number; engage: number } | null
  attentionDirection: string
  adjustments: ReviewAdjustment[]
  comboDrafts?: Partial<Record<'radar_focus' | 'focus_engage', ReviewComboDraft>>
}

export interface ConfirmedEngagePlan {
  mainTitle: string
  mainNotes: string
  steps: Array<{
    id: string
    title: string
    notes: string
    children: Array<{ id: string; title: string; notes: string }>
  }>
}

export type TickTickCreateMode = 'deeplink' | 'cli'

export interface TickTickExportReceipt {
  exportId: string
  itemId: string
  status: 'not_created' | 'handed_off_unverified' | 'skipped' | 'created_with_plan'
  createdAt: string
  url?: string
  taskId?: string
  channel?: TickTickCreateMode
  mode?: 'main' | 'tree'
  plan?: ConfirmedEngagePlan
}

export interface CategoryDefinition {
  name: string
  color: string
}

export type AiConnectionStatus = 'unknown' | 'ok' | 'missing_key' | 'error'

export interface AiSettings {
  endpoint: string
  model: string
  lastTestedAt: string | null
  lastTestStatus: AiConnectionStatus
  lastTestMessage: string
}

export interface WorkspaceSettings {
  boards: Board[]
  focusWipLimit: number
  engageWipLimit: number
  stalledDays: Record<'radar' | 'focus' | 'engage', number>
  tickTickListName: string
  tickTickCreateMode: TickTickCreateMode
  categories: Record<Board, CategoryDefinition[]>
  ai: AiSettings
}

export interface WorkspaceState {
  schemaVersion: 1
  items: Record<string, AttentionItem>
  events: WorkspaceEvent[]
  relations: ItemRelation[]
  reviews: WeeklyReviewRecord[]
  exportReceipts: TickTickExportReceipt[]
  settings: WorkspaceSettings
}

export interface DomainEnv {
  now: () => string
  id: () => string
}

export interface CaptureInput {
  title: string
  description?: string
  board: Board
  category?: string | null
  topics?: string[]
}

export interface MoveOptions {
  transitionMode?: Exclude<TransitionMode, 'capture' | 'import'>
  reason?: string
  overrideWip?: boolean
  replaceItemId?: string
  displaceTarget?: 'radar' | 'focus'
}

export interface MoveResult {
  state: WorkspaceState
  ok: boolean
  enteredEngage: boolean
  reason?: 'item_not_found' | 'same_stage' | 'invalid_source' | 'wip_limit'
  target?: Stage
  current?: number
  limit?: number
}
