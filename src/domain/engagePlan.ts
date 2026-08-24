export const MAX_PLAN_SUBTASKS = 15
export const MAX_FIRST_LEVEL = 7

export interface EngagePlanStep {
  id: string
  title: string
  notes: string
  children: EngagePlanStep[]
}

export interface EngagePlanDraft {
  mainTitle: string
  mainNotes: string
  steps: EngagePlanStep[]
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asSteps(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function parseStep(entry: unknown, depth: number, takeId: () => string): EngagePlanStep | null {
  if (!entry || typeof entry !== 'object') return null
  const candidate = entry as { title?: unknown; notes?: unknown; children?: unknown; id?: unknown }
  const title = asText(candidate.title)
  if (!title) return null
  const id = asText(candidate.id) || takeId()
  const children = depth >= 2
    ? []
    : asSteps(candidate.children)
      .map((child) => parseStep(child, depth + 1, takeId))
      .filter((child): child is EngagePlanStep => child !== null)
  return {
    id,
    title,
    notes: asText(candidate.notes),
    children,
  }
}

export function countSubtasks(plan: EngagePlanDraft): number {
  return plan.steps.reduce((total, step) => total + 1 + step.children.length, 0)
}

export function emptyPlanFromTitle(title: string, notes = ''): EngagePlanDraft {
  return { mainTitle: title.trim(), mainNotes: notes, steps: [] }
}

export function sanitizeEngagePlan(raw: unknown, takeId: () => string = () => crypto.randomUUID()): EngagePlanDraft {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const parsed = asSteps(source.steps)
    .map((entry) => parseStep(entry, 1, takeId))
    .filter((step): step is EngagePlanStep => step !== null)
    .slice(0, MAX_FIRST_LEVEL)

  const steps: EngagePlanStep[] = []
  let remaining = MAX_PLAN_SUBTASKS
  for (const step of parsed) {
    if (remaining <= 0) break
    remaining -= 1
    const children = remaining <= 0 ? [] : step.children.slice(0, remaining)
    remaining -= children.length
    steps.push({ ...step, children })
  }

  return {
    mainTitle: asText(source.mainTitle),
    mainNotes: asText(source.mainNotes),
    steps,
  }
}

function withNotes(title: string, notes: string): string {
  const extra = notes.trim()
  return extra ? `${title}：${extra}` : title
}

export function formatChecklistItems(plan: EngagePlanDraft): string[] {
  const items: string[] = []
  for (const step of plan.steps) {
    const title = step.title.trim()
    if (!title) continue
    items.push(withNotes(title, step.notes))
    for (const child of step.children) {
      const childTitle = child.title.trim()
      if (!childTitle) continue
      items.push(withNotes(`${title} · ${childTitle}`, child.notes))
    }
  }
  return items
}

export function formatTaskTree(plan: EngagePlanDraft): Array<{
  title: string
  notes: string
  children: Array<{ title: string; notes: string }>
}> {
  return plan.steps
    .map((step) => ({
      title: step.title.trim(),
      notes: step.notes.trim(),
      children: step.children
        .map((child) => ({ title: child.title.trim(), notes: child.notes.trim() }))
        .filter((child) => child.title),
    }))
    .filter((step) => step.title)
}

export function formatPlanContent(plan: EngagePlanDraft, includeSteps: boolean): string {
  const lines: string[] = []
  if (plan.mainNotes) lines.push(plan.mainNotes)
  if (!includeSteps || plan.steps.length === 0) return lines.join('\n\n').trim()
  const items = formatChecklistItems(plan)
  if (items.length === 0) return lines.join('\n\n').trim()
  if (lines.length) lines.push('')
  for (const item of items) lines.push(`- [ ] ${item}`)
  return lines.join('\n').trim()
}

export function replaceStep(
  steps: EngagePlanStep[],
  stepId: string,
  patch: Partial<Pick<EngagePlanStep, 'title' | 'notes' | 'children'>>,
): EngagePlanStep[] {
  return steps.map((step) => {
    if (step.id === stepId) return { ...step, ...patch }
    return { ...step, children: replaceStep(step.children, stepId, patch) }
  })
}

export function removeStep(steps: EngagePlanStep[], stepId: string): EngagePlanStep[] {
  return steps
    .filter((step) => step.id !== stepId)
    .map((step) => ({ ...step, children: removeStep(step.children, stepId) }))
}

export function moveStep(steps: EngagePlanStep[], stepId: string, direction: -1 | 1): EngagePlanStep[] {
  const index = steps.findIndex((step) => step.id === stepId)
  if (index >= 0) {
    const next = index + direction
    if (next < 0 || next >= steps.length) return steps
    const copy = [...steps]
    const [item] = copy.splice(index, 1)
    copy.splice(next, 0, item)
    return copy
  }
  return steps.map((step) => ({ ...step, children: moveStep(step.children, stepId, direction) }))
}
