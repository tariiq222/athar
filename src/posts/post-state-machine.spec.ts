import { PostStateMachine, ALLOWED_TRANSITIONS } from './post-state-machine';

describe('PostStateMachine', () => {
  const sm = new PostStateMachine();

  it('ALLOWED_TRANSITIONS holds the spec pairs (Phase 5 added approved → published)', () => {
    expect(ALLOWED_TRANSITIONS).toEqual([
      { from: 'draft', to: 'pending_review' },
      { from: 'pending_review', to: 'approved' },
      { from: 'pending_review', to: 'draft' },
      { from: 'approved', to: 'pending_review' },
      { from: 'approved', to: 'published' },
    ]);
  });

  it('accepts each allowed transition when from matches current status', () => {
    for (const t of ALLOWED_TRANSITIONS) {
      expect(() => sm.assertTransition(t.from, t)).not.toThrow();
    }
  });

  it('isAllowed mirrors the table (approved → published is allowed; ownership enforced by PATCH guard)', () => {
    expect(sm.isAllowed('draft', 'pending_review')).toBe(true);
    expect(sm.isAllowed('approved', 'pending_review')).toBe(true);
    expect(sm.isAllowed('approved', 'published')).toBe(true);
    expect(sm.isAllowed('draft', 'approved')).toBe(false);
    expect(sm.isAllowed('draft', 'published')).toBe(false);
  });

  it('rejects a transition whose from does not match the current status', () => {
    expect(() =>
      sm.assertTransition('draft', { from: 'pending_review', to: 'approved' }),
    ).toThrow(
      expect.objectContaining({
        message: expect.stringContaining('الحالة الحالية'),
      }),
    );
  });

  it('rejects an undefined transition (draft → approved) as INVALID_TRANSITION', () => {
    expect(() => sm.assertTransition('draft', { from: 'draft', to: 'approved' })).toThrow(
      expect.objectContaining({ code: 'INVALID_TRANSITION' }),
    );
  });

  it('accepts approved → published (semantically valid; PATCH must reject it at the service layer)', () => {
    expect(() =>
      sm.assertTransition('approved', { from: 'approved', to: 'published' }),
    ).not.toThrow();
  });
});
