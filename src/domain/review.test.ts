import { describe, expect, it } from 'vitest'
import { createInitialWorkspace } from './defaults'
import { captureItem, moveItem } from './workspace'
import { advanceWeeklyReview, completeWeeklyReview, discardWeeklyReview, normalizeReviewStep, patchReviewComboDraft, REVIEW_STEP_COUNT, startWeeklyReview } from './review'

const reviewEnv = {
  now: () => '2026-08-21T08:00:00.000Z',
  id: () => 'review-1',
}

describe('weekly review', () => {
  it('creates a resumable six-step review with before and after snapshots', () => {
    const captured = captureItem(
      createInitialWorkspace(),
      { title: '当前关注', board: 'explore' },
      { now: reviewEnv.now, id: () => crypto.randomUUID() },
    )
    const focused = moveItem(captured.state, captured.itemId, 'focus').state
    const started = startWeeklyReview(focused, reviewEnv)
    const advanced = advanceWeeklyReview(started.state, started.reviewId, 4)
    const completed = completeWeeklyReview(advanced.state, started.reviewId, reviewEnv)
    const review = completed.state.reviews.find((entry) => entry.id === started.reviewId)

    expect(started.state.reviews[0]).toMatchObject({
      step: 1,
      attentionDirection: '',
      adjustments: [],
    })
    expect(advanced.state.reviews[0].step).toBe(4)
    expect(review).toMatchObject({
      status: 'completed',
      step: REVIEW_STEP_COUNT,
      startSnapshot: { focus: 1, engage: 0 },
      endSnapshot: { focus: 1, engage: 0 },
    })
  })

  it('normalizes legacy step numbers when resuming an in-progress review', () => {
    const started = startWeeklyReview(createInitialWorkspace(), reviewEnv)
    const legacy = {
      ...started.state,
      reviews: [{ ...started.state.reviews[0], step: 7 }],
    }
    const resumed = startWeeklyReview(legacy, reviewEnv)

    expect(resumed.reviewId).toBe(started.reviewId)
    expect(resumed.state.reviews[0].step).toBe(REVIEW_STEP_COUNT)
    expect(normalizeReviewStep(7)).toBe(REVIEW_STEP_COUNT)
  })

  it('stores combo drafts on the in-progress review record', () => {
    const started = startWeeklyReview(createInitialWorkspace(), reviewEnv)
    const patched = patchReviewComboDraft(started.state, started.reviewId, 'radar_focus', {
      kind: 'radar_focus',
      promotions: [{ itemId: 'item-1', evidence: '', relation: '', risk: '', selected: true }],
      displacements: [],
      summary: '草稿',
      analyzedCount: 1,
      totalCount: 1,
      extraIds: [],
    })
    expect(patched.state.reviews[0].comboDrafts?.radar_focus?.summary).toBe('草稿')
  })

  it('discards an in-progress review so the next start is fresh', () => {
    const started = startWeeklyReview(createInitialWorkspace(), reviewEnv)
    const advanced = advanceWeeklyReview(started.state, started.reviewId, 3)
    const discarded = discardWeeklyReview(advanced.state, started.reviewId)
    const restarted = startWeeklyReview(discarded.state, {
      now: () => '2026-08-24T08:00:00.000Z',
      id: () => 'review-2',
    })

    expect(discarded.state.reviews).toEqual([])
    expect(restarted.reviewId).toBe('review-2')
    expect(restarted.state.reviews[0]).toMatchObject({
      id: 'review-2',
      status: 'in_progress',
      step: 1,
      attentionDirection: '',
    })
  })
})
