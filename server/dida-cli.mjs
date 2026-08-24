import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const AUTH_TIMEOUT_MS = 8000
const CREATE_TIMEOUT_MS = 20000

function npmDidaScript(npmDir) {
  return path.join(npmDir, 'node_modules', '@suibiji', 'dida-cli', 'dist', 'index.js')
}

export function resolveDidaCommand(env = process.env, platform = process.platform, exists = existsSync) {
  if (env.DIDA_CLI) return env.DIDA_CLI
  if (platform === 'win32') {
    const npmDir = env.APPDATA ? path.join(env.APPDATA, 'npm') : ''
    if (npmDir) {
      const script = npmDidaScript(npmDir)
      if (exists(script)) return script
      const cmd = path.join(npmDir, 'dida.cmd')
      if (exists(cmd)) return cmd
      return cmd
    }
    return 'dida.cmd'
  }
  return 'dida'
}

export function spawnTarget(command, exists = existsSync) {
  let entry = command
  if (/\.cmd$/i.test(command)) {
    const mapped = npmDidaScript(path.dirname(command))
    if (exists(mapped)) entry = mapped
  }
  if (/\.[cm]?js$/i.test(entry)) {
    return { file: process.execPath, argv: [entry] }
  }
  return { file: command, argv: [] }
}

function extractJson(text) {
  const start = String(text ?? '').search(/[\[{]/)
  if (start < 0) return null
  try {
    return JSON.parse(text.slice(start))
  } catch {
    const lines = String(text).trim().split(/\n/)
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        return JSON.parse(lines[index])
      } catch {
        // keep scanning from the end
      }
    }
    return null
  }
}

export function runDida(args, options = {}) {
  const command = options.command ?? resolveDidaCommand()
  const timeoutMs = options.timeoutMs ?? AUTH_TIMEOUT_MS
  const target = spawnTarget(command)
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(target.file, [...target.argv, ...args], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      })
    } catch (error) {
      resolve({
        code: error?.code === 'ENOENT' ? 'ENOENT' : 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
      })
      return
    }

    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      resolve({ code: 'TIMEOUT', stdout, stderr: stderr || 'dida CLI 超时' })
    }, timeoutMs)

    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({
        code: error?.code === 'ENOENT' ? 'ENOENT' : 1,
        stdout,
        stderr: error.message,
      })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

function notInstalledResult() {
  return {
    ok: false,
    installed: false,
    loggedIn: false,
    code: 'cli_missing',
    error: '未找到 dida 命令。请先安装并登录 @suibiji/dida-cli。',
  }
}

export function createDidaCli(options = {}) {
  const run = options.run ?? runDida

  async function status() {
    const result = await run(['auth', 'status'], { timeoutMs: AUTH_TIMEOUT_MS })
    if (result.code === 'ENOENT') return notInstalledResult()
    if (result.code === 'TIMEOUT') {
      return { ok: false, installed: true, loggedIn: false, code: 'timeout', error: 'dida CLI 响应超时。' }
    }
    const output = `${result.stdout}\n${result.stderr}`
    const loggedIn = /已登录/.test(output)
    if (!loggedIn) {
      return {
        ok: false,
        installed: true,
        loggedIn: false,
        code: 'not_logged_in',
        error: 'dida CLI 尚未登录。请在终端运行 dida auth login。',
      }
    }
    return { ok: true, installed: true, loggedIn: true }
  }

  async function listProjects() {
    const result = await run(['project', 'list', '--json'], { timeoutMs: AUTH_TIMEOUT_MS })
    if (result.code === 'ENOENT') return { ok: false, ...notInstalledResult(), projects: [] }
    const parsed = extractJson(result.stdout)
    const projects = Array.isArray(parsed) ? parsed : []
    return { ok: result.code === 0, projects }
  }

  function findProject(projects, listName) {
    const name = String(listName ?? '').trim()
    if (!name) return null
    return projects.find((project) => String(project?.name ?? '').trim() === name && project?.closed !== true)
      ?? projects.find((project) => String(project?.name ?? '').trim() === name)
      ?? null
  }

  function isInboxAlias(listName) {
    const name = String(listName ?? '').trim()
    return name === '' || /^收集箱$/u.test(name) || /^inbox$/iu.test(name)
  }

  async function test(listName) {
    const auth = await status()
    if (!auth.ok) return auth
    const listed = await listProjects()
    const project = listed.ok ? findProject(listed.projects, listName) : null
    if (project) {
      return {
        ok: true,
        installed: true,
        loggedIn: true,
        projectId: String(project.id ?? ''),
        projectName: String(project.name ?? ''),
      }
    }
    if (isInboxAlias(listName)) {
      return {
        ok: true,
        installed: true,
        loggedIn: true,
        projectId: 'inbox',
        projectName: String(listName ?? '').trim() || '收集箱',
      }
    }
    if (!listed.ok) {
      return {
        ok: false,
        installed: true,
        loggedIn: true,
        code: 'list_failed',
        error: '已登录，但无法读取滴答清单。',
      }
    }
    return {
      ok: false,
      installed: true,
      loggedIn: true,
      code: 'list_not_found',
      error: `找不到清单「${String(listName ?? '').trim() || '未命名'}」。`,
    }
  }

  function taskIdOf(payload) {
    return payload && typeof payload.id === 'string' ? payload.id : ''
  }

  function normalizeTree(raw) {
    if (!Array.isArray(raw)) return []
    return raw.map((step) => ({
      title: String(step?.title ?? '').trim(),
      notes: String(step?.notes ?? '').trim(),
      children: Array.isArray(step?.children)
        ? step.children.map((child) => ({
          title: String(child?.title ?? '').trim(),
          notes: String(child?.notes ?? '').trim(),
        })).filter((child) => child.title)
        : [],
    })).filter((step) => step.title)
  }

  async function createLeaf(projectId, title, content) {
    const args = ['task', 'create', '--title', title, '--project', projectId, '--json']
    if (content) args.push('--content', content)
    const result = await run(args, { timeoutMs: CREATE_TIMEOUT_MS })
    if (result.code === 'ENOENT') return notInstalledResult()
    if (result.code !== 0) {
      return { ok: false, code: 'create_failed', error: 'dida CLI 创建任务失败。' }
    }
    const taskId = taskIdOf(extractJson(result.stdout))
    if (!taskId) return { ok: false, code: 'create_failed', error: 'dida CLI 创建任务失败。' }
    return { ok: true, taskId }
  }

  async function attachParent(projectId, taskId, parentId) {
    const result = await run([
      'task', 'update', taskId,
      '--id', taskId,
      '--project', projectId,
      '--parent-id', parentId,
      '--json',
    ], { timeoutMs: CREATE_TIMEOUT_MS })
    if (result.code === 'ENOENT') return notInstalledResult()
    if (result.code !== 0) {
      return { ok: false, code: 'link_failed', error: 'dida CLI 已创建任务，但未能挂到父任务下。' }
    }
    return { ok: true }
  }

  return {
    status,
    test,
    async createTask(request) {
      const listName = String(request?.listName ?? '').trim()
      const title = String(request?.title ?? '').trim()
      if (!title) return { ok: false, code: 'invalid', error: '缺少任务标题。' }
      const probed = await test(listName)
      if (!probed.ok) return probed
      const content = String(request?.content ?? '').trim()
      const parent = await createLeaf(probed.projectId, title, content)
      if (!parent.ok) return parent
      const tree = normalizeTree(request?.steps)
      for (const step of tree) {
        const child = await createLeaf(probed.projectId, step.title, step.notes)
        if (!child.ok) {
          return {
            ok: false,
            code: 'partial',
            taskId: parent.taskId,
            error: '主任务已创建，但部分子任务未能写入。',
          }
        }
        const linked = await attachParent(probed.projectId, child.taskId, parent.taskId)
        if (!linked.ok) {
          return {
            ...linked,
            taskId: parent.taskId,
          }
        }
        for (const nested of step.children) {
          const grand = await createLeaf(probed.projectId, nested.title, nested.notes)
          if (!grand.ok) {
            return {
              ok: false,
              code: 'partial',
              taskId: parent.taskId,
              error: '主任务已创建，但部分子任务未能写入。',
            }
          }
          const nestedLink = await attachParent(probed.projectId, grand.taskId, child.taskId)
          if (!nestedLink.ok) {
            return {
              ...nestedLink,
              taskId: parent.taskId,
            }
          }
        }
      }
      return {
        ok: true,
        taskId: parent.taskId,
        projectId: probed.projectId,
        projectName: probed.projectName,
      }
    },
  }
}
