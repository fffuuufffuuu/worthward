import { createInitialWorkspace, migrateWorkspace } from '../domain/defaults'
import { normalizeWorkspaceCategories } from '../domain/categories'
import { rebuildSeedExploreTopics } from '../domain/topics'
import type { WorkspaceState } from '../domain/types'
import personalSeed from './personal-seed.json'

export const STORAGE_KEY = 'attention-workbench:v1'
export const EXPLORE_TOPIC_MIGRATION_KEY = 'attention-workbench:migration:explore-topics-v1'

function isWorkspaceState(value: unknown): value is WorkspaceState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<WorkspaceState>
  return (
    candidate.schemaVersion === 1 &&
    !!candidate.items &&
    typeof candidate.items === 'object' &&
    Array.isArray(candidate.events) &&
    Array.isArray(candidate.relations) &&
    Array.isArray(candidate.reviews) &&
    Array.isArray(candidate.exportReceipts) &&
    !!candidate.settings
  )
}

export function saveWorkspace(
  state: WorkspaceState,
  storage: Storage = localStorage,
): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function loadWorkspace(storage: Storage = localStorage): WorkspaceState {
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return createInitialWorkspace()
  try {
    return importWorkspaceJson(raw)
  } catch {
    return createInitialWorkspace()
  }
}

export function mergeWorkspaceSeed(
  current: WorkspaceState,
  seed: WorkspaceState,
): WorkspaceState {
  const eventIds = new Set(current.events.map((event) => event.id))
  const relationKeys = new Set(
    current.relations.map((relation) => `${relation.parentItemId}:${relation.childItemId}:${relation.type}`),
  )
  return {
    ...current,
    items: { ...seed.items, ...current.items },
    events: [
      ...current.events,
      ...seed.events.filter((event) => !eventIds.has(event.id)),
    ],
    relations: [
      ...current.relations,
      ...seed.relations.filter(
        (relation) => !relationKeys.has(`${relation.parentItemId}:${relation.childItemId}:${relation.type}`),
      ),
    ],
  }
}

export function createPersonalWorkspace(): WorkspaceState {
  return rebuildSeedExploreTopics(
    migrateWorkspace(normalizeWorkspaceCategories(
      JSON.parse(JSON.stringify(personalSeed)) as WorkspaceState,
    )),
  )
}

export function applyExploreTopicMigration(
  current: WorkspaceState,
  seed: WorkspaceState,
): WorkspaceState {
  let changed = false
  const items = { ...current.items }
  for (const seedItem of Object.values(seed.items)) {
    const currentItem = items[seedItem.id]
    if (!currentItem || seedItem.board !== 'explore' || currentItem.board !== 'explore') continue
    if (currentItem.topics.length === seedItem.topics.length &&
      currentItem.topics.every((topic, index) => topic === seedItem.topics[index])) continue
    changed = true
    items[seedItem.id] = { ...currentItem, topics: [...seedItem.topics] }
  }
  return changed ? { ...current, items } : current
}

export function loadPersonalWorkspace(
  storage: Storage = localStorage,
): WorkspaceState {
  const seed = createPersonalWorkspace()
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) {
    storage.setItem(EXPLORE_TOPIC_MIGRATION_KEY, '1')
    return seed
  }
  try {
    const merged = mergeWorkspaceSeed(importWorkspaceJson(raw), seed)
    if (storage.getItem(EXPLORE_TOPIC_MIGRATION_KEY) === '1') return merged
    const migrated = applyExploreTopicMigration(merged, seed)
    storage.setItem(EXPLORE_TOPIC_MIGRATION_KEY, '1')
    return migrated
  } catch {
    storage.setItem(EXPLORE_TOPIC_MIGRATION_KEY, '1')
    return seed
  }
}

export function exportWorkspaceJson(state: WorkspaceState): string {
  return JSON.stringify(state, null, 2)
}

export function importWorkspaceJson(raw: string): WorkspaceState {
  const parsed: unknown = JSON.parse(raw)
  if (!isWorkspaceState(parsed)) {
    throw new Error('不支持的数据版本或文件内容不完整')
  }
  return normalizeWorkspaceCategories(migrateWorkspace(parsed))
}
