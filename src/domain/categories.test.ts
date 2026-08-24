import { describe, expect, it } from 'vitest'
import {
  CATEGORY_COLOR_PALETTE,
  addCategory,
  categoryColorDistance,
  categoryColorFor,
  categoryOptionsFor,
  chooseMostDistinctColor,
  countCategoryUsage,
  normalizeCategory,
  recolorCategory,
  removeCategory,
  renameCategory,
} from './categories'
import { createInitialWorkspace } from './defaults'

describe('attention categories', () => {
  it('offers three stable shapes for each board', () => {
    expect(categoryOptionsFor('explore')).toEqual([
      '主题 / 问题',
      '书籍 / 影音',
      '课程 / 体验',
    ])
    expect(categoryOptionsFor('create')).toEqual([
      '产品 / 项目',
      '写作 / 表达',
      '活动 / 组织',
    ])
  })

  it('assigns a stable distinct color to every category', () => {
    const colors = [
      ...categoryOptionsFor('explore').map((category) => categoryColorFor('explore', category)),
      ...categoryOptionsFor('create').map((category) => categoryColorFor('create', category)),
    ]

    expect(new Set(colors)).toHaveLength(6)
    expect(colors.every((color) => /^#[0-9a-f]{6}$/i.test(color))).toBe(true)
    expect(categoryColorFor('explore', null)).toBe('#7e8f9a')
  })

  it('reads editable category definitions while legacy callers use defaults', () => {
    const workspace = createInitialWorkspace()
    workspace.settings.categories.explore = [{ name: '自定义探索', color: '#123456' }]

    expect(categoryOptionsFor('explore', workspace.settings.categories)).toEqual(['自定义探索'])
    expect(categoryColorFor('explore', '自定义探索', workspace.settings.categories)).toBe('#123456')
    expect(categoryOptionsFor('explore')).toEqual(['主题 / 问题', '书籍 / 影音', '课程 / 体验'])
  })

  it('normalizes legacy categories without guessing empty values', () => {
    expect(normalizeCategory({ board: 'explore', title: '《可见的学习》', category: '教育教学' })).toBe('书籍 / 影音')
    expect(normalizeCategory({ board: 'explore', title: '腾讯云黑客松', category: '好奇看看' })).toBe('课程 / 体验')
    expect(normalizeCategory({ board: 'explore', title: '注意力残留', category: '知识概念' })).toBe('主题 / 问题')
    expect(normalizeCategory({ board: 'create', title: '教育AI的设计原则', category: '教育思考' })).toBe('写作 / 表达')
    expect(normalizeCategory({ board: 'create', title: '直观化换算器', category: '教学工具' })).toBe('产品 / 项目')
    expect(normalizeCategory({ board: 'create', title: '未来工作坊', category: '活动 / 组织' })).toBe('活动 / 组织')
    expect(normalizeCategory({ board: 'create', title: '无法判断', category: null })).toBeNull()
  })

  it('adds a trimmed category at the end with a deterministic unused palette color', () => {
    const workspace = createInitialWorkspace()
    const first = addCategory(workspace, 'explore', '  复盘  ')
    const second = addCategory(workspace, 'explore', '复盘')

    expect(first).toMatchObject({ ok: true })
    const addedColor = first.state.settings.categories.explore.at(-1)?.color
    expect(addedColor).toMatch(/^#[0-9a-f]{6}$/)
    expect(first.state.settings.categories.explore.map((category) => category.name)).toEqual([
      '主题 / 问题', '书籍 / 影音', '课程 / 体验', '复盘',
    ])
    expect(second).toMatchObject({ ok: true })
    expect(second.state.settings.categories.explore.at(-1)?.color).toBe(addedColor)
    expect(workspace.settings.categories.explore.map((category) => category.color)).not.toContain(addedColor)
  })

  it('chooses a color farther from a near-custom color than every fixed candidate', () => {
    const workspace = createInitialWorkspace()
    workspace.settings.categories.explore = [
      { name: '近似紫红', color: '#b14e8b' },
      { name: '已有蓝色', color: '#2f6fb2' },
    ]
    const currentColors = workspace.settings.categories.explore.map((category) => category.color)
    const result = addCategory(workspace, 'explore', '新类别')
    const selected = result.state.settings.categories.explore.at(-1)?.color

    expect(result).toMatchObject({ ok: true })
    expect(selected).not.toBe('#b14e8a')
    expect(minimumColorDistance(selected!, currentColors)).toBeGreaterThanOrEqual(
      Math.max(...CATEGORY_COLOR_PALETTE.map((candidate) => minimumColorDistance(candidate, currentColors))),
    )
  })

  it('keeps generated colors distinct beyond the initial candidate window', () => {
    let workspace = createInitialWorkspace()

    for (let index = 0; index < 40; index += 1) {
      const result = addCategory(workspace, 'explore', `类别 ${index}`)
      expect(result.ok).toBe(true)
      workspace = result.state
    }

    const colors = workspace.settings.categories.explore.map((category) => category.color)
    expect(new Set(colors)).toHaveLength(colors.length)
    expect(colors.every((color) => /^#[0-9a-f]{6}$/.test(color))).toBe(true)
  })

  it('selects the candidate with the greatest minimum RGB distance and keeps the first tie', () => {
    const existingColors = ['#b14e8b', '#2f6fb2']
    const candidates = ['#b14e8a', '#2c8198', '#c23535', '#35c27b']
    const minimumDistances = candidates.map((candidate) => minimumColorDistance(candidate, existingColors))
    const expected = candidates[minimumDistances.indexOf(Math.max(...minimumDistances))]

    expect(chooseMostDistinctColor(existingColors, candidates)).toBe(expected)
    expect(chooseMostDistinctColor(['#808080'], ['#000001', '#000100'])).toBe('#000001')
  })

  it('rejects blank and duplicate names within the same board without changing state', () => {
    const workspace = createInitialWorkspace()

    expect(addCategory(workspace, 'explore', '   ')).toEqual({ state: workspace, ok: false, error: 'blank_name' })
    expect(addCategory(workspace, 'explore', '主题 / 问题')).toEqual({ state: workspace, ok: false, error: 'duplicate_name' })
  })

  it('allows a category name that exists only on the other board', () => {
    const workspace = createInitialWorkspace()
    const result = addCategory(workspace, 'explore', '产品 / 项目')

    expect(result).toMatchObject({ ok: true })
    expect(result.state.settings.categories.explore.at(-1)?.name).toBe('产品 / 项目')
    expect(workspace.settings.categories.create.map((category) => category.name)).toContain('产品 / 项目')
  })

  it('counts category use only on the requested board', () => {
    const workspace = createInitialWorkspace()
    workspace.items = {
      exploreMatch: { ...itemFor('explore'), category: '主题 / 问题' },
      exploreOther: { ...itemFor('explore'), category: '书籍 / 影音' },
      createMatch: { ...itemFor('create'), category: '主题 / 问题' },
    }

    expect(countCategoryUsage(workspace, 'explore', '主题 / 问题')).toBe(1)
  })

  it('renames the matching board definition and its cards without touching the other board', () => {
    const workspace = createInitialWorkspace()
    workspace.items = {
      exploreMatch: { ...itemFor('explore'), category: '主题 / 问题' },
      exploreOther: { ...itemFor('explore'), category: '书籍 / 影音' },
      createMatch: { ...itemFor('create'), category: '主题 / 问题' },
    }

    const result = renameCategory(workspace, 'explore', '主题 / 问题', '研究问题')

    expect(result).toMatchObject({ ok: true })
    expect(result.state.settings.categories.explore[0]).toEqual({ name: '研究问题', color: '#2f6fb2' })
    expect(result.state.items.exploreMatch.category).toBe('研究问题')
    expect(result.state.items.exploreOther.category).toBe('书籍 / 影音')
    expect(result.state.items.createMatch.category).toBe('主题 / 问题')
    expect(workspace.items.exploreMatch.category).toBe('主题 / 问题')
  })

  it('rejects blank and duplicate rename targets without changing state', () => {
    const workspace = createInitialWorkspace()

    expect(renameCategory(workspace, 'explore', '主题 / 问题', ' ')).toEqual({ state: workspace, ok: false, error: 'blank_name' })
    expect(renameCategory(workspace, 'explore', '主题 / 问题', '书籍 / 影音')).toEqual({ state: workspace, ok: false, error: 'duplicate_name' })
  })

  it('recolors only the matching definition and validates normalized hex colors', () => {
    const workspace = createInitialWorkspace()
    const invalid = recolorCategory(workspace, 'explore', '主题 / 问题', '#abc')
    const result = recolorCategory(workspace, 'explore', '主题 / 问题', '#ABCDEF')

    expect(invalid).toEqual({ state: workspace, ok: false, error: 'invalid_color' })
    expect(result).toMatchObject({ ok: true })
    expect(result.state.settings.categories.explore[0].color).toBe('#abcdef')
    expect(result.state.settings.categories.create[0].color).toBe('#d0533c')
  })

  it('removes a used category by moving cards to a same-board replacement or uncategorized', () => {
    const workspace = createInitialWorkspace()
    workspace.items = {
      first: { ...itemFor('explore'), category: '主题 / 问题' },
      second: { ...itemFor('explore'), category: '主题 / 问题' },
      otherBoard: { ...itemFor('create'), category: '主题 / 问题' },
    }
    const moved = removeCategory(workspace, 'explore', '主题 / 问题', '书籍 / 影音')
    const cleared = removeCategory(moved.state, 'explore', '书籍 / 影音', null)

    expect(moved).toMatchObject({ ok: true })
    expect(moved.state.items.first.category).toBe('书籍 / 影音')
    expect(moved.state.items.otherBoard.category).toBe('主题 / 问题')
    expect(cleared).toMatchObject({ ok: true })
    expect(cleared.state.items.first.category).toBeNull()
    expect(cleared.state.settings.categories.explore.map((category) => category.name)).toEqual(['课程 / 体验'])
  })

  it('requires a valid same-board replacement before removing an in-use category', () => {
    const workspace = createInitialWorkspace()
    workspace.items = { used: { ...itemFor('explore'), category: '主题 / 问题' } }

    expect(removeCategory(workspace, 'explore', '主题 / 问题')).toEqual({ state: workspace, ok: false, error: 'replacement_required' })
    expect(removeCategory(workspace, 'explore', '主题 / 问题', '产品 / 项目')).toEqual({ state: workspace, ok: false, error: 'invalid_replacement' })
  })
})

function itemFor(board: 'explore' | 'create') {
  return {
    id: `${board}-item`,
    title: '测试卡片',
    description: '',
    board,
    category: null,
    topics: [],
    stage: 'radar' as const,
    capturedAt: '2026-08-22T00:00:00.000Z',
    stageEnteredAt: '2026-08-22T00:00:00.000Z',
    lastTouchedAt: '2026-08-22T00:00:00.000Z',
    lastProgressAt: null,
    version: 1,
  }
}

function minimumColorDistance(candidate: string, currentColors: string[]): number {
  return Math.min(...currentColors.map((current) => categoryColorDistance(candidate, current)))
}
