# 所向：洞察下钻、类别管理与本地启动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成已确认的洞察主题下钻、聚焦名言、类别标签管理、本地文件主存储与固定端口一键启动。

**Architecture:** 继续保留现有 React 领域层，类别定义进入 `WorkspaceSettings`，卡片仍记录类别名称；洞察层新增可追溯的主题结果查询。生产环境由只监听 `127.0.0.1:5174` 的 Node 本地服务同时提供静态网页和工作区接口，浏览器存储只用于首次迁移。

**Tech Stack:** React 19、TypeScript、Vitest、Testing Library、Node.js 22、原生文件与 HTTP API、PowerShell。

## Global Constraints

- 不改变近 30 天统计口径。
- 不增加投入时间记录或滴答后续同步。
- 不保存滴答身份密钥。
- 不引入在线名言接口；候选名言保存在本地并记录来源。
- 探索和创造类别严格分开；卡片继续按类别名称记录。
- 本地服务只监听 `127.0.0.1`，固定端口 `5174`。
- 数据文件位于 `%LOCALAPPDATA%\所向\workspace.json`，项目目录不保存个人运行数据。
- 保存必须校验结构、临时写入后替换，并保留最近一次可读备份。
- 当前目录不是 Git 仓库；以逐任务测试、改动复读和进度台账代替提交步骤。

---

### Task 1: 设置默认值与兼容迁移

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/defaults.ts`
- Modify: `src/domain/categories.ts`
- Modify: `src/data/storage.ts`
- Modify: `src/data/personal-seed.json`
- Test: `src/domain/defaults.test.ts`
- Test: `src/data/storage.test.ts`

**Interfaces:**
- Produces: `CategoryDefinition { name: string; color: string }`、`WorkspaceSettings.categories`。
- Produces: `migrateWorkspaceSettings(state)`，只把旧系统默认 `Attention Workbench` 改成 `收集箱`，补齐缺失类别定义，保留自定义清单名。

- [x] 写失败测试：新工作区清单为“收集箱”；旧默认被迁移；自定义值不变；旧 JSON 自动获得六个类别定义。
- [x] 运行 `npm.cmd run test:run -- src/domain/defaults.test.ts src/data/storage.test.ts`，确认因新字段和迁移缺失而失败。
- [x] 最小实现类型、默认类别定义和导入迁移，并同步个人种子清单名。
- [x] 重跑聚焦测试，确认通过。

### Task 2: 类别标签领域操作

**Files:**
- Modify: `src/domain/categories.ts`
- Modify: `src/domain/categories.test.ts`

**Interfaces:**
- Produces: `addCategory`、`renameCategory`、`recolorCategory`、`removeCategory`、`countCategoryUsage`。
- `renameCategory` 同步同板块卡片；`removeCategory` 接受同板块目标名称或 `null`（未分类）。

- [x] 写失败测试：新增颜色不同；重名被拒绝；重命名同步卡片；改色保留名称；删除迁移或未分类；跨板块目标被拒绝。
- [x] 运行 `npm.cmd run test:run -- src/domain/categories.test.ts`，确认 RED。
- [x] 用不可变更新实现最小领域函数；新颜色从本地调色板中选择与现有颜色距离最大的候选。
- [x] 重跑聚焦测试，确认 GREEN。

### Task 3: 设置页类别管理界面

**Files:**
- Create: `src/components/CategoryManager.tsx`
- Create: `src/components/CategoryManager.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/app.css`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: Task 2 的领域函数。
- Produces: 探索/创造两个管理区；新增、改名、改色、删除确认和迁移选择。

- [x] 写失败交互测试，验证两板块独立管理、重复名提示、受影响数量、删除前必须选择合法迁移。
- [x] 运行聚焦测试确认 RED。
- [x] 实现最小表单与确认浮窗；把看板筛选、卡片色带、Capture/详情类别选项改为读取工作区类别定义。
- [x] 运行 `npm.cmd run test:run -- src/components/CategoryManager.test.tsx src/App.test.tsx`，确认 GREEN。

### Task 4: 洞察布局、主题下钻与聚焦名言

**Files:**
- Modify: `src/domain/insights.ts`
- Modify: `src/domain/insights.test.ts`
- Create: `src/domain/focusQuotes.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- Produces: `itemsForCurrentTopic(state, topic)` 与 `itemsForRecentTopic(state, topic, now)`。
- Produces: 本地 `FOCUS_QUOTES`；每条含 `text`、`author`、`source`、`sourceUrl`。
- `InsightPage` 通过 `onOpenItem(item)` 返回顶层，由顶层切换探索/创造/归档并打开详情。

- [x] 写失败领域测试：当前主题排除归档；近 30 天按现有事件口径去重并包含近期归档。
- [x] 写失败界面测试：新四卡顺序；漏斗说明消失；榜单项、扇区和图例可打开同一浮窗；分栏、空态、卡片信息、Escape/遮罩/关闭按钮；三类卡片正确跳转。
- [x] 写失败测试：离开后重新进入洞察会重新抽取，停留期间不变化。
- [x] 实现查询、浮窗、布局和本地名言；“其他”聚合扇区不作为单一主题入口。
- [x] 运行 `npm.cmd run test:run -- src/domain/insights.test.ts src/App.test.tsx`，确认 GREEN。

### Task 5: 本地文件主存储

**Files:**
- Create: `server/workspace-store.mjs`
- Create: `server/workspace-store.test.ts`
- Create: `server/local-server.mjs`
- Create: `src/data/fileStorage.ts`
- Create: `src/data/fileStorage.test.ts`
- Modify: `src/App.tsx`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Server: `GET /api/health`、`GET /api/workspace`、`PUT /api/workspace`。
- Client: `loadPrimaryWorkspace()`、`savePrimaryWorkspace(state)`。

- [x] 写失败服务测试：结构拒绝、临时文件替换、备份、读回一致、失败不破坏正式文件。
- [x] 写失败客户端测试：文件存在直接读取；文件缺失时从旧 `localStorage` 写入并读回后采用；迁移失败保留旧数据并抛出明确错误。
- [x] 实现只监听回环地址的静态服务和原子存储；生产 App 启动时等待文件读取，保存失败显示常驻提示且不声称已保存。
- [x] 运行 `npm.cmd run test:run -- server/workspace-store.test.ts src/data/fileStorage.test.ts src/App.test.tsx`，确认 GREEN。

### Task 6: 固定端口一键启动与完整验收

**Files:**
- Create: `scripts/launch-xiang.ps1`
- Create: `scripts/install-shortcut.ps1`
- Create: `work/insight_drilldown_acceptance.cjs`
- Modify: `README.md`

**Interfaces:**
- 固定地址：`http://127.0.0.1:5174`。
- 启动脚本：健康检查通过则只打开浏览器；否则隐藏启动本地服务，等待健康检查后打开。

- [x] 为启动判断编写可无浏览器运行的参数化测试或自检模式，覆盖“已运行”和“未运行”。
- [x] 实现项目内启动脚本与桌面快捷方式安装脚本；不制作分发包，不复制 `personal-seed.json` 到任何新目录。
- [x] 运行全部测试、类型检查、构建。
- [x] 用本地服务在桌面 1440px 与手机 390px 完成真实浏览器验收：三种入口、三种跳转、类别管理、文件写入后清空浏览器再加载、控制台无错误。
- [x] 对照设计规格十项验收逐条复核并读回所有新增脚本与文档。
