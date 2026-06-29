import { PostStateMachine, ALLOWED_TRANSITIONS } from './post-state-machine';
import { AppError } from '../common/errors/error-envelope';

describe('PostStateMachine', () => {
  const sm = new PostStateMachine();

  it('ALLOWED_TRANSITIONS holds exactly the four spec pairs', () => {
    expect(ALLOWED_TRANSITIONS).toEqual([
      { from: 'draft', to: 'pending_review' },
      { from: 'pending_review', to: 'approved' },
      { from: 'pending_review', to: 'draft' },
      { from: 'approved', to: 'pending_review' },
    ]);
  });

  it('accepts each allowed transition when from matches current status', () => {
    for (const t of ALLOWED_TRANSITIONS) {
      expect(() => sm.assertTransition(t.from, t)).not.toThrow();
    }
  });

  it('isAllowed mirrors the table', () => {
    expect(sm.isAllowed('draft', 'pending_review')).toBe(true);
    expect(sm.isAllowed('approved', 'pending_review')).toBe(true);
    expect(sm.isAllowed('draft', 'approved')).toBe(false);
    expect(sm.isAllowed('draft', 'published')).toBe(false);
  });

  it('rejects a transition whose from does not match the current status', () => {
    try {
      sm.assertTransition('draft', { from: 'pending_review', to: 'approved' });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).getEnvelope().statusCode).toBe(409);
    }
  });

  it('rejects an undefined transition (draft → approved) as INVALID_TRANSITION', () => {
    try {
      sm.assertTransition('draft', { from: 'draft', to: 'approved' });
      throw new Error('expected throw');
    } catch (e) {
      expect((e as AppError).getEnvelope().error).toBe('INVALID_TRANSITION');
    }
  });

  it('rejects any → published with PUBLISH_NOT_ALLOWED_HERE (422), even from approved', () => {
    try {
      sm.assertTransition('approved', { from: 'approved', to: 'published' });
      throw new Error('expected throw');
    } catch (e) {
      expect((e as AppError).getEnvelope().statusCode).toBe(422);
      expect((e as AppError).getEnvelope().error).toBe('PUBLISH_NOT_ALLOWED_HERE');
    }
  });
});
