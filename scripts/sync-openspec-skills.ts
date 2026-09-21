import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Mirror the OpenSpec-generated skills from `.trae/skills` into `.workbuddy/skills`.
 *
 * OpenSpec has no `workbuddy` tool target (see `AI_TOOLS` in the openspec CLI),
 * so `openspec init/update` writes its skills under the configured tool
 * directory — currently `.trae`. WorkBuddy only loads skills from
 * `~/.workbuddy/skills` and `<workspace>/.workbuddy/skills`, so the generated
 * files must be mirrored after every `openspec update`.
 *
 * Scope: only directories prefixed with `openspec-` are touched, and only
 * inside the project's own `.workbuddy/skills`. Any other skill present there
 * is left untouched. Each managed directory is recreated from scratch so the
 * mirror always matches the source exactly.
 *
 * Usage:
 *   pnpm openspec:sync-skills             # copy/refresh managed skills
 *   pnpm openspec:sync-skills -- --prune  # also drop managed skills absent from the source
 */

const SKILL_PREFIX = 'openspec-';
const LOG_PREFIX = '[openspec:sync-skills]';

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const shouldPrune = args.includes('--prune');

const source = resolve(__dirname, '../.trae/skills');
const target = resolve(__dirname, '../.workbuddy/skills');

if (!existsSync(source)) {
  console.error(`${LOG_PREFIX} Source directory not found: ${source}`);
  console.error(`${LOG_PREFIX} Run \`openspec init\` or \`openspec update\` first.`);
  process.exit(1);
}

const skillNames = readdirSync(source, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith(SKILL_PREFIX))
  .map((entry) => entry.name);

if (skillNames.length === 0) {
  console.error(`${LOG_PREFIX} No "${SKILL_PREFIX}*" skill directory found in ${source}.`);
  process.exit(1);
}

mkdirSync(target, { recursive: true });

for (const name of skillNames) {
  const destination = join(target, name);
  // Recreate from scratch so a file removed upstream does not linger here.
  rmSync(destination, { recursive: true, force: true });
  cpSync(join(source, name), destination, { recursive: true });
}

const stale = readdirSync(target, { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isDirectory() &&
      entry.name.startsWith(SKILL_PREFIX) &&
      !skillNames.includes(entry.name),
  )
  .map((entry) => entry.name);

for (const name of stale) {
  if (shouldPrune) {
    rmSync(join(target, name), { recursive: true, force: true });
  }
}

console.log(`${LOG_PREFIX} Synced ${skillNames.length} skill(s) to .workbuddy/skills`);
console.log(`${LOG_PREFIX} ${skillNames.join(', ')}`);

if (stale.length > 0) {
  if (shouldPrune) {
    console.log(`${LOG_PREFIX} Pruned ${stale.length} stale skill(s): ${stale.join(', ')}`);
  } else {
    console.warn(
      `${LOG_PREFIX} ${stale.length} stale skill(s) no longer in the source: ${stale.join(', ')}`,
    );
    console.warn(`${LOG_PREFIX} Re-run with --prune to remove them.`);
  }
}

console.log(`${LOG_PREFIX} Restart WorkBuddy if the new skills do not appear immediately.`);
