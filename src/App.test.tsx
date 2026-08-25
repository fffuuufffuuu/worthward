import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { BRAND } from './brand'
import { saveWorkspace } from './data/storage'
import { createInitialWorkspace } from './domain/defaults'
import type { WorkspaceState } from './domain/types'
import { archiveItem, captureItem } from './domain/workspace'

function saveTopicWorkspace() {
  let id = 0
  const env = {
    now: () => '2026-08-20T00:00:00.000Z',
    id: () => `topic-fixture-${++id}`,
  }
  const activeExplore = captureItem(
    createInitialWorkspace(),
    { title: '探索中的共同主题', board: 'explore', category: '主题 / 问题', topics: ['共同主题'] },
    env,
  )
  const activeCreate = captureItem(
    activeExplore.state,
    { title: '创造中的共同主题', board: 'create', category: '产品 / 项目', topics: ['共同主题'] },
    env,
  )
  const archived = captureItem(
    activeCreate.state,
    { title: '近期归档的共同主题', board: 'explore', category: '主题 / 问题', topics: ['共同主题'] },
    env,
  )
  const archivedState = archiveItem(archived.state, archived.itemId, 'archive', undefined, env)
  saveWorkspace(archivedState.state)
}

describe('attention workbench interface', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('captures a card and shows it in the Explore Radar column', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '记录想法' }))
    await user.type(screen.getByLabelText('标题'), '理解知识追踪')
    await user.type(
      screen.getByLabelText('说明（支持 Markdown）'),
      '## 起点\n\n先理解学生模型。',
    )
    await user.click(screen.getByRole('button', { name: '保存到 Radar' }))

    const radar = screen.getByRole('region', { name: 'Radar' })
    expect(within(radar).getByText('理解知识追踪')).toBeInTheDocument()
  })

  it('offers AI auto-tag in Capture and Detail topic editors', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '记录想法' }))
    const capture = screen.getByRole('dialog', { name: '先接住，再决定' })
    expect(within(capture).getByRole('button', { name: 'AI 自动标签' })).toBeVisible()
    await user.type(within(capture).getByLabelText('标题'), '接入自动标签')
    await user.click(within(capture).getByRole('button', { name: '保存到 Radar' }))

    await user.click(screen.getByRole('button', { name: '打开卡片：接入自动标签' }))
    await user.click(screen.getByRole('button', { name: '编辑信息' }))
    const detail = screen.getByRole('dialog', { name: '接入自动标签' })
    expect(within(detail).getByRole('button', { name: 'AI 自动标签' })).toBeVisible()
  })

  it('shows separate explore and create category regions in Settings', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '打开设置' }))

    const card = screen.getByRole('heading', { name: '类别标签' }).closest('section')!
    expect(card).toHaveClass('wide')
    expect(within(card).getByRole('region', { name: '探索类别标签' })).toBeVisible()
    expect(within(card).getByRole('region', { name: '创造类别标签' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'AI 服务' })).toBeVisible()
  })

  it('updates a card and its filter after renaming and recoloring a selected category', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '记录想法' }))
    await user.type(screen.getByLabelText('标题'), '类别会跟着设置变化')
    await user.selectOptions(screen.getByLabelText('类别标签'), '主题 / 问题')
    await user.click(screen.getByRole('button', { name: '保存到 Radar' }))
    await user.click(screen.getByRole('button', { name: '类别筛选：主题 / 问题' }))
    await user.click(screen.getByRole('button', { name: '打开设置' }))

    const nameInput = screen.getByLabelText('探索类别名称：主题 / 问题')
    await user.clear(nameInput)
    await user.type(nameInput, '研究线索')
    await user.tab()
    fireEvent.change(screen.getByLabelText('探索类别颜色：研究线索'), { target: { value: '#123456' } })

    await user.click(screen.getByRole('button', { name: '探索' }))

    const card = screen.getByRole('button', { name: '打开卡片：类别会跟着设置变化' }).closest('article')!
    const filter = screen.getByRole('button', { name: '类别筛选：研究线索' })
    expect(within(card).getByText('研究线索')).toBeVisible()
    expect(card).toHaveStyle('--category-color: #123456')
    expect(filter).toHaveStyle('--filter-color: #123456')
    expect(screen.queryByRole('button', { name: '类别筛选：主题 / 问题' })).toBeNull()
  })

  it('offers a newly added category in both Capture and Detail', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '打开设置' }))
    await user.type(screen.getByRole('textbox', { name: '新增探索类别' }), '观察主题')
    await user.click(screen.getByRole('button', { name: '添加探索类别' }))
    await user.click(screen.getByRole('button', { name: '记录想法' }))

    const capture = screen.getByRole('dialog', { name: '先接住，再决定' })
    expect(within(capture).getByRole('option', { name: '观察主题' })).toBeVisible()
    await user.type(within(capture).getByLabelText('标题'), '使用新增类别')
    await user.selectOptions(within(capture).getByLabelText('类别标签'), '观察主题')
    await user.click(within(capture).getByRole('button', { name: '保存到 Radar' }))
    await user.click(screen.getByRole('button', { name: '打开卡片：使用新增类别' }))
    await user.click(screen.getByRole('button', { name: '编辑信息' }))

    const detail = screen.getByRole('dialog', { name: '使用新增类别' })
    expect(within(detail).getByRole('option', { name: '观察主题' })).toBeVisible()
  })

  it('keeps rename and deletion isolated to the edited board', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '打开设置' }))
    await user.type(screen.getByRole('textbox', { name: '新增探索类别' }), '产品 / 项目')
    await user.click(screen.getByRole('button', { name: '添加探索类别' }))
    const exploreName = screen.getByLabelText('探索类别名称：产品 / 项目')
    await user.clear(exploreName)
    await user.type(exploreName, '实践项目')
    await user.tab()

    const createRegion = screen.getByRole('region', { name: '创造类别标签' })
    expect(within(createRegion).getByLabelText('创造类别名称：产品 / 项目')).toBeVisible()
    expect(within(createRegion).queryByLabelText('创造类别名称：实践项目')).toBeNull()

    await user.click(screen.getByRole('button', { name: '删除实践项目' }))
    await user.click(screen.getByRole('button', { name: '确认删除' }))

    expect(within(createRegion).getByLabelText('创造类别名称：产品 / 项目')).toBeVisible()
    expect(screen.queryByLabelText('探索类别名称：实践项目')).toBeNull()
  })

  it('uses direct stage language and never exposes the discarded action verbs', () => {
    render(<App />)

    expect(screen.getByRole('navigation', { name: '主导航' })).toBeVisible()
    expect(screen.getByText('Radar')).toBeVisible()
    expect(screen.getByText('Outcome & Review')).toBeVisible()
    expect(screen.queryByText(/Reconsider|Reengage|Reactivate|Promote|Demote/)).toBeNull()
  })

  it('keeps the Worthward footer across primary views', async () => {
    const user = userEvent.setup()
    render(<App />)
    for (const name of ['洞察', '打开归档', '打开设置']) {
      await user.click(screen.getByRole('button', { name }))
      expect(screen.getByRole('contentinfo')).toBeVisible()
      expect(within(screen.getByRole('contentinfo')).getByText('CashewLab')).toBeVisible()
    }
  })

  it('uses the Xiang brand, board questions, category colors, and combined filters', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)

    const brand = screen.getByRole('button', { name: '所向首页' })
    expect(within(brand).getByText('所向')).toBeVisible()
    expect(within(brand).getByText('WORTHWARD')).toBeVisible()
    expect(BRAND.tagline).toBe('Attention, directed.')
    expect(within(brand).getByText('Attention, directed.')).toBeVisible()
    expect(container.querySelector('.wip-readout')).toBeNull()

    const footer = screen.getByRole('contentinfo')
    expect(within(footer).getByText('CashewLab')).toBeVisible()
    expect(within(footer).getByText('v0.1.0')).toBeVisible()
    expect(within(footer).getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/fffuuufffuuu/worthward',
    )
    expect(screen.getByRole('heading', { name: '我渴望了解什么？' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '记录想法' }))
    await user.type(screen.getByLabelText('标题'), '看一本学习科学书')
    await user.selectOptions(screen.getByLabelText('类别标签'), '书籍 / 影音')
    await user.click(screen.getByRole('button', { name: '添加标签' }))
    await user.type(screen.getByRole('textbox', { name: '输入主题标签' }), '学习科学{Enter}')
    await user.click(screen.getByRole('button', { name: '保存到 Radar' }))

    await user.click(screen.getByRole('button', { name: '记录想法' }))
    await user.type(screen.getByLabelText('标题'), '研究智能体')
    await user.selectOptions(screen.getByLabelText('类别标签'), '主题 / 问题')
    await user.click(screen.getByRole('button', { name: '添加标签' }))
    await user.type(screen.getByRole('textbox', { name: '输入主题标签' }), 'AI 与智能体{Enter}')
    await user.click(screen.getByRole('button', { name: '保存到 Radar' }))

    const bookCard = screen.getByRole('button', { name: '打开卡片：看一本学习科学书' }).closest('article')!
    expect(bookCard).toHaveStyle('--category-color: #7d5ba6')
    // 类别与标题同行，类别在右上角
    const cardTitleRow = bookCard.querySelector('.card-title-row')!
    const kindBadge = within(cardTitleRow as HTMLElement).getByText('书籍 / 影音')
    const cardTitle = within(cardTitleRow as HTMLElement).getByText('看一本学习科学书')
    expect(kindBadge.compareDocumentPosition(cardTitle) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    expect(within(bookCard).getByRole('button', { name: '拖动卡片：看一本学习科学书' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '类别筛选：书籍 / 影音' }))
    expect(screen.getByText('看一本学习科学书')).toBeVisible()
    expect(screen.queryByText('研究智能体')).toBeNull()

    await user.click(screen.getByRole('button', { name: '主题标签筛选' }))
    await user.click(screen.getByRole('checkbox', { name: '筛选主题：AI 与智能体' }))
    expect(screen.getByRole('button', { name: '移除主题筛选：AI 与智能体' })).toBeVisible()
    expect(screen.queryByText('看一本学习科学书')).toBeNull()
    expect(screen.queryByText('研究智能体')).toBeNull()

    await user.click(screen.getByRole('heading', { name: '我渴望了解什么？' }))
    expect(screen.queryByRole('group', { name: '按主题标签筛选' })).toBeNull()

    await user.click(screen.getByRole('button', { name: '移除主题筛选：AI 与智能体' }))
    expect(screen.getByText('看一本学习科学书')).toBeVisible()
    expect(screen.queryByText('研究智能体')).toBeNull()

    await user.click(screen.getByRole('button', { name: '清除筛选' }))
    expect(screen.getByText('研究智能体')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '创造' }))
    expect(screen.getByRole('heading', { name: '我想要创造什么？' })).toBeVisible()
  })

  it('uses one reading page with independent metadata and Markdown editing', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '记录想法' }))
    await user.type(screen.getByLabelText('标题'), '安全预览')
    await user.selectOptions(screen.getByLabelText('类别标签'), '主题 / 问题')
    await user.click(screen.getByRole('button', { name: '添加标签' }))
    await user.type(screen.getByRole('textbox', { name: '输入主题标签' }), 'AI{Enter}教育{Enter}')
    await user.click(screen.getByRole('button', { name: '保存到 Radar' }))
    await user.click(screen.getByRole('button', { name: '打开卡片：安全预览' }))

    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.getByText('探索', { selector: '.metadata-chip' })).toBeVisible()
    expect(screen.getByText('主题 / 问题', { selector: '.metadata-chip' })).toBeVisible()
    expect(screen.getByText('#AI', { selector: '.metadata-chip' })).toBeVisible()
    expect(screen.getByText('#教育', { selector: '.metadata-chip' })).toBeVisible()
    expect(screen.queryByLabelText('说明（支持 Markdown）')).toBeNull()
    expect(screen.queryByText(/记录投入/)).toBeNull()

    await user.click(screen.getByRole('button', { name: '编辑信息' }))
    await user.click(screen.getByRole('button', { name: '删除主题标签：教育' }))
    await user.click(screen.getByRole('button', { name: '取消编辑信息' }))
    expect(screen.getByText('#教育', { selector: '.metadata-chip' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '编辑信息' }))
    await user.click(screen.getByRole('button', { name: '删除主题标签：教育' }))
    await user.click(screen.getByRole('button', { name: '添加标签' }))
    await user.type(screen.getByRole('textbox', { name: '输入主题标签' }), '人机共育{Enter}')
    await user.click(screen.getByRole('button', { name: '保存信息' }))

    await user.click(screen.getByRole('button', { name: '编辑说明' }))
    const editor = screen.getByLabelText('说明（支持 Markdown）')
    await user.type(editor, '# 标题\n\n<script>alert(1)</script>正文')
    await user.click(screen.getByRole('button', { name: '保存说明' }))

    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.getByRole('heading', { name: '标题' })).toBeVisible()
    expect(screen.queryByText('#教育', { selector: '.metadata-chip' })).toBeNull()
    expect(screen.getByText('#人机共育', { selector: '.metadata-chip' })).toBeVisible()
    expect(document.querySelector('script')).toBeNull()

    await user.click(screen.getByRole('button', { name: '关闭卡片' }))
    await user.click(screen.getByRole('button', { name: '打开卡片：安全预览' }))
    expect(screen.getByText('#人机共育', { selector: '.metadata-chip' })).toBeVisible()
    await user.click(document.querySelector('.drawer-backdrop')!)
    expect(screen.queryByRole('dialog', { name: '安全预览' })).toBeNull()
  })

  it('uses the required insight card order and desktop layout semantics', async () => {
    const user = userEvent.setup()
    render(<App />)

    for (const title of ['主题一', '主题二']) {
      await user.click(screen.getByRole('button', { name: '记录想法' }))
      await user.type(screen.getByLabelText('标题'), title)
      await user.click(screen.getByRole('button', { name: '添加标签' }))
      await user.type(screen.getByRole('textbox', { name: '输入主题标签' }), 'AI教育{Enter}')
      await user.click(screen.getByRole('button', { name: '保存到 Radar' }))
    }
    await user.click(screen.getByRole('button', { name: '打开卡片：主题二' }))
    await user.click(screen.getByRole('button', { name: '进入 Focus' }))
    await user.click(screen.getByRole('button', { name: '关闭卡片' }))
    await user.click(screen.getByRole('button', { name: '洞察' }))

    expect(screen.getByRole('heading', { name: '当前阶段分布' })).toBeVisible()
    const funnel = screen.getByRole('img', { name: /阶段分布漏斗/ })
    const radarBar = within(funnel).getByLabelText('Radar：1 张')
    const focusBar = within(funnel).getByLabelText('Focus：1 张')
    expect(radarBar.tagName.toLowerCase()).toBe('rect')
    // 数量相同则宽度相同
    expect(radarBar.getAttribute('width')).toBe(focusBar.getAttribute('width'))
    expect(screen.queryByText(/绕过 Focus/)).toBeNull()
    expect(screen.queryByText('累计投入')).toBeNull()
    expect(screen.getByRole('heading', { name: '关注领域' })).toBeVisible()
    expect(screen.getByRole('group', { name: '关注领域，共 2 次主题标签' })).toBeVisible()
    expect(screen.getByLabelText('AI教育：2 次主题标签')).toBeVisible()
    const singleTopicSector = screen.getByRole('button', { name: '打开当前主题扇区：AI教育（2 次主题标签）' })
    expect(singleTopicSector.getAttribute('d')).not.toContain('A88 88 0 1 1 100.00 12.00')

    const balance = screen.getByRole('heading', { name: '探索 / 创造' }).closest('section')!
    const stages = screen.getByRole('heading', { name: '当前阶段分布' }).closest('section')!
    const recent = screen.getByRole('heading', { name: '近 30 天关注最多的领域' }).closest('section')!
    const topics = screen.getByRole('heading', { name: '关注领域' }).closest('section')!
    const aging = screen.getByRole('heading', { name: '停滞项目' }).closest('section')!
    expect(balance).toHaveClass('insight-balance-card')
    expect(within(balance).getByLabelText(/共 \d+ 张/)).toBeVisible()
    expect(stages).toHaveClass('insight-stages-card')
    expect(recent).toHaveClass('insight-recent-card')
    expect(topics).toHaveClass('insight-topics-card')
    expect(aging).toHaveClass('wide', 'insight-aging-card')
    expect(balance.compareDocumentPosition(stages) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(stages.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(recent.compareDocumentPosition(topics) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(topics.compareDocumentPosition(aging) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(balance).queryByText(/近 30 天/)).toBeNull()
    expect(within(recent).getByRole('button', { name: '打开近期主题：AI教育（2 张）' })).toBeVisible()
    expect(within(balance).queryByText('探索', { selector: '.balance-ends span' })).toBeNull()
    expect(screen.queryByText('宽度与当前数量对应，数字表示各阶段卡片数。')).toBeNull()
    expect(screen.getByText('Radar', { selector: '.metric-strip small' })).toBeVisible()
    expect(screen.queryByText('停滞项目', { selector: '.metric-strip small' })).toBeNull()
    expect(within(aging).getByLabelText(/停滞 \d+ 项/)).toBeVisible()
  })

  it('opens the correctly scoped topic dialog from the recent list, donut sector, and legend by keyboard', async () => {
    saveTopicWorkspace()
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '洞察' }))

    await user.click(screen.getByRole('button', { name: '打开近期主题：共同主题（3 张）' }))
    expect(screen.getByRole('dialog', { name: '共同主题' })).toBeVisible()
    expect(screen.getByRole('button', { name: '打开卡片：近期归档的共同主题' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '关闭主题结果' }))

    const sector = screen.getByRole('button', { name: '打开当前主题扇区：共同主题（2 次主题标签）' })
    sector.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('dialog', { name: '共同主题' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '打开卡片：近期归档的共同主题' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '关闭主题结果' }))

    const legend = screen.getByRole('button', { name: '打开当前主题图例：共同主题（2 次主题标签）' })
    legend.focus()
    await user.keyboard(' ')
    expect(screen.getByRole('dialog', { name: '共同主题' })).toBeVisible()
  })

  it('opens topic card detail from insights without leaving the insights page', async () => {
    saveTopicWorkspace()
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '洞察' }))
    await user.click(screen.getByRole('button', { name: '打开当前主题图例：共同主题（2 次主题标签）' }))
    await user.click(screen.getByRole('button', { name: '打开卡片：探索中的共同主题' }))
    expect(screen.getByRole('heading', { name: '注意力洞察' })).toBeVisible()
    expect(screen.getByRole('dialog', { name: '探索中的共同主题' })).toBeVisible()
    expect(screen.queryByRole('dialog', { name: '共同主题' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '关闭卡片' }))

    await user.click(screen.getByRole('button', { name: '打开当前主题图例：共同主题（2 次主题标签）' }))
    await user.click(screen.getByRole('button', { name: '打开卡片：创造中的共同主题' }))
    expect(screen.getByRole('heading', { name: '注意力洞察' })).toBeVisible()
    expect(screen.getByRole('dialog', { name: '创造中的共同主题' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '关闭卡片' }))

    await user.click(screen.getByRole('button', { name: '打开近期主题：共同主题（3 张）' }))
    await user.click(screen.getByRole('button', { name: '打开卡片：近期归档的共同主题' }))
    expect(screen.getByRole('heading', { name: '注意力洞察' })).toBeVisible()
    expect(screen.getByRole('dialog', { name: '近期归档的共同主题' })).toBeVisible()
  })

  it('picks one local quote per insight visit and keeps it through insight rerenders', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99)
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '洞察' }))
    expect(screen.getByText('“我的经验，就是我同意去关注的事物。”')).toBeVisible()
    expect(screen.getByText('— 威廉·詹姆斯')).toBeVisible()
    expect(random).toHaveBeenCalledTimes(1)

    await user.type(screen.getByRole('textbox', { name: '搜索卡片' }), '仍在洞察内')
    expect(screen.getByText('“我的经验，就是我同意去关注的事物。”')).toBeVisible()
    expect(random).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: '探索' }))
    await user.click(screen.getByRole('button', { name: '洞察' }))
    expect(screen.getByText('“世界太大，你只能认真活好当下这一寸。”')).toBeVisible()
    expect(random).toHaveBeenCalledTimes(2)
  })

  it('splits stalled cards by board and shows category, topics, and age', async () => {
    let id = 0
    const env = { now: () => '2020-01-01T00:00:00.000Z', id: () => `aging-${++id}` }
    const explore = captureItem(
      createInitialWorkspace(),
      { title: '停滞的探索', board: 'explore', category: '主题 / 问题', topics: ['学习科学'] },
      env,
    )
    const create = captureItem(
      explore.state,
      { title: '停滞的创造', board: 'create', category: '产品 / 项目', topics: ['AI 与智能体'] },
      env,
    )
    saveWorkspace(create.state)
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '洞察' }))

    const exploreLane = screen.getByRole('region', { name: '探索停滞项目' })
    const createLane = screen.getByRole('region', { name: '创造停滞项目' })
    expect(within(exploreLane).getByText('停滞的探索')).toBeVisible()
    expect(within(exploreLane).getByText('主题 / 问题')).toBeVisible()
    expect(within(exploreLane).getByText('#学习科学')).toBeVisible()
    expect(within(exploreLane).getByText(/天未触达/)).toBeVisible()
    expect(within(createLane).getByText('停滞的创造')).toBeVisible()
    expect(within(createLane).getByText('产品 / 项目')).toBeVisible()
    expect(within(createLane).getByText('#AI 与智能体')).toBeVisible()

    await user.click(within(exploreLane).getByRole('button', { name: '打开卡片：停滞的探索' }))
    expect(screen.getByRole('dialog', { name: '停滞的探索' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '注意力洞察' })).toBeVisible()
  })

  it('groups topics beyond the leading six as other', async () => {
    const user = userEvent.setup()
    render(<App />)

    for (const [index, topic] of ['主题A', '主题B', '主题C', '主题D', '主题E', '主题F', '主题G'].entries()) {
      await user.click(screen.getByRole('button', { name: '记录想法' }))
      await user.type(screen.getByLabelText('标题'), `卡片${index + 1}`)
      await user.click(screen.getByRole('button', { name: '添加标签' }))
      await user.type(screen.getByRole('textbox', { name: '输入主题标签' }), `${topic}{Enter}`)
      await user.click(screen.getByRole('button', { name: '保存到 Radar' }))
    }

    await user.click(screen.getByRole('button', { name: '洞察' }))

    expect(screen.getAllByRole('listitem', { name: /次主题标签/ })).toHaveLength(7)
    const otherLegend = screen.getByRole('listitem', { name: '其他：1 次主题标签' })
    expect(within(otherLegend).queryByRole('button')).toBeNull()
    const otherSlice = document.querySelector('path.donut-slice.other')
    expect(otherSlice).not.toHaveAttribute('role')
    expect(otherSlice).not.toHaveAttribute('tabindex')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps a real topic named 其他 interactive instead of treating it as the aggregate slice', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '记录想法' }))
    await user.type(screen.getByLabelText('标题'), '真实的其他主题')
    await user.click(screen.getByRole('button', { name: '添加标签' }))
    await user.type(screen.getByRole('textbox', { name: '输入主题标签' }), '其他{Enter}')
    await user.click(screen.getByRole('button', { name: '保存到 Radar' }))
    await user.click(screen.getByRole('button', { name: '洞察' }))

    await user.click(screen.getByRole('button', { name: '打开当前主题图例：其他（1 次主题标签）' }))
    expect(screen.getByRole('dialog', { name: '其他' })).toBeVisible()
    expect(screen.getByRole('button', { name: '打开卡片：真实的其他主题' })).toBeVisible()
  })

  it('renders an SVG logo instead of a text mark and keeps stage headers sticky', () => {
    render(<App />)

    const brand = screen.getByRole('button', { name: '所向首页' })
    expect(brand.querySelector('svg.brand-logo')).not.toBeNull()
    expect(brand.querySelector('.brand-mark')).toBeNull()
    expect(document.querySelector('.attention-rail')).toBeNull()

    const header = screen.getByRole('region', { name: 'Radar' }).querySelector('.stage-header')!
    expect(header).toHaveClass('stage-header')
  })

  it('shows only current board counts in stage headers', () => {
    const { container } = render(<App />)

    expect(container.querySelector('.wip-readout')).toBeNull()
    const stages = screen.getAllByRole('region').filter((node) => node.classList.contains('stage-column'))
    expect(stages).toHaveLength(4)
    for (const stage of stages) {
      expect(stage.querySelector('.count-badge')).not.toBeNull()
    }
    expect(screen.queryByText(/\d+\s*\/\s*10/)).toBeNull()
    expect(screen.queryByText(/\d+\s*\/\s*4/)).toBeNull()
  })

  it('waits for the primary file before rendering and does not save the loaded snapshot again', async () => {
    const loaded = createInitialWorkspace()
    let resolveLoad: ((workspace: WorkspaceState) => void) | undefined
    const loadPrimary = vi.fn(() => new Promise<WorkspaceState>((resolve) => { resolveLoad = resolve }))
    const savePrimary = vi.fn(async (workspace: WorkspaceState) => workspace)

    render(<App storageMode="file" loadPrimary={loadPrimary} savePrimary={savePrimary} />)
    expect(screen.getByRole('status')).toHaveTextContent('正在读取本地工作区')
    expect(screen.queryByRole('button', { name: '记录想法' })).toBeNull()
    expect(savePrimary).not.toHaveBeenCalled()

    await act(async () => { resolveLoad?.(loaded) })
    expect(await screen.findByRole('button', { name: '记录想法' })).toBeVisible()
    expect(savePrimary).not.toHaveBeenCalled()
  })

  it('keeps a file loading failure visible instead of rendering an empty workspace', async () => {
    const loadPrimary = vi.fn().mockRejectedValue(new Error('无法读取'))

    render(<App storageMode="file" loadPrimary={loadPrimary} savePrimary={vi.fn()} />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('本地工作区加载失败')
    expect(alert).toHaveTextContent('旧浏览器数据仍会保留')
    expect(screen.queryByRole('button', { name: '记录想法' })).toBeNull()
  })

  it('uses ordered file saves, shows a persistent failure, and clears it after a later success', async () => {
    const loaded = createInitialWorkspace()
    const loadPrimary = vi.fn().mockResolvedValue(loaded)
    const savePrimary = vi.fn()
      .mockRejectedValueOnce(new Error('磁盘已满'))
      .mockImplementation(async (workspace: WorkspaceState) => workspace)
    const user = userEvent.setup()

    render(<App storageMode="file" loadPrimary={loadPrimary} savePrimary={savePrimary} />)
    await screen.findByRole('button', { name: '记录想法' })
    await user.click(screen.getByRole('button', { name: '记录想法' }))
    await user.type(screen.getByLabelText('标题'), '只写入本地文件')
    await user.click(screen.getByRole('button', { name: '保存到 Radar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('本地文件保存失败')
    expect(localStorage.getItem('attention-workbench:v1')).toBeNull()

    await user.click(screen.getByRole('button', { name: '打开设置' }))
    fireEvent.change(screen.getByLabelText('Focus 上限'), { target: { value: '9' } })
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(savePrimary).toHaveBeenCalledTimes(2)
  })
})
