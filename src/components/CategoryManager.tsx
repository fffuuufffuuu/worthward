import { useEffect, useState } from 'react'
import {
  addCategory,
  countCategoryUsage,
  recolorCategory,
  removeCategory,
  renameCategory,
  type CategoryError,
  type CategoryResult,
} from '../domain/categories'
import type { Board, WorkspaceState } from '../domain/types'

interface CategoryManagerProps {
  workspace: WorkspaceState
  onChange: (state: WorkspaceState) => void
}

interface PendingDeletion {
  board: Board
  name: string
  usage: number
}

const boardLabels: Record<Board, string> = {
  explore: '探索',
  create: '创造',
}

const errorMessages: Record<CategoryError, string> = {
  blank_name: '类别名称不能为空。',
  duplicate_name: '探索板块中已存在同名类别。',
  category_not_found: '找不到要修改的类别。',
  invalid_color: '请输入有效的颜色。',
  replacement_required: '请先选择卡片的新类别。',
  invalid_replacement: '只能迁移到同一板块的其他类别或未分类。',
}

function errorMessage(error: CategoryError | undefined, board: Board): string {
  if (error === 'duplicate_name') return `${boardLabels[board]}板块中已存在同名类别。`
  return error ? errorMessages[error] : '类别设置未能保存。'
}

export function CategoryManager({ workspace, onChange }: CategoryManagerProps) {
  const [addNames, setAddNames] = useState<Record<Board, string>>({ explore: '', create: '' })
  const [renameDrafts, setRenameDrafts] = useState<Record<Board, Record<string, string>>>({ explore: {}, create: {} })
  const [error, setError] = useState<string | null>(null)
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null)
  const [replacement, setReplacement] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    if (!pendingDeletion) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDeletion()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pendingDeletion])

  function apply(result: CategoryResult, board: Board): boolean {
    if (!result.ok) {
      setError(errorMessage(result.error, board))
      return false
    }
    setError(null)
    onChange(result.state)
    return true
  }

  function add(board: Board) {
    if (apply(addCategory(workspace, board, addNames[board]), board)) {
      setAddNames((current) => ({ ...current, [board]: '' }))
    }
  }

  function rename(board: Board, oldName: string) {
    const nextName = renameDrafts[board][oldName] ?? oldName
    if (nextName === oldName) return
    if (apply(renameCategory(workspace, board, oldName, nextName), board)) {
      setRenameDrafts((current) => ({ ...current, [board]: { ...current[board], [oldName]: undefined } }))
    } else {
      setRenameDrafts((current) => ({ ...current, [board]: { ...current[board], [oldName]: undefined } }))
    }
  }

  function openDeletion(board: Board, name: string) {
    setError(null)
    setReplacement(undefined)
    setPendingDeletion({ board, name, usage: countCategoryUsage(workspace, board, name) })
  }

  function closeDeletion() {
    setPendingDeletion(null)
    setReplacement(undefined)
  }

  function confirmDeletion() {
    if (!pendingDeletion) return
    const { board, name, usage } = pendingDeletion
    if (usage > 0 && replacement === undefined) return
    if (apply(removeCategory(workspace, board, name, replacement), board)) closeDeletion()
  }

  return <div className="category-manager">
    {error && <p className="category-manager-error" role="alert">{error}</p>}
    {(['explore', 'create'] as const).map((board) => {
      const label = boardLabels[board]
      return <section key={board} className="category-manager-board" aria-label={`${label}类别标签`}>
        <h3>{label}类别标签</h3>
        <div className="category-manager-add">
          <input
            aria-label={`新增${label}类别`}
            value={addNames[board]}
            onChange={(event) => setAddNames((current) => ({ ...current, [board]: event.target.value }))}
          />
          <button type="button" onClick={() => add(board)}>添加{label}类别</button>
        </div>
        <ul className="category-manager-list">
          {workspace.settings.categories[board].map((category) => <li key={category.name} className="category-manager-row">
            <input
              aria-label={`${label}类别名称：${category.name}`}
              value={renameDrafts[board][category.name] ?? category.name}
              onChange={(event) => setRenameDrafts((current) => ({
                ...current,
                [board]: { ...current[board], [category.name]: event.target.value },
              }))}
              onBlur={() => rename(board, category.name)}
            />
            <input
              aria-label={`${label}类别颜色：${category.name}`}
              type="color"
              value={category.color}
              onChange={(event) => apply(recolorCategory(workspace, board, category.name, event.target.value), board)}
            />
            <button type="button" onClick={() => openDeletion(board, category.name)}>删除{category.name}</button>
          </li>)}
        </ul>
      </section>
    })}
    {pendingDeletion && <div
      className="category-delete-backdrop"
      data-testid="category-delete-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget) closeDeletion() }}
    >
      <section className="category-delete-dialog" role="dialog" aria-modal="true" aria-label={`删除类别：${pendingDeletion.name}`}>
        <button type="button" aria-label="关闭删除对话框" onClick={closeDeletion}>关闭</button>
        <h3>删除类别：{pendingDeletion.name}</h3>
        <p>将影响 {pendingDeletion.usage} 张卡片</p>
        {pendingDeletion.usage > 0 && <fieldset>
          <legend>迁移到</legend>
          {workspace.settings.categories[pendingDeletion.board]
            .filter((category) => category.name !== pendingDeletion.name)
            .map((category) => <label key={category.name}>
              <input
                type="radio"
                name="category-replacement"
                checked={replacement === category.name}
                onChange={() => setReplacement(category.name)}
              />
              {category.name}
            </label>)}
          <label>
            <input
              type="radio"
              name="category-replacement"
              checked={replacement === null}
              onChange={() => setReplacement(null)}
            />
            改为未分类
          </label>
        </fieldset>}
        <div className="dialog-actions">
          <button type="button" onClick={closeDeletion}>取消</button>
          <button type="button" onClick={confirmDeletion} disabled={pendingDeletion.usage > 0 && replacement === undefined}>确认删除</button>
        </div>
      </section>
    </div>}
  </div>
}
