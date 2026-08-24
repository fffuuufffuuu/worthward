# Personal Attention Workbench Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished, local-first single-user web application that implements the approved Phase 1 attention lifecycle, WIP governance, weekly review, baseline insights, Markdown notes, JSON backup, and one-time TickTick handoff.

**Architecture:** A React + TypeScript single-page application uses a pure reducer/domain layer as the only place that changes cards, events, WIP, reviews, and export receipts. A storage adapter persists one versioned workspace snapshot in browser local storage. TickTick is an outbound-only adapter: the default implementation opens the official URL Scheme and records an honest handoff receipt; the domain never reads or updates external tasks.

**Tech Stack:** Node.js 22+, React 19, TypeScript, Vite, Vitest, Testing Library, dnd-kit, react-markdown, remark-gfm, rehype-sanitize, CSS variables and SVG/CSS charts.

## Global Constraints

- Exploration and Creation share one object model and one lifecycle.
- User-facing stage changes use drag-and-drop or “移动到”; do not expose Select, Commit, Promote, Demote, Reconsider, Reengage, or Reactivate.
- Focus WIP defaults to 10; Engage WIP defaults to 4 and both are global across boards.
- Leaving Engage never asks how to handle TickTick and never reads, updates, completes, or deletes TickTick tasks.
- The optional `description` field stores Markdown source, renders through sanitization, and participates in plain-text search.
- Data is local-first and exportable as lossless versioned JSON.
- No AI features, accounts, collaboration, calendar scheduling, or Obsidian vault automation in this phase.

---

### Task 1: Toolchain, app shell, and domain contracts

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `index.html`
- Create: `src/main.tsx`, `src/App.tsx`, `src/domain/types.ts`, `src/domain/defaults.ts`
- Test: `src/domain/defaults.test.ts`

**Interfaces:**
- Produces: `Stage`, `Board`, `AttentionItem`, `StageChangeEvent`, `WorkspaceState`, `createInitialWorkspace()`.

- [ ] Write `defaults.test.ts` asserting Focus=10, Engage=4, both boards exist, and the initial workspace contains no sample data.
- [ ] Run `npm test -- src/domain/defaults.test.ts` and confirm the module is missing.
- [ ] Add the minimal types/default factory and app entry point.
- [ ] Run the focused test and confirm it passes.

### Task 2: Pure attention lifecycle and WIP rules

**Files:**
- Create: `src/domain/workspace.ts`, `src/domain/workspace.test.ts`
- Modify: `src/domain/types.ts`

**Interfaces:**
- Produces: `captureItem`, `moveItem`, `archiveItem`, `restoreItem`, `spawnItem`, `updateItem`, `logProgress`, `setWipLimit`.
- `moveItem(state, itemId, target, options)` returns `{ state, result }`; failures never mutate input state.

- [ ] Write failing tests for capture timestamps, direct non-adjacent moves, one `stage_changed` event, target WIP rejection, atomic replacement, Drop/Archive modes, restore, spawn relations, Last Touched, and Engage re-entry.
- [ ] Run the focused test and confirm expected assertion failures.
- [ ] Implement immutable reducer helpers with injected clock and ID factory.
- [ ] Run the focused test, then all domain tests.

### Task 3: Persistence, backup, migration, and search

**Files:**
- Create: `src/data/storage.ts`, `src/data/storage.test.ts`, `src/domain/search.ts`, `src/domain/search.test.ts`

**Interfaces:**
- Produces: `loadWorkspace`, `saveWorkspace`, `exportWorkspaceJson`, `importWorkspaceJson`, `searchItems`.
- Storage key: `attention-workbench:v1`; schema version: `1`.

- [ ] Write failing tests for exact Markdown round-trip, empty/corrupt storage fallback, version validation, JSON export/import equality, and Markdown plain-text search.
- [ ] Run focused tests and confirm failures are caused by missing modules.
- [ ] Implement local storage adapter and deterministic JSON import/export.
- [ ] Implement Markdown-to-search-text normalization without executing markup.
- [ ] Run all data/domain tests.

### Task 4: Board, capture, detail drawer, and direct drag interaction

**Files:**
- Create: `src/app/WorkspaceProvider.tsx`, `src/app/useWorkspace.ts`
- Create: `src/components/AppShell.tsx`, `BoardView.tsx`, `StageColumn.tsx`, `AttentionCard.tsx`, `CaptureDialog.tsx`, `DetailDrawer.tsx`, `MoveDialog.tsx`, `WipDialog.tsx`, `ArchiveView.tsx`
- Create: `src/components/BoardView.test.tsx`, `src/components/DetailDrawer.test.tsx`

**Interfaces:**
- Consumes domain functions only through `WorkspaceProvider` actions.
- Produces keyboard-accessible controls for Capture, move, Stop, Archive, Restore, Spawn, and Markdown edit/preview.

- [ ] Write failing interaction tests for capture, board switching, move menu, WIP rejection, stop/archive distinction, restore, spawn, Markdown save, and sanitized preview.
- [ ] Run tests and confirm the UI is missing.
- [ ] Build components with dnd-kit for pointer/keyboard drag and an always-available “移动到” fallback.
- [ ] Add optimistic target placeholders while keeping the item in its source stage until the domain accepts the move.
- [ ] Run component and domain tests.

### Task 5: Weekly review, insights, settings, and activity logging

**Files:**
- Create: `src/components/WeeklyReview.tsx`, `InsightsView.tsx`, `SettingsView.tsx`, `ProgressDialog.tsx`
- Create: `src/domain/insights.ts`, `src/domain/insights.test.ts`, `src/domain/review.ts`, `src/domain/review.test.ts`

**Interfaces:**
- Produces: `buildInsights(state, range)`, `startWeeklyReview`, `advanceWeeklyReview`, `completeWeeklyReview`.

- [ ] Write failing tests for stage counts, global WIP, board distribution, topic counts, stalled thresholds, funnel bypasses, Drop cohort rate, and resumable review snapshots.
- [ ] Run tests and confirm expected failures.
- [ ] Implement metric selectors and review state transitions.
- [ ] Build the seven-step review, compact SVG funnel, topic bars, aging list, and WIP settings.
- [ ] Run focused tests and the complete suite.

### Task 6: One-time TickTick handoff

**Files:**
- Create: `src/integrations/ticktick.ts`, `src/integrations/ticktick.test.ts`, `src/components/TickTickDialog.tsx`
- Modify: `src/domain/types.ts`, `src/app/WorkspaceProvider.tsx`, `src/components/SettingsView.tsx`

**Interfaces:**
- Produces: `buildTickTickUrl(request)`, `requestTickTickExport`, `confirmTickTickHandoff`.
- Default receipt status is `handed_off_unverified`; it must never be shown as verified creation because browser URL Scheme callbacks cannot be relied on in a normal web page.

- [ ] Write failing tests for encoded title/content/list/check-items, stable export IDs, no second automatic handoff on Engage re-entry, and no TickTick call on leaving Engage.
- [ ] Run tests and confirm failures.
- [ ] Implement the official `ticktick://x-callback-url/v1/add_task` builder and handoff receipt.
- [ ] Open the handoff only after the Phase 1 Engage confirmation; allow “open existing / create another / skip” on re-entry.
- [ ] Run focused and full tests.

### Task 7: Visual system, responsive behavior, and accessibility

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/app.css`
- Modify: all page components for semantic labels and focus management.

**Interfaces:**
- Visual direction: “signal desk” — slate-blue ink, cool mineral canvas, citrus focus accent, vermilion Engage accent; IBM Plex Sans/Serif system-safe fallbacks; a slim animated attention rail is the single signature element.

- [ ] Add a component test for landmark labels, dialog names, keyboard move controls, and visible focus states.
- [ ] Run it and confirm missing accessibility behavior.
- [ ] Implement responsive desktop four-column board and mobile stage tabs, reduced-motion handling, high-contrast focus rings, empty/error guidance, and no decorative gradients.
- [ ] Run tests, then inspect desktop and mobile screenshots.

### Task 8: Production verification and handoff

**Files:**
- Create: `README.md`

- [ ] Document install, run, backup/restore, browser storage limits, and the honest TickTick handoff boundary.
- [ ] Run `npm test -- --run` and require zero failures.
- [ ] Run `npm run build` and require exit code 0.
- [ ] Start the preview server and exercise Capture → Focus → Engage → Outcome & Review → Archive, WIP rejection, Markdown preview, JSON round-trip, weekly review, and TickTick handoff.
- [ ] Re-read README and user-facing copy; confirm prohibited action terms do not appear in UI strings.

