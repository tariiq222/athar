import type { PostStatus } from '../generated/prisma/enums';
import { AppError } from '../common/errors/error-envelope';

export interface PostStatusTransition {
  from: PostStatus;
  to: PostStatus;
}

// The only transitions this phase owns. approved → published belongs to Phase 5.
export const ALLOWED_TRANSITIONS: readonly PostStatusTransition[] = [
  { from: 'draft', to: 'pending_review' },
  { from: 'pending_review', to: 'approved' },
  { from: 'pending_review', to: 'draft' }, // reopen for more editing
  { from: 'approved', to: 'pending_review' }, // pull approval back before publishing
  { from: 'approved', to: 'published' }, // Phase 5 — owned by mark-published only
];

export class PostStateMachine {
  isAllowed(from: PostStatus, to: PostStatus): boolean {
    return ALLOWED_TRANSITIONS.some((t) => t.from === from && t.to === to);
  }

  // Pure validation. Throws AppError on rejection; returns void on success.
  // The `approved → published` transition is intentionally allowed here so the
  // state machine is the single source of truth — but PostService.patch refuses
  // any transition.to === 'published' (only Phase 5 marks published).
  assertTransition(currentStatus: PostStatus, transition: PostStatusTransition): void {
    if (transition.from !== currentStatus) {
      throw new AppError(
        409,
        'INVALID_TRANSITION',
        'الحالة الحالية لا تطابق نقطة بداية الانتقال',
      );
    }
    if (!this.isAllowed(transition.from, transition.to)) {
      throw new AppError(409, 'INVALID_TRANSITION', 'انتقال غير مسموح به');
    }
  }
}
