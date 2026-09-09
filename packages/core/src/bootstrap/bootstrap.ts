/**
 * Database bootstrap deep module (ADR 0007).
 *
 * Owns HOW the application brings its database up at container start:
 *   - fail-closed: missing/empty migration dir → explicit English error, NEVER db push
 *   - `migrate deploy` (via injected `runMigration`)
 *   - fresh-DB seed heuristic: `countUsers() === 0 → runSeed()`
 *
 * All execution adapters are injected by the CLI shell (scripts/db-bootstrap.ts);
 * this module never imports Prisma or spawns a process directly, so the decision
 * logic is unit-testable with fakes. Ordering invariants stay inside the module.
 */

export interface BootstrapDeps {
  nodeEnv: string;
  hasMigrations: () => boolean | Promise<boolean>;
  runMigration: () => void | Promise<void>;
  countUsers: () => number | Promise<number>;
  runSeed: () => void | Promise<void>;
}

export interface BootstrapResult {
  migrationApplied: boolean;
  seeded: boolean;
}

export class NoMigrationsError extends Error {
  constructor() {
    super(
      'prisma/migrations is missing or empty. Refusing to run `prisma db push`. ' +
        'Establish a migration baseline first (see .agents/project/deployment.md).',
    );
    this.name = 'NoMigrationsError';
  }
}

export async function bootstrapDatabase(deps: BootstrapDeps): Promise<BootstrapResult> {
  const hasMigrations = await deps.hasMigrations();
  if (!hasMigrations) {
    throw new NoMigrationsError();
  }

  await deps.runMigration();

  const seeded = (await deps.countUsers()) === 0;
  if (seeded) {
    await deps.runSeed();
  }

  return { migrationApplied: true, seeded };
}