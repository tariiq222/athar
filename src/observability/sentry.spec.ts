import * as Sentry from '@sentry/node';
import { initSentry } from './sentry';

jest.mock('@sentry/node', () => ({
  init: jest.fn(),
}));

describe('initSentry', () => {
  const ORIGINAL_ENV = process.env;

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.clearAllMocks();
  });

  it('is a no-op when SENTRY_DSN is unset', () => {
    delete process.env.SENTRY_DSN;
    initSentry();
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('calls Sentry.init with dsn and release when SENTRY_DSN is set', () => {
    process.env.SENTRY_DSN = 'https://abc@sentry.example/1';
    process.env.GIT_SHA = 'deadbeef';
    initSentry();
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://abc@sentry.example/1',
        release: 'deadbeef',
        tracesSampleRate: 0.1,
      }),
    );
  });
});
