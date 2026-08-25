import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { BRAND } from './brand'
import { AppFooter } from './components/AppFooter'
import { CategoryManager } from './components/CategoryManager'
import { AiSettingsCard } from './components/AiSettingsCard'
import { TickTickSettingsCard } from './components/TickTickSettingsCard'
import { createBrowserAiClient, createMemoryAiClient, type AiClient } from './data/aiClient'
import { createBrowserTickTickCli, createMemoryTickTickCli, type TickTickCliClient } from './data/ticktickClient'
import { EngageCommitDialog } from './components/EngageCommitDialog'
import { EngagePlanDialog } from './components/EngagePlanDialog'
import { TopicDrilldownDialog } from './components/TopicDrilldownDialog'
import { WeeklyReviewOverlay } from './components/WeeklyReviewOverlay'
import { AiTopicEditor } from './components/AiTopicEditor'
import { loadPrimaryWorkspace, savePrimaryWorkspace } from './data/fileStorage'
import { exportWorkspaceJson, importWorkspaceJson, loadWorkspace, saveWorkspace } from './data/storage'
import { categoryColorFor, categoryOptionsFor } from './domain/categories'
import { FocusQuoteRotator } from './components/FocusQuoteRotator'
import { buildInsights, itemsForCurrentTopic, itemsForRecentTopic } from './domain/insights'
import { startWeeklyReview } from './domain/review'
import { searchItems } from './domain/search'
import type { EngagePlanDraft } from './domain/engagePlan'
import type { ActiveStage, AttentionItem, Board, Stage, TickTickExportReceipt, WorkspaceSettings, WorkspaceState } from './domain/types'
import {
  archiveItem,
  captureItem,
  deleteArchivedItem,
  moveItem,
  restoreItem,
  setWipLimit,
  spawnItem,
  updateItem,
} from './domain/workspace'
import { buildTickTickWrite, describeReceipt, findActiveTickTickReceipt, prepareTickTickHandoff } from './integrations/ticktick'

const activeStages: Array<{ id: ActiveStage; label: string; note: string }> = [
  { id: 'radar', label: 'Radar', note: '可能值得，以后再看' },
  { id: 'focus', label: 'Focus', note: '当前值得认真关注' },
  { id: 'engage', label: 'Engage', note: '已经承诺，正在投入' },
  { id: 'outcome', label: 'Outcome & Review', note: '形成结果，等待复盘' },
]

const stageLabels: Record<Stage, string> = {
  radar: 'Radar', focus: 'Focus', engage: 'Engage', outcome: 'Outcome & Review', archive: 'Archive',
}

const nextStageLabels: Record<ActiveStage, string> = {
  radar: '进入 Focus',
  focus: '进入 Engage',
  engage: '进入 Outcome & Review',
  outcome: '完成并归档',
}

function BrandLogo() {
  return <svg className="brand-logo" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <rect width="40" height="40" rx="9" fill="#1f3442" />
    <circle cx="20" cy="20" r="13" fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="2.4" />
    <circle cx="20" cy="20" r="8.2" fill="none" stroke="#ffffff" strokeOpacity="0.75" strokeWidth="2.4" />
    <circle cx="20" cy="20" r="4" fill="#4fc3a1" />
  </svg>
}

function nextStageFor(stage: ActiveStage): ActiveStage | 'archive' {
  return ({ radar: 'focus', focus: 'engage', engage: 'outcome', outcome: 'archive' } as const)[stage]
}

type View = Board | 'insights' | 'archive' | 'settings'

function CaptureDialog({ board, categories, onClose, onSave, aiClient, onOpenSettings }: {
  board: Board
  categories: WorkspaceSettings['categories']
  onClose: () => void
  onSave: (input: { title: string; description: string; board: Board; category: string | null; topics: string[] }) => void
  aiClient: AiClient
  onOpenSettings: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedBoard, setSelectedBoard] = useState(board)
  const [category, setCategory] = useState('')
  const [topics, setTopics] = useState<string[]>([])
  function changeBoard(nextBoard: Board) {
    setSelectedBoard(nextBoard)
    if (!categoryOptionsFor(nextBoard, categories).includes(category)) setCategory('')
  }
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="capture-title">
        <div className="dialog-heading"><div><p className="eyebrow">CAPTURE</p><h2 id="capture-title">先接住，再决定</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭记录窗口">×</button></div>
        <label>标题<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <fieldset className="segmented-field"><legend>所属板块</legend><label><input aria-label="探索" type="radio" checked={selectedBoard === 'explore'} onChange={() => changeBoard('explore')} />探索</label><label><input aria-label="创造" type="radio" checked={selectedBoard === 'create'} onChange={() => changeBoard('create')} />创造</label></fieldset>
        <div className="form-row"><label>类别标签<select aria-label="类别标签" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">未分类</option>{categoryOptionsFor(selectedBoard, categories).map((value) => <option key={value} value={value}>{value}</option>)}</select></label><AiTopicEditor topics={topics} onChange={setTopics} card={{ title, description, board: selectedBoard, category: category.trim() || null }} aiClient={aiClient} onOpenSettings={onOpenSettings} /></div>
        <label>说明（支持 Markdown）<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={6} /></label>
        <div className="dialog-actions"><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!title.trim()} onClick={() => onSave({ title, description, board: selectedBoard, category: category.trim() || null, topics })}>保存到 Radar</button></div>
      </section>
    </div>
  )
}

function ConfirmDialog({ title, children, confirmLabel, onConfirm, onClose, tone = 'primary' }: {
  title: string; children: React.ReactNode; confirmLabel: string; onConfirm: () => void; onClose: () => void; tone?: 'primary' | 'danger'
}) {
  return <div className="dialog-backdrop" role="presentation"><section className="dialog compact-dialog" role="dialog" aria-modal="true" aria-label={title}><p className="eyebrow">CONFIRM</p><h2>{title}</h2><div className="dialog-copy">{children}</div><div className="dialog-actions"><button className="secondary-button" onClick={onClose}>取消</button><button className={tone === 'danger' ? 'danger-button' : 'primary-button'} onClick={onConfirm}>{confirmLabel}</button></div></section></div>
}

function BoardFilters({ board, categories, topics, selectedCategories, selectedTopics, resultCount, totalCount, onChangeCategories, onChangeTopics }: {
  board: Board
  categories: WorkspaceSettings['categories']
  topics: string[]
  selectedCategories: string[]
  selectedTopics: string[]
  resultCount: number
  totalCount: number
  onChangeCategories: (categories: string[]) => void
  onChangeTopics: (topics: string[]) => void
}) {
  const [topicOpen, setTopicOpen] = useState(false)
  const [topicQuery, setTopicQuery] = useState('')
  const topicFilterRef = useRef<HTMLDivElement>(null)
  const matchingTopics = topics.filter((topic) => topic.toLocaleLowerCase('zh-CN').includes(topicQuery.trim().toLocaleLowerCase('zh-CN')))
  const hasFilters = selectedCategories.length > 0 || selectedTopics.length > 0

  function toggle(values: string[], value: string): string[] {
    return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]
  }

  function closeTopicMenu() {
    setTopicOpen(false)
    setTopicQuery('')
  }

  useEffect(() => {
    if (!topicOpen) return
    const closeOnOutside = (event: MouseEvent) => {
      if (topicFilterRef.current && !topicFilterRef.current.contains(event.target as Node)) {
        closeTopicMenu()
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeTopicMenu()
    }
    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [topicOpen])

  return <section className="board-filters" aria-label="筛选卡片">
    <div className="filter-row">
      <span className="filter-label">类别</span>
      <div className="category-filter-options" role="group" aria-label="按类别标签筛选">
        {categoryOptionsFor(board, categories).map((category) => {
          const colorStyle = { '--filter-color': categoryColorFor(board, category, categories) } as CSSProperties
          const active = selectedCategories.includes(category)
          return (
            <button
              key={category}
              style={colorStyle}
              className={`filter-chip${active ? ' active' : ''}`}
              aria-label={`类别筛选：${category}`}
              aria-pressed={active}
              onClick={() => onChangeCategories(toggle(selectedCategories, category))}
            >
              {category}
            </button>
          )
        })}
      </div>
    </div>
    <div className="filter-row">
      <span className="filter-label">主题</span>
      <div className="topic-filter-row">
        <div className="topic-filter-wrap" ref={topicFilterRef}>
          <button
            type="button"
            className={`topic-filter-trigger${selectedTopics.length ? ' active' : ''}`}
            aria-label="主题标签筛选"
            aria-expanded={topicOpen}
            onClick={() => setTopicOpen((open) => !open)}
          >
            主题标签
            <span className="topic-filter-caret" aria-hidden="true" />
          </button>
          {topicOpen && (
            <div className="topic-filter-menu" role="group" aria-label="按主题标签筛选">
              <input
                autoFocus
                aria-label="搜索主题标签"
                value={topicQuery}
                onChange={(event) => setTopicQuery(event.target.value)}
                placeholder="搜索主题"
              />
              <div className="topic-filter-list">
                {matchingTopics.length ? matchingTopics.map((topic) => (
                  <label key={topic}>
                    <input
                      type="checkbox"
                      aria-label={`筛选主题：${topic}`}
                      checked={selectedTopics.includes(topic)}
                      onChange={() => onChangeTopics(toggle(selectedTopics, topic))}
                    />
                    <span>{topic}</span>
                  </label>
                )) : <p>没有匹配的主题</p>}
              </div>
            </div>
          )}
        </div>
        {selectedTopics.length > 0 && (
          <div className="topic-filter-selected" aria-label="已选主题标签">
            {selectedTopics.map((topic) => (
              <button
                key={topic}
                type="button"
                className="topic-filter-chip"
                aria-label={`移除主题筛选：${topic}`}
                onClick={() => onChangeTopics(selectedTopics.filter((entry) => entry !== topic))}
              >
                #{topic}
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="filter-result">{resultCount} / {totalCount} 张</span>
      {hasFilters && (
        <button type="button" className="clear-filter" onClick={() => { onChangeCategories([]); onChangeTopics([]) }}>
          清除筛选
        </button>
      )}
    </div>
  </section>
}

function Card({ item, categories, onOpen }: { item: AttentionItem; categories: WorkspaceSettings['categories']; onOpen: (item: AttentionItem) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id })
  const style = {
    ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}),
    '--category-color': categoryColorFor(item.board, item.category, categories),
  } as CSSProperties
  return <article ref={setNodeRef} style={style} className={`attention-card${isDragging ? ' dragging' : ''}`}>
    <button className="drag-handle" aria-label={`拖动卡片：${item.title}`} {...attributes} {...listeners}>⠿</button>
    <button className="card-content" onClick={() => onOpen(item)} aria-label={`打开卡片：${item.title}`}>
      <span className="card-title-row"><strong>{item.title}</strong><span className="card-kind">{item.category ?? (item.board === 'explore' ? '探索' : '创造')}</span></span>
      {item.description && <span className="description-line">{item.description.replace(/[#*_`>\[\]()]/g, ' ')}</span>}
      <span className="topic-line">{item.topics.slice(0, 3).map((topic) => `#${topic}`).join(' ') || '尚未添加主题'}</span>
    </button>
  </article>
}

function BoardColumn({ stage, items, categories, onOpen }: { stage: typeof activeStages[number]; items: AttentionItem[]; categories: WorkspaceSettings['categories']; onOpen: (item: AttentionItem) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  const emptyHints: Record<ActiveStage, string> = {
    radar: '记录一个想法，它先在这里等待判断。',
    focus: '从 Radar 拖入近期真正值得认真关注的事项。',
    engage: '只有决定真实投入的事项才来到这里。',
    outcome: '推进完成的事项会在这里等待复盘。',
  }
  return <section ref={setNodeRef} className={`stage-column stage-${stage.id}${isOver ? ' drop-target' : ''}`} aria-label={stage.label} role="region">
    <header className="stage-header"><div><h2>{stage.label}</h2><p>{stage.note}</p></div><span className="count-badge">{items.length}</span></header>
    <div className="card-stack">{items.length ? items.map((item) => <Card key={item.id} item={item} categories={categories} onOpen={onOpen} />) : <p className="empty-state">{emptyHints[stage.id]}</p>}</div>
  </section>
}

function DetailDrawer({ item, categories, receipt, onClose, onSave, onMove, onAdvance, onStop, onRestore, onDelete, onSpawn, onOpenPlan, aiClient, onOpenSettings }: {
  item: AttentionItem
  categories: WorkspaceSettings['categories']
  receipt?: TickTickExportReceipt
  onClose: () => void
  onSave: (patch: Pick<AttentionItem, 'title' | 'description' | 'board' | 'category' | 'topics'>) => void
  onMove: (stage: ActiveStage) => void
  onAdvance: () => void
  onStop: () => void
  onRestore: () => void
  onDelete: () => void
  onSpawn: () => void
  onOpenPlan?: () => void
  aiClient: AiClient
  onOpenSettings: () => void
}) {
  const [title, setTitle] = useState(item.title)
  const [description, setDescription] = useState(item.description)
  const [board, setBoard] = useState(item.board)
  const [category, setCategory] = useState(item.category ?? '')
  const [topics, setTopics] = useState<string[]>(item.topics)
  const [editingInfo, setEditingInfo] = useState(false)
  const [editingDescription, setEditingDescription] = useState(false)
  function changeBoard(nextBoard: Board) {
    setBoard(nextBoard)
    if (!categoryOptionsFor(nextBoard, categories).includes(category)) setCategory('')
  }
  function cancelInfoEditing() {
    setTitle(item.title)
    setBoard(item.board)
    setCategory(item.category ?? '')
    setTopics(item.topics)
    setEditingInfo(false)
  }
  function beginInfoEditing() {
    setDescription(item.description)
    setEditingDescription(false)
    setEditingInfo(true)
  }
  function beginDescriptionEditing() {
    cancelInfoEditing()
    setDescription(item.description)
    setEditingDescription(true)
  }
  return <div className="drawer-backdrop" role="presentation" onClick={onClose}><aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="detail-title" onClick={(event) => event.stopPropagation()}>
    <div className="dialog-heading"><div><p className="eyebrow">{stageLabels[item.stage].toUpperCase()}</p><h2 id="detail-title">{item.title}</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭卡片">×</button></div>
    {item.stage !== 'archive' && <div className="stage-actions"><label className="stage-picker">移动到<select aria-label="移动到" value={item.stage} onChange={(event) => onMove(event.target.value as ActiveStage)}>{activeStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label><button className="primary-button next-stage-button" onClick={onAdvance}>{nextStageLabels[item.stage]}</button></div>}
    {item.stage === 'engage' && onOpenPlan && <button className="secondary-button full-button" onClick={onOpenPlan}>执行计划</button>}
    {receipt && <p className="handoff-status"><span />{describeReceipt(receipt)}</p>}
    <section className="detail-section"><div className="detail-section-heading"><div><p className="eyebrow">CARD / INFO</p><h3>卡片信息</h3></div>{!editingInfo && <button className="text-button" onClick={beginInfoEditing}>编辑信息</button>}</div>
    {!editingInfo ? <div className="preview-metadata"><span className="metadata-chip">{item.board === 'explore' ? '探索' : '创造'}</span><span className="metadata-chip">{item.category ?? '未分类'}</span>{item.topics.map((topic) => <span className="metadata-chip topic" key={topic}>#{topic}</span>)}</div> : <div className="inline-editor">
      <label>标题<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <div className="form-row"><label>所属板块<select aria-label="所属板块" value={board} onChange={(event) => changeBoard(event.target.value as Board)}><option value="explore">探索</option><option value="create">创造</option></select></label><label>类别标签<select aria-label="类别标签" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">未分类</option>{categoryOptionsFor(board, categories).map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>
      <AiTopicEditor topics={topics} onChange={setTopics} card={{ title, description: item.description, board, category: category.trim() || null }} aiClient={aiClient} onOpenSettings={onOpenSettings} />
      <div className="inline-editor-actions"><button className="secondary-button" onClick={cancelInfoEditing}>取消编辑信息</button><button className="primary-button" disabled={!title.trim()} onClick={() => { onSave({ title, description: item.description, board, category: category.trim() || null, topics }); setEditingInfo(false) }}>保存信息</button></div>
    </div>}</section>
    <section className="detail-section description-section"><div className="detail-section-heading"><div><p className="eyebrow">NOTES / MARKDOWN</p><h3>说明</h3></div>{!editingDescription && <button className="text-button description-edit-trigger" onClick={beginDescriptionEditing}>编辑说明</button>}</div>
      {!editingDescription ? <article className="markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{item.description || '*还没有说明。*'}</ReactMarkdown></article> : <div className="inline-editor"><label>说明（支持 Markdown）<textarea autoFocus value={description} onChange={(event) => setDescription(event.target.value)} rows={12} /></label><div className="inline-editor-actions"><button className="secondary-button" onClick={() => { setDescription(item.description); setEditingDescription(false) }}>取消编辑说明</button><button className="primary-button" onClick={() => { onSave({ title: item.title, description, board: item.board, category: item.category, topics: item.topics }); setEditingDescription(false) }}>保存说明</button></div></div>}
    </section>
    <div className="item-meta"><span>入库 {new Date(item.capturedAt).toLocaleDateString('zh-CN')}</span><span>进入当前阶段 {new Date(item.stageEnteredAt).toLocaleDateString('zh-CN')}</span></div>
    <div className="drawer-footer">{item.stage === 'archive' ? <><button className="danger-button" onClick={onDelete}>永久删除</button><button className="primary-button" onClick={onRestore}>恢复到 Radar</button></> : <><button className="text-button danger-text" onClick={onStop}>停止关注</button><button className="text-button" onClick={onSpawn}>由此新建卡片</button></>}</div>
  </aside></div>
}

function capacityAlert(current: number, limit: number) {
  if (current > limit) {
    return { className: 'capacity-over' as const, label: `超出 ${current - limit} 项` }
  }
  if (current === limit) {
    return { className: 'capacity-full' as const, label: '已达上限' }
  }
  return { className: 'capacity-normal' as const, label: null }
}

function InsightPage({ workspace, onStartReview, onOpenItem }: {
  workspace: WorkspaceState
  onStartReview: () => void
  onOpenItem: (item: AttentionItem) => void
}) {
  const insight = buildInsights(workspace)
  const focusCapacity = capacityAlert(insight.stageCounts.focus, workspace.settings.focusWipLimit)
  const engageCapacity = capacityAlert(insight.stageCounts.engage, workspace.settings.engageWipLimit)
  const [activeTopic, setActiveTopic] = useState<string | null>(null)
  const [drilldown, setDrilldown] = useState<{ topic: string; source: 'current' | 'recent' } | null>(null)
  const stalledByBoard = {
    explore: insight.stalled.filter(({ itemId }) => workspace.items[itemId].board === 'explore'),
    create: insight.stalled.filter(({ itemId }) => workspace.items[itemId].board === 'create'),
  }
  const topicColors = ['#2f6fb2', '#d0533c', '#1e8a70', '#c98a12', '#7d5ba6', '#5d6f3f', '#8b98a0']
  const topicTotal = insight.topicCounts.reduce((sum, [, count]) => sum + count, 0)
  const topicSlices = insight.topicCounts.slice(0, 6).map(([label, count], index) => ({ key: `topic:${label}`, label, count, color: topicColors[index], aggregate: false }))
  const otherCount = insight.topicCounts.slice(6).reduce((sum, [, count]) => sum + count, 0)
  if (otherCount) topicSlices.push({ key: 'aggregate:other', label: '其他', count: otherCount, color: topicColors[6], aggregate: true })

  // 环形图扇区：SVG path，悬停时沿圆心方向外移
  const donutGeometry = useMemo(() => {
    if (!topicTotal) return []
    const cx = 100; const cy = 100; const outer = 88; const inner = 55
    let angle = -90
    return topicSlices.map((slice) => {
      const sweep = slice.count / topicTotal * 360
      const start = angle
      angle += sweep
      const end = sweep >= 360 ? start + 359.9 : angle
      const mid = (start + end) / 2
      const rad = (mid * Math.PI) / 180
      const toXY = (r: number, deg: number) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)]
      const [x1, y1] = toXY(outer, start); const [x2, y2] = toXY(outer, end)
      const [x3, y3] = toXY(inner, end); const [x4, y4] = toXY(inner, start)
      const large = sweep > 180 ? 1 : 0
      const d = `M${x1.toFixed(2)} ${y1.toFixed(2)} A${outer} ${outer} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L${x3.toFixed(2)} ${y3.toFixed(2)} A${inner} ${inner} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`
      return { ...slice, d, dx: Math.cos(rad) * 7, dy: Math.sin(rad) * 7 }
    })
  }, [topicSlices.map((s) => `${s.key}:${s.count}`).join('|'), topicTotal])

  // 漏斗：宽度随数量的平方根变化，最窄的阶段把文字放到条外右侧
  const stageMax = Math.max(1, ...activeStages.map((stage) => insight.stageCounts[stage.id]))
  const funnelWidthFor = (count: number) => (count === 0 ? 10 : Math.max(24, Math.round(Math.sqrt(count / stageMax) * 100)))
  const recentTopics = insight.recentTopicCounts.slice(0, 3)

  const drilldownItems = drilldown
    ? drilldown.source === 'recent'
      ? itemsForRecentTopic(workspace, drilldown.topic)
      : itemsForCurrentTopic(workspace, drilldown.topic)
    : []
  const openTopic = (topic: string, source: 'current' | 'recent') => setDrilldown({ topic, source })
  const openItem = (item: AttentionItem) => {
    setDrilldown(null)
    onOpenItem(item)
  }

  return <main className="workspace-main insights-page"><section className="workspace-heading insight-heading"><div><p className="eyebrow">INSIGHTS / ATTENTION</p><h1>注意力洞察</h1></div><FocusQuoteRotator /><button type="button" className="primary-button insight-review-cta" onClick={onStartReview}>开始注意力梳理</button></section>
    <section className="metric-strip"><div><small>Radar</small><strong>{insight.stageCounts.radar}</strong><span>项</span></div><div className={`capacity-metric ${focusCapacity.className}`}><small>正在 Focus</small><strong>{insight.stageCounts.focus}</strong><span>/ {workspace.settings.focusWipLimit}</span>{focusCapacity.label && <em className="capacity-status">{focusCapacity.label}</em>}</div><div className={`capacity-metric ${engageCapacity.className}`}><small>正在 Engage</small><strong>{insight.stageCounts.engage}</strong><span>/ {workspace.settings.engageWipLimit}</span>{engageCapacity.label && <em className="capacity-status">{engageCapacity.label}</em>}</div><div><small>等待 Review</small><strong>{insight.stageCounts.outcome}</strong><span>项</span></div></section>
    <div className="insight-grid"><section className="insight-card balance-card insight-balance-card"><div className="insight-balance-heading"><div><p className="eyebrow">BALANCE</p><h2>探索 / 创造</h2></div><strong className="insight-balance-total" aria-label={`共 ${insight.boardCounts.explore + insight.boardCounts.create} 张`}>{insight.boardCounts.explore + insight.boardCounts.create}</strong></div><div className="balance-chart" role="img" aria-label={`探索 ${insight.boardCounts.explore} 张，创造 ${insight.boardCounts.create} 张`}><div className="balance-segment balance-explore" style={{ flexGrow: Math.max(1, insight.boardCounts.explore) }}><svg className="balance-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M16 16l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg><span>探索</span><b>{insight.boardCounts.explore}</b></div><div className="balance-segment balance-create" style={{ flexGrow: Math.max(1, insight.boardCounts.create) }}><svg className="balance-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19l2.2-7.5L16.5 2.2a2.1 2.1 0 0 1 3 3L10.5 16.8 5 19z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M13.2 5.5l5.3 5.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg><span>创造</span><b>{insight.boardCounts.create}</b></div></div></section>
      <section className="insight-card insight-stages-card"><p className="eyebrow">STAGES / NOW</p><h2>当前阶段分布</h2><svg className="stage-funnel-chart" viewBox="0 0 440 176" role="img" aria-label={`阶段分布漏斗：Radar ${insight.stageCounts.radar} 张，Focus ${insight.stageCounts.focus} 张，Engage ${insight.stageCounts.engage} 张，Outcome & Review ${insight.stageCounts.outcome} 张`}>{activeStages.map((stage, index) => { const count = insight.stageCounts[stage.id]; const width = funnelWidthFor(count); const y = 12 + index * 42; const colors = ['#284a68', '#d9a01f', '#df634d', '#4b8279']; const barW = width * 2.35; const barX = 168 - barW / 2; return <g key={stage.id}><rect aria-label={`${stage.label}：${count} 张`} x={barX} y={y} width={barW} height={30} rx={2} fill={colors[index]} /><text x={barX + barW + 14} y={y + 21} className="funnel-outside">{stage.label} · {count} 张</text></g> })}</svg></section>
      <section className="insight-card insight-recent-card"><p className="eyebrow">RECENT / 30 DAYS</p><h2>近 30 天关注最多的领域</h2>{recentTopics.length ? <ol className="recent-topic-list">{recentTopics.map(([topic, count]) => <li key={topic}><button onClick={() => openTopic(topic, 'recent')} aria-label={`打开近期主题：${topic}（${count} 张）`}><span>{topic}</span><b>{count} 张</b></button></li>)}</ol> : <p className="subtle">近 30 天还没有新加入或推进的卡片。</p>}</section>
      <section className="insight-card insight-topics-card"><p className="eyebrow">TOPICS / NOW</p><h2>关注领域</h2>{topicTotal ? <div className="topic-donut-layout"><svg className="topic-donut-svg" viewBox="0 0 200 200" role="group" aria-label={`关注领域，共 ${topicTotal} 次主题标签`}>{donutGeometry.map((slice) => { const active = activeTopic === slice.key; const isAggregate = slice.aggregate; return <path key={slice.key} d={slice.d} fill={slice.color} role={isAggregate ? undefined : 'button'} tabIndex={isAggregate ? undefined : 0} aria-label={isAggregate ? undefined : `打开当前主题扇区：${slice.label}（${slice.count} 次主题标签）`} className={`donut-slice${isAggregate ? ' other' : ' interactive'}${active ? ' active' : ''}${activeTopic && !active ? ' dimmed' : ''}`} style={active ? { transform: `translate(${slice.dx}px, ${slice.dy}px)` } : undefined} onClick={isAggregate ? undefined : () => openTopic(slice.label, 'current')} onKeyDown={isAggregate ? undefined : (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openTopic(slice.label, 'current') } }} onMouseEnter={() => setActiveTopic(slice.key)} onMouseLeave={() => setActiveTopic(null)}><title>{`${slice.label}：${slice.count} 次主题标签`}</title></path> })}<text x="100" y="105" textAnchor="middle" className="donut-total">{topicTotal}</text></svg><div><p className="donut-caption-line">共 {topicTotal} 次主题标签</p><ul className="topic-legend">{topicSlices.map((slice) => { const isAggregate = slice.aggregate; return <li key={slice.key} aria-label={`${slice.label}：${slice.count} 次主题标签`} className={`${isAggregate ? 'aggregate' : 'interactive'}${activeTopic === slice.key ? ' active' : ''}`} onMouseEnter={() => setActiveTopic(slice.key)} onMouseLeave={() => setActiveTopic(null)}>{isAggregate ? <><span className="topic-legend-dot" style={{ background: slice.color }} /><span>{slice.label}</span><b>{slice.count}</b></> : <button aria-label={`打开当前主题图例：${slice.label}（${slice.count} 次主题标签）`} onClick={() => openTopic(slice.label, 'current')}><span className="topic-legend-dot" style={{ background: slice.color }} /><span>{slice.label}</span><b>{slice.count}</b></button>}</li> })}</ul></div></div> : <p className="empty-state">给卡片添加主题后，这里会出现关注领域。</p>}</section>
      <section className="insight-card wide insight-aging-card"><div className="insight-aging-heading"><div><p className="eyebrow">AGING</p><h2>停滞项目</h2></div><strong className="insight-aging-total" aria-label={`停滞 ${insight.stalled.length} 项`}>{insight.stalled.length}</strong></div><div className="aging-columns">{(['explore', 'create'] as const).map((board) => <section key={board} className="aging-lane" role="region" aria-label={`${board === 'explore' ? '探索' : '创造'}停滞项目`}><header><h3>{board === 'explore' ? '探索' : '创造'}</h3><span>{stalledByBoard[board].length}</span></header>{stalledByBoard[board].length ? <ul className="aging-list">{stalledByBoard[board].map(({ itemId, ageDays }) => { const item = workspace.items[itemId]; const categoryStyle = { '--category-color': categoryColorFor(item.board, item.category, workspace.settings.categories) } as CSSProperties; return <li key={itemId} style={categoryStyle}><button type="button" className="aging-item-open" aria-label={`打开卡片：${item.title}`} onClick={() => openItem(item)}><div className="aging-item-heading"><strong>{item.title}</strong><b>{ageDays} 天未触达</b></div><div className="aging-item-tags"><span className="aging-category">{item.category ?? '未分类'}</span>{item.topics.map((topic) => <span key={topic}>#{topic}</span>)}</div></button></li> })}</ul> : <p className="empty-state">这里暂时没有停滞卡片。</p>}</section>)}</div></section>
    </div>
    {drilldown && <TopicDrilldownDialog topic={drilldown.topic} items={drilldownItems} categories={workspace.settings.categories} onOpenItem={openItem} onClose={() => setDrilldown(null)} />}
  </main>
}

function ArchivePage({ items, onOpen, onDelete }: { items: AttentionItem[]; onOpen: (item: AttentionItem) => void; onDelete: (item: AttentionItem) => void }) {
  return <main className="workspace-main"><section className="workspace-heading"><div><p className="eyebrow">ARCHIVE / MEMORY</p><h1>归档</h1></div><p>这里保留历史与停止的决定，不再占用当前注意力。</p></section><section className="archive-grid">{items.length ? items.map((item) => <article key={item.id} className="archive-row"><button type="button" className="archive-open" onClick={() => onOpen(item)} aria-label={`打开卡片：${item.title}`}><span>{item.board === 'explore' ? '探索' : '创造'}</span><strong>{item.title}</strong><small>{new Date(item.lastTouchedAt).toLocaleDateString('zh-CN')}</small></button><button type="button" className="archive-delete" aria-label={`永久删除卡片：${item.title}`} onClick={() => onDelete(item)}><span aria-hidden="true">⌫</span></button></article>) : <p className="empty-state">归档还是空的。</p>}</section></main>
}

function SettingsPage({ workspace, onChange, aiClient, tickTickCli }: { workspace: WorkspaceState; onChange: (state: WorkspaceState) => void; aiClient: AiClient; tickTickCli: TickTickCliClient }) {
  const [message, setMessage] = useState('')
  function downloadData() { const blob = new Blob([exportWorkspaceJson(workspace)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `attention-workbench-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url) }
  return <main className="workspace-main settings-page"><section className="workspace-heading"><div><p className="eyebrow">SETTINGS / BOUNDARIES</p><h1>工作台设置</h1></div><p>先守住同时投入的上限，再考虑扩充系统。</p></section><div className="settings-grid"><section className="insight-card"><h2>WIP 上限</h2><label>Focus 上限<input type="number" min="1" value={workspace.settings.focusWipLimit} onChange={(event) => onChange(setWipLimit(workspace, 'focus', Number(event.target.value)).state)} /></label><label>Engage 上限<input type="number" min="1" value={workspace.settings.engageWipLimit} onChange={(event) => onChange(setWipLimit(workspace, 'engage', Number(event.target.value)).state)} /></label></section><TickTickSettingsCard workspace={workspace} onChange={onChange} tickTickCli={tickTickCli} /><AiSettingsCard workspace={workspace} onChange={onChange} aiClient={aiClient} /><section className="insight-card wide category-settings-card"><h2>类别标签</h2><CategoryManager workspace={workspace} onChange={onChange} /></section><section className="insight-card wide"><h2>数据备份</h2><div className="settings-actions"><button className="secondary-button" onClick={downloadData}>导出 JSON</button><label className="file-button">导入 JSON<input type="file" accept="application/json" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { onChange(importWorkspaceJson(await file.text())); setMessage('数据已导入') } catch (error) { setMessage(error instanceof Error ? error.message : '导入失败') } }} /></label></div>{message && <p role="status">{message}</p>}</section></div></main>
}

function openExternalInSeparateContext(url: string) {
  const link = document.createElement('a')
  link.href = url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.click()
}

export default function App({
  openExternal = openExternalInSeparateContext,
  storageMode = import.meta.env.MODE === 'test' ? 'browser' : 'file',
  loadPrimary = loadPrimaryWorkspace,
  savePrimary = savePrimaryWorkspace,
  aiClient = import.meta.env.MODE === 'test' ? createMemoryAiClient() : createBrowserAiClient(),
  tickTickCli = import.meta.env.MODE === 'test' ? createMemoryTickTickCli() : createBrowserTickTickCli(),
}: {
  openExternal?: (url: string) => void
  storageMode?: 'browser' | 'file'
  loadPrimary?: () => Promise<WorkspaceState>
  savePrimary?: (state: WorkspaceState) => Promise<WorkspaceState>
  aiClient?: AiClient
  tickTickCli?: TickTickCliClient
}) {
  const fileMode = storageMode === 'file'
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(() => fileMode ? null : loadWorkspace())
  const [storageReady, setStorageReady] = useState(!fileMode)
  const [loadError, setLoadError] = useState('')
  const [storageError, setStorageError] = useState('')
  const [view, setView] = useState<View>('explore')
  const [captureOpen, setCaptureOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [boardFilters, setBoardFilters] = useState<Record<Board, { categories: string[]; topics: string[] }>>({
    explore: { categories: [], topics: [] },
    create: { categories: [], topics: [] },
  })
  const [pendingEngageId, setPendingEngageId] = useState<string | null>(null)
  const [planItemId, setPlanItemId] = useState<string | null>(null)
  const [pendingStopId, setPendingStopId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [wipBlocked, setWipBlocked] = useState<{ itemId: string; target: ActiveStage; current: number; limit: number } | null>(null)
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const skipNextFileSave = useRef(fileMode)
  const fileSaveQueue = useRef<Promise<unknown>>(Promise.resolve())
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => {
    if (!fileMode) return
    let active = true
    loadPrimary()
      .then((loaded) => {
        if (!active) return
        skipNextFileSave.current = true
        setWorkspace(loaded)
        setStorageReady(true)
      })
      .catch(() => {
        if (!active) return
        setLoadError('本地工作区加载失败。旧浏览器数据仍会保留，请检查本地服务；也可以使用已导出的 JSON 备份恢复。')
      })
    return () => { active = false }
  }, [fileMode, loadPrimary])

  useEffect(() => {
    if (!workspace) return
    if (!fileMode) {
      saveWorkspace(workspace)
      return
    }
    if (!storageReady) return
    if (skipNextFileSave.current) {
      skipNextFileSave.current = false
      return
    }
    const snapshot = workspace
    fileSaveQueue.current = fileSaveQueue.current
      .catch(() => undefined)
      .then(() => savePrimary(snapshot))
      .then(() => setStorageError(''))
      .catch(() => setStorageError('本地文件保存失败，最近一次更改尚未写入磁盘。请保持页面打开并检查本地服务。'))
  }, [fileMode, savePrimary, storageReady, workspace])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2600); return () => window.clearTimeout(timer) }, [toast])

  if (fileMode && loadError) return <div className="app-shell storage-state"><main className="workspace-main"><section className="insight-card" role="alert"><p className="eyebrow">STORAGE / ERROR</p><h1>无法打开所向</h1><p>{loadError}</p></section></main></div>
  if (!workspace || !storageReady) return <div className="app-shell storage-state"><main className="workspace-main"><p role="status">正在读取本地工作区…</p></main></div>

  const allItems = Object.values(workspace.items)
  const visibleItems = query.trim() ? searchItems(workspace, query) : allItems
  const selectedItem = selectedId ? workspace.items[selectedId] : undefined
  const selectedReceipt = selectedId ? findActiveTickTickReceipt(workspace, selectedId) : undefined
  const pendingEngageItem = pendingEngageId ? workspace.items[pendingEngageId] : undefined
  const planItem = planItemId ? workspace.items[planItemId] : undefined
  const pendingDeleteItem = pendingDeleteId ? workspace.items[pendingDeleteId] : undefined
  const engageItems = allItems.filter((entry) => entry.stage === 'engage')
  const focusCount = allItems.filter((item) => item.stage === 'focus').length
  const engageCount = engageItems.length

  function executeMove(itemId: string, target: ActiveStage, options: { overrideWip?: boolean; replaceItemId?: string; displaceTarget?: 'radar' | 'focus' } = {}): boolean {
    if (!workspace) return false
    const result = moveItem(workspace, itemId, target, options)
    if (!result.ok) {
      if (result.reason === 'wip_limit' && result.current !== undefined && result.limit !== undefined) {
        setWipBlocked({ itemId, target: (result.target ?? target) as ActiveStage, current: result.current, limit: result.limit })
      }
      return false
    }
    setToast(result.enteredEngage ? '已移入 Engage' : `已移动到 ${stageLabels[target]}`)
    setWorkspace(result.state)
    return true
  }

  async function commitTickTick(itemId: string, mode: 'main' | 'tree', plan: EngagePlanDraft) {
    if (!workspace) return
    const channel = workspace.settings.tickTickCreateMode === 'cli' ? 'cli' : 'deeplink'
    const hasReceipt = Boolean(findActiveTickTickReceipt(workspace, itemId))
    if (channel === 'cli') {
      const write = buildTickTickWrite(workspace, itemId, { mode, plan, channel })
      const result = await tickTickCli.create({
        title: write.title,
        content: write.description,
        listName: write.listName,
        steps: write.steps,
      })
      if (!result.ok) {
        setToast(result.error || 'dida CLI 创建任务失败')
        return
      }
      const handoff = prepareTickTickHandoff(workspace, itemId, undefined, {
        force: hasReceipt,
        mode,
        plan,
        channel,
        taskId: result.taskId,
      })
      setWorkspace(handoff.state)
      setToast(mode === 'tree' ? '已通过 CLI 写入滴答任务和子任务' : '已通过 CLI 创建滴答主任务')
      setPlanItemId(null)
      return
    }

    const handoff = prepareTickTickHandoff(workspace, itemId, undefined, { force: hasReceipt, mode, plan, channel })
    setWorkspace(handoff.state)
    if (handoff.alreadyHandedOff) setToast('已有滴答交接记录，未重复创建')
    else {
      openExternal(handoff.receipt.url ?? '')
      setToast('已打开滴答创建入口')
    }
    setPlanItemId(null)
  }

  function requestMove(itemId: string, target: ActiveStage) {
    if (!workspace) return
    const item = workspace.items[itemId]
    if (!item || item.stage === target) return
    if (target === 'engage' && item.stage !== 'engage') setPendingEngageId(itemId)
    else executeMove(itemId, target)
  }

  function confirmPermanentDelete() {
    if (!workspace || !pendingDeleteId) return
    const result = deleteArchivedItem(workspace, pendingDeleteId)
    setPendingDeleteId(null)
    if (!result.ok) return
    setWorkspace(result.state)
    if (selectedId === pendingDeleteId) setSelectedId(null)
    setToast('已永久删除')
  }
  function onDragEnd(event: DragEndEvent) {
    const target = event.over?.id as ActiveStage | undefined
    if (target && activeStages.some((stage) => stage.id === target)) requestMove(String(event.active.id), target)
  }

  const board = view === 'create' ? 'create' : 'explore'
  const boardSourceItems = visibleItems.filter((item) => item.board === board && item.stage !== 'archive')
  const boardTopics = [...new Set(allItems.filter((item) => item.board === board && item.stage !== 'archive').flatMap((item) => item.topics))]
    .sort((left, right) => left.localeCompare(right, 'zh-CN'))
  const categoryOptions = categoryOptionsFor(board, workspace.settings.categories)
  const currentFilters = {
    ...boardFilters[board],
    categories: boardFilters[board].categories.filter((category) => categoryOptions.includes(category)),
  }
  const boardItems = boardSourceItems.filter((item) => {
    const categoryMatches = currentFilters.categories.length === 0 || (item.category !== null && currentFilters.categories.includes(item.category))
    const topicMatches = currentFilters.topics.length === 0 || item.topics.some((topic) => currentFilters.topics.includes(topic))
    return categoryMatches && topicMatches
  })
  function updateBoardFilter(kind: 'categories' | 'topics', values: string[]) {
    setBoardFilters((current) => ({ ...current, [board]: { ...current[board], [kind]: values } }))
  }

  return <div className="app-shell">
    <header className="topbar"><button className="brand" onClick={() => setView('explore')} aria-label="所向首页"><BrandLogo /><span className="brand-copy"><span className="brand-title-row"><strong>{BRAND.chineseName}</strong><b>{BRAND.englishName}</b></span><small>{BRAND.tagline}</small></span></button><nav aria-label="主导航" className="main-nav"><button className={view === 'explore' ? 'active' : ''} onClick={() => setView('explore')}>探索</button><button className={view === 'create' ? 'active' : ''} onClick={() => setView('create')}>创造</button><button className={view === 'insights' ? 'active' : ''} onClick={() => setView('insights')}>洞察</button></nav><div className="top-actions"><label className="search-field"><span>⌕</span><input aria-label="搜索卡片" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索" /></label><button className="utility-button" onClick={() => setView('archive')} aria-label="打开归档">归档</button><button className="utility-button" onClick={() => setView('settings')} aria-label="打开设置">设置</button><button className="primary-button compact" aria-label="记录想法" onClick={() => setCaptureOpen(true)}>＋ 记录想法</button></div></header>
    {storageError && <div className="storage-alert" role="alert">{storageError}</div>}

    {(view === 'explore' || view === 'create') && <main id="top" className="workspace-main"><section className="workspace-heading board-heading"><div><p className="eyebrow">{board === 'explore' ? 'EXPLORE' : 'CREATE'} / NOW</p><h1>{board === 'explore' ? '我渴望了解什么？' : '我想要创造什么？'}</h1></div><BoardFilters board={board} categories={workspace.settings.categories} topics={boardTopics} selectedCategories={currentFilters.categories} selectedTopics={currentFilters.topics} resultCount={boardItems.length} totalCount={boardSourceItems.length} onChangeCategories={(values) => updateBoardFilter('categories', values)} onChangeTopics={(values) => updateBoardFilter('topics', values)} /></section><DndContext sensors={sensors} onDragEnd={onDragEnd}><div className="board-grid">{activeStages.map((stage) => <BoardColumn key={stage.id} stage={stage} items={boardItems.filter((item) => item.stage === stage.id)} categories={workspace.settings.categories} onOpen={(item) => setSelectedId(item.id)} />)}</div></DndContext></main>}
    {view === 'insights' && <InsightPage workspace={workspace} onStartReview={() => { const started = startWeeklyReview(workspace); setWorkspace(started.state); setReviewId(started.reviewId) }} onOpenItem={(item) => setSelectedId(item.id)} />}
    {view === 'archive' && <ArchivePage items={visibleItems.filter((item) => item.stage === 'archive')} onOpen={(item) => setSelectedId(item.id)} onDelete={(item) => setPendingDeleteId(item.id)} />}
    {view === 'settings' && <SettingsPage workspace={workspace} onChange={setWorkspace} aiClient={aiClient} tickTickCli={tickTickCli} />}
    <AppFooter />

    {captureOpen && <CaptureDialog board={board} categories={workspace.settings.categories} onClose={() => setCaptureOpen(false)} onSave={(input) => { const result = captureItem(workspace, input); setWorkspace(result.state); setView(input.board); setCaptureOpen(false) }} aiClient={aiClient} onOpenSettings={() => { setCaptureOpen(false); setView('settings') }} />}
    {selectedItem && <DetailDrawer key={selectedItem.id} item={selectedItem} categories={workspace.settings.categories} receipt={selectedReceipt} onClose={() => setSelectedId(null)} onSave={(patch) => { setWorkspace(updateItem(workspace, selectedItem.id, patch).state); if (!fileMode) setToast('卡片已保存') }} onMove={(stage) => requestMove(selectedItem.id, stage)} onAdvance={() => { if (selectedItem.stage === 'archive') return; const target = nextStageFor(selectedItem.stage); if (target === 'archive') { setWorkspace(archiveItem(workspace, selectedItem.id, 'archive').state); setSelectedId(null); setToast('已完成并归档') } else requestMove(selectedItem.id, target) }} onStop={() => setPendingStopId(selectedItem.id)} onRestore={() => { const result = restoreItem(workspace, selectedItem.id, 'radar'); setWorkspace(result.state); setSelectedId(null); setView(selectedItem.board); setToast('已恢复到 Radar') }} onDelete={() => setPendingDeleteId(selectedItem.id)} onSpawn={() => { const result = spawnItem(workspace, selectedItem.id, { title: `${selectedItem.title} — 新线索`, board: selectedItem.board, topics: selectedItem.topics }); setWorkspace(result.state); setSelectedId(result.itemId); setToast('已生成一张 Radar 卡片') }} onOpenPlan={selectedItem.stage === 'engage' ? () => setPlanItemId(selectedItem.id) : undefined} aiClient={aiClient} onOpenSettings={() => { setSelectedId(null); setView('settings') }} />}
    {pendingEngageItem && <EngageCommitDialog item={pendingEngageItem} engageItems={engageItems} engageCount={engageCount} engageLimit={workspace.settings.engageWipLimit} focusCount={focusCount} focusLimit={workspace.settings.focusWipLimit} onClose={() => setPendingEngageId(null)} onConfirm={(options) => { const itemId = pendingEngageItem.id; setPendingEngageId(null); if (executeMove(itemId, 'engage', options)) setPlanItemId(itemId) }} />}
    {planItem && <EngagePlanDialog item={planItem} listName={workspace.settings.tickTickListName} hasReceipt={Boolean(findActiveTickTickReceipt(workspace, planItem.id))} createMode={workspace.settings.tickTickCreateMode === 'cli' ? 'cli' : 'deeplink'} aiClient={aiClient} onOpenSettings={() => { setPlanItemId(null); setView('settings') }} onClose={() => setPlanItemId(null)} onCreateMain={(plan) => commitTickTick(planItem.id, 'main', plan)} onCreateTree={(plan) => commitTickTick(planItem.id, 'tree', plan)} />}
    {pendingStopId && <ConfirmDialog title="停止关注" confirmLabel="确认停止关注" tone="danger" onClose={() => setPendingStopId(null)} onConfirm={() => { setWorkspace(archiveItem(workspace, pendingStopId, 'drop').state); setSelectedId(null); setPendingStopId(null); setToast('已停止关注并移入归档') }}><p>卡片会移入归档并保留历史，之后仍可恢复。</p></ConfirmDialog>}
    {pendingDeleteItem && <ConfirmDialog title="永久删除卡片" confirmLabel="确认永久删除" tone="danger" onClose={() => setPendingDeleteId(null)} onConfirm={confirmPermanentDelete}><p><strong>{pendingDeleteItem.title}</strong> 将被永久删除。永久删除后无法恢复。</p></ConfirmDialog>}
    {wipBlocked && <ConfirmDialog title={`${stageLabels[wipBlocked.target]} 已满`} confirmLabel="仍然移入" onClose={() => setWipBlocked(null)} onConfirm={() => { const pending = wipBlocked; setWipBlocked(null); executeMove(pending.itemId, pending.target, { overrideWip: true }) }}><p>当前已有 {wipBlocked.current}/{wipBlocked.limit} 项。继续会暂时突破你设定的上限。</p></ConfirmDialog>}
    {reviewId && <WeeklyReviewOverlay workspace={workspace} reviewId={reviewId} aiClient={aiClient} onChange={setWorkspace} onClose={() => setReviewId(null)} onOpenItem={(item) => setSelectedId(item.id)} onOpenSettings={() => { setReviewId(null); setView('settings') }} />}
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>
}
