// @vitest-environment node

import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { createDidaCli, resolveDidaCommand, spawnTarget } from './dida-cli.mjs'

describe('dida CLI adapter', () => {
  test('prefers the Node entry over dida.cmd on Windows', () => {
    const appData = 'C:\\Users\\demo\\AppData\\Roaming'
    const script = path.join(appData, 'npm', 'node_modules', '@suibiji', 'dida-cli', 'dist', 'index.js')
    const resolved = resolveDidaCommand(
      { APPDATA: appData },
      'win32',
      (candidate) => candidate === script,
    )
    expect(resolved).toBe(script)
    expect(spawnTarget(resolved).file).toBe(process.execPath)
    expect(spawnTarget(resolved).argv).toEqual([script])
  })

  test('maps a Windows .cmd shim to the same Node entry', () => {
    const cmd = 'C:\\Users\\demo\\AppData\\Roaming\\npm\\dida.cmd'
    const script = path.join(path.dirname(cmd), 'node_modules', '@suibiji', 'dida-cli', 'dist', 'index.js')
    const target = spawnTarget(cmd, (candidate) => candidate === script)
    expect(target.file).toBe(process.execPath)
    expect(target.argv).toEqual([script])
  })

  test('reports a missing binary without leaking command output', async () => {
    const cli = createDidaCli({
      run: async () => ({ code: 'ENOENT', stdout: '', stderr: 'not found' }),
    })
    await expect(cli.status()).resolves.toMatchObject({
      ok: false,
      installed: false,
      code: 'cli_missing',
    })
  })

  test('creates nested subtasks under the named list', async () => {
    const calls: string[][] = []
    let created = 0
    const cli = createDidaCli({
      run: async (args) => {
        calls.push(args)
        if (args[0] === 'auth') return { code: 0, stdout: '✓ 已登录\n  Token: secret-should-not-leak', stderr: '' }
        if (args[0] === 'project') {
          return {
            code: 0,
            stdout: JSON.stringify([{ id: 'proj-1', name: '收集箱' }, { id: 'proj-2', name: '其他' }]),
            stderr: '',
          }
        }
        if (args[0] === 'task' && args[1] === 'create') {
          created += 1
          return { code: 0, stdout: JSON.stringify({ id: `task-${created}` }), stderr: '' }
        }
        return { code: 0, stdout: JSON.stringify({ id: args[2] }), stderr: '' }
      },
    })

    const result = await cli.createTask({
      title: '做所向',
      content: '先能用',
      listName: '收集箱',
      steps: [
        { title: '明确最小成果', notes: '先写清', children: [] },
        { title: '制作', notes: '', children: [{ title: '写执行计划', notes: '' }] },
      ],
    })

    expect(result).toEqual({
      ok: true,
      taskId: 'task-1',
      projectId: 'proj-1',
      projectName: '收集箱',
    })
    expect(JSON.stringify(calls)).not.toContain('secret-should-not-leak')
    const creates = calls.filter((args) => args[0] === 'task' && args[1] === 'create')
    expect(creates).toHaveLength(4)
    expect(creates.map((args) => args[args.indexOf('--title') + 1])).toEqual([
      '做所向',
      '明确最小成果',
      '制作',
      '写执行计划',
    ])
    const links = calls.filter((args) => args[0] === 'task' && args[1] === 'update')
    expect(links).toHaveLength(3)
    expect(links[0]).toEqual(expect.arrayContaining(['--parent-id', 'task-1']))
    expect(links[1]).toEqual(expect.arrayContaining(['--parent-id', 'task-1']))
    expect(links[2]).toEqual(expect.arrayContaining(['--parent-id', 'task-3']))
    expect(calls.some((args) => args.includes('--items'))).toBe(false)
  })

  test('fails clearly when the list name is missing', async () => {
    const cli = createDidaCli({
      run: async (args) => {
        if (args[0] === 'auth') return { code: 0, stdout: '已登录', stderr: '' }
        return { code: 0, stdout: JSON.stringify([{ id: 'proj-1', name: '工作' }]), stderr: '' }
      },
    })
    await expect(cli.createTask({ title: '做所向', listName: '不存在' })).resolves.toMatchObject({
      ok: false,
      code: 'list_not_found',
    })
  })

  test('writes the system inbox when 收集箱 is absent from the project list', async () => {
    const calls: string[][] = []
    const cli = createDidaCli({
      run: async (args) => {
        calls.push(args)
        if (args[0] === 'auth') return { code: 0, stdout: '已登录', stderr: '' }
        if (args[0] === 'project') return { code: 0, stdout: JSON.stringify([{ id: 'proj-2', name: '工作' }]), stderr: '' }
        return { code: 0, stdout: JSON.stringify({ id: 'task-inbox', projectId: 'inbox1010' }), stderr: '' }
      },
    })

    await expect(cli.createTask({ title: '做所向', listName: '收集箱' })).resolves.toMatchObject({
      ok: true,
      taskId: 'task-inbox',
      projectId: 'inbox',
      projectName: '收集箱',
    })
    const create = calls.find((args) => args[0] === 'task' && args[1] === 'create')
    expect(create).toContain('--project')
    expect(create?.[create.indexOf('--project') + 1]).toBe('inbox')
  })

  test('writes the system inbox when the list name is empty', async () => {
    const calls: string[][] = []
    const cli = createDidaCli({
      run: async (args) => {
        calls.push(args)
        if (args[0] === 'auth') return { code: 0, stdout: '已登录', stderr: '' }
        if (args[0] === 'project') return { code: 0, stdout: JSON.stringify([{ id: 'proj-2', name: '工作' }]), stderr: '' }
        return { code: 0, stdout: JSON.stringify({ id: 'task-empty' }), stderr: '' }
      },
    })

    await expect(cli.createTask({ title: '做所向', listName: '   ' })).resolves.toMatchObject({
      ok: true,
      projectId: 'inbox',
      projectName: '收集箱',
    })
    const create = calls.find((args) => args[0] === 'task' && args[1] === 'create')
    expect(create?.[create.indexOf('--project') + 1]).toBe('inbox')
  })
})
