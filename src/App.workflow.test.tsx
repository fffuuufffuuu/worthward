import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { createInitialWorkspace } from './domain/defaults'
import { exportWorkspaceJson, STORAGE_KEY } from './data/storage'

async function capture(title: string, board: 'explore' | 'create' = 'explore') {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '记录想法' }))
  await user.type(screen.getByLabelText('标题'), title)
  if (board === 'create') await user.click(screen.getByLabelText('创造'))
  await user.click(screen.getByRole('button', { name: '保存到 Radar' }))
  return user
}

describe('attention workflow', () => {
  beforeEach(() => localStorage.clear())

  it('offers the next stage beside free movement', async () => {
    const user = userEvent.setup()
    render(<App />)
    await capture('研究知识追踪')
    await user.click(screen.getByRole('button', { name: '打开卡片：研究知识追踪' }))
    await user.click(screen.getByRole('button', { name: '进入 Focus' }))

    expect(within(screen.getByRole('region', { name: 'Focus' })).getByText('研究知识追踪')).toBeVisible()
    expect(screen.getByRole('button', { name: '进入 Engage' })).toBeVisible()
    expect(screen.queryByText(/Reconsider|Reengage|Reactivate|Promote|Demote/)).toBeNull()
  })

  it('can enter Engage without creating a TickTick handoff', async () => {
    const openExternal = vi.fn()
    const user = userEvent.setup()
    render(<App openExternal={openExternal} />)
    await capture('做注意力工作台', 'create')
    await user.click(screen.getByRole('button', { name: '打开卡片：做注意力工作台' }))
    await user.click(screen.getByRole('button', { name: '进入 Focus' }))
    await user.click(screen.getByRole('button', { name: '进入 Engage' }))

    expect(screen.getByRole('dialog', { name: '进入 Engage' })).toBeVisible()
    expect(screen.getByRole('button', { name: '确认进入' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '移入并创建滴答任务' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '确认进入' }))
    expect(screen.getByRole('dialog', { name: '执行计划' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '不创建滴答任务' }))

    expect(openExternal).not.toHaveBeenCalled()
    expect(screen.queryByText(/已发起滴答创建/)).toBeNull()
    expect(screen.getByRole('button', { name: '进入 Outcome & Review' })).toBeVisible()
  })

  it('creates a TickTick handoff only when explicitly requested', async () => {
    const openExternal = vi.fn()
    const user = userEvent.setup()
    render(<App openExternal={openExternal} />)
    await capture('创建滴答测试', 'create')
    await user.click(screen.getByRole('button', { name: '打开卡片：创建滴答测试' }))
    await user.selectOptions(screen.getByLabelText('移动到'), 'engage')
    await user.click(screen.getByRole('button', { name: '确认进入' }))
    await user.click(screen.getByRole('button', { name: '只创建主任务' }))

    expect(openExternal).toHaveBeenCalledOnce()
    expect(screen.getByText('已发起滴答创建，结果待确认')).toBeVisible()
  })

  it('creates TickTick tasks through CLI without opening a deep link', async () => {
    const openExternal = vi.fn()
    const create = vi.fn(async () => ({ ok: true, taskId: 'task-cli' }))
    const workspace = createInitialWorkspace()
    workspace.settings.tickTickCreateMode = 'cli'
    localStorage.setItem(STORAGE_KEY, exportWorkspaceJson(workspace))
    const user = userEvent.setup()
    render(<App
      openExternal={openExternal}
      tickTickCli={{
        status: async () => ({ ok: true, installed: true, loggedIn: true, projectName: '收集箱' }),
        create,
      }}
    />)

    await capture('CLI写入测试', 'create')
    await user.click(screen.getByRole('button', { name: '打开卡片：CLI写入测试' }))
    await user.selectOptions(screen.getByLabelText('移动到'), 'engage')
    await user.click(screen.getByRole('button', { name: '确认进入' }))
    await user.click(screen.getByRole('button', { name: '只创建主任务' }))

    await waitFor(() => expect(create).toHaveBeenCalledOnce())
    expect(openExternal).not.toHaveBeenCalled()
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'CLI写入测试',
      listName: '收集箱',
    }))
    expect(screen.getAllByText('已通过 CLI 创建滴答主任务').length).toBeGreaterThan(0)
  })

  it('does not open a second TickTick creation when the same card re-enters Engage', async () => {
    const openExternal = vi.fn()
    const user = userEvent.setup()
    render(<App openExternal={openExternal} />)
    await capture('重复进入测试', 'create')
    await user.click(screen.getByRole('button', { name: '打开卡片：重复进入测试' }))
    await user.selectOptions(screen.getByLabelText('移动到'), 'engage')
    await user.click(screen.getByRole('button', { name: '确认进入' }))
    await user.click(screen.getByRole('button', { name: '只创建主任务' }))
    await user.selectOptions(screen.getByLabelText('移动到'), 'outcome')
    await user.selectOptions(screen.getByLabelText('移动到'), 'engage')
    await user.click(screen.getByRole('button', { name: '确认进入' }))
    expect(screen.getByText(/已经发起过滴答创建/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: '不创建滴答任务' }))

    expect(openExternal).toHaveBeenCalledOnce()
    expect(screen.getByText('已发起滴答创建，结果待确认')).toBeVisible()
  })

  it('completes Outcome into Archive without treating it as a drop', async () => {
    const user = userEvent.setup()
    render(<App />)
    await capture('完成一个项目', 'create')
    await user.click(screen.getByRole('button', { name: '打开卡片：完成一个项目' }))
    await user.selectOptions(screen.getByLabelText('移动到'), 'outcome')
    await user.click(screen.getByRole('button', { name: '完成并归档' }))
    await user.click(screen.getByRole('button', { name: '打开归档' }))

    expect(screen.getByRole('button', { name: '打开卡片：完成一个项目' })).toBeVisible()
    expect(screen.getByText('已完成并归档')).toBeVisible()
  })

  it('shows useful insights and a resumable six-step attention grooming flow', async () => {
    const user = userEvent.setup()
    render(<App />)
    await capture('学习 AI')
    await user.click(screen.getByRole('button', { name: '洞察' }))

    expect(screen.getByRole('heading', { name: '注意力洞察' })).toBeVisible()
    expect(screen.getByText('探索 / 创造')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '开始注意力梳理' }))
    expect(screen.getByRole('heading', { name: /哪些值得我关注/ })).toBeVisible()
    expect(screen.getByPlaceholderText('说说接下来一周真正想盯住的方向。')).toBeVisible()
    expect(screen.getByText('写出近期关注的方向，推荐卡片会更聚焦。没想好也可留空。')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '下一步' }))
    expect(screen.getByText('2 / 6')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '关闭注意力梳理' }))
    await user.click(screen.getByRole('button', { name: '保存并稍后继续' }))
    expect(screen.queryByRole('heading', { name: /哪些值得我关注|哪些值得我投入/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: '开始注意力梳理' }))
    expect(screen.getByText('2 / 6')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '关闭注意力梳理' }))
    await user.click(screen.getByRole('button', { name: '清空并退出' }))
    await user.click(screen.getByRole('button', { name: '开始注意力梳理' }))
    expect(screen.getByRole('heading', { name: /哪些值得我关注/ })).toBeVisible()
    expect(screen.getByText('1 / 6')).toBeVisible()
  })

  it('archives a card directly and restores it from Archive', async () => {
    const user = userEvent.setup()
    render(<App />)
    await capture('也许以后再看')
    await user.click(screen.getByRole('button', { name: '打开卡片：也许以后再看' }))
    await user.click(screen.getByRole('button', { name: '停止关注' }))
    await user.click(screen.getByRole('button', { name: '确认停止关注' }))
    await user.click(screen.getByRole('button', { name: '打开归档' }))
    await user.click(screen.getByRole('button', { name: '打开卡片：也许以后再看' }))
    await user.click(screen.getByRole('button', { name: '恢复到 Radar' }))

    expect(screen.getByText('已恢复到 Radar')).toBeVisible()
  })

  it('permanently deletes an archived card from its detail drawer after confirmation', async () => {
    const user = userEvent.setup()
    render(<App />)
    await capture('详情永久删除')
    await user.click(screen.getByRole('button', { name: '打开卡片：详情永久删除' }))
    await user.click(screen.getByRole('button', { name: '停止关注' }))
    await user.click(screen.getByRole('button', { name: '确认停止关注' }))
    await user.click(screen.getByRole('button', { name: '打开归档' }))
    await user.click(screen.getByRole('button', { name: '打开卡片：详情永久删除' }))

    await user.click(screen.getByRole('button', { name: '永久删除' }))
    expect(screen.getByRole('heading', { name: '永久删除卡片' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '确认永久删除' }))

    expect(screen.queryByRole('button', { name: '打开卡片：详情永久删除' })).toBeNull()
    expect(screen.queryByRole('dialog', { name: '详情永久删除' })).toBeNull()
    expect(screen.getByText('已永久删除')).toBeVisible()
  })

  it('permanently deletes an archived card from its list icon after confirmation', async () => {
    const user = userEvent.setup()
    render(<App />)
    await capture('准备永久删除')
    await user.click(screen.getByRole('button', { name: '打开卡片：准备永久删除' }))
    await user.click(screen.getByRole('button', { name: '停止关注' }))
    await user.click(screen.getByRole('button', { name: '确认停止关注' }))
    await user.click(screen.getByRole('button', { name: '打开归档' }))

    await user.click(screen.getByRole('button', { name: '永久删除卡片：准备永久删除' }))
    const confirmation = screen.getByRole('dialog', { name: '永久删除卡片' })
    expect(within(confirmation).getByRole('heading', { name: '永久删除卡片' })).toBeVisible()
    expect(within(confirmation).getByText(/准备永久删除/)).toBeVisible()
    expect(within(confirmation).getByText(/无法恢复/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: '确认永久删除' }))

    expect(screen.queryByRole('button', { name: '打开卡片：准备永久删除' })).toBeNull()
    expect(screen.getByText('已永久删除')).toBeVisible()
  })

  it('keeps an archived card when permanent deletion is cancelled', async () => {
    const user = userEvent.setup()
    render(<App />)
    await capture('取消永久删除')
    await user.click(screen.getByRole('button', { name: '打开卡片：取消永久删除' }))
    await user.click(screen.getByRole('button', { name: '停止关注' }))
    await user.click(screen.getByRole('button', { name: '确认停止关注' }))
    await user.click(screen.getByRole('button', { name: '打开归档' }))
    await user.click(screen.getByRole('button', { name: '永久删除卡片：取消永久删除' }))
    await user.click(screen.getByRole('button', { name: '取消' }))

    expect(screen.queryByRole('heading', { name: '永久删除卡片' })).toBeNull()
    expect(screen.getByRole('button', { name: '打开卡片：取消永久删除' })).toBeVisible()
  })
})
