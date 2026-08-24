import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EngagePlanDialog } from './EngagePlanDialog'
import type { AiClient } from '../data/aiClient'
import type { AttentionItem } from '../domain/types'

const item: AttentionItem = {
  id: 'card-1',
  title: '做所向',
  description: '接入 LLM',
  board: 'create',
  category: '产品 / 项目',
  topics: ['注意力与个人系统'],
  stage: 'engage',
  capturedAt: '2026-08-23T00:00:00.000Z',
  stageEnteredAt: '2026-08-23T00:00:00.000Z',
  lastTouchedAt: '2026-08-23T00:00:00.000Z',
  lastProgressAt: null,
  version: 1,
}

function client(partial: Partial<AiClient> = {}): AiClient {
  return {
    status: async () => ({ hasKey: true }),
    saveCredential: async () => ({ ok: true }),
    clearCredential: async () => ({ ok: true }),
    testConnection: async () => ({ ok: true }),
    suggestTopics: async () => ({ ok: true, existing: [], proposed: [] }),
    suggestEngagePlan: async () => ({ ok: true, mainTitle: '', mainNotes: '', steps: [] }),
    suggestReviewPlan: async () => ({ ok: false, code: 'network', error: '未连接' }),
    ...partial,
  }
}

describe('EngagePlanDialog', () => {
  it('does not call the model until generate is clicked', () => {
    const suggestEngagePlan = vi.fn(async () => ({ ok: true, mainTitle: '做所向', mainNotes: '', steps: [] }))
    render(
      <EngagePlanDialog
        item={item}
        listName="收集箱"
        hasReceipt={false}
        aiClient={client({ suggestEngagePlan })}
        onClose={() => undefined}
        onCreateMain={() => undefined}
        onCreateTree={() => undefined}
      />,
    )
    expect(screen.getByRole('button', { name: 'AI 生成任务拆解' })).toBeVisible()
    expect(suggestEngagePlan).not.toHaveBeenCalled()
  })

  it('lets the user skip TickTick without creating a handoff', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onCreateMain = vi.fn()
    render(
      <EngagePlanDialog
        item={item}
        listName="收集箱"
        hasReceipt={false}
        aiClient={client()}
        onClose={onClose}
        onCreateMain={onCreateMain}
        onCreateTree={() => undefined}
      />,
    )

    await user.click(screen.getByRole('button', { name: '不创建滴答任务' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onCreateMain).not.toHaveBeenCalled()
  })

  it('creates only the main task from the current draft', async () => {
    const user = userEvent.setup()
    const onCreateMain = vi.fn()
    const onCreateTree = vi.fn()
    render(
      <EngagePlanDialog
        item={item}
        listName="收集箱"
        hasReceipt={false}
        aiClient={client()}
        onClose={() => undefined}
        onCreateMain={onCreateMain}
        onCreateTree={onCreateTree}
      />,
    )
    await user.click(screen.getByRole('button', { name: '只创建主任务' }))
    expect(onCreateMain).toHaveBeenCalledOnce()
    expect(onCreateMain.mock.calls[0]?.[0]).toMatchObject({ mainTitle: '做所向', steps: [] })
    expect(onCreateTree).not.toHaveBeenCalled()
  })

  it('asks for a second confirmation before writing the tree', async () => {
    const user = userEvent.setup()
    const suggestEngagePlan = vi.fn(async () => ({
      ok: true,
      mainTitle: '做所向',
      mainNotes: '先能用',
      steps: [{ title: '明确最小成果', notes: '', children: [] }],
    }))
    const onCreateTree = vi.fn()
    render(
      <EngagePlanDialog
        item={item}
        listName="收集箱"
        hasReceipt={false}
        aiClient={client({ suggestEngagePlan })}
        onClose={() => undefined}
        onCreateMain={() => undefined}
        onCreateTree={onCreateTree}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'AI 生成任务拆解' }))
    await waitFor(() => expect(screen.getByDisplayValue('明确最小成果')).toBeVisible())
    expect(screen.getByRole('button', { name: '创建主任务和子任务' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '创建主任务和子任务' }))
    expect(onCreateTree).not.toHaveBeenCalled()
    expect(screen.getByText(/将在清单「收集箱」创建主任务/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: '确认写入' }))
    expect(onCreateTree).toHaveBeenCalledOnce()
  })

  it('sends the latest main title and notes to the model', async () => {
    const user = userEvent.setup()
    const suggestEngagePlan = vi.fn(async () => ({
      ok: true,
      mainTitle: '忽略我',
      mainNotes: '',
      steps: [{ title: '拆成步骤', notes: '', children: [] }],
    }))
    render(
      <EngagePlanDialog
        item={item}
        listName="收集箱"
        hasReceipt={false}
        aiClient={client({ suggestEngagePlan })}
        onClose={() => undefined}
        onCreateMain={() => undefined}
        onCreateTree={() => undefined}
      />,
    )

    const title = screen.getByLabelText('主任务标题')
    const notes = screen.getByLabelText('主任务说明')
    await user.clear(title)
    await user.type(title, '改过的主任务')
    await user.clear(notes)
    await user.type(notes, '改过的说明')
    await user.click(screen.getByRole('button', { name: 'AI 生成任务拆解' }))

    expect(suggestEngagePlan).toHaveBeenCalledWith(expect.objectContaining({
      title: '改过的主任务',
      description: '改过的说明',
      mainTitle: '改过的主任务',
      mainNotes: '改过的说明',
    }))
    await waitFor(() => expect(screen.getByDisplayValue('拆成步骤')).toBeVisible())
    expect(screen.getByDisplayValue('改过的主任务')).toBeVisible()
    expect(screen.getByDisplayValue('改过的说明')).toBeVisible()
  })

  it('shows a spinner instead of the analysis label while generating', async () => {
    const user = userEvent.setup()
    let finish!: (value: Awaited<ReturnType<AiClient['suggestEngagePlan']>>) => void
    const suggestEngagePlan = vi.fn(() => new Promise<Awaited<ReturnType<AiClient['suggestEngagePlan']>>>((resolve) => {
      finish = resolve
    }))
    render(
      <EngagePlanDialog
        item={item}
        listName="收集箱"
        hasReceipt={false}
        aiClient={client({ suggestEngagePlan })}
        onClose={() => undefined}
        onCreateMain={() => undefined}
        onCreateTree={() => undefined}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'AI 生成任务拆解' }))
    expect(screen.getByRole('status', { name: 'AI 分析中' })).toBeVisible()
    expect(document.querySelector('.plan-ai-spinner')).not.toBeNull()
    finish({ ok: true, mainTitle: '做所向', mainNotes: '', steps: [] })
    await waitFor(() => expect(screen.getByText('没有生成步骤，可手工补充或只创建主任务')).toBeVisible())
  })

  it('uses icons for step actions', async () => {
    const user = userEvent.setup()
    render(
      <EngagePlanDialog
        item={item}
        listName="收集箱"
        hasReceipt={false}
        aiClient={client()}
        onClose={() => undefined}
        onCreateMain={() => undefined}
        onCreateTree={() => undefined}
      />,
    )

    await user.click(screen.getByRole('button', { name: '新增一级任务' }))
    expect(screen.getByRole('button', { name: '上移' })).toBeVisible()
    expect(screen.getByRole('button', { name: '下移' })).toBeVisible()
    expect(screen.getAllByRole('button', { name: '删除' })[0]).toBeVisible()
    expect(screen.getByRole('button', { name: '新增二级任务' })).toBeVisible()
    expect(screen.queryByText('上移')).toBeNull()
    expect(screen.queryByText('下移')).toBeNull()
    expect(screen.queryByText('删除')).toBeNull()
    expect(screen.queryByText('新增二级任务')).toBeNull()
    expect(screen.queryByText('新增一级任务')).toBeNull()
  })
})
