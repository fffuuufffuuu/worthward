import { useState, type ReactNode } from 'react'

export function TopicEditor({ topics, onChange, legendAction }: {
  topics: string[]
  onChange: (topics: string[]) => void
  legendAction?: ReactNode
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  function addDraft(keepOpen: boolean) {
    const topic = draft.trim()
    if (topic && !topics.includes(topic)) onChange([...topics, topic])
    setDraft('')
    setAdding(keepOpen)
  }

  return <fieldset className="topic-editor" aria-label="主题标签">
    <div className="topic-editor-heading">
      <span className="topic-editor-title">主题标签</span>
      {legendAction}
    </div>
    <div className="topic-editor-list">
      {topics.map((topic) => <span className="topic-edit-chip" key={topic} tabIndex={0}>
        <span>{topic}</span>
        <button
          type="button"
          aria-label={`删除主题标签：${topic}`}
          onClick={() => onChange(topics.filter((value) => value !== topic))}
        >×</button>
      </span>)}
      {adding ? <input
        autoFocus
        aria-label="输入主题标签"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            addDraft(true)
          }
          if (event.key === 'Escape') {
            setDraft('')
            setAdding(false)
          }
        }}
        onBlur={() => addDraft(false)}
      /> : <button
        type="button"
        className="add-topic-button"
        aria-label="添加标签"
        onClick={() => setAdding(true)}
      >＋ 添加标签</button>}
    </div>
  </fieldset>
}
