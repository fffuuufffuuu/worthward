import { describe, expect, it } from 'vitest'
import {
  countSubtasks,
  emptyPlanFromTitle,
  formatChecklistItems,
  formatPlanContent,
  formatTaskTree,
  MAX_PLAN_SUBTASKS,
  sanitizeEngagePlan,
} from './engagePlan'

function ids() {
  let value = 0
  return () => `step-${++value}`
}

describe('sanitizeEngagePlan', () => {
  it('keeps a main task and trims empty steps', () => {
    const plan = sanitizeEngagePlan({
      mainTitle: '  理解知识追踪  ',
      mainNotes: '先画学生模型',
      steps: [
        { title: '明确问题', notes: '学什么' },
        { title: '   ' },
        { title: '选择材料', children: [{ title: '读一篇综述' }, { title: '' }] },
      ],
    }, ids())

    expect(plan.mainTitle).toBe('理解知识追踪')
    expect(plan.steps).toHaveLength(2)
    expect(plan.steps[1]?.title).toBe('选择材料')
    expect(plan.steps[1]?.children.map((child) => child.title)).toEqual(['读一篇综述'])
    expect(countSubtasks(plan)).toBe(3)
  })

  it('drops a third nesting level instead of keeping it', () => {
    const plan = sanitizeEngagePlan({
      mainTitle: '做所向',
      steps: [{
        title: '制作',
        children: [{
          title: '写拆解界面',
          children: [{ title: '不允许的第三层' }],
        }],
      }],
    }, ids())

    expect(plan.steps[0]?.children[0]?.children).toEqual([])
  })

  it('caps subtasks at 15 excluding the main task', () => {
    const plan = sanitizeEngagePlan({
      mainTitle: '过大计划',
      steps: Array.from({ length: 8 }, (_, index) => ({
        title: `步骤 ${index + 1}`,
        children: [{ title: `子 ${index + 1}a` }, { title: `子 ${index + 1}b` }],
      })),
    }, ids())

    expect(plan.steps.length).toBeLessThanOrEqual(7)
    expect(countSubtasks(plan)).toBe(MAX_PLAN_SUBTASKS)
  })

  it('allows an empty plan so the user can skip TickTick', () => {
    expect(sanitizeEngagePlan({}, ids())).toEqual({
      mainTitle: '',
      mainNotes: '',
      steps: [],
    })
    expect(emptyPlanFromTitle('做注意力工作台').mainTitle).toBe('做注意力工作台')
    expect(emptyPlanFromTitle('做注意力工作台', '先能用').mainNotes).toBe('先能用')
  })

  it('formats a tree into Markdown for the TickTick parent task', () => {
    const plan = sanitizeEngagePlan({
      mainTitle: '做所向',
      mainNotes: '先能用',
      steps: [
        { title: '明确最小成果', notes: '可编辑计划' },
        { title: '写入滴答', children: [{ title: '只创建主任务' }] },
      ],
    }, ids())

    expect(formatPlanContent(plan, false)).toBe('先能用')
    expect(formatPlanContent(plan, true)).toContain('- [ ] 明确最小成果：可编辑计划')
    expect(formatPlanContent(plan, true)).toContain('- [ ] 写入滴答 · 只创建主任务')
    expect(formatChecklistItems(plan)).toEqual([
      '明确最小成果：可编辑计划',
      '写入滴答',
      '写入滴答 · 只创建主任务',
    ])
    expect(formatTaskTree(plan)).toEqual([
      { title: '明确最小成果', notes: '可编辑计划', children: [] },
      { title: '写入滴答', notes: '', children: [{ title: '只创建主任务', notes: '' }] },
    ])
  })
})
