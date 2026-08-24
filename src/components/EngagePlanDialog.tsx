import { useRef, useState, type ReactNode } from 'react'
import type { AiClient } from '../data/aiClient'
import {
  countSubtasks,
  emptyPlanFromTitle,
  moveStep,
  removeStep,
  replaceStep,
  sanitizeEngagePlan,
  type EngagePlanDraft,
  type EngagePlanStep,
} from '../domain/engagePlan'
import type { AttentionItem, TickTickCreateMode } from '../domain/types'
import { describePlanWrite } from '../integrations/ticktick'

interface EngagePlanDialogProps {
  item: AttentionItem
  listName: string
  hasReceipt: boolean
  createMode?: TickTickCreateMode
  aiClient: AiClient
  onOpenSettings?: () => void
  onClose: () => void
  onCreateMain: (plan: EngagePlanDraft) => void | Promise<void>
  onCreateTree: (plan: EngagePlanDraft) => void | Promise<void>
}

type StatusKind = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'missing_key'

function statusText(kind: StatusKind): string {
  if (kind === 'ready') return '已生成可编辑计划'
  if (kind === 'empty') return '没有生成步骤，可手工补充或只创建主任务'
  if (kind === 'error') return '拆解失败，可重试或手工编辑'
  if (kind === 'missing_key') return '尚未保存 API 密钥。'
  return ''
}

export function EngagePlanDialog({
  item,
  listName,
  hasReceipt,
  createMode = 'deeplink',
  aiClient,
  onOpenSettings,
  onClose,
  onCreateMain,
  onCreateTree,
}: EngagePlanDialogProps) {
  const [plan, setPlan] = useState<EngagePlanDraft>(() => emptyPlanFromTitle(item.title, item.description))
  const [status, setStatus] = useState<StatusKind>('idle')
  const [confirmTree, setConfirmTree] = useState(false)
  const [writing, setWriting] = useState(false)
  const requestId = useRef(0)
  const itemRef = useRef(item)
  const planRef = useRef(plan)
  itemRef.current = item
  planRef.current = plan

  async function generate() {
    const id = ++requestId.current
    const snapshot = item.id
    const draft = planRef.current
    const mainTitle = draft.mainTitle.trim() || item.title
    const mainNotes = draft.mainNotes.trim() || item.description
    setStatus('loading')
    setConfirmTree(false)
    const result = await aiClient.suggestEngagePlan({
      title: mainTitle,
      description: mainNotes,
      board: item.board,
      category: item.category,
      topics: item.topics,
      mainTitle,
      mainNotes,
    })
    if (id !== requestId.current || itemRef.current.id !== snapshot) return
    if (!result.ok) {
      setStatus(result.code === 'missing_key' || result.code === 'not_configured' ? 'missing_key' : 'error')
      return
    }
    const next = sanitizeEngagePlan({
      mainTitle: result.mainTitle,
      mainNotes: result.mainNotes,
      steps: result.steps,
    })
    setPlan((current) => ({
      mainTitle: current.mainTitle.trim() || next.mainTitle || item.title,
      mainNotes: current.mainNotes.trim() || next.mainNotes,
      steps: next.steps,
    }))
    setStatus(next.steps.length ? 'ready' : 'empty')
  }

  function withId(): string {
    return crypto.randomUUID()
  }

  function updatePlan(patch: Partial<EngagePlanDraft>) {
    setPlan((current) => ({ ...current, ...patch }))
  }

  function addFirstLevel() {
    setPlan((current) => ({
      ...current,
      steps: [...current.steps, { id: withId(), title: '', notes: '', children: [] }],
    }))
  }

  function addChild(parentId: string) {
    setPlan((current) => ({
      ...current,
      steps: current.steps.map((step) => (
        step.id === parentId
          ? { ...step, children: [...step.children, { id: withId(), title: '', notes: '', children: [] }] }
          : step
      )),
    }))
  }

  async function writeMain() {
    setWriting(true)
    try {
      await onCreateMain({ ...plan, mainTitle })
    } finally {
      setWriting(false)
    }
  }

  async function writeTree() {
    setWriting(true)
    try {
      await onCreateTree({ ...plan, mainTitle })
    } finally {
      setWriting(false)
    }
  }

  const subtasks = countSubtasks(plan)
  const mainTitle = plan.mainTitle.trim() || item.title

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog plan-dialog" role="dialog" aria-modal="true" aria-label="执行计划">
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">ENGAGE / PLAN</p>
            <h2>执行计划</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭执行计划">×</button>
        </div>
        {hasReceipt && <p className="handoff-status"><span />这张卡片已经发起过滴答创建。重新创建不会更新或删除旧任务，可能形成重复。</p>}
        <label>主任务标题<input value={plan.mainTitle} onChange={(event) => updatePlan({ mainTitle: event.target.value })} /></label>
        <label>主任务说明<textarea rows={3} value={plan.mainNotes} onChange={(event) => updatePlan({ mainNotes: event.target.value })} /></label>
        <div className="ai-topic-actions">
          <button type="button" className="secondary-button" onClick={generate} disabled={status === 'loading'}>
            AI 生成任务拆解
          </button>
          {status === 'loading' && (
            <span role="status" className="plan-ai-status" aria-label="AI 分析中" aria-live="polite">
              <span className="plan-ai-spinner" aria-hidden="true" />
            </span>
          )}
          {status !== 'idle' && status !== 'loading' && <p role="status" className="subtle">{statusText(status)}</p>}
          {status === 'missing_key' && onOpenSettings && (
            <button type="button" className="text-button" onClick={onOpenSettings}>打开 AI 设置</button>
          )}
        </div>
        <div className="plan-steps-heading">
          <h3>子任务</h3>
          <button type="button" className="plan-add-circle" aria-label="新增一级任务" title="新增一级任务" onClick={addFirstLevel}>
            <IconPlus />
          </button>
        </div>
        <ul className="plan-step-list">
          {plan.steps.map((step, index) => (
            <PlanStepEditor
              key={step.id}
              step={step}
              index={index}
              total={plan.steps.length}
              onChange={(patch) => setPlan((current) => ({ ...current, steps: replaceStep(current.steps, step.id, patch) }))}
              onRemove={() => setPlan((current) => ({ ...current, steps: removeStep(current.steps, step.id) }))}
              onMove={(direction) => setPlan((current) => ({ ...current, steps: moveStep(current.steps, step.id, direction) }))}
              onAddChild={() => addChild(step.id)}
              onChangeChild={(childId, patch) => setPlan((current) => ({ ...current, steps: replaceStep(current.steps, childId, patch) }))}
              onRemoveChild={(childId) => setPlan((current) => ({ ...current, steps: removeStep(current.steps, childId) }))}
            />
          ))}
        </ul>
        {confirmTree ? (
          <div className="plan-confirm" role="group" aria-label="确认写入滴答">
            <p>{describePlanWrite({ ...plan, mainTitle }, listName, createMode)}</p>
            <div className="dialog-actions">
              <button className="secondary-button" onClick={() => setConfirmTree(false)} disabled={writing}>返回修改</button>
              <button className="primary-button" onClick={writeTree} disabled={writing}>确认写入</button>
            </div>
          </div>
        ) : (
          <div className="dialog-actions engage-actions">
            <button className="secondary-button" onClick={onClose} disabled={writing}>不创建滴答任务</button>
            <button className="secondary-button" onClick={writeMain} disabled={writing}>
              {hasReceipt ? '重新创建主任务' : '只创建主任务'}
            </button>
            <button className="primary-button" disabled={subtasks === 0 || writing} onClick={() => setConfirmTree(true)}>
              {hasReceipt ? '重新创建主任务和子任务' : '创建主任务和子任务'}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

function PlanIconButton({
  label,
  disabled,
  onClick,
  round,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  round?: boolean
  children: ReactNode
}) {
  return (
    <button type="button" className={round ? 'plan-add-circle' : 'plan-icon-button'} aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}

function IconUp() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M3.5 9.5 8 5l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconDown() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M3.5 6.5 8 11l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M3 4.5h10M6 4.5V3h4v1.5M5.2 4.5l.5 8h4.6l.5-8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconPlus() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M8 3.5v9M3.5 8h9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function PlanStepEditor({
  step,
  index,
  total,
  onChange,
  onRemove,
  onMove,
  onAddChild,
  onChangeChild,
  onRemoveChild,
}: {
  step: EngagePlanStep
  index: number
  total: number
  onChange: (patch: Partial<EngagePlanStep>) => void
  onRemove: () => void
  onMove: (direction: -1 | 1) => void
  onAddChild: () => void
  onChangeChild: (childId: string, patch: Partial<EngagePlanStep>) => void
  onRemoveChild: (childId: string) => void
}) {
  return (
    <li className="plan-step">
      <div className="plan-step-row">
        <input aria-label={`一级任务 ${index + 1}`} value={step.title} onChange={(event) => onChange({ title: event.target.value })} />
        <span className="plan-step-actions">
          <PlanIconButton label="上移" disabled={index === 0} onClick={() => onMove(-1)}><IconUp /></PlanIconButton>
          <PlanIconButton label="下移" disabled={index === total - 1} onClick={() => onMove(1)}><IconDown /></PlanIconButton>
          <PlanIconButton label="删除" onClick={onRemove}><IconTrash /></PlanIconButton>
        </span>
      </div>
      <input className="plan-step-notes" aria-label={`一级任务说明 ${index + 1}`} value={step.notes} placeholder="说明（可选）" onChange={(event) => onChange({ notes: event.target.value })} />
      <ul>
        {step.children.map((child, childIndex) => (
          <li key={child.id} className="plan-step-child">
            <input aria-label={`二级任务 ${index + 1}-${childIndex + 1}`} value={child.title} onChange={(event) => onChangeChild(child.id, { title: event.target.value })} />
            <PlanIconButton label="删除" onClick={() => onRemoveChild(child.id)}><IconTrash /></PlanIconButton>
          </li>
        ))}
      </ul>
      <PlanIconButton label="新增二级任务" round onClick={onAddChild}><IconPlus /></PlanIconButton>
    </li>
  )
}
