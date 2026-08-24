import type { AttentionItem } from '../domain/types'

interface EngageCommitDialogProps {
  item: AttentionItem
  engageItems: AttentionItem[]
  engageCount: number
  engageLimit: number
  focusCount: number
  focusLimit: number
  onClose: () => void
  onConfirm: (options: { overrideWip?: boolean; replaceItemId?: string; displaceTarget?: 'radar' | 'focus' }) => void
}

export function EngageCommitDialog({
  item,
  engageItems,
  engageCount,
  engageLimit,
  focusCount,
  focusLimit,
  onClose,
  onConfirm,
}: EngageCommitDialogProps) {
  const full = engageCount >= engageLimit
  const focusFull = focusCount >= focusLimit

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog compact-dialog" role="dialog" aria-modal="true" aria-label="进入 Engage">
        <p className="eyebrow">COMMIT</p>
        <h2>进入 Engage</h2>
        <div className="dialog-copy">
          <p>
            <b>{item.title}</b>
            {' · '}
            {item.board === 'explore' ? '探索' : '创造'}
            {' · '}
            {item.category ?? '未分类'}
            {item.topics.length ? ` · ${item.topics.map((topic) => `#${topic}`).join(' ')}` : ''}
          </p>
          {full && (
            <p className="engage-over-limit">
              <strong>Engage 已满。</strong>
              {' '}
              Engage {engageCount}/{engageLimit} 已超出建议同时进行任务的数量。
            </p>
          )}
          {engageItems.length > 0 && (
            <ul className="engage-current-list">
              {engageItems.map((current) => (
                <li key={current.id}>
                  <span>{current.title}</span>
                  {full && (
                    <span className="engage-displace-actions">
                      <button
                        type="button"
                        className="text-button"
                        title={focusFull ? 'Focus 已满，无法把旧卡降回 Focus' : '把这张旧卡降回 Focus'}
                        disabled={focusFull}
                        onClick={() => onConfirm({ replaceItemId: current.id, displaceTarget: 'focus' })}
                      >
                        替换
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="dialog-actions engage-actions">
          <button className="secondary-button" onClick={onClose}>取消</button>
          {full ? (
            <button className="primary-button" onClick={() => onConfirm({ overrideWip: true })}>任性加入</button>
          ) : (
            <button className="primary-button" onClick={() => onConfirm({})}>确认进入</button>
          )}
        </div>
      </section>
    </div>
  )
}
