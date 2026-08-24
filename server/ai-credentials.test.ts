// @vitest-environment node

import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { createCredentialStore } from './ai-credentials.mjs'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

async function store() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xiang-cred-'))
  roots.push(directory)
  return createCredentialStore({
    directory,
    protect: async (plain) => Buffer.from(Buffer.from(plain, 'utf8').toString('base64'), 'utf8'),
    unprotect: async (blob) => Buffer.from(Buffer.from(blob).toString('utf8'), 'base64').toString('utf8'),
  })
}

describe('AI credential store', () => {
  test('saves and reads back a key without writing plaintext', async () => {
    const credentials = await store()
    await credentials.save('sk-test-secret')
    await expect(credentials.has()).resolves.toBe(true)
    await expect(credentials.read()).resolves.toBe('sk-test-secret')
    const raw = await fs.readFile(credentials.file, 'utf8')
    expect(raw).not.toContain('sk-test-secret')
  })

  test('clear removes the credential file', async () => {
    const credentials = await store()
    await credentials.save('sk-test-secret')
    await credentials.clear()
    await expect(credentials.has()).resolves.toBe(false)
    await expect(credentials.read()).resolves.toBe(null)
  })

  test('rejects a blank key', async () => {
    const credentials = await store()
    await expect(credentials.save('   ')).rejects.toThrow(/empty/i)
  })

  test('treats an unreadable blob as missing instead of throwing plaintext', async () => {
    const credentials = await store()
    await credentials.save('sk-test-secret')
    await fs.writeFile(credentials.file, 'not-encrypted', 'utf8')
    const broken = createCredentialStore({
      directory: path.dirname(credentials.file),
      protect: async (plain) => Buffer.from(plain, 'utf8'),
      unprotect: async () => {
        throw new Error('sk-test-secret leaked from protector')
      },
    })
    await expect(broken.read()).resolves.toBe(null)
    await expect(broken.has()).resolves.toBe(false)
  })
})
