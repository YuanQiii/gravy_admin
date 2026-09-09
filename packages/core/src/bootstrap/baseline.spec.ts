import { verifyNoDrift, generateBaseline, RunResult } from './baseline';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'fs';

const fakeRun = (result: Partial<RunResult>) =>
  jest.fn().mockResolvedValue({
    code: 0,
    stdout: '',
    stderr: '',
    ...result,
  });

describe('verifyNoDrift', () => {
  it('returns clean when diff output is empty', async () => {
    const run = fakeRun({ code: 0, stdout: '   \n  ' });
    const report = await verifyNoDrift('postgres://test/db', run);
    expect(report).toEqual({ status: 'clean' });
  });

  it('returns clean when diff output is only the empty-migration comment', async () => {
    const run = fakeRun({ code: 0, stdout: '-- This is an empty migration.\n' });
    const report = await verifyNoDrift('postgres://test/db', run);
    expect(report).toEqual({ status: 'clean' });
  });

  it('returns drift and carries the diff when output is non-empty', async () => {
    const diff = 'CREATE TABLE "Foo" (id TEXT);';
    const run = fakeRun({ code: 0, stdout: diff });
    const report = await verifyNoDrift('postgres://test/db', run);
    expect(report).toEqual({ status: 'drift', diff });
  });

  it('returns error (NOT drift) when the command fails', async () => {
    const run = fakeRun({ code: 1, stderr: 'Unable to connect' });
    const report = await verifyNoDrift('postgres://test/db', run);
    expect(report.status).toBe('error');
    expect(report.diff).toBeUndefined();
    expect(report.error).toContain('Unable to connect');
  });

  it('returns error (NOT drift) when the command throws (unreachable DB)', async () => {
    const run = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const report = await verifyNoDrift('postgres://test/db', run);
    expect(report).toEqual({ status: 'error', error: 'ECONNREFUSED' });
  });
});

describe('generateBaseline', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'gvray-baseline-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes migration.sql and migration.lock into the migrations root', async () => {
    const run = fakeRun({ code: 0, stdout: 'CREATE TABLE "User" (id TEXT);' });
    const baseline = await generateBaseline(run, tempDir);

    const migrationsRoot = join(tempDir, '0_init');
    expect(existsSync(join(migrationsRoot, 'migration.sql'))).toBe(true);
    expect(readFileSync(join(migrationsRoot, 'migration.sql'), 'utf8')).toBe(
      'CREATE TABLE "User" (id TEXT);',
    );
    expect(existsSync(join(migrationsRoot, 'migration.lock'))).toBe(true);
    expect(readFileSync(join(migrationsRoot, 'migration.lock'), 'utf8')).toContain(
      'provider = "postgresql"',
    );
    expect(baseline.migrationName).toBe('0_init');
  });

  it('throws when the CLI command fails', async () => {
    const run = fakeRun({ code: 2, stderr: 'boom' });
    await expect(generateBaseline(run, tempDir)).rejects.toThrow('boom');
  });
});