import {
  CONTENT_PROVIDER,
  SEARCH_PROVIDER,
  IMAGE_PROVIDER,
} from './provider.tokens';

describe('engine seam DI tokens', () => {
  it('exposes stable string keys shared between EngineModule and consumers', () => {
    // These tokens MUST match the bindings in src/engine/engine.module.ts
    // so BrandModule, LearningService and PipelineService resolve to the
    // same provider instance at the root injector.
    expect(CONTENT_PROVIDER).toBe('ContentProvider');
    expect(SEARCH_PROVIDER).toBe('SearchProvider');
    expect(IMAGE_PROVIDER).toBe('ImageProvider');
  });
});