import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CategoryManager } from './CategoryManager'
import { createInitialWorkspace } from '../domain/defaults'
import type { WorkspaceState } from '../domain/types'

function workspaceWithCategories(): WorkspaceState {
  const workspace = createInitialWorkspace()
  return {
    ...workspace,
    items: {
      usedExplore: {
        id: 'usedExplore', title: '在用的探索卡片', description: '', board: 'explore', category: '主题 / 问题', topics: [],
        stage: 'radar', capturedAt: '2026-08-01T00:00:00.000Z', stageEnteredAt: '2026-08-01T00:00:00.000Z',
        lastTouchedAt: '2026-08-01T00:00:00.000Z', lastProgressAt: null, version: 1,
      },
      usedCreate: {
        id: 'usedCreate', title: '在用的创造卡片', description: '', board: 'create', category: '产品 / 项目', topics: [],
        stage: 'radar', capturedAt: '2026-08-01T00:00:00.000Z', stageEnteredAt: '2026-08-01T00:00:00.000Z',
        lastTouchedAt: '2026-08-01T00:00:00.000Z', lastProgressAt: null, version: 1,
      },
    },
  }
}

function Harness({ initial = workspaceWithCategories() }: { initial?: WorkspaceState }) {
  const [workspace, setWorkspace] = useState(initial)
  return <><CategoryManager workspace={workspace} onChange={setWorkspace} /><output data-testid="workspace">{JSON.stringify(workspace)}</output></>
}

describe('CategoryManager', () => {
  it('separates explore and create category regions with accessible controls', () => {
    render(<Harness />)

    expect(within(screen.getByRole('region', { name: '探索类别标签' })).getByLabelText('探索类别名称：主题 / 问题')).toBeVisible()
    expect(within(screen.getByRole('region', { name: '创造类别标签' })).getByLabelText('创造类别颜色：产品 / 项目')).toHaveAttribute('type', 'color')
    expect(screen.getByRole('textbox', { name: '新增探索类别' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: '新增创造类别' })).toBeVisible()
  })

  it('adds a trimmed category to its own board', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByRole('textbox', { name: '新增探索类别' }), '  新发现  ')
    await user.click(screen.getByRole('button', { name: '添加探索类别' }))

    expect(screen.getByLabelText('探索类别名称：新发现')).toHaveValue('新发现')
    expect(screen.getByTestId('workspace').textContent).toContain('"name":"新发现"')
  })

  it('shows a visible error and keeps state unchanged for a same-board duplicate', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByRole('textbox', { name: '新增探索类别' }), '主题 / 问题')
    await user.click(screen.getByRole('button', { name: '添加探索类别' }))

    expect(screen.getByRole('alert')).toHaveTextContent('探索板块中已存在同名类别。')
    expect(screen.getAllByLabelText(/探索类别名称：主题 \/ 问题/)).toHaveLength(1)
  })

  it('renames a category and synchronizes its assigned cards', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const nameInput = screen.getByLabelText('探索类别名称：主题 / 问题')

    await user.clear(nameInput)
    await user.type(nameInput, '研究问题')
    await user.tab()

    expect(screen.getByLabelText('探索类别名称：研究问题')).toHaveValue('研究问题')
    expect(screen.getByTestId('workspace').textContent).toContain('"category":"研究问题"')
  })

  it('updates a category color through the domain rule', () => {
    render(<Harness />)

    fireEvent.change(screen.getByLabelText('创造类别颜色：产品 / 项目'), { target: { value: '#112233' } })

    expect(screen.getByTestId('workspace').textContent).toContain('"color":"#112233"')
  })

  it('deletes an unused category after direct confirmation', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: '删除书籍 / 影音' }))
    expect(screen.getByRole('dialog', { name: '删除类别：书籍 / 影音' })).toHaveTextContent('将影响 0 张卡片')
    await user.click(screen.getByRole('button', { name: '确认删除' }))

    expect(screen.queryByLabelText('探索类别名称：书籍 / 影音')).toBeNull()
  })

  it('requires a same-board migration choice before deleting a used category', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: '删除主题 / 问题' }))
    const dialog = screen.getByRole('dialog', { name: '删除类别：主题 / 问题' })

    expect(dialog).toHaveTextContent('将影响 1 张卡片')
    expect(within(dialog).getByRole('button', { name: '确认删除' })).toBeDisabled()
    expect(within(dialog).getByLabelText('书籍 / 影音')).toBeVisible()
    expect(within(dialog).getByLabelText('课程 / 体验')).toBeVisible()
    expect(within(dialog).queryByLabelText('产品 / 项目')).toBeNull()
    expect(within(dialog).getByLabelText('改为未分类')).toBeVisible()

    await user.click(within(dialog).getByLabelText('书籍 / 影音'))
    await user.click(within(dialog).getByRole('button', { name: '确认删除' }))

    expect(screen.getByTestId('workspace').textContent).toContain('"category":"书籍 / 影音"')
  })

  it('can migrate a used category to uncategorized', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: '删除产品 / 项目' }))
    const dialog = screen.getByRole('dialog', { name: '删除类别：产品 / 项目' })
    await user.click(within(dialog).getByLabelText('改为未分类'))
    await user.click(within(dialog).getByRole('button', { name: '确认删除' }))

    expect(screen.getByTestId('workspace').textContent).toContain('"category":null')
  })

  it('closes deletion without mutation on Escape or backdrop click', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: '删除书籍 / 影音' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByLabelText('探索类别名称：书籍 / 影音')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '删除书籍 / 影音' }))
    fireEvent.mouseDown(screen.getByTestId('category-delete-backdrop'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByLabelText('探索类别名称：书籍 / 影音')).toBeVisible()
  })
})
