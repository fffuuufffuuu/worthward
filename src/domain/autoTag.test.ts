import { describe, expect, it } from 'vitest'
import { createInitialWorkspace } from './defaults'
import { captureItem } from './workspace'
import type { DomainEnv } from './types'
import {
  matchExistingTopic,
  sanitizeAutoTagResult,
  topicUsage,
} from './autoTag'

const env: DomainEnv = {
  now: () => '2026-08-23T12:00:00.000Z',
  id: (() => {
    let value = 0
    return () => `tag-${++value}`
  })(),
}

describe('topicUsage', () => {
  it('counts every existing topic name without card bodies', () => {
    let state = createInitialWorkspace()
    state = captureItem(state, { title: 'A', board: 'explore', topics: ['注意力与个人系统', '学习科学'] }, env).state
    state = captureItem(state, { title: 'B', board: 'create', topics: ['学习科学'] }, env).state

    expect(topicUsage(state)).toEqual([
      { name: '学习科学', count: 2 },
      { name: '注意力与个人系统', count: 1 },
    ])
  })
})

describe('sanitizeAutoTagResult', () => {
  const catalog = [
    { name: '注意力与个人系统', count: 4 },
    { name: '教学设计', count: 2 },
    { name: 'AI 与智能体', count: 8 },
  ]

  it('keeps at most three existing tags and remaps case or spacing', () => {
    const result = sanitizeAutoTagResult({
      existing: [
        { name: 'ai与智能体', reason: '内容在谈模型' },
        { name: '教学 设计', reason: '在做课' },
        { name: '注意力与个人系统', reason: '个人系统' },
        { name: '学习科学', reason: '不在目录' },
      ],
      proposed: [],
    }, catalog, [])

    expect(result.existing.map((item) => item.name)).toEqual([
      'AI 与智能体',
      '教学设计',
      '注意力与个人系统',
    ])
    expect(result.proposed).toEqual([])
  })

  it('turns an exact new tag into reuse and marks near-synonyms', () => {
    const result = sanitizeAutoTagResult({
      existing: [],
      proposed: [
        { name: '注意力管理', reason: '在谈专注' },
        { name: '教学设计', reason: '其实已有' },
      ],
    }, catalog, [])

    expect(result.existing).toEqual([
      { name: '教学设计', reason: '其实已有' },
    ])
    expect(result.proposed).toEqual([
      { name: '注意力管理', reason: '在谈专注', reuse: '注意力与个人系统' },
    ])
  })

  it('does not re-add tags the user already selected', () => {
    const result = sanitizeAutoTagResult({
      existing: [{ name: '教学设计', reason: '重复' }],
      proposed: [],
    }, catalog, ['教学设计'])

    expect(result.existing).toEqual([])
  })

  it('allows an empty suggestion', () => {
    expect(sanitizeAutoTagResult({ existing: [], proposed: [] }, catalog, [])).toEqual({
      existing: [],
      proposed: [],
    })
  })
})

describe('matchExistingTopic', () => {
  it('matches near synonyms like 注意力 and 注意力管理', () => {
    const catalog = [{ name: '注意力与个人系统', count: 1 }]
    expect(matchExistingTopic(catalog, '注意力管理')?.kind).toBe('near')
    expect(matchExistingTopic(catalog, '注意力与个人系统')?.kind).toBe('exact')
  })
})
