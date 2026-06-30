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
    expect(() => sm.assertTransition('draft', { from: 'pending_review', to: 'approved' })).toThrow(
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

  // ── additional edge cases ─────────────────────────────────────────────────

  it('rejects draft → draft self-transition as INVALID_TRANSITION', () => {
    expect(() => sm.assertTransition('draft', { from: 'draft', to: 'draft' })).toThrow(
      expect.objectContaining({ code: 'INVALID_TRANSITION' }),
    );
  });

  it('rejects pending_review → published as INVALID_TRANSITION', () => {
    expect(() =>
      sm.assertTransition('pending_review', { from: 'pending_review', to: 'published' }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
  });

  it('rejects published → draft (no way back from published)', () => {
    expect(() => sm.assertTransition('published', { from: 'published', to: 'draft' })).toThrow(
      expect.objectContaining({ code: 'INVALID_TRANSITION' }),
    );
  });

  it('rejects published → pending_review (no way back from published)', () => {
    expect(() =>
      sm.assertTransition('published', { from: 'published', to: 'pending_review' }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
  });

  it('rejects published → approved (no way back from published)', () => {
    expect(() => sm.assertTransition('published', { from: 'published', to: 'approved' })).toThrow(
      expect.objectContaining({ code: 'INVALID_TRANSITION' }),
    );
  });

  it('isAllowed returns false for published → anything', () => {
    expect(sm.isAllowed('published', 'draft')).toBe(false);
    expect(sm.isAllowed('published', 'pending_review')).toBe(false);
    expect(sm.isAllowed('published', 'approved')).toBe(false);
    expect(sm.isAllowed('published', 'published')).toBe(false);
  });

  it('INVALID_TRANSITION error carries code INVALID_TRANSITION', () => {
    let caught: any;
    try {
      sm.assertTransition('draft', { from: 'draft', to: 'approved' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(caught.code).toBe('INVALID_TRANSITION');
  });

  it('mismatch error carries code INVALID_TRANSITION', () => {
    let caught: any;
    try {
      sm.assertTransition('draft', { from: 'approved', to: 'pending_review' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(caught.code).toBe('INVALID_TRANSITION');
  });
});
