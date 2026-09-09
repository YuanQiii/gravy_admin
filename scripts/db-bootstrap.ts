import { spawn } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { bootstrapDatabase } from '../src/bootstrap/bootstrap';

/**
 * Thin CLI adapter over the `bootstrapDatabase` deep module (ADR 0007).
 * Holds ALL process/DB side effects; the module holds the decision logic.
 * Invoked by container entrypoint: `node dist/scripts/db-bootstrap.js`.
 */

const prisma = new PrismaClient();

function hasMigrations(): boolean {
  const dir = 'prisma/migrations';
  if (!existsSync(dir)) return false;
  return readdirSync(dir).length > 0;
}

function runMigration(): Promise<void> {
  return run('node_modules/.bin/prisma', ['migrate', 'deploy']);
}

async function countUsers(): Promise<number> {
  try {
    return await prisma.user.count();
  } finally {
    await prisma.$disconnect();
  }
}

function runSeed(): Promise<void> {
  if (process.env.NODE_ENV === 'development') {
    return run('node_modules/.bin/ts-node', ['prisma/seed.ts']);
  }
  return run('node', ['dist/prisma/seed.js']);
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', env: process.env });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

async function main(): Promise<void> {
  const result = await bootstrapDatabase({
    nodeEnv: process.env.NODE_ENV ?? 'production',
    hasMigrations,
    runMigration,
    countUsers,
    runSeed,
  });
  // eslint-disable-next-line no-console
  console.log(
    `[db-bootstrap] migrationApplied=${result.migrationApplied} seeded=${result.seeded}`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`[db-bootstrap] ${(err as Error).message}`);
  process.exitCode = 1;
});