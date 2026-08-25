import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AiClient } from '../data/aiClient'
import { archiveItem, countByStage, moveItem } from '../domain/workspace'
import {
  REVIEW_STEP_COUNT,
  advanceWeeklyReview,
  completeWeeklyReview,
  discardWeeklyReview,
  normalizeReviewStep,
  patchWeeklyReview,
  patchReviewComboDraft,
  recordReviewAdjustment,
} from '../domain/review'
import {
  MAX_REVIEW_CANDIDATES,
  WIP_FULL_REMINDER,
  applyReviewCombo,
  confirmedAdjustmentFrom,
  emptyComboPlan,
  isDisplacementSelected,
  isPromotionSelected,
  itemsInStage,
  mergeReviewComboDraft,
  projectedWip,
  sanitizeReviewSuggestion,
  selectRadarCandidates,
  type ReviewComboPlan,
  type ReviewPlanKind,
} from '../domain/reviewPlan'
import type { AttentionItem, Stage, StageChangeEvent, WorkspaceState } from '../domain/types'

const reviewSteps = [
  ['哪些值得我关注？', '选择值得进入 Focus 的对象；已满时先替换或降级。'],
  ['哪些值得我投入？', '确认近期真正值得认真关注的事项，并决定是否进入 Engage。'],
  ['这些任务已经告一段落了吗？', '看看正在 Engage 的事项是否该进入 Outcome，或退回 Focus。'],
  ['这些成果归档了吗？', 'Outcome 里已完成的结果可以归档收束。'],
  ['很久没动作，还值得关注吗？', '让长期未动的事项降级、停止或重新安排。'],
  ['注意力梳理成果', '对照梳理前后的容量与这次调整，看看哪些事项真正前进了、哪些该停下。'],
] as const

const attentionDirectionHint = '这里可以填写近阶段感兴趣或想要发展的方向。'
const attentionDirectionNote = '写出近期关注的方向，推荐卡片会更聚焦。没想好也可留空。'

const comboPaneCopy = {
  radar_focus: {
    promote: '建议进入 Focus',
    displace: '当前 Focus，可降回 Radar',
  },
  focus_engage: {
    promote: '建议进入 Engage',
    displace: '当前 Engage，可退回 Focus',
  },
} as const

function titleOf(item?: AttentionItem) {
  return item?.title || '未命名'
}

function ReviewStatRow({ label, count }: { label: string; count: number }) {
  return (
    <li className="review-stat-row">
      <span className="review-stat-label">{label}</span>
      <span className="review-stat-value"><b>{count}</b><small>张</small></span>
    </li>
  )
}

const stalledColumnTone = {
  Radar: 'review-stalled-radar',
  Focus: 'review-stalled-focus',
  Engage: 'review-stalled-engage',
} as const

function ReviewItemRow({
  item,
  onOpen,
  selected = false,
  children,
}: {
  item: AttentionItem
  onOpen?: (item: AttentionItem) => void
  selected?: boolean
  children?: ReactNode
}) {
  const meta = `${item.board === 'create' ? '创造' : '探索'} · ${item.category ?? '未分类'}`
  return (
    <li className={`review-item${selected ? ' review-item-selected' : ''}`}>
      <div className="review-item-copy">
        {onOpen ? (
          <button type="button" className="review-item-open" onClick={() => onOpen(item)} aria-label={`打开卡片：${item.title}`}>
            <strong>{item.title}</strong>
            <small>{meta}</small>
          </button>
        ) : (
          <>
            <strong>{item.title}</strong>
            <small>{meta}</small>
          </>
        )}
      </div>
      {children ? <div className="review-item-actions">{children}</div> : null}
    </li>
  )
}

function stalledInStage(
  items: AttentionItem[],
  stage: Stage,
  limit: number,
  nowMs: number,
) {
  return items.filter((item) => {
    const days = Math.floor((nowMs - new Date(item.lastTouchedAt).getTime()) / 86_400_000)
    return days >= limit
  })
}

function summarizeReviewSession(state: WorkspaceState, startedAt: string) {
  const moves = state.events.filter((event): event is StageChangeEvent =>
    event.type === 'stage_changed' && event.occurredAt >= startedAt,
  )
  const count = (from: Stage | null, to: Stage) =>
    moves.filter((event) => event.fromStage === from && event.toStage === to).length
  const stopped = moves.filter((event) => event.toStage === 'archive' && event.fromStage !== 'outcome').length
  return {
    intoFocus: count('radar', 'focus'),
    intoEngage: count('focus', 'engage'),
    intoOutcome: count('engage', 'outcome'),
    archivedFromOutcome: count('outcome', 'archive'),
    backToRadar: count('focus', 'radar') + count('engage', 'radar'),
    backToFocus: count('engage', 'focus'),
    stopped,
    totalMoves: moves.length,
  }
}

export function WeeklyReviewOverlay({
  workspace,
  reviewId,
  aiClient,
  onChange,
  onClose,
  onOpenItem,
  onOpenSettings,
}: {
  workspace: WorkspaceState
  reviewId: string
  aiClient: AiClient
  onChange: (state: WorkspaceState) => void
  onClose: () => void
  onOpenItem?: (item: AttentionItem) => void
  onOpenSettings?: () => void
}) {
  const review = workspace.reviews.find((entry) => entry.id === reviewId)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'missing_key'>('idle')
  const [message, setMessage] = useState('')
  const [wantOverride, setWantOverride] = useState(false)
  const [exitOpen, setExitOpen] = useState(false)
  const requestId = useRef(0)
  const mainRef = useRef<HTMLElement>(null)
  const focusCount = countByStage(workspace, 'focus')
  const engageCount = countByStage(workspace, 'engage')
  const focusLimit = workspace.settings.focusWipLimit
  const engageLimit = workspace.settings.engageWipLimit

  const radar = useMemo(() => itemsInStage(workspace, 'radar'), [workspace])
  const focus = useMemo(() => itemsInStage(workspace, 'focus'), [workspace])
  const engage = useMemo(() => itemsInStage(workspace, 'engage'), [workspace])
  const outcome = useMemo(() => itemsInStage(workspace, 'outcome'), [workspace])
  const radarExtraIds = review?.comboDrafts?.radar_focus?.extraIds ?? []
  const candidates = useMemo(
    () => selectRadarCandidates(workspace, radarExtraIds),
    [workspace, radarExtraIds],
  )
  const excludedRadar = radar.filter((item) => !candidates.selected.some((entry) => entry.id === item.id))
  const stalledRadar = stalledInStage(radar, 'radar', workspace.settings.stalledDays.radar, Date.now())
  const stalledFocus = stalledInStage(focus, 'focus', workspace.settings.stalledDays.focus, Date.now())
  const stalledEngage = stalledInStage(engage, 'engage', workspace.settings.stalledDays.engage, Date.now())

  useEffect(() => {
    const node = mainRef.current
    if (!node) return
    if (typeof node.scrollTo === 'function') node.scrollTo({ top: 0 })
    else node.scrollTop = 0
  }, [review?.step])

  useEffect(() => {
    if (!review || review.status !== 'in_progress') return
    const normalized = normalizeReviewStep(review.step)
    if (normalized === review.step) return
    onChange(advanceWeeklyReview(workspace, reviewId, normalized).state)
  }, [onChange, review, reviewId, workspace])

  if (!review) return null
  const step = normalizeReviewStep(review.step)
  const index = step - 1
  const [title, copy] = reviewSteps[index]
  const finish = index === reviewSteps.length - 1
  const comboKind: ReviewPlanKind | null = step === 1 ? 'radar_focus' : step === 2 ? 'focus_engage' : null
  const combo = comboKind ? review.comboDrafts?.[comboKind] ?? null : null
  const sourceItems = comboKind === 'radar_focus' ? candidates.selected : comboKind === 'focus_engage' ? focus : []
  const occupyingItems = comboKind === 'radar_focus' ? focus : comboKind === 'focus_engage' ? engage : []
  const projection = combo ? projectedWip(workspace, combo) : null
  const rankingActive = comboKind === 'radar_focus' && candidates.total > MAX_REVIEW_CANDIDATES

  function updateComboDraft(
    kind: ReviewPlanKind,
    updater: (current: ReviewComboPlan | null) => ReviewComboPlan | null,
  ) {
    const currentReview = workspace.reviews.find((entry) => entry.id === reviewId)
    if (!currentReview) return
    const current = currentReview.comboDrafts?.[kind] ?? null
    onChange(patchReviewComboDraft(workspace, reviewId, kind, updater(current)).state)
  }

  function addRadarExtra(itemId: string) {
    const currentReview = workspace.reviews.find((entry) => entry.id === reviewId)
    if (!currentReview) return
    const current = currentReview.comboDrafts?.radar_focus ?? null
    const extraIds = current?.extraIds ?? []
    if (extraIds.includes(itemId)) return
    const nextExtraIds = [...extraIds, itemId]
    if (current) {
      onChange(patchReviewComboDraft(workspace, reviewId, 'radar_focus', { ...current, extraIds: nextExtraIds }).state)
      return
    }
    onChange(patchReviewComboDraft(
      workspace,
      reviewId,
      'radar_focus',
      emptyComboPlan('radar_focus', candidates.selected.length, candidates.total, nextExtraIds),
    ).state)
  }

  function move(itemId: string, target: Stage, options: { overrideWip?: boolean } = {}) {
    const result = target === 'archive'
      ? archiveItem(workspace, itemId, 'drop')
      : moveItem(workspace, itemId, target, options)
    if (!result.ok) {
      setMessage(result.reason === 'wip_limit' ? `目标阶段已满（${result.current}/${result.limit}）。` : '无法移动这张卡片。')
      return
    }
    setMessage('')
    onChange(result.state)
  }

  function goToStep(nextStep: number) {
    setWantOverride(false)
    setMessage('')
    onChange(advanceWeeklyReview(workspace, reviewId, nextStep).state)
  }

  async function generate() {
    if (!comboKind) return
    const id = ++requestId.current
    setStatus('loading')
    setMessage('')
    const extraIds = comboKind === 'radar_focus' ? radarExtraIds : []
    const result = await aiClient.suggestReviewPlan({
      kind: comboKind,
      attentionDirection: review?.attentionDirection ?? '',
      candidateIds: comboKind === 'radar_focus' ? candidates.selected.map((item) => item.id) : undefined,
      extraIds,
    })
    if (id !== requestId.current) return
    if (!result.ok) {
      setStatus(result.code === 'missing_key' || result.code === 'not_configured' ? 'missing_key' : 'error')
      setMessage(result.error || '建议失败，可继续手工选择。')
      return
    }
    onChange(patchReviewComboDraft(
      workspace,
      reviewId,
      comboKind,
      mergeReviewComboDraft(
        workspace.reviews.find((entry) => entry.id === reviewId)?.comboDrafts?.[comboKind] ?? null,
        sanitizeReviewSuggestion(
          result.suggestion,
          workspace,
          comboKind,
          extraIds,
          new Date().toISOString(),
          comboKind === 'radar_focus' ? candidates.selected.map((item) => item.id) : undefined,
        ),
      ),
    ).state)
    setStatus('idle')
  }

  function togglePromotion(itemId: string) {
    if (!comboKind) return
    updateComboDraft(comboKind, (current) => {
      const base = current ?? emptyComboPlan(comboKind, candidates.selected.length, candidates.total, radarExtraIds)
      const exists = base.promotions.some((entry) => entry.itemId === itemId)
      return {
        ...base,
        kind: comboKind,
        promotions: exists
          ? base.promotions.map((entry) => entry.itemId === itemId ? { ...entry, selected: !entry.selected } : entry)
          : [...base.promotions, { itemId, evidence: '', relation: '', risk: '', selected: true }],
      }
    })
  }

  function toggleDisplacement(itemId: string) {
    if (!comboKind) return
    const to = comboKind === 'focus_engage' ? 'focus' : 'radar'
    updateComboDraft(comboKind, (current) => {
      const base = current ?? emptyComboPlan(comboKind, candidates.selected.length, candidates.total, radarExtraIds)
      const exists = base.displacements.some((entry) => entry.itemId === itemId)
      return {
        ...base,
        kind: comboKind,
        displacements: exists
          ? base.displacements.map((entry) => entry.itemId === itemId ? { ...entry, selected: !entry.selected } : entry)
          : [...base.displacements, { itemId, to, reason: '', selected: true }],
      }
    })
  }

  function confirmCombo(overrideWip = false) {
    if (!combo || !comboKind) return
    const applied = applyReviewCombo(workspace, { ...combo, kind: comboKind }, { overrideWip })
    if (!applied.ok) {
      if (applied.reason === 'wip_limit') {
        setWantOverride(true)
        setMessage(`确认后将超过上限（${applied.current}/${applied.limit}）。`)
        return
      }
      setMessage('这组调整无法一次完成，原组合保持不变。')
      return
    }
    const recorded = recordReviewAdjustment(
      applied.state,
      reviewId,
      confirmedAdjustmentFrom(combo, overrideWip, new Date().toISOString()),
    )
    onChange(patchReviewComboDraft(recorded.state, reviewId, comboKind, null).state)
    setWantOverride(false)
    setMessage('已保存这一步的组合调整。')
  }

  const focusOver = focusCount > focusLimit
  const engageOver = engageCount > engageLimit
  const focusFull = focusCount >= focusLimit
  const engageFull = engageCount >= engageLimit
  const full = focusFull || engageFull
  const sessionStats = review
    ? summarizeReviewSession(workspace, review.startedAt)
    : null

  return (
    <div className="review-overlay" role="dialog" aria-modal="true" aria-labelledby="review-title">
      <div className="review-progress"><span style={{ width: `${step / REVIEW_STEP_COUNT * 100}%` }} /></div>
      <div className="review-top">
        <span>{step} / {REVIEW_STEP_COUNT}</span>
        <button className="icon-button" onClick={() => setExitOpen(true)} aria-label="关闭注意力梳理">×</button>
      </div>
      <div className="review-body">
        <aside className="review-sidebar" aria-label="回顾上下文">
          <label>
            近期关注方向
            <textarea
              rows={5}
              aria-label="近期关注方向"
              value={review.attentionDirection}
              placeholder={attentionDirectionHint}
              onChange={(event) => onChange(patchWeeklyReview(workspace, reviewId, { attentionDirection: event.target.value }).state)}
            />
          </label>
          <p className="review-sidebar-note">{attentionDirectionNote}</p>
          <div className="review-wip-meters" aria-label="当前容量">
            <div className={`review-wip-meter${focusOver ? ' over' : focusFull ? ' full' : ''}`}>
              <small>Focus</small>
              <strong>{focusCount}<span>/{focusLimit}</span></strong>
              {focusOver ? <em>已超限</em> : focusFull ? <em>已满</em> : null}
            </div>
            <div className={`review-wip-meter${engageOver ? ' over' : engageFull ? ' full' : ''}`}>
              <small>Engage</small>
              <strong>{engageCount}<span>/{engageLimit}</span></strong>
              {engageOver ? <em>已超限</em> : engageFull ? <em>已满</em> : null}
            </div>
          </div>
          {full && <p className="review-wip-warning">{WIP_FULL_REMINDER}</p>}
        </aside>
        <section className="review-main" ref={mainRef}>
          <p className="eyebrow">WEEKLY ATTENTION REVIEW</p>
          <h2 id="review-title">{title}</h2>
          <p>{copy}</p>

          {comboKind && (
            <div className="review-combo">
              <div className="ai-topic-actions">
                <button type="button" className="secondary-button" onClick={generate} disabled={status === 'loading'}>
                  生成 AI 建议
                </button>
                {status === 'loading' && <span role="status" className="plan-ai-status" aria-label="AI 分析中"><span className="plan-ai-spinner" aria-hidden="true" /></span>}
                {status === 'missing_key' && onOpenSettings && <button type="button" className="text-button" onClick={onOpenSettings}>打开 AI 设置</button>}
              </div>
              {comboKind === 'radar_focus' && (
                <p className="subtle">
                  本次分析 {candidates.selected.length}/{candidates.total} 张 Radar 卡片。
                  {rankingActive
                    ? ' 候选已按近期触达、主题与方向相关度重排；改方向会更新这份名单。'
                    : ` Radar 不超过 ${MAX_REVIEW_CANDIDATES} 张时按最近触达时间排列。`}
                </p>
              )}
              {combo?.summary && <p className="review-summary-text">{combo.summary}</p>}
              <div className="review-split">
                <section className="review-split-pane review-pane-promote" aria-label="晋级候选">
                  <p className="review-pane-kicker">晋级</p>
                  <h3>{comboKind ? comboPaneCopy[comboKind].promote : ''}</h3>
                  <ul className="review-list">
                    {sourceItems.map((item) => (
                      <ReviewItemRow
                        key={item.id}
                        item={item}
                        onOpen={onOpenItem}
                        selected={isPromotionSelected(combo, item.id)}
                      >
                        <label className="review-check">
                          <input
                            type="checkbox"
                            checked={isPromotionSelected(combo, item.id)}
                            onChange={() => togglePromotion(item.id)}
                          />
                          晋级
                        </label>
                      </ReviewItemRow>
                    ))}
                    {!sourceItems.length && <li className="subtle">这一侧暂时没有候选。</li>}
                  </ul>
                  {combo?.promotions.filter((entry) => entry.selected && (entry.evidence || entry.risk)).map((entry) => (
                    <p key={entry.itemId} className="subtle">
                      {titleOf(workspace.items[entry.itemId])}：{entry.evidence} {entry.relation && `关系：${entry.relation}`} {entry.risk && `可能不适合：${entry.risk}`}
                    </p>
                  ))}
                </section>
                <section className="review-split-pane review-pane-displace" aria-label="让位候选">
                  <p className="review-pane-kicker">让位</p>
                  <h3>{comboKind ? comboPaneCopy[comboKind].displace : ''}</h3>
                  <ul className="review-list">
                    {occupyingItems.map((item) => (
                      <ReviewItemRow
                        key={item.id}
                        item={item}
                        onOpen={onOpenItem}
                        selected={isDisplacementSelected(combo, item.id)}
                      >
                        <label className="review-check">
                          <input
                            type="checkbox"
                            checked={isDisplacementSelected(combo, item.id)}
                            onChange={() => toggleDisplacement(item.id)}
                          />
                          让位
                        </label>
                      </ReviewItemRow>
                    ))}
                    {!occupyingItems.length && <li className="subtle">这一层目前是空的。</li>}
                  </ul>
                </section>
              </div>
              {comboKind === 'radar_focus' && excludedRadar.length > 0 && (
                <details className="review-extras">
                  <summary>补充其他 Radar 候选</summary>
                  <ul className="review-list">
                    {excludedRadar.map((item) => (
                      <ReviewItemRow key={item.id} item={item} onOpen={onOpenItem}>
                        <button className="text-button" onClick={() => addRadarExtra(item.id)}>加入分析</button>
                      </ReviewItemRow>
                    ))}
                  </ul>
                </details>
              )}
              {projection && <p className="subtle">确认后 Focus {projection.focus}/{focusLimit}，Engage {projection.engage}/{engageLimit}。</p>}
              <div className="dialog-actions">
                <button className="primary-button" onClick={() => confirmCombo(wantOverride)} disabled={!combo || (!combo.promotions.some((entry) => entry.selected) && !combo.displacements.some((entry) => entry.selected))}>
                  {wantOverride ? '任性确认' : '确认移动'}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <ul className="review-list">
              {engage.map((item) => (
                <ReviewItemRow key={item.id} item={item} onOpen={onOpenItem}>
                  <button type="button" className="text-button review-action-displace" onClick={() => move(item.id, 'focus')}>退回 Focus</button>
                  <button type="button" className="text-button review-action-promote" onClick={() => move(item.id, 'outcome')}>进入 Outcome</button>
                </ReviewItemRow>
              ))}
              {!engage.length && <li className="subtle">当前没有 Engage 卡片。</li>}
            </ul>
          )}

          {step === 4 && (
            <ul className="review-list">
              {outcome.map((item) => (
                <ReviewItemRow key={item.id} item={item} onOpen={onOpenItem}>
                  <button type="button" className="text-button review-action-promote" onClick={() => onChange(archiveItem(workspace, item.id, 'archive').state)}>归档</button>
                </ReviewItemRow>
              ))}
              {!outcome.length && <li className="subtle">没有待复盘的结果。</li>}
            </ul>
          )}

          {step === 5 && (
            <div className="review-stalled-grid">
              {([
                ['Radar', stalledRadar, workspace.settings.stalledDays.radar] as const,
                ['Focus', stalledFocus, workspace.settings.stalledDays.focus] as const,
                ['Engage', stalledEngage, workspace.settings.stalledDays.engage] as const,
              ]).map(([label, items, days]) => (
                <section
                  key={label}
                  className={`review-stalled-column ${stalledColumnTone[label]}`}
                  aria-label={`${label} 停滞`}
                >
                  <p className="review-stalled-kicker">{label}</p>
                  <h3>停滞项<small>≥{days} 天未触达</small></h3>
                  <ul className="review-list">
                    {items.map((item) => (
                      <ReviewItemRow key={item.id} item={item} onOpen={onOpenItem}>
                        {item.stage === 'focus' && (
                          <button type="button" className="text-button review-action-displace" onClick={() => move(item.id, 'radar')}>移回 Radar</button>
                        )}
                        {item.stage === 'engage' && (
                          <button type="button" className="text-button review-action-displace" onClick={() => move(item.id, 'focus')}>移回 Focus</button>
                        )}
                        <button type="button" className="text-button review-action-stop" onClick={() => move(item.id, 'archive')}>停止关注</button>
                      </ReviewItemRow>
                    ))}
                    {!items.length && <li className="subtle">这一阶段没有停滞项。</li>}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {step === REVIEW_STEP_COUNT && sessionStats && (
            <div className="review-finish">
              <p className="subtle">
                对照梳理开始与现在的容量，看看这次注意力真正流向了哪里。
              </p>
              <div className="review-finish-meters">
                <div className="review-finish-meter review-finish-meter-focus">
                  <small>Focus</small>
                  <strong>{review.startSnapshot.focus} → {focusCount}</strong>
                  <span>上限 {focusLimit}</span>
                </div>
                <div className="review-finish-meter review-finish-meter-engage">
                  <small>Engage</small>
                  <strong>{review.startSnapshot.engage} → {engageCount}</strong>
                  <span>上限 {engageLimit}</span>
                </div>
              </div>
              <div className="review-finish-stats-grid">
                <section className="review-finish-stats-column review-pane-promote" aria-label="前进与收束">
                  <p className="review-pane-kicker">前进</p>
                  <h3>前进与收束</h3>
                  <ul className="review-finish-stats">
                    <ReviewStatRow label="进入 Focus" count={sessionStats.intoFocus} />
                    <ReviewStatRow label="进入 Engage" count={sessionStats.intoEngage} />
                    <ReviewStatRow label="进入 Outcome" count={sessionStats.intoOutcome} />
                    <ReviewStatRow label="从 Outcome 归档" count={sessionStats.archivedFromOutcome} />
                  </ul>
                </section>
                <section className="review-finish-stats-column review-pane-displace" aria-label="退回与停止">
                  <p className="review-pane-kicker">退回</p>
                  <h3>退回与停止</h3>
                  <ul className="review-finish-stats">
                    <ReviewStatRow label="退回 Radar" count={sessionStats.backToRadar} />
                    <ReviewStatRow label="退回 Focus" count={sessionStats.backToFocus} />
                    <ReviewStatRow label="停止关注" count={sessionStats.stopped} />
                  </ul>
                </section>
              </div>
              <p className="review-finish-total">本次阶段变动合计 <span className="review-stat-value"><b>{sessionStats.totalMoves}</b><small>次</small></span></p>
              {review.adjustments?.length ? (
                <div className="review-finish-adjustments">
                  <h3>已确认的组合移动</h3>
                  {review.adjustments.map((adjustment, adjustmentIndex) => (
                    <p key={`${adjustment.kind}-${adjustmentIndex}`} className="subtle">
                      {adjustment.kind === 'radar_focus' ? 'Radar → Focus' : 'Focus → Engage'}：
                      晋级 {adjustment.promotions.length} 张
                      {adjustment.displacements.length ? `，让位 ${adjustment.displacements.length} 张` : ''}
                      {adjustment.note ? `。${adjustment.note}` : ''}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="subtle">这次还没有确认过组合移动，也可以直接完成梳理。</p>
              )}
            </div>
          )}

          {message && <p role="status" className="subtle">{message}</p>}
          <div className="dialog-actions">
            <button className="secondary-button" disabled={step === 1} onClick={() => goToStep(step - 1)}>上一步</button>
            <button className="primary-button" onClick={() => {
              if (finish) {
                onChange(completeWeeklyReview(workspace, reviewId).state)
                onClose()
              } else {
                goToStep(step + 1)
              }
            }}>{finish ? '完成注意力梳理' : '下一步'}</button>
          </div>
        </section>
      </div>
      {exitOpen && (
        <div className="dialog-backdrop" role="presentation">
          <section className="dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="review-exit-title">
            <p className="eyebrow">LEAVE REVIEW</p>
            <h2 id="review-exit-title">离开注意力梳理</h2>
            <p className="dialog-copy">可以保存进度稍后再继续，也可以清空这次梳理后退出。已经确认过的看板调整会保留。</p>
            <div className="dialog-actions review-exit-actions">
              <button className="secondary-button" onClick={() => setExitOpen(false)}>取消</button>
              <button className="primary-button" onClick={() => { setExitOpen(false); onClose() }}>保存并稍后继续</button>
              <button className="danger-button" onClick={() => { onChange(discardWeeklyReview(workspace, reviewId).state); onClose() }}>清空并退出</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
