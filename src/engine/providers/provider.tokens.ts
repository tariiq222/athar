// DI tokens for the engine seams. Services depend on these, not concretes.
// Values MUST match the bindings in src/engine/engine.module.ts so BrandModule
// and EngineModule resolve to the same provider instance at the root injector.
export const CONTENT_PROVIDER = 'ContentProvider';
export const SEARCH_PROVIDER = 'SearchProvider';
export const IMAGE_PROVIDER = 'ImageProvider';
