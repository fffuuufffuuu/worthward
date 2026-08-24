import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AiSettingsCard } from './AiSettingsCard'
import { exportWorkspaceJson } from '../data/storage'
import { createInitialWorkspace } from '../domain/defaults'
import type { AiClient } from '../data/aiClient'
import type { WorkspaceState } from '../domain/types'

function renderCard(
  client: Partial<AiClient>,
  workspace: WorkspaceState = createInitialWorkspace(),
  onChange = vi.fn(),
) {
  const aiClient: AiClient = {
    status: async () => ({ hasKey: false }),
    saveCredential: async () => ({ ok: true }),
    clearCredential: async () => ({ ok: true }),
    testConnection: async () => ({ ok: true }),
    suggestTopics: async () => ({ ok: true, existing: [], proposed: [] }),
    suggestEngagePlan: async () => ({ ok: true, mainTitle: '', mainNotes: '', steps: [] }),
    suggestReviewPlan: async () => ({ ok: false, code: 'network', error: '未连接' }),
    ...client,
  }
  render(
    <AiSettingsCard
      workspace={workspace}
      onChange={onChange}
      aiClient={aiClient}
      now={() => '2026-08-23T12:00:00.000Z'}
    />,
  )
  return { onChange, aiClient }
}

describe('AiSettingsCard', () => {
  it('does not test a connection just because the card opened', async () => {
    const testConnection = vi.fn(async () => ({ ok: true }))
    renderCard({ testConnection })
    expect(screen.getByRole('heading', { name: 'AI 服务' })).toBeVisible()
    expect(testConnection).not.toHaveBeenCalled()
  })

  it('tests the connection with the form values when the button is clicked', async () => {
    const user = userEvent.setup()
    const testConnection = vi.fn(async () => ({ ok: true }))
    const { onChange } = renderCard({ testConnection })

    await user.type(screen.getByLabelText('接口地址'), 'https://api.example.test/v1')
    await user.type(screen.getByLabelText('模型名称'), 'demo-model')
    await user.type(screen.getByLabelText('API 密钥'), 'sk-live-should-not-leak')
    await user.click(screen.getByRole('button', { name: '测试连接' }))

    expect(testConnection).toHaveBeenCalledOnce()
    expect(testConnection).toHaveBeenCalledWith({
      endpoint: 'https://api.example.test/v1',
      model: 'demo-model',
      apiKey: 'sk-live-should-not-leak',
    })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const next = onChange.mock.calls.at(-1)?.[0] as WorkspaceState
    expect(next.settings.ai).toMatchObject({
      endpoint: 'https://api.example.test/v1',
      model: 'demo-model',
      lastTestStatus: 'ok',
      lastTestedAt: '2026-08-23T12:00:00.000Z',
    })
    expect(exportWorkspaceJson(next)).not.toContain('sk-live-should-not-leak')
  })

  it('keeps a saved key out of the password field', async () => {
    renderCard({ status: async () => ({ hasKey: true }) })
    const input = await screen.findByPlaceholderText('已保存密钥')
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveValue('')
    expect(input).toHaveAttribute('placeholder', '已保存密钥')
  })

  it('shows a Chinese error and does not leak the key', async () => {
    const user = userEvent.setup()
    renderCard({
      testConnection: async () => ({
        ok: false,
        code: 'unauthorized',
        error: '密钥或接口未被接受。',
      }),
    })
    await user.type(screen.getByLabelText('API 密钥'), 'sk-live-should-not-leak')
    await user.click(screen.getByRole('button', { name: '测试连接' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('密钥或接口未被接受。'))
    expect(screen.queryByText(/sk-live-should-not-leak/)).toBeNull()
  })
})
