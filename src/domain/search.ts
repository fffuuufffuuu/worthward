import type { AttentionItem, Board, WorkspaceState } from './types'

export function stripMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[`*_>#~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function searchableText(item: AttentionItem): string {
  return stripMarkdown(
    [
      item.title,
      item.description,
      item.category ?? '',
      item.topics.join(' '),
    ].join(' '),
  ).toLocaleLowerCase('zh-CN')
}

export function searchItems(
  state: WorkspaceState,
  query: string,
  board?: Board,
): AttentionItem[] {
  const normalized = stripMarkdown(query).toLocaleLowerCase('zh-CN')
  if (!normalized) return []
  return Object.values(state.items).filter(
    (item) => (!board || item.board === board) && searchableText(item).includes(normalized),
  )
}
