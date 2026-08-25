import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export class WorkspaceValidationError extends Error {
  constructor(message = 'Unsupported workspace structure') {
    super(message)
    this.name = 'WorkspaceValidationError'
  }
}

export class WorkspaceReadError extends Error {
  constructor(message = 'Workspace data is unreadable') {
    super(message)
    this.name = 'WorkspaceReadError'
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function purgeItemFromWorkspace(workspace, itemId) {
  const { [itemId]: removed, ...items } = workspace.items
  void removed
  const referencesItem = (event) =>
    event.itemId === itemId || ('childItemId' in event && event.childItemId === itemId)

  return {
    ...workspace,
    items,
    events: workspace.events.filter((event) => !referencesItem(event)),
    relations: workspace.relations.filter((relation) =>
      relation.parentItemId !== itemId && relation.childItemId !== itemId),
    exportReceipts: workspace.exportReceipts.filter((receipt) => receipt.itemId !== itemId),
    reviews: workspace.reviews.map((review) => ({
      ...review,
      adjustments: Array.isArray(review.adjustments)
        ? review.adjustments.map((adjustment) => ({
          ...adjustment,
          promotions: Array.isArray(adjustment.promotions)
            ? adjustment.promotions.filter((id) => id !== itemId)
            : adjustment.promotions,
          displacements: Array.isArray(adjustment.displacements)
            ? adjustment.displacements.filter((entry) => entry?.itemId !== itemId)
            : adjustment.displacements,
        }))
        : review.adjustments,
      comboDrafts: isObject(review.comboDrafts)
        ? Object.fromEntries(
          Object.entries(review.comboDrafts).map(([kind, draft]) => {
            if (!isObject(draft)) return [kind, draft]
            return [kind, {
              ...draft,
              promotions: Array.isArray(draft.promotions)
                ? draft.promotions.filter((entry) => entry?.itemId !== itemId)
                : draft.promotions,
              displacements: Array.isArray(draft.displacements)
                ? draft.displacements.filter((entry) => entry?.itemId !== itemId)
                : draft.displacements,
              extraIds: Array.isArray(draft.extraIds)
                ? draft.extraIds.filter((id) => id !== itemId)
                : draft.extraIds,
            }]
          }),
        )
        : review.comboDrafts,
    })),
  }
}

export function validateWorkspace(value) {
  if (
    !isObject(value) ||
    value.schemaVersion !== 1 ||
    !isObject(value.items) ||
    !Array.isArray(value.events) ||
    !Array.isArray(value.relations) ||
    !Array.isArray(value.reviews) ||
    !Array.isArray(value.exportReceipts) ||
    !isObject(value.settings)
  ) {
    throw new WorkspaceValidationError()
  }

  return value
}

function defaultDirectory() {
  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local')
  return path.join(localAppData, '所向')
}

function isMissing(error) {
  return error && typeof error === 'object' && error.code === 'ENOENT'
}

export function createWorkspaceStore(options = {}) {
  const directory = options.directory ?? defaultDirectory()
  const fileSystem = options.fileSystem ?? fs
  const paths = {
    directory,
    workspace: path.join(directory, 'workspace.json'),
    backup: path.join(directory, 'workspace.backup.json'),
  }

  async function readValidated(file) {
    const text = await fileSystem.readFile(file, 'utf8')
    try {
      return validateWorkspace(JSON.parse(String(text)))
    } catch (error) {
      if (error instanceof WorkspaceValidationError) {
        throw error
      }
      throw new WorkspaceValidationError()
    }
  }

  async function removeTemporary(file) {
    try {
      await fileSystem.unlink(file)
    } catch (error) {
      if (!isMissing(error)) {
        // Cleanup is best effort and must not hide the original operation result.
      }
    }
  }

  function temporaryPath(label = 'workspace') {
    return path.join(
      directory,
      `${label}.${process.pid}-${Date.now()}-${randomUUID()}.tmp`,
    )
  }

  async function writeTemporary(temporary, workspace) {
    await fileSystem.mkdir(directory, { recursive: true })
    const text = `${JSON.stringify(workspace, null, 2)}\n`
    await fileSystem.writeFile(temporary, text, { encoding: 'utf8', flag: 'wx' })
  }

  async function exists() {
    try {
      await fileSystem.access(paths.workspace)
      return true
    } catch (error) {
      if (isMissing(error)) return false
      throw error
    }
  }

  async function replaceBackupFromCurrent() {
    let temporary = temporaryPath('workspace.backup')
    try {
      await fileSystem.copyFile(paths.workspace, temporary)
      await readValidated(temporary)
      await fileSystem.rename(temporary, paths.backup)
      temporary = undefined
    } finally {
      if (temporary) await removeTemporary(temporary)
    }
  }

  async function scrubRemovedItemsFromBackup(savedWorkspace) {
    let backup
    try {
      backup = await readValidated(paths.backup)
    } catch (error) {
      if (isMissing(error) || error instanceof WorkspaceValidationError) return
      throw error
    }

    const removedIds = Object.keys(backup.items).filter((itemId) => !(itemId in savedWorkspace.items))
    if (removedIds.length === 0) return

    let next = backup
    for (const itemId of removedIds) {
      next = purgeItemFromWorkspace(next, itemId)
    }

    let temporary = temporaryPath('workspace.backup')
    try {
      await writeTemporary(temporary, next)
      await readValidated(temporary)
      await fileSystem.rename(temporary, paths.backup)
      temporary = undefined
    } finally {
      if (temporary) await removeTemporary(temporary)
    }
  }

  async function save(workspace) {
    validateWorkspace(workspace)
    JSON.stringify(workspace)

    let temporary = temporaryPath()
    try {
      await writeTemporary(temporary, workspace)
      await readValidated(temporary)

      let currentIsReadable = false
      try {
        await readValidated(paths.workspace)
        currentIsReadable = true
      } catch (error) {
        if (isMissing(error) || error instanceof WorkspaceValidationError) {
          currentIsReadable = false
        } else {
          throw error
        }
      }

      if (currentIsReadable) {
        await replaceBackupFromCurrent()
      }

      await fileSystem.rename(temporary, paths.workspace)
      temporary = undefined
      await scrubRemovedItemsFromBackup(workspace)
      return await readValidated(paths.workspace)
    } finally {
      if (temporary) await removeTemporary(temporary)
    }
  }

  async function read() {
    try {
      return { status: 'ok', workspace: await readValidated(paths.workspace) }
    } catch (workspaceError) {
      if (isMissing(workspaceError)) {
        return { status: 'missing', workspace: null }
      }
      if (!(workspaceError instanceof WorkspaceValidationError)) {
        throw workspaceError
      }

      let backup
      try {
        backup = await readValidated(paths.backup)
      } catch {
        throw new WorkspaceReadError()
      }

      let temporary = temporaryPath()
      try {
        await writeTemporary(temporary, backup)
        await readValidated(temporary)
        await fileSystem.rename(temporary, paths.workspace)
        temporary = undefined
      } finally {
        if (temporary) await removeTemporary(temporary)
      }

      return { status: 'recovered', workspace: backup }
    }
  }

  return { paths, exists, read, save }
}
