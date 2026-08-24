import { useEffect, useState } from 'react'
import type { AiClient } from '../data/aiClient'
import { aiConnectionMessage, DEFAULT_AI_SETTINGS } from '../domain/ai'
import type { AiConnectionStatus, WorkspaceState } from '../domain/types'

interface AiSettingsCardProps {
  workspace: WorkspaceState
  onChange: (state: WorkspaceState) => void
  aiClient: AiClient
  now?: () => string
}

function statusFromCode(code?: string): AiConnectionStatus {
  if (code === 'missing_key') return 'missing_key'
  return 'error'
}

export function AiSettingsCard({
  workspace,
  onChange,
  aiClient,
  now = () => new Date().toISOString(),
}: AiSettingsCardProps) {
  const ai = workspace.settings.ai ?? DEFAULT_AI_SETTINGS
  const [endpoint, setEndpoint] = useState(ai.endpoint)
  const [model, setModel] = useState(ai.model)
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(
    ai.lastTestMessage || aiConnectionMessage(ai.lastTestStatus),
  )

  useEffect(() => {
    let active = true
    aiClient.status().then((status) => {
      if (active) setHasKey(status.hasKey)
    }).catch(() => {
      if (active) setHasKey(false)
    })
    return () => {
      active = false
    }
  }, [aiClient])

  async function testConnection() {
    setBusy(true)
    try {
      const result = await aiClient.testConnection({
        endpoint: endpoint.trim(),
        model: model.trim(),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      })
      const lastTestStatus: AiConnectionStatus = result.ok ? 'ok' : statusFromCode(result.code)
      const lastTestMessage = result.ok
        ? aiConnectionMessage('ok')
        : result.error || aiConnectionMessage(lastTestStatus)
      setMessage(lastTestMessage)
      if (result.ok && apiKey.trim()) {
        setHasKey(true)
        setApiKey('')
      }
      onChange({
        ...workspace,
        settings: {
          ...workspace.settings,
          ai: {
            endpoint: endpoint.trim(),
            model: model.trim(),
            lastTestedAt: now(),
            lastTestStatus,
            lastTestMessage,
          },
        },
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="insight-card">
      <h2>AI 服务</h2>
      <p className="subtle">由本机服务调用通用 OpenAI 兼容接口。密钥只保存在这台电脑，不会进入工作区备份。</p>
      <label>
        接口地址
        <input
          value={endpoint}
          onChange={(event) => setEndpoint(event.target.value)}
          placeholder="https://api.openai.com/v1"
        />
      </label>
      <label>
        模型名称
        <input
          value={model}
          onChange={(event) => setModel(event.target.value)}
          placeholder="gpt-4.1-mini"
        />
      </label>
      <label>
        API 密钥
        <input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={hasKey ? '已保存密钥' : ''}
          autoComplete="off"
        />
      </label>
      <div className="settings-actions">
        <button className="primary-button" type="button" onClick={testConnection} disabled={busy}>
          测试连接
        </button>
      </div>
      <p role="status" className="subtle">{message}</p>
    </section>
  )
}
