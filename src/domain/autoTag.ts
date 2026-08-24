import type { WorkspaceState } from './types'

export interface TopicUsage {
  name: string
  count: number
}

export interface AutoTagSuggestion {
  name: string
  reason: string
  reuse?: string
}

export interface AutoTagResult {
  existing: AutoTagSuggestion[]
  proposed: AutoTagSuggestion[]
}

export function normalizeTopicKey(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase('zh-CN')
    .replace(/\s+/g, '')
    .replace(/[·./（）()_\-—－]/g, '')
}

export function topicUsage(state: WorkspaceState): TopicUsage[] {
  const counts = new Map<string, number>()
  for (const item of Object.values(state.items)) {
    for (const topic of item.topics) {
      const name = topic.trim()
      if (!name) continue
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'zh-CN'))
}

function overlapRatio(left: string, right: string): number {
  if (!left || !right) return 0
  const letters = new Set(right)
  let hits = 0
  for (const character of left) {
    if (letters.has(character)) hits += 1
  }
  return hits / Math.max(left.length, right.length)
}

function sharedPrefixLength(left: string, right: string): number {
  let index = 0
  while (index < left.length && index < right.length && left[index] === right[index]) index += 1
  return index
}

export function matchExistingTopic(
  catalog: TopicUsage[],
  name: string,
): { name: string; kind: 'exact' | 'near' } | null {
  const key = normalizeTopicKey(name)
  if (!key) return null

  for (const topic of catalog) {
    if (normalizeTopicKey(topic.name) === key) return { name: topic.name, kind: 'exact' }
  }

  let best: { name: string; score: number } | null = null
  for (const topic of catalog) {
    const other = normalizeTopicKey(topic.name)
    if (!other) continue
    const contained = key.includes(other) || other.includes(key)
    const prefix = sharedPrefixLength(key, other)
    const overlap = overlapRatio(key, other)
    const near = (contained && Math.min(key.length, other.length) >= 2)
      || prefix >= 2
      || overlap >= 0.6
    if (!near) continue
    const score = (contained ? 3 : 0) + prefix + overlap
    if (!best || score > best.score) best = { name: topic.name, score }
  }
  return best ? { name: best.name, kind: 'near' } : null
}

function asSuggestion(entry: unknown): AutoTagSuggestion | null {
  if (!entry || typeof entry !== 'object') return null
  const candidate = entry as { name?: unknown; reason?: unknown }
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
  if (!name) return null
  return {
    name,
    reason: typeof candidate.reason === 'string' ? candidate.reason.trim() : '',
  }
}

function selectedKeys(selected: string[]): Set<string> {
  return new Set(selected.map(normalizeTopicKey).filter(Boolean))
}

export function sanitizeAutoTagResult(
  raw: { existing?: unknown; proposed?: unknown },
  catalog: TopicUsage[],
  selected: string[] = [],
): AutoTagResult {
  const already = selectedKeys(selected)
  const existing: AutoTagSuggestion[] = []
  const existingKeys = new Set<string>()

  function addExisting(suggestion: AutoTagSuggestion) {
    const matched = matchExistingTopic(catalog, suggestion.name)
    if (matched?.kind !== 'exact') return false
    const key = normalizeTopicKey(matched.name)
    if (already.has(key) || existingKeys.has(key) || existing.length >= 3) return true
    existingKeys.add(key)
    existing.push({ name: matched.name, reason: suggestion.reason })
    return true
  }

  for (const entry of Array.isArray(raw.existing) ? raw.existing : []) {
    const suggestion = asSuggestion(entry)
    if (suggestion) addExisting(suggestion)
  }

  const proposed: AutoTagSuggestion[] = []
  const proposedKeys = new Set<string>()
  for (const entry of Array.isArray(raw.proposed) ? raw.proposed : []) {
    const suggestion = asSuggestion(entry)
    if (!suggestion) continue
    const matched = matchExistingTopic(catalog, suggestion.name)
    if (matched?.kind === 'exact') {
      addExisting({ name: matched.name, reason: suggestion.reason })
      continue
    }
    if (proposed.length >= 2) continue
    const key = normalizeTopicKey(suggestion.name)
    if (!key || already.has(key) || existingKeys.has(key) || proposedKeys.has(key)) continue
    proposedKeys.add(key)
    proposed.push(matched?.kind === 'near'
      ? { name: suggestion.name, reason: suggestion.reason, reuse: matched.name }
      : suggestion)
  }

  return { existing, proposed }
}

export function mergeExistingTopics(topics: string[], existing: AutoTagSuggestion[]): string[] {
  const next = [...topics]
  const seen = selectedKeys(next)
  for (const suggestion of existing) {
    const key = normalizeTopicKey(suggestion.name)
    if (!key || seen.has(key)) continue
    next.push(suggestion.name)
    seen.add(key)
  }
  return next
}
