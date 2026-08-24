import type { AiConnectionStatus, AiSettings } from './types'

export const AI_PROMPT_VERSION = '2026-08-23.1'

export const DEFAULT_AI_SETTINGS: AiSettings = {
  endpoint: '',
  model: '',
  lastTestedAt: null,
  lastTestStatus: 'unknown',
  lastTestMessage: '',
}

const CONNECTION_STATUSES: AiConnectionStatus[] = ['unknown', 'ok', 'missing_key', 'error']

export function isAiSettings(value: unknown): value is AiSettings {
  if (!value || typeof value !== 'object') return false
  const candidate = value as AiSettings
  return (
    typeof candidate.endpoint === 'string' &&
    typeof candidate.model === 'string' &&
    (candidate.lastTestedAt === null || typeof candidate.lastTestedAt === 'string') &&
    CONNECTION_STATUSES.includes(candidate.lastTestStatus) &&
    typeof candidate.lastTestMessage === 'string'
  )
}

export function migrateAiSettings(value: unknown): AiSettings {
  if (!isAiSettings(value)) return { ...DEFAULT_AI_SETTINGS }
  return {
    endpoint: value.endpoint.trim(),
    model: value.model.trim(),
    lastTestedAt: value.lastTestedAt,
    lastTestStatus: value.lastTestStatus,
    lastTestMessage: value.lastTestMessage,
  }
}

export function aiConnectionMessage(status: AiConnectionStatus, detail = ''): string {
  if (status === 'ok') return '连接成功。'
  if (status === 'missing_key') return '尚未保存 API 密钥。'
  if (status === 'error') return detail || '无法完成连接测试。'
  return '尚未测试连接。'
}
