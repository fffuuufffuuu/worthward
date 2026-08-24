import { useRef, useState } from 'react'
import type { AiClient, TopicSuggestion } from '../data/aiClient'
import { mergeExistingTopics } from '../domain/autoTag'
import type { Board } from '../domain/types'
import { TopicEditor } from './TopicEditor'

export interface TopicCardDraft {
  title: string
  description: string
  board: Board
  category: string | null
}

interface AiTopicEditorProps {
  topics: string[]
  onChange: (topics: string[]) => void
  card: TopicCardDraft
  aiClient: AiClient
  onOpenSettings?: () => void
}

type StatusKind = 'idle' | 'loading' | 'added' | 'proposed' | 'empty' | 'error' | 'missing_key' | 'stale'

function statusText(kind: StatusKind): string {
  if (kind === 'added') return '已添加现有标签'
  if (kind === 'proposed') return '发现新标签建议'
  if (kind === 'empty') return '没有合适标签'
  if (kind === 'error') return '分析失败，重新尝试'
  if (kind === 'missing_key') return '尚未保存 API 密钥。'
  if (kind === 'stale') return '卡片已更改，请重新分析'
  return ''
}

export function AiTopicEditor({
  topics,
  onChange,
  card,
  aiClient,
  onOpenSettings,
}: AiTopicEditorProps) {
  const [status, setStatus] = useState<StatusKind>('idle')
  const [proposed, setProposed] = useState<TopicSuggestion[]>([])
  const requestId = useRef(0)
  const cardRef = useRef(card)
  const topicsRef = useRef(topics)
  cardRef.current = card
  topicsRef.current = topics

  async function autoTag() {
    const id = ++requestId.current
    const snapshot = { ...card }
    setStatus('loading')
    setProposed([])
    const result = await aiClient.suggestTopics({
      title: card.title,
      description: card.description,
      board: card.board,
      category: card.category,
      selectedTopics: topics,
    })
    if (id !== requestId.current) return
    const latest = cardRef.current
    if (
      snapshot.title !== latest.title ||
      snapshot.description !== latest.description ||
      snapshot.board !== latest.board ||
      snapshot.category !== latest.category
    ) {
      setStatus('stale')
      return
    }
    if (!result.ok) {
      setStatus(result.code === 'missing_key' || result.code === 'not_configured' ? 'missing_key' : 'error')
      return
    }
    onChange(mergeExistingTopics(topicsRef.current, result.existing))
    setProposed(result.proposed)
    if (result.proposed.length) setStatus('proposed')
    else if (result.existing.length) setStatus('added')
    else setStatus('empty')
  }

  function confirmProposed(suggestion: TopicSuggestion) {
    const name = suggestion.reuse ?? suggestion.name
    onChange(mergeExistingTopics(topicsRef.current, [{ name, reason: suggestion.reason }]))
    setProposed((current) => {
      const next = current.filter((item) => item.name !== suggestion.name)
      if (next.length === 0) setStatus('added')
      return next
    })
  }

  return (
    <div className="ai-topic-editor">
      <TopicEditor
        topics={topics}
        onChange={onChange}
        legendAction={
          <>
            <button
              type="button"
              className="compact-ai-button"
              onClick={autoTag}
              disabled={status === 'loading'}
            >
              AI 自动标签
            </button>
            {status === 'loading' && (
              <span role="status" className="plan-ai-status" aria-label="AI 分析中" aria-live="polite">
                <span className="plan-ai-spinner" aria-hidden="true" />
              </span>
            )}
          </>
        }
      />
      {status !== 'idle' && status !== 'loading' && (
        <div className="ai-topic-actions">
          <p role="status" className="subtle">{statusText(status)}</p>
          {status === 'missing_key' && onOpenSettings && (
            <button type="button" className="text-button" onClick={onOpenSettings}>打开 AI 设置</button>
          )}
        </div>
      )}
      {proposed.length > 0 && (
        <ul className="ai-topic-proposed">
          {proposed.map((suggestion) => (
            <li key={suggestion.name}>
              <div>
                <strong>{suggestion.name}</strong>
                {suggestion.reason && <span className="subtle"> {suggestion.reason}</span>}
                {suggestion.reuse && <p className="subtle">建议复用「{suggestion.reuse}」</p>}
              </div>
              {suggestion.reuse ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => confirmProposed(suggestion)}
                  aria-label={`复用现有标签：${suggestion.reuse}`}
                >
                  使用现有标签
                </button>
              ) : (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => confirmProposed(suggestion)}
                  aria-label={`确认新标签：${suggestion.name}`}
                >
                  确认添加
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
