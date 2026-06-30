import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

// OWASP-2025 argon2id parameters: 19 MiB memory, 2 iterations, 1 lane.
const ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON2_OPTS);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch (err) {
      // Narrowed: only swallow known malformed-hash errors; re-throw unknown failures
      // so we don't mask real bugs (e.g. native module errors) as auth failures.
      // Narrowed: only swallow known malformed-hash errors from argon2
      // (e.g. "Invalid hash", "pchstr must contain a $ as first char").
      // Re-throw anything else so we don't mask real bugs as auth failures.
      if (err instanceof Error && /hash|pchstr|must contain/i.test(err.message)) return false;
      throw err;
    }
  }
}
