import { useState } from 'react'
import type { TickTickCliClient } from '../data/ticktickClient'
import type { TickTickCreateMode, WorkspaceState } from '../domain/types'

interface TickTickSettingsCardProps {
  workspace: WorkspaceState
  onChange: (state: WorkspaceState) => void
  tickTickCli: TickTickCliClient
}

export function TickTickSettingsCard({
  workspace,
  onChange,
  tickTickCli,
}: TickTickSettingsCardProps) {
  const createMode: TickTickCreateMode = workspace.settings.tickTickCreateMode === 'cli' ? 'cli' : 'deeplink'
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  function patch(next: Partial<WorkspaceState['settings']>) {
    onChange({
      ...workspace,
      settings: { ...workspace.settings, ...next },
    })
  }

  async function testCli() {
    setBusy(true)
    try {
      const result = await tickTickCli.status(workspace.settings.tickTickListName)
      setMessage(result.ok
        ? `dida CLI 可用，将写入清单「${result.projectName || workspace.settings.tickTickListName}」。`
        : result.error || 'dida CLI 不可用。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="insight-card">
      <h2>滴答清单</h2>
      <label>
        创建到清单
        <input
          value={workspace.settings.tickTickListName}
          onChange={(event) => patch({ tickTickListName: event.target.value })}
        />
      </label>
      <fieldset className="segmented-field">
        <legend>创建方式</legend>
        <label>
          <input
            type="radio"
            name="ticktick-create-mode"
            checked={createMode === 'deeplink'}
            onChange={() => patch({ tickTickCreateMode: 'deeplink' })}
          />
          深链
        </label>
        <label>
          <input
            type="radio"
            name="ticktick-create-mode"
            checked={createMode === 'cli'}
            onChange={() => patch({ tickTickCreateMode: 'cli' })}
          />
          CLI
        </label>
      </fieldset>
      {createMode === 'cli' ? (
        <>
          <p className="subtle">使用本机已登录的 dida 命令创建任务。系统收集箱不会出现在清单列表里，填写「收集箱」或留空都会写入收集箱。选择「创建主任务和子任务」时会写入真正的子任务，可含两层。</p>
          <div className="settings-actions">
            <button className="secondary-button" type="button" onClick={testCli} disabled={busy}>
              测试 CLI
            </button>
          </div>
          {message && <p role="status" className="subtle">{message}</p>}
        </>
      ) : (
        <p className="subtle">打开滴答创建入口。深链只能带上标题和说明，检查事项会写进任务说明。</p>
      )}
    </section>
  )
}
