import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CATEGORY_DEFINITIONS } from '../domain/categories'
import type { AttentionItem, WorkspaceSettings } from '../domain/types'
import { TopicDrilldownDialog } from './TopicDrilldownDialog'

const categories: WorkspaceSettings['categories'] = {
  explore: [...DEFAULT_CATEGORY_DEFINITIONS.explore],
  create: [...DEFAULT_CATEGORY_DEFINITIONS.create],
}

function item(overrides: Partial<AttentionItem> & Pick<AttentionItem, 'id' | 'title'>): AttentionItem {
  const { id, title, ...rest } = overrides
  return {
    id,
    title,
    description: '',
    board: 'explore',
    category: '主题 / 问题',
    topics: ['学习科学'],
    stage: 'radar',
    capturedAt: '2026-08-01T00:00:00.000Z',
    stageEnteredAt: '2026-08-01T00:00:00.000Z',
    lastTouchedAt: '2026-08-01T00:00:00.000Z',
    lastProgressAt: null,
    version: 1,
    ...rest,
  }
}

const activeItem = item({
  id: 'active-explore',
  title: '理解学习迁移',
  topics: ['学习科学', '认知心理学'],
})

const archivedItem = item({
  id: 'archived-explore',
  title: '旧分类卡片',
  category: '已删除的分类',
  topics: ['学习科学'],
  stage: 'archive',
})

describe('TopicDrilldownDialog', () => {
  it('shows the topic, both boards, item metadata, archive status, and an empty lane', () => {
    render(<TopicDrilldownDialog
      topic="学习科学"
      items={[activeItem, archivedItem]}
      categories={categories}
      onOpenItem={vi.fn()}
      onClose={vi.fn()}
    />)

    expect(screen.getByRole('dialog', { name: '学习科学' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '学习科学' })).toBeVisible()

    const exploreLane = screen.getByRole('region', { name: '探索结果' })
    expect(within(exploreLane).getByRole('heading', { name: '探索' })).toBeVisible()
    expect(within(exploreLane).getByText('理解学习迁移')).toBeVisible()
    expect(within(exploreLane).getByText('雷达')).toBeVisible()
    expect(within(exploreLane).getByText('主题 / 问题')).toBeVisible()
    expect(within(exploreLane).getAllByText('#学习科学')).toHaveLength(2)
    expect(within(exploreLane).getByText('#认知心理学')).toBeVisible()
    expect(within(exploreLane).getByText('已归档')).toBeVisible()
    expect(within(exploreLane).getByText('已删除的分类')).toBeVisible()
    expect(within(exploreLane).getByRole('button', { name: '打开卡片：旧分类卡片' }))
      .toHaveStyle('--topic-result-category-color: #7e8f9a')

    const createLane = screen.getByRole('region', { name: '创造结果' })
    expect(within(createLane).getByRole('heading', { name: '创造' })).toBeVisible()
    expect(within(createLane).getByText('暂无创造结果')).toBeVisible()
  })

  it('returns the selected item when a result is clicked', async () => {
    const user = userEvent.setup()
    const onOpenItem = vi.fn()
    const createItem = item({ id: 'create', title: '制作学习卡片', board: 'create', category: '产品 / 项目' })
    render(<TopicDrilldownDialog
      topic="学习科学"
      items={[activeItem, createItem]}
      categories={categories}
      onOpenItem={onOpenItem}
      onClose={vi.fn()}
    />)

    await user.click(screen.getByRole('button', { name: '打开卡片：制作学习卡片' }))

    expect(onOpenItem).toHaveBeenCalledOnce()
    expect(onOpenItem).toHaveBeenCalledWith(createItem)
  })

  it('closes from its button, backdrop, or Escape, but not from dialog content', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<TopicDrilldownDialog
      topic="学习科学"
      items={[activeItem]}
      categories={categories}
      onOpenItem={vi.fn()}
      onClose={onClose}
    />)

    await user.click(screen.getByRole('button', { name: '关闭主题结果' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('topic-drilldown-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(2)

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('focuses the close button first and supports opening a result from the keyboard', async () => {
    const user = userEvent.setup()
    const onOpenItem = vi.fn()
    render(<TopicDrilldownDialog
      topic="学习科学"
      items={[activeItem]}
      categories={categories}
      onOpenItem={onOpenItem}
      onClose={vi.fn()}
    />)

    expect(screen.getByRole('button', { name: '关闭主题结果' })).toHaveFocus()

    await user.tab()
    expect(screen.getByRole('button', { name: '打开卡片：理解学习迁移' })).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(onOpenItem).toHaveBeenCalledWith(activeItem)
  })
})
