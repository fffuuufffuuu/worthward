import type { EngagePlanDraft } from '../domain/engagePlan'
import { countSubtasks, formatChecklistItems, formatPlanContent, formatTaskTree } from '../domain/engagePlan'
import type { ConfirmedEngagePlan, DomainEnv, TickTickCreateMode, TickTickExportReceipt, WorkspaceState } from '../domain/types'

const browserEnv: DomainEnv = {
  now: () => new Date().toISOString(),
  id: () => crypto.randomUUID(),
}

export function createModeOf(state: WorkspaceState): TickTickCreateMode {
  return state.settings.tickTickCreateMode === 'cli' ? 'cli' : 'deeplink'
}

export function buildTickTickUrl(input: {
  title: string
  description: string
  listName: string
  subtasks?: string[]
}): string {
  const parameters = new URLSearchParams({
    title: input.title,
    content: input.description,
    list: input.listName,
  })
  if (input.subtasks?.length) parameters.set('subtasks', input.subtasks.join('\n'))
  return `ticktick://x-callback-url/v1/add_task?${parameters.toString()}`
}

export function isActiveTickTickReceipt(receipt: TickTickExportReceipt): boolean {
  return receipt.status === 'handed_off_unverified' || receipt.status === 'created_with_plan'
}

export function findActiveTickTickReceipt(state: WorkspaceState, itemId: string): TickTickExportReceipt | undefined {
  return [...state.exportReceipts]
    .reverse()
    .find((receipt) => receipt.itemId === itemId && isActiveTickTickReceipt(receipt))
}

function toConfirmedPlan(plan: EngagePlanDraft): ConfirmedEngagePlan {
  return {
    mainTitle: plan.mainTitle,
    mainNotes: plan.mainNotes,
    steps: plan.steps.map((step) => ({
      id: step.id,
      title: step.title,
      notes: step.notes,
      children: step.children.map((child) => ({
        id: child.id,
        title: child.title,
        notes: child.notes,
      })),
    })),
  }
}

export function buildTickTickWrite(
  state: WorkspaceState,
  itemId: string,
  options: { mode?: 'main' | 'tree'; plan?: EngagePlanDraft; channel?: TickTickCreateMode } = {},
) {
  const item = state.items[itemId]
  if (!item) throw new Error('卡片不存在')
  const mode = options.mode ?? 'main'
  const plan = options.plan
  const channel = options.channel ?? createModeOf(state)
  const title = plan?.mainTitle.trim() || item.title
  const includeChecklistInContent = channel !== 'cli' && mode === 'tree'
  const description = plan
    ? formatPlanContent(plan, includeChecklistInContent)
    : item.description
  const items = mode === 'tree' && plan && channel !== 'cli' ? formatChecklistItems(plan) : []
  const steps = mode === 'tree' && plan && channel === 'cli' ? formatTaskTree(plan) : []
  return {
    title,
    description,
    listName: state.settings.tickTickListName,
    items,
    steps,
    mode,
    channel,
    plan,
  }
}

export function prepareTickTickHandoff(
  state: WorkspaceState,
  itemId: string,
  env: DomainEnv = browserEnv,
  options: {
    force?: boolean
    mode?: 'main' | 'tree'
    plan?: EngagePlanDraft
    channel?: TickTickCreateMode
    taskId?: string
  } = {},
): {
  state: WorkspaceState
  receipt: TickTickExportReceipt
  alreadyHandedOff: boolean
  write: ReturnType<typeof buildTickTickWrite>
} {
  const existing = findActiveTickTickReceipt(state, itemId)
  if (existing && !options.force) {
    return {
      state,
      receipt: existing,
      alreadyHandedOff: true,
      write: buildTickTickWrite(state, itemId, options),
    }
  }

  const write = buildTickTickWrite(state, itemId, options)
  const receipt: TickTickExportReceipt = {
    exportId: env.id(),
    itemId,
    status: write.mode === 'tree' ? 'created_with_plan' : 'handed_off_unverified',
    createdAt: env.now(),
    url: write.channel === 'cli'
      ? undefined
      : buildTickTickUrl({
        title: write.title,
        description: write.description,
        listName: write.listName,
        subtasks: write.mode === 'tree' ? write.items : undefined,
      }),
    taskId: options.taskId,
    channel: write.channel,
    mode: write.mode,
    plan: write.mode === 'tree' && write.plan ? toConfirmedPlan(write.plan) : undefined,
  }
  return {
    state: { ...state, exportReceipts: [...state.exportReceipts, receipt] },
    receipt,
    alreadyHandedOff: false,
    write,
  }
}

export function describePlanWrite(
  plan: EngagePlanDraft,
  listName: string,
  createMode: TickTickCreateMode = 'deeplink',
): string {
  const subtasks = countSubtasks(plan)
  const title = plan.mainTitle.trim() || '未命名'
  if (createMode === 'cli') {
    return `将通过 dida CLI 在清单「${listName}」创建主任务「${title}」，并把 ${subtasks} 个步骤写成子任务。`
  }
  return `将在清单「${listName}」创建主任务「${title}」，并把 ${subtasks} 个步骤写成任务说明里的勾选列表。本机深链无法创建独立检查事项或子任务。`
}

export function describeReceipt(receipt: TickTickExportReceipt): string {
  if (receipt.channel === 'cli') {
    return receipt.status === 'created_with_plan'
      ? '已通过 CLI 写入滴答任务和子任务'
      : '已通过 CLI 创建滴答主任务'
  }
  return receipt.status === 'created_with_plan'
    ? '已保存执行计划并打开滴答创建入口'
    : '已发起滴答创建，结果待确认'
}
