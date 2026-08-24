import type { WorkspaceState } from './types'

export const CONTROLLED_EXPLORE_TOPICS = [
  'AI 与智能体',
  '教育技术',
  '教学设计',
  '学习科学',
  '项目式学习',
  '教师发展',
  '科研与信息检索',
  '写作表达',
  '思维模型',
  '沟通与协作',
  '个人成长',
  '注意力与个人系统',
  '科学与自然',
  '社会与文化',
  '设计与创意',
] as const

const EXPLORE_TOPIC_OVERRIDES: Record<string, readonly string[]> = {}

export function rebuildSeedExploreTopics(state: WorkspaceState): WorkspaceState {
  let changed = false
  const items = Object.fromEntries(Object.entries(state.items).map(([id, item]) => {
    const topics = EXPLORE_TOPIC_OVERRIDES[id]
    if (item.board !== 'explore' || !topics) return [id, item]
    changed = true
    return [id, { ...item, topics: [...topics] }]
  }))
  return changed ? { ...state, items } : state
}

