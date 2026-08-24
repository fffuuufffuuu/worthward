import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WeeklyReviewOverlay } from './WeeklyReviewOverlay'
import { createInitialWorkspace } from '../domain/defaults'
import { captureItem } from '../domain/workspace'
import { startWeeklyReview } from '../domain/review'
import { createMemoryAiClient, type AiClient } from '../data/aiClient'
import type { WorkspaceState } from '../domain/types'

function Harness({
  initial,
  reviewId,
  suggestReviewPlan,
  onClose,
  onOpenItem,
}: {
  initial: WorkspaceState
  reviewId: string
  suggestReviewPlan?: (request: Parameters<AiClient['suggestReviewPlan']>[0]) => ReturnType<AiClient['suggestReviewPlan']>
  onClose?: () => void
  onOpenItem?: (item: import('../domain/types').AttentionItem) => void
}) {
  const [workspace, setWorkspace] = useState(initial)
  return (
    <WeeklyReviewOverlay
      workspace={workspace}
      reviewId={reviewId}
      aiClient={{ ...createMemoryAiClient(), suggestReviewPlan: suggestReviewPlan ?? createMemoryAiClient().suggestReviewPlan }}
      onChange={setWorkspace}
      onClose={onClose ?? (() => undefined)}
      onOpenItem={onOpenItem}
    />
  )
}

describe('WeeklyReviewOverlay', () => {
  it('does not call the model until the user asks for a combination', async () => {
    const suggestReviewPlan = vi.fn(async () => ({
      ok: false,
      code: 'network',
      error: '未连接',
    })) as unknown as AiClient['suggestReviewPlan']
    const captured = captureItem(createInitialWorkspace(), { title: '雷达甲', board: 'explore' })
    const started = startWeeklyReview(captured.state, {
      now: () => '2026-08-24T00:00:00.000Z',
      id: () => 'review-1',
    })
    const user = userEvent.setup()
    render(<Harness initial={started.state} reviewId={started.reviewId} suggestReviewPlan={suggestReviewPlan} />)

    expect(screen.getByLabelText('近期关注方向')).toBeVisible()
    expect(screen.getByPlaceholderText('说说接下来一周真正想盯住的方向。')).toBeVisible()
    expect(screen.getByText('写出近期关注的方向，推荐卡片会更聚焦。没想好也可留空。')).toBeVisible()
    expect(screen.queryByText(/左侧方向会参与/)).toBeNull()
    expect(screen.getByLabelText('当前容量')).toHaveTextContent('Focus')
    expect(screen.getByLabelText('当前容量')).toHaveTextContent('0/10')
    expect(screen.getByLabelText('当前容量')).toHaveTextContent('Engage')
    expect(screen.getByLabelText('当前容量')).toHaveTextContent('0/4')
    expect(screen.getByRole('heading', { name: '哪些值得我关注？' })).toBeVisible()
    expect(suggestReviewPlan).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '生成 AI 建议' }))
    expect(suggestReviewPlan).toHaveBeenCalledOnce()
    expect(suggestReviewPlan).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'radar_focus',
      candidateIds: [captured.itemId],
    }))
  })

  it('asks whether to save or discard when closing an in-progress review', async () => {
    const started = startWeeklyReview(createInitialWorkspace(), {
      now: () => '2026-08-24T00:00:00.000Z',
      id: () => 'review-1',
    })
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<Harness initial={started.state} reviewId={started.reviewId} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: '下一步' }))
    await user.click(screen.getByRole('button', { name: '关闭注意力梳理' }))
    expect(screen.getByRole('heading', { name: '离开注意力梳理' })).toBeVisible()
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '保存并稍后继续' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.getByText('2 / 6')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '关闭注意力梳理' }))
    await user.click(screen.getByRole('button', { name: '清空并退出' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('keeps AI combo drafts when navigating between combo steps', async () => {
    const captured = captureItem(createInitialWorkspace(), { title: '雷达甲', board: 'explore' })
    const started = startWeeklyReview(captured.state, {
      now: () => '2026-08-24T00:00:00.000Z',
      id: () => 'review-1',
    })
    const suggestReviewPlan = vi.fn(async () => ({
      ok: true as const,
      suggestion: {
        promotions: [{ itemId: captured.itemId, evidence: '近期相关', relation: '', risk: '' }],
        displacements: [],
        summary: '建议先盯住这张卡片',
      },
    })) as unknown as AiClient['suggestReviewPlan']
    const user = userEvent.setup()
    render(<Harness initial={started.state} reviewId={started.reviewId} suggestReviewPlan={suggestReviewPlan} />)

    await user.click(screen.getByRole('button', { name: '生成 AI 建议' }))
    expect(screen.getByText('建议先盯住这张卡片')).toBeVisible()
    expect(screen.getByRole('checkbox', { name: '晋级' })).toBeChecked()

    await user.click(screen.getByRole('button', { name: '下一步' }))
    expect(screen.getByRole('heading', { name: '哪些值得我投入？' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '上一步' }))
    expect(screen.getByText('建议先盯住这张卡片')).toBeVisible()
    expect(screen.getByRole('checkbox', { name: '晋级' })).toBeChecked()

    await user.click(screen.getByRole('checkbox', { name: '晋级' }))
    expect(screen.getByRole('checkbox', { name: '晋级' })).not.toBeChecked()

    await user.click(screen.getByRole('button', { name: '下一步' }))
    await user.click(screen.getByRole('button', { name: '上一步' }))
    expect(screen.getByRole('checkbox', { name: '晋级' })).not.toBeChecked()
  })

  it('opens card details from review rows', async () => {
    const captured = captureItem(createInitialWorkspace(), { title: '雷达甲', board: 'explore' })
    const started = startWeeklyReview(captured.state, {
      now: () => '2026-08-24T00:00:00.000Z',
      id: () => 'review-1',
    })
    const onOpenItem = vi.fn()
    const user = userEvent.setup()
    render(<Harness initial={started.state} reviewId={started.reviewId} onOpenItem={onOpenItem} />)

    await user.click(screen.getByRole('button', { name: '打开卡片：雷达甲' }))
    expect(onOpenItem).toHaveBeenCalledWith(expect.objectContaining({ id: captured.itemId, title: '雷达甲' }))
  })

  it('keeps manual promotion selections without generating AI', async () => {
    const captured = captureItem(createInitialWorkspace(), { title: '雷达甲', board: 'explore' })
    const started = startWeeklyReview(captured.state, {
      now: () => '2026-08-24T00:00:00.000Z',
      id: () => 'review-1',
    })
    const user = userEvent.setup()
    render(<Harness initial={started.state} reviewId={started.reviewId} />)

    await user.click(screen.getByRole('checkbox', { name: '晋级' }))
    expect(screen.getByRole('checkbox', { name: '晋级' })).toBeChecked()
    await user.click(screen.getByRole('button', { name: '下一步' }))
    await user.click(screen.getByRole('button', { name: '上一步' }))
    expect(screen.getByRole('checkbox', { name: '晋级' })).toBeChecked()
  })
})
