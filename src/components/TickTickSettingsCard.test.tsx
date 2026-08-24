import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TickTickSettingsCard } from './TickTickSettingsCard'
import { createInitialWorkspace } from '../domain/defaults'
import type { TickTickCliClient } from '../data/ticktickClient'

function Harness({ client }: { client: Partial<TickTickCliClient> }) {
  const [workspace, setWorkspace] = useState(createInitialWorkspace())
  const tickTickCli: TickTickCliClient = {
    status: async () => ({ ok: true, installed: true, loggedIn: true, projectName: '收集箱' }),
    create: async () => ({ ok: true, taskId: 't1' }),
    ...client,
  }
  return <TickTickSettingsCard workspace={workspace} onChange={setWorkspace} tickTickCli={tickTickCli} />
}

describe('TickTickSettingsCard', () => {
  it('defaults to deeplink and does not probe CLI until asked', () => {
    const status = vi.fn(async () => ({ ok: true, installed: true, loggedIn: true }))
    render(<Harness client={{ status }} />)
    expect(screen.getByRole('radio', { name: '深链' })).toBeChecked()
    expect(screen.queryByRole('button', { name: '测试 CLI' })).toBeNull()
    expect(status).not.toHaveBeenCalled()
  })

  it('switches to CLI and tests the configured list', async () => {
    const user = userEvent.setup()
    const status = vi.fn(async () => ({ ok: true, installed: true, loggedIn: true, projectName: '收集箱' }))
    render(<Harness client={{ status }} />)

    await user.click(screen.getByRole('radio', { name: 'CLI' }))
    expect(screen.getByRole('radio', { name: 'CLI' })).toBeChecked()
    await user.click(screen.getByRole('button', { name: '测试 CLI' }))
    expect(status).toHaveBeenCalledWith('收集箱')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('dida CLI 可用'))
  })
})
