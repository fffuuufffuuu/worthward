// @vitest-environment node

import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { afterEach, describe, expect, test } from 'vitest'
import {
  WorkspaceReadError,
  WorkspaceValidationError,
  createWorkspaceStore,
} from './workspace-store.mjs'

const temporaryDirectories: string[] = []

async function temporaryDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xiang-store-'))
  temporaryDirectories.push(directory)
  return directory
}

function workspace(title = 'first') {
  return {
    schemaVersion: 1,
    items: { item: { title } },
    events: [],
    relations: [],
    reviews: [],
    exportReceipts: [],
    settings: {},
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  )
})

describe('workspace store', () => {
  test('reports its paths and a missing workspace explicitly', async () => {
    const directory = await temporaryDirectory()
    const store = createWorkspaceStore({ directory })

    expect(store.paths).toEqual({
      directory,
      workspace: path.join(directory, 'workspace.json'),
      backup: path.join(directory, 'workspace.backup.json'),
    })
    await expect(store.exists()).resolves.toBe(false)
    await expect(store.read()).resolves.toEqual({
      status: 'missing',
      workspace: null,
    })
  })

  test('rejects unsupported structures without changing the workspace file', async () => {
    const directory = await temporaryDirectory()
    const store = createWorkspaceStore({ directory })
    const original = workspace()
    await store.save(original)
    const originalText = await fs.readFile(store.paths.workspace, 'utf8')

    await expect(
      store.save({ ...workspace('invalid'), schemaVersion: 2 }),
    ).rejects.toBeInstanceOf(WorkspaceValidationError)

    expect(await fs.readFile(store.paths.workspace, 'utf8')).toBe(originalText)
    expect((await fs.readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  test.each([
    ['items', null],
    ['items', []],
    ['events', {}],
    ['relations', {}],
    ['reviews', {}],
    ['exportReceipts', {}],
    ['settings', []],
  ])('rejects an invalid %s field', async (field, invalidValue) => {
    const directory = await temporaryDirectory()
    const store = createWorkspaceStore({ directory })

    await expect(
      store.save({ ...workspace(), [field]: invalidValue }),
    ).rejects.toBeInstanceOf(WorkspaceValidationError)
    await expect(store.exists()).resolves.toBe(false)
  })

  test('accepts an empty items object for a new workspace', async () => {
    const directory = await temporaryDirectory()
    const store = createWorkspaceStore({ directory })
    const emptyWorkspace = { ...workspace(), items: {} }

    await expect(store.save(emptyWorkspace)).resolves.toEqual(emptyWorkspace)
  })

  test('writes through a unique temporary file and keeps the last readable version as backup', async () => {
    const directory = await temporaryDirectory()
    const store = createWorkspaceStore({ directory })
    const first = workspace('first')
    const second = workspace('second')

    await expect(store.save(first)).resolves.toEqual(first)
    await expect(store.save(second)).resolves.toEqual(second)

    expect(JSON.parse(await fs.readFile(store.paths.workspace, 'utf8'))).toEqual(second)
    expect(JSON.parse(await fs.readFile(store.paths.backup, 'utf8'))).toEqual(first)
    expect((await fs.readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  test('a failed temporary-file verification preserves the current workspace and removes its temporary file', async () => {
    const directory = await temporaryDirectory()
    const originalStore = createWorkspaceStore({ directory })
    const original = workspace('safe')
    await originalStore.save(original)
    const originalText = await fs.readFile(originalStore.paths.workspace, 'utf8')

    const failingStore = createWorkspaceStore({
      directory,
      fileSystem: {
        ...fs,
        async readFile(file: Parameters<typeof fs.readFile>[0], options?: Parameters<typeof fs.readFile>[1]) {
          if (String(file).endsWith('.tmp')) {
            return '{"schemaVersion":2}'
          }
          return fs.readFile(file, options as never)
        },
      },
    })

    await expect(failingStore.save(workspace('unsafe'))).rejects.toBeInstanceOf(
      WorkspaceValidationError,
    )

    expect(await fs.readFile(originalStore.paths.workspace, 'utf8')).toBe(originalText)
    expect((await fs.readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  test('a partial temporary write failure is cleaned up without changing the workspace', async () => {
    const directory = await temporaryDirectory()
    const originalStore = createWorkspaceStore({ directory })
    const original = workspace('safe')
    await originalStore.save(original)
    const originalText = await fs.readFile(originalStore.paths.workspace, 'utf8')

    const failingStore = createWorkspaceStore({
      directory,
      fileSystem: {
        ...fs,
        async writeFile(file: Parameters<typeof fs.writeFile>[0], data: Parameters<typeof fs.writeFile>[1], options?: Parameters<typeof fs.writeFile>[2]) {
          await fs.writeFile(file, data, options)
          if (String(file).endsWith('.tmp')) throw new Error('simulated write failure')
        },
      },
    })

    await expect(failingStore.save(workspace('unsafe'))).rejects.toThrow(
      'simulated write failure',
    )
    expect(await fs.readFile(originalStore.paths.workspace, 'utf8')).toBe(originalText)
    expect((await fs.readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  test('recovers a corrupt workspace from a readable backup and exposes that status', async () => {
    const directory = await temporaryDirectory()
    const store = createWorkspaceStore({ directory })
    const readableBackup = workspace('backup')
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(store.paths.workspace, '{broken', 'utf8')
    await fs.writeFile(store.paths.backup, JSON.stringify(readableBackup), 'utf8')

    await expect(store.read()).resolves.toEqual({
      status: 'recovered',
      workspace: readableBackup,
    })
    expect(JSON.parse(await fs.readFile(store.paths.workspace, 'utf8'))).toEqual(readableBackup)
  })

  test('does not restore permanently removed cards when recovering from backup', async () => {
    const directory = await temporaryDirectory()
    const store = createWorkspaceStore({ directory })
    const withCard = {
      ...workspace('keep'),
      items: {
        keep: { title: 'keep' },
        gone: { title: 'gone' },
      },
      events: [
        { type: 'note', itemId: 'keep' },
        { type: 'note', itemId: 'gone' },
        { type: 'spawn', itemId: 'keep', childItemId: 'gone' },
      ],
      relations: [{ parentItemId: 'keep', childItemId: 'gone' }],
      exportReceipts: [{ itemId: 'gone' }, { itemId: 'keep' }],
      reviews: [{
        adjustments: [{
          promotions: ['gone', 'keep'],
          displacements: [{ itemId: 'gone' }, { itemId: 'keep' }],
        }],
        comboDrafts: {
          radar_focus: {
            promotions: [{ itemId: 'gone' }, { itemId: 'keep' }],
            displacements: [{ itemId: 'gone' }],
            extraIds: ['gone', 'keep'],
          },
        },
      }],
    }
    const withoutCard = {
      ...withCard,
      items: { keep: { title: 'keep' } },
      events: [{ type: 'note', itemId: 'keep' }],
      relations: [],
      exportReceipts: [{ itemId: 'keep' }],
      reviews: [{
        adjustments: [{
          promotions: ['keep'],
          displacements: [{ itemId: 'keep' }],
        }],
        comboDrafts: {
          radar_focus: {
            promotions: [{ itemId: 'keep' }],
            displacements: [],
            extraIds: ['keep'],
          },
        },
      }],
    }

    await store.save(withCard)
    await store.save(withoutCard)
    await fs.writeFile(store.paths.workspace, '{broken', 'utf8')

    const recovered = await store.read()
    expect(recovered.status).toBe('recovered')
    expect(recovered.workspace?.items.gone).toBeUndefined()
    expect(recovered.workspace?.items.keep).toEqual({ title: 'keep' })
    expect(recovered.workspace?.events.some((event: { itemId?: string; childItemId?: string }) =>
      event.itemId === 'gone' || event.childItemId === 'gone')).toBe(false)
    expect(recovered.workspace?.relations).toEqual([])
    expect(recovered.workspace?.exportReceipts).toEqual([{ itemId: 'keep' }])
  })

  test('does not replace a newer workspace when reading it fails for an I/O reason', async () => {
    const directory = await temporaryDirectory()
    const originalStore = createWorkspaceStore({ directory })
    await originalStore.save(workspace('old'))
    await originalStore.save(workspace('new'))
    const latestText = await fs.readFile(originalStore.paths.workspace, 'utf8')

    const failingStore = createWorkspaceStore({
      directory,
      fileSystem: {
        ...fs,
        async readFile(file: Parameters<typeof fs.readFile>[0], options?: Parameters<typeof fs.readFile>[1]) {
          if (path.resolve(String(file)) === path.resolve(originalStore.paths.workspace)) {
            throw Object.assign(new Error('simulated I/O failure'), { code: 'EIO' })
          }
          return fs.readFile(file, options as never)
        },
      },
    })

    await expect(failingStore.read()).rejects.toThrow('simulated I/O failure')
    expect(await fs.readFile(originalStore.paths.workspace, 'utf8')).toBe(latestText)
    expect(JSON.parse(latestText)).toEqual(workspace('new'))
  })

  test('a failed atomic backup replacement preserves both current data and the older backup', async () => {
    const directory = await temporaryDirectory()
    const originalStore = createWorkspaceStore({ directory })
    await originalStore.save(workspace('v1'))
    await originalStore.save(workspace('v2'))

    const failingStore = createWorkspaceStore({
      directory,
      fileSystem: {
        ...fs,
        async rename(oldPath: Parameters<typeof fs.rename>[0], newPath: Parameters<typeof fs.rename>[1]) {
          if (path.resolve(String(newPath)) === path.resolve(originalStore.paths.backup)) {
            throw new Error('simulated backup replacement failure')
          }
          return fs.rename(oldPath, newPath)
        },
      },
    })

    await expect(failingStore.save(workspace('v3'))).rejects.toThrow('simulated backup replacement failure')
    expect(JSON.parse(await fs.readFile(originalStore.paths.workspace, 'utf8'))).toEqual(workspace('v2'))
    expect(JSON.parse(await fs.readFile(originalStore.paths.backup, 'utf8'))).toEqual(workspace('v1'))
    expect((await fs.readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  test('fails explicitly when neither workspace nor backup is readable', async () => {
    const directory = await temporaryDirectory()
    const store = createWorkspaceStore({ directory })
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(store.paths.workspace, '{broken', 'utf8')
    await fs.writeFile(store.paths.backup, '{also broken', 'utf8')

    await expect(store.read()).rejects.toBeInstanceOf(WorkspaceReadError)
  })
})
