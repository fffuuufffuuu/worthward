# 所向界面与主题治理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成品牌、类别色卡片、看板筛选、探索主题重建、单页详情、漏斗方向和停滞分栏的整套更新。

**Architecture:** 在领域层新增稳定的类别色与主题迁移函数，UI 只消费这些结果；看板筛选使用页面内状态，不写入卡片数据；详情把元信息和说明拆为两个独立的局部编辑状态。现有 WorkspaceState 数据结构保持不变，主题重建通过独立的一次性迁移标记完成。

**Tech Stack:** React 19、TypeScript、Vitest、Testing Library、CSS、localStorage。

## Global Constraints

- 不记录投入时间。
- 不恢复 Preview/Edit 标签页。
- 每张探索卡片最多两个 AI 重建主题。
- 滴答仍只在进入 Engage 时按用户选择发起创建，不做后续同步。
- 当前目录不是 Git 仓库，因此本计划不执行提交步骤。

---

### Task 1: 类别视觉与主题迁移领域规则

**Files:**
- Create: `src/domain/topics.ts`
- Modify: `src/domain/categories.ts`
- Modify: `src/data/storage.ts`
- Modify: `src/data/personal-seed.json`
- Test: `src/domain/categories.test.ts`
- Test: `src/data/personal-seed.test.ts`
- Test: `src/data/storage.test.ts`

**Interfaces:**
- Produces: `categoryColorFor(board, category)` 返回类别色标识；`CONTROLLED_EXPLORE_TOPICS` 返回受控主题；`applyExploreTopicMigration(current, seed)` 只更新内置探索卡片主题。

- [ ] **Step 1: 写失败测试**

验证六个类别各有稳定且不同的颜色；63 张探索卡片均有 1–2 个受控主题；一次性迁移更新内置探索主题但保留说明与非内置卡片。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm.cmd run test:run -- src/domain/categories.test.ts src/data/personal-seed.test.ts src/data/storage.test.ts`
Expected: FAIL，因为颜色与迁移接口尚不存在，旧主题不满足受控主题库。

- [ ] **Step 3: 最小实现**

新增类别色映射与受控主题常量；根据 AI 判断更新 63 张探索卡片；在 `loadPersonalWorkspace` 中应用一次性迁移标记，只替换对应 ID 的 topics。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm.cmd run test:run -- src/domain/categories.test.ts src/data/personal-seed.test.ts src/data/storage.test.ts`
Expected: 相关测试全部通过。

### Task 2: 看板品牌、标题、类别色和筛选

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles/app.css`
- Modify: `src/styles/tokens.css`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: `categoryColorFor`、`categoryOptionsFor`。
- Produces: `BoardFilters`，使用类别集合与主题集合过滤当前板块卡片。

- [ ] **Step 1: 写失败测试**

验证品牌与两个标题；卡片暴露类别色；类别与主题筛选支持多选、跨组交集和清除。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm.cmd run test:run -- src/App.test.tsx`
Expected: FAIL，因为新文案与筛选控件不存在。

- [ ] **Step 3: 最小实现**

替换品牌文案；新增看板筛选状态与控件；向卡片传入类别色 CSS 变量；把拖拽区改为 26px 类别色块。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm.cmd run test:run -- src/App.test.tsx`
Expected: 新增看板行为测试通过。

### Task 3: 单页局部编辑详情

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles/app.css`
- Test: `src/App.test.tsx`
- Test: `src/App.workflow.test.tsx`

**Interfaces:**
- Produces: 元信息编辑状态与说明编辑状态互相独立；两者都沿用现有 `onSave`。

- [ ] **Step 1: 写失败测试**

验证打开详情时没有标签页；Markdown 默认渲染；点击说明进入编辑；取消恢复原说明；编辑信息只展开元信息表单。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm.cmd run test:run -- src/App.test.tsx src/App.workflow.test.tsx`
Expected: FAIL，因为旧详情仍使用 Preview/Edit 标签页。

- [ ] **Step 3: 最小实现**

移除标签页；添加“编辑信息”与可点击说明区；分别提供保存、取消，保存后回到阅读状态。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm.cmd run test:run -- src/App.test.tsx src/App.workflow.test.tsx`
Expected: 详情与阶段流转测试通过。

### Task 4: 洞察页漏斗和停滞项目

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles/app.css`
- Test: `src/App.test.tsx`
- Test: `src/domain/insights.test.ts`

**Interfaces:**
- Consumes: `buildInsights().stalled` 与 `workspace.items`。
- Produces: 上宽下窄的漏斗样式；探索/创造双栏停滞列表。

- [ ] **Step 1: 写失败测试**

验证停滞区存在探索、创造两个分组，每项展示类别、主题和天数；漏斗层具有正确方向类名。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm.cmd run test:run -- src/App.test.tsx src/domain/insights.test.ts`
Expected: FAIL，因为旧停滞列表未分组且漏斗裁切方向相反。

- [ ] **Step 3: 最小实现**

按 board 分组渲染停滞卡片；添加类别与主题；把漏斗 clip-path 改为上宽下窄。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm.cmd run test:run -- src/App.test.tsx src/domain/insights.test.ts`
Expected: 洞察相关测试通过。

### Task 5: 全量与真实页面验收

**Files:**
- Modify only if verification exposes a scoped defect.

- [ ] **Step 1: 运行全部测试与构建**

Run: `npm.cmd run test:run`
Expected: 0 failures。

Run: `npm.cmd run build`
Expected: exit code 0。

- [ ] **Step 2: 浏览器检查**

使用本地服务器与 Playwright 检查桌面 1440px 和手机 390px：看板筛选、类别色拖拽区、单页编辑、漏斗方向、停滞分栏均可见且可操作；浏览器控制台无错误。

- [ ] **Step 3: 对照需求复核**

逐项对照设计文档，确认没有恢复投入时间或滴答后续同步，也没有覆盖非内置卡片。

