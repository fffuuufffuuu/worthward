import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const FILE_NAME = 'ai-credential.dpapi'

class EmptyCredentialError extends Error {
  constructor() {
    super('API key cannot be empty')
    this.name = 'EmptyCredentialError'
  }
}

function defaultDirectory() {
  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local')
  return path.join(localAppData, '所向')
}

function isMissing(error) {
  return error && typeof error === 'object' && error.code === 'ENOENT'
}

function runPowerShell(script, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    )
    const stdout = []
    const stderr = []
    child.stdout.on('data', (chunk) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      const out = Buffer.concat(stdout).toString('utf8').trim()
      const err = Buffer.concat(stderr).toString('utf8').trim()
      if (code === 0 && out) {
        resolve(out)
        return
      }
      reject(new Error(err || `DPAPI helper exited with code ${code}`))
    })
    if (input) child.stdin.end(input)
    else child.stdin.end()
  })
}

async function protectWithDpapi(plain) {
  const script = [
    'Add-Type -AssemblyName System.Security',
    '$reader = New-Object IO.StreamReader([Console]::OpenStandardInput(), [Text.Encoding]::UTF8)',
    '$plain = $reader.ReadToEnd()',
    '$bytes = [Text.Encoding]::UTF8.GetBytes($plain)',
    '$protected = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)',
    '[Console]::Out.Write([Convert]::ToBase64String($protected))',
  ].join('; ')
  const encoded = await runPowerShell(script, plain)
  return Buffer.from(encoded, 'base64')
}

async function unprotectWithDpapi(blob) {
  const script = [
    'Add-Type -AssemblyName System.Security',
    '$reader = New-Object IO.StreamReader([Console]::OpenStandardInput(), [Text.Encoding]::UTF8)',
    '$encoded = $reader.ReadToEnd()',
    '$protected = [Convert]::FromBase64String($encoded)',
    '$bytes = [Security.Cryptography.ProtectedData]::Unprotect($protected, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)',
    '[Console]::Out.Write([Text.Encoding]::UTF8.GetString($bytes))',
  ].join('; ')
  return runPowerShell(script, Buffer.from(blob).toString('base64'))
}

export function createCredentialStore(options = {}) {
  const directory = options.directory ?? defaultDirectory()
  const fileSystem = options.fileSystem ?? fs
  const protect = options.protect ?? (process.platform === 'win32' ? protectWithDpapi : undefined)
  const unprotect = options.unprotect ?? (process.platform === 'win32' ? unprotectWithDpapi : undefined)
  const file = path.join(directory, FILE_NAME)

  if (!protect || !unprotect) {
    throw new Error('Secure credential storage is only available on Windows or with an injected protector')
  }

  async function removeTemporary(temporary) {
    try {
      await fileSystem.unlink(temporary)
    } catch (error) {
      if (!isMissing(error)) {
        // Cleanup is best effort.
      }
    }
  }

  return {
    file,
    async save(secret) {
      const value = typeof secret === 'string' ? secret.trim() : ''
      if (!value) throw new EmptyCredentialError()

      const protectedBlob = await protect(value)
      await fileSystem.mkdir(directory, { recursive: true })
      const temporary = path.join(
        directory,
        `${FILE_NAME}.${process.pid}-${Date.now()}-${randomUUID()}.tmp`,
      )
      try {
        await fileSystem.writeFile(temporary, protectedBlob, { flag: 'wx' })
        await fileSystem.rename(temporary, file)
      } catch (error) {
        await removeTemporary(temporary)
        throw error
      }
    },
    async read() {
      try {
        const blob = await fileSystem.readFile(file)
        const plain = await unprotect(blob)
        const value = String(plain ?? '').trim()
        return value || null
      } catch (error) {
        if (isMissing(error)) return null
        return null
      }
    },
    async has() {
      return (await this.read()) !== null
    },
    async clear() {
      try {
        await fileSystem.unlink(file)
      } catch (error) {
        if (!isMissing(error)) throw error
      }
    },
  }
}

export { EmptyCredentialError }
