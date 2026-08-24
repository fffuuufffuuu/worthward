import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { AiTopicEditor } from './AiTopicEditor'
import type { AiClient, TopicSuggestionRequest } from '../data/aiClient'

function Harness({
  client,
  onOpenSettings,
}: {
  client: Partial<AiClient>
  onOpenSettings?: () => void
}) {
  const [topics, setTopics] = useState<string[]>([])
  const aiClient = {
    status: async () => ({ hasKey: true }),
    saveCredential: async () => ({ ok: true }),
    clearCredential: async () => ({ ok: true }),
    testConnection: async () => ({ ok: true }),
    suggestTopics: async () => ({ ok: true, existing: [], proposed: [] }),
    suggestEngagePlan: async () => ({ ok: true, mainTitle: '', mainNotes: '', steps: [] }),
    ...client,
  } as AiClient
  return (
    <AiTopicEditor
      topics={topics}
      onChange={setTopics}
      card={{ title: '做所向', description: '接入 LLM', board: 'create', category: '产品 / 项目' }}
      aiClient={aiClient}
      onOpenSettings={onOpenSettings}
    />
  )
}

describe('AiTopicEditor', () => {
  it('does not call the model until the auto-tag button is clicked', async () => {
    const suggestTopics = vi.fn(async () => ({ ok: true, existing: [], proposed: [] }))
    render(<Harness client={{ suggestTopics }} />)
    const autoTag = screen.getByRole('button', { name: 'AI 自动标签' })
    expect(autoTag).toBeVisible()
    expect(autoTag.closest('.topic-editor-heading')).toHaveTextContent('主题标签')
    expect(suggestTopics).not.toHaveBeenCalled()
  })

  it('adds existing tags immediately and asks to confirm new ones', async () => {
    const user = userEvent.setup()
    const suggestTopics = vi.fn(async (_request: TopicSuggestionRequest) => ({
      ok: true as const,
      existing: [{ name: 'AI 与智能体', reason: '在做智能体产品' }],
      proposed: [{ name: '本地优先软件', reason: '可复用主题' }],
    }))
    render(<Harness client={{ suggestTopics }} />)

    await user.click(screen.getByRole('button', { name: 'AI 自动标签' }))
    await waitFor(() => expect(screen.getByText('AI 与智能体')).toBeVisible())
    expect(screen.getByRole('status')).toHaveTextContent('发现新标签建议')
    expect(screen.getByText('本地优先软件')).toBeVisible()
    expect(screen.queryByRole('button', { name: '删除主题标签：本地优先软件' })).toBeNull()

    await user.click(screen.getByRole('button', { name: '确认新标签：本地优先软件' }))
    expect(screen.getByRole('button', { name: '删除主题标签：本地优先软件' })).toBeVisible()
    expect(suggestTopics).toHaveBeenCalledOnce()
    expect(suggestTopics.mock.calls[0]?.[0]).toMatchObject({
      title: '做所向',
      board: 'create',
      selectedTopics: [],
    })
  })

  it('offers reuse instead of creating a near-synonym', async () => {
    const user = userEvent.setup()
    render(<Harness client={{
      suggestTopics: async () => ({
        ok: true,
        existing: [],
        proposed: [{ name: '注意力管理', reason: '在谈专注', reuse: '注意力与个人系统' }],
      }),
    }} />)

    await user.click(screen.getByRole('button', { name: 'AI 自动标签' }))
    await waitFor(() => expect(screen.getByText('建议复用「注意力与个人系统」')).toBeVisible())
    await user.click(screen.getByRole('button', { name: '复用现有标签：注意力与个人系统' }))
    expect(screen.getByRole('button', { name: '删除主题标签：注意力与个人系统' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '删除主题标签：注意力管理' })).toBeNull()
  })

  it('keeps current tags when analysis fails', async () => {
    const user = userEvent.setup()
    render(<Harness client={{
      suggestTopics: async () => ({ ok: false, code: 'timeout', error: '连接超时，请稍后重试。' }),
    }} />)

    await user.click(screen.getByRole('button', { name: 'AI 自动标签' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('分析失败，重新尝试'))
    expect(screen.queryByRole('button', { name: /删除主题标签/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'AI 自动标签' })).toBeEnabled()
  })

  it('points to settings when the key is missing', async () => {
    const user = userEvent.setup()
    const onOpenSettings = vi.fn()
    render(<Harness
      client={{
        suggestTopics: async () => ({ ok: false, code: 'missing_key', error: '尚未保存 API 密钥。' }),
      }}
      onOpenSettings={onOpenSettings}
    />)

    await user.click(screen.getByRole('button', { name: 'AI 自动标签' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '打开 AI 设置' })).toBeVisible())
    await user.click(screen.getByRole('button', { name: '打开 AI 设置' }))
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })

  it('shows a spinner beside the button while analyzing', async () => {
    const user = userEvent.setup()
    let finish!: (value: { ok: true; existing: []; proposed: [] }) => void
    const suggestTopics = vi.fn(() => new Promise<{ ok: true; existing: []; proposed: [] }>((resolve) => {
      finish = resolve
    }))
    render(<Harness client={{ suggestTopics }} />)

    await user.click(screen.getByRole('button', { name: 'AI 自动标签' }))
    expect(screen.getByRole('status', { name: 'AI 分析中' })).toBeVisible()
    expect(document.querySelector('.plan-ai-spinner')).not.toBeNull()
    expect(screen.queryByText('AI 分析中')).toBeNull()
    finish({ ok: true, existing: [], proposed: [] })
    await waitFor(() => expect(screen.getByText('没有合适标签')).toBeVisible())
  })
})
