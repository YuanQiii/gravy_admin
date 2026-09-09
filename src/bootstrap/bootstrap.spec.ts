import { bootstrapDatabase, NoMigrationsError } from './bootstrap';

describe('bootstrapDatabase', () => {
  const makeDeps = (overrides: Record<string, unknown> = {}) => ({
    nodeEnv: 'production',
    hasMigrations: () => true,
    runMigration: jest.fn().mockResolvedValue(undefined),
    countUsers: jest.fn().mockResolvedValue(0),
    runSeed: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  it('applies migrations then seeds when user table is empty', async () => {
    const deps = makeDeps();
    const result = await bootstrapDatabase(deps);

    expect(deps.runMigration).toHaveBeenCalledTimes(1);
    expect(deps.runSeed).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ migrationApplied: true, seeded: true });
  });

  it('skips (fail-closed, throws) when migrations dir is missing — never runs migrations/seed', async () => {
    const deps = makeDeps({ hasMigrations: () => false });

    await expect(bootstrapDatabase(deps)).rejects.toBeInstanceOf(NoMigrationsError);
    expect(deps.runMigration).not.toHaveBeenCalled();
    expect(deps.countUsers).not.toHaveBeenCalled();
    expect(deps.runSeed).not.toHaveBeenCalled();
  });

  it('skips seed when users already exist', async () => {
    const deps = makeDeps({ countUsers: () => 5 });

    const result = await bootstrapDatabase(deps);

    expect(deps.runMigration).toHaveBeenCalledTimes(1);
    expect(deps.runSeed).not.toHaveBeenCalled();
    expect(result).toEqual({ migrationApplied: true, seeded: false });
  });

  it('propagates migration failure (does not swallow)', async () => {
    const deps = makeDeps({
      runMigration: jest.fn().mockRejectedValue(new Error('migrate deploy failed')),
    });

    await expect(bootstrapDatabase(deps)).rejects.toThrow('migrate deploy failed');
    expect(deps.runSeed).not.toHaveBeenCalled();
  });
});