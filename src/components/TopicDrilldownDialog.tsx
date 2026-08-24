import { useEffect, useRef, type CSSProperties } from 'react'
import type { AttentionItem, Board, Stage, WorkspaceSettings } from '../domain/types'

interface TopicDrilldownDialogProps {
  topic: string
  items: AttentionItem[]
  categories: WorkspaceSettings['categories']
  onOpenItem: (item: AttentionItem) => void
  onClose: () => void
}

const boardLabels: Record<Board, string> = {
  explore: '探索',
  create: '创造',
}

const stageLabels: Record<Stage, string> = {
  radar: '雷达',
  focus: '聚焦',
  engage: '投入',
  outcome: '成果与复盘',
  archive: '归档',
}

const fallbackCategoryColor = '#7e8f9a'

function ResultCard({
  item,
  categories,
  onOpen,
}: {
  item: AttentionItem
  categories: WorkspaceSettings['categories']
  onOpen: (item: AttentionItem) => void
}) {
  const category = item.category
    ? categories[item.board]?.find((definition) => definition.name === item.category)
    : undefined
  const style = {
    '--topic-result-category-color': category?.color ?? fallbackCategoryColor,
  } as CSSProperties

  return <button
    type="button"
    className="topic-drilldown-item"
    style={style}
    aria-label={`打开卡片：${item.title}`}
    onClick={() => onOpen(item)}
  >
    <span className="topic-drilldown-item-heading">
      <strong>{item.title}</strong>
      {item.stage === 'archive' && <b>已归档</b>}
    </span>
    <span className="topic-drilldown-metadata">
      <span>{stageLabels[item.stage]}</span>
      <span className="topic-drilldown-category">{category?.name ?? item.category ?? '未分类'}</span>
    </span>
    <span className="topic-drilldown-topics">
      {item.topics.length
        ? item.topics.map((topic) => <span key={topic}>#{topic}</span>)
        : <span>暂无主题</span>}
    </span>
  </button>
}

export function TopicDrilldownDialog({
  topic,
  items,
  categories,
  onOpenItem,
  onClose,
}: TopicDrilldownDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return <div
    className="topic-drilldown-backdrop"
    data-testid="topic-drilldown-backdrop"
    onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
  >
    <section
      className="topic-drilldown-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="topic-drilldown-title"
    >
      <header className="topic-drilldown-heading">
        <div>
          <p className="eyebrow">TOPIC / CARDS</p>
          <h2 id="topic-drilldown-title">{topic}</h2>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          className="icon-button"
          aria-label="关闭主题结果"
          onClick={onClose}
        >×</button>
      </header>
      <div className="topic-drilldown-columns">
        {(['explore', 'create'] as const).map((board) => {
          const boardItems = items.filter((item) => item.board === board)
          const label = boardLabels[board]
          return <section key={board} className="topic-drilldown-lane" aria-label={`${label}结果`}>
            <header>
              <h3>{label}</h3>
              <span>{boardItems.length}</span>
            </header>
            <div className="topic-drilldown-list">
              {boardItems.length
                ? boardItems.map((item) => <ResultCard
                  key={item.id}
                  item={item}
                  categories={categories}
                  onOpen={onOpenItem}
                />)
                : <p className="empty-state">暂无{label}结果</p>}
            </div>
          </section>
        })}
      </div>
    </section>
  </div>
}
