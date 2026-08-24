import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EngageCommitDialog } from './EngageCommitDialog'
import type { AttentionItem } from '../domain/types'

const item: AttentionItem = {
  id: 'new',
  title: '做所向',
  description: '',
  board: 'create',
  category: '产品 / 项目',
  topics: ['注意力与个人系统'],
  stage: 'focus',
  capturedAt: '2026-08-23T00:00:00.000Z',
  stageEnteredAt: '2026-08-23T00:00:00.000Z',
  lastTouchedAt: '2026-08-23T00:00:00.000Z',
  lastProgressAt: null,
  version: 1,
}

const occupying: AttentionItem = { ...item, id: 'old', title: '旧投入', stage: 'engage', board: 'explore', category: null, topics: [] }

describe('EngageCommitDialog', () => {
  it('confirms entry without creating TickTick when Engage has room', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <EngageCommitDialog
        item={item}
        engageItems={[]}
        engageCount={1}
        engageLimit={4}
        focusCount={0}
        focusLimit={10}
        onClose={() => undefined}
        onConfirm={onConfirm}
      />,
    )

    expect(screen.queryByText(/这只表示你愿意承诺投入/)).toBeNull()
    expect(screen.queryByText(/当前 Engage 1\/4/)).toBeNull()
    expect(screen.queryByRole('button', { name: '移入并创建滴答任务' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '确认进入' }))
    expect(onConfirm).toHaveBeenCalledWith({})
  })

  it('offers replace-to-focus and override when Engage is full', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <EngageCommitDialog
        item={item}
        engageItems={[occupying]}
        engageCount={1}
        engageLimit={1}
        focusCount={0}
        focusLimit={10}
        onClose={() => undefined}
        onConfirm={onConfirm}
      />,
    )

    expect(screen.queryByRole('button', { name: '降回 Focus' })).toBeNull()
    expect(screen.getByText('Engage 已满。')).toBeVisible()
    expect(screen.getByText(/Engage 1\/1 已超出建议同时进行任务的数量/)).toBeVisible()
    expect(screen.queryByText(/继续待办但不再占用 Engage/)).toBeNull()
    expect(screen.queryByText(/也可以任性加入/)).toBeNull()
    await user.click(screen.getByRole('button', { name: '替换' }))
    expect(onConfirm).toHaveBeenCalledWith({ replaceItemId: 'old', displaceTarget: 'focus' })
    onConfirm.mockClear()
    await user.click(screen.getByRole('button', { name: '任性加入' }))
    expect(onConfirm).toHaveBeenCalledWith({ overrideWip: true })
  })

  it('disables replace when Focus is also full', () => {
    render(
      <EngageCommitDialog
        item={item}
        engageItems={[occupying]}
        engageCount={1}
        engageLimit={1}
        focusCount={10}
        focusLimit={10}
        onClose={() => undefined}
        onConfirm={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: '替换' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '任性加入' })).toBeEnabled()
  })
})
