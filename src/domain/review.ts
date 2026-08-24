import type { DomainEnv, ReviewAdjustment, ReviewComboDraft, WeeklyReviewRecord, WorkspaceState } from './types'
import type { ReviewPlanKind } from './reviewPlan'
import { countByStage } from './workspace'

export const REVIEW_STEP_COUNT = 6

export function normalizeReviewStep(step: number): number {
  const raw = Math.max(1, Math.floor(step))
  return Math.min(REVIEW_STEP_COUNT, raw)
}

const browserEnv: DomainEnv = {
  now: () => new Date().toISOString(),
  id: () => crypto.randomUUID(),
}

function snapshot(state: WorkspaceState) {
  return {
    focus: countByStage(state, 'focus'),
    engage: countByStage(state, 'engage'),
  }
}

export function startWeeklyReview(
  state: WorkspaceState,
  env: DomainEnv = browserEnv,
): { state: WorkspaceState; reviewId: string } {
  const existing = state.reviews.find((review) => review.status === 'in_progress')
  if (existing) {
    const step = normalizeReviewStep(existing.step)
    if (step === existing.step) return { state, reviewId: existing.id }
    return { ...advanceWeeklyReview(state, existing.id, step), reviewId: existing.id }
  }
  const reviewId = env.id()
  return {
    reviewId,
    state: {
      ...state,
      reviews: [
        ...state.reviews,
        {
          id: reviewId,
          status: 'in_progress',
          step: 1,
          startedAt: env.now(),
          completedAt: null,
          startSnapshot: snapshot(state),
          endSnapshot: null,
          attentionDirection: '',
          adjustments: [],
        },
      ],
    },
  }
}

export function advanceWeeklyReview(
  state: WorkspaceState,
  reviewId: string,
  step: number,
): { state: WorkspaceState } {
  return {
    state: {
      ...state,
      reviews: state.reviews.map((review) =>
        review.id === reviewId
          ? { ...review, step: normalizeReviewStep(step) }
          : review,
      ),
    },
  }
}

export function patchWeeklyReview(
  state: WorkspaceState,
  reviewId: string,
  patch: Partial<Pick<WeeklyReviewRecord, 'attentionDirection' | 'comboDrafts'>>,
): { state: WorkspaceState } {
  return {
    state: {
      ...state,
      reviews: state.reviews.map((review) =>
        review.id === reviewId
          ? {
              ...review,
              attentionDirection: patch.attentionDirection === undefined
                ? review.attentionDirection
                : patch.attentionDirection,
              comboDrafts: patch.comboDrafts === undefined
                ? review.comboDrafts
                : patch.comboDrafts,
            }
          : review,
      ),
    },
  }
}

export function patchReviewComboDraft(
  state: WorkspaceState,
  reviewId: string,
  kind: ReviewPlanKind,
  plan: ReviewComboDraft | null,
): { state: WorkspaceState } {
  const review = state.reviews.find((entry) => entry.id === reviewId)
  if (!review) return { state }
  const comboDrafts = { ...review.comboDrafts }
  if (plan) comboDrafts[kind] = plan
  else delete comboDrafts[kind]
  return patchWeeklyReview(state, reviewId, { comboDrafts })
}

export function recordReviewAdjustment(
  state: WorkspaceState,
  reviewId: string,
  adjustment: ReviewAdjustment,
): { state: WorkspaceState } {
  return {
    state: {
      ...state,
      reviews: state.reviews.map((review) =>
        review.id === reviewId
          ? { ...review, adjustments: [...(review.adjustments ?? []), adjustment] }
          : review,
      ),
    },
  }
}

export function completeWeeklyReview(
  state: WorkspaceState,
  reviewId: string,
  env: DomainEnv = browserEnv,
): { state: WorkspaceState } {
  return {
    state: {
      ...state,
      reviews: state.reviews.map((review) =>
        review.id === reviewId
          ? {
              ...review,
              status: 'completed',
              step: REVIEW_STEP_COUNT,
              completedAt: env.now(),
              endSnapshot: snapshot(state),
            }
          : review,
      ),
    },
  }
}

export function discardWeeklyReview(
  state: WorkspaceState,
  reviewId: string,
): { state: WorkspaceState } {
  return {
    state: {
      ...state,
      reviews: state.reviews.filter((review) => !(review.id === reviewId && review.status === 'in_progress')),
    },
  }
}
