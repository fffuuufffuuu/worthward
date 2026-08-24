import { describe, expect, it } from 'vitest'
import { createInitialWorkspace } from './defaults'
import { captureItem } from './workspace'
import { searchItems, stripMarkdown } from './search'

describe('searchItems', () => {
  it('finds plain text inside Markdown without matching syntax only', () => {
    const first = captureItem(createInitialWorkspace(), {
      title: '学习笔记',
      board: 'explore',
      description: '## 学生模型\n\n研究 **Knowledge Tracing**。',
      topics: ['AI 教育'],
    })
    const second = captureItem(first.state, {
      title: '电影清单',
      board: 'explore',
      description: '周末观看。',
    })

    expect(searchItems(second.state, 'knowledge tracing')).toHaveLength(1)
    expect(searchItems(second.state, 'AI 教育')).toHaveLength(1)
    expect(searchItems(second.state, '**')).toHaveLength(0)
  })

  it('normalizes links and common Markdown markers', () => {
    expect(stripMarkdown('[官方文档](https://example.com) 与 `代码`')).toBe(
      '官方文档 与 代码',
    )
  })
})
