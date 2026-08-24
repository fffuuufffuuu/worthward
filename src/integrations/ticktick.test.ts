import { describe, expect, it } from 'vitest'
import { createInitialWorkspace } from '../domain/defaults'
import { captureItem } from '../domain/workspace'
import { buildTickTickUrl, prepareTickTickHandoff } from './ticktick'

const env = {
  now: () => '2026-08-21T08:00:00.000Z',
  id: (() => {
    let value = 0
    return () => `id-${++value}`
  })(),
}

describe('TickTick one-time handoff', () => {
  it('encodes the card as one TickTick task with Markdown context', () => {
    const url = buildTickTickUrl({
      title: '理解知识追踪',
      description: '## 起点\n\n学生模型',
      listName: 'Attention Workbench',
    })

    expect(url).toContain('ticktick://x-callback-url/v1/add_task?')
    expect(decodeURIComponent(url)).toContain('title=理解知识追踪')
    expect(decodeURIComponent(url)).toContain('content=##+起点')
    expect(decodeURIComponent(url)).toContain('list=Attention+Workbench')
  })

  it('creates only one unverified handoff receipt per Engage entry', () => {
    const captured = captureItem(
      createInitialWorkspace(),
      { title: '搭建原型', description: '先做最小版本', board: 'create' },
      env,
    )
    const first = prepareTickTickHandoff(captured.state, captured.itemId, env)
    const second = prepareTickTickHandoff(first.state, captured.itemId, env)

    expect(first.receipt.status).toBe('handed_off_unverified')
    expect(second.state.exportReceipts).toHaveLength(1)
    expect(second.alreadyHandedOff).toBe(true)
  })

  it('writes subtasks into the parent task content when creating a tree', () => {
    const captured = captureItem(
      createInitialWorkspace(),
      { title: '搭建原型', description: '先做最小版本', board: 'create' },
      env,
    )
    const handoff = prepareTickTickHandoff(captured.state, captured.itemId, env, {
      mode: 'tree',
      plan: {
        mainTitle: '搭建原型',
        mainNotes: '先能用',
        steps: [{ id: 's1', title: '明确最小成果', notes: '', children: [] }],
      },
    })

    expect(handoff.receipt.status).toBe('created_with_plan')
    expect(handoff.receipt.plan?.steps).toHaveLength(1)
    expect(decodeURIComponent(handoff.receipt.url ?? '')).toContain('subtasks=明确最小成果')
    expect(decodeURIComponent(handoff.receipt.url ?? '')).toContain('-+[+]+明确最小成果')
  })

  it('keeps checklist items out of the description when writing through CLI', () => {
    const captured = captureItem(
      createInitialWorkspace(),
      { title: '搭建原型', description: '先做最小版本', board: 'create' },
      env,
    )
    const handoff = prepareTickTickHandoff(captured.state, captured.itemId, env, {
      mode: 'tree',
      channel: 'cli',
      taskId: 'dida-1',
      plan: {
        mainTitle: '搭建原型',
        mainNotes: '先能用',
        steps: [{ id: 's1', title: '明确最小成果', notes: '', children: [] }],
      },
    })

    expect(handoff.receipt.channel).toBe('cli')
    expect(handoff.receipt.url).toBeUndefined()
    expect(handoff.receipt.taskId).toBe('dida-1')
    expect(handoff.write.description).toBe('先能用')
    expect(handoff.write.items).toEqual([])
    expect(handoff.write.steps).toEqual([
      { title: '明确最小成果', notes: '', children: [] },
    ])
  })
})
