import { execSync } from 'child_process';
import { join } from 'path';

// Local dev fallback so the drift check works without a pre-set DATABASE_URL
// (CI sets its own shadow + main URLs).
process.env.DATABASE_URL ||= 'postgresql://athar:athar@localhost:5442/athar?schema=public';
process.env.SHADOW_DATABASE_URL ||= process.env.DATABASE_URL;

// Sprint A — Task 3.1: CI drift guard. Fails if prisma/schema.prisma has
// changes that are not yet captured in a migration under prisma/migrations/
// (or vice-versa). Runs `prisma migrate diff` against the migrations folder
// and the schema datamodel; if there's any drift, the command exits non-zero
// and execSync throws, failing this test.
describe('migrations are in sync with schema.prisma', () => {
  const cwd = join(__dirname, '..');

  it('prisma migrate diff reports zero drift', () => {
    // Pass env explicitly: prisma.config.ts loads .env via dotenv/config and
    // may otherwise supply credentials (e.g. a placeholder) that break the
    // diff. Forcing the URL through env ensures a deterministic run.
    execSync(
      'npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script',
      {
        cwd,
        stdio: 'pipe',
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL!,
          SHADOW_DATABASE_URL: process.env.SHADOW_DATABASE_URL!,
        },
      },
    );
    // If non-zero drift, execSync throws. If zero drift, this passes.
  });
});