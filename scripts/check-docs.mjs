#!/usr/bin/env node
// Docs self-check — **zero dependency**, runs in CI with no install.
//
// It checks four kinds of things that **silently go stale** (the first three come from step 5's hard requirements in SKILL.md; the fourth was added from real experience):
//   1 relative links reachable — resolved against **the file's own directory** (resolving against the repo root mis-flags a batch of good links)
//   2 commands mentioned in docs really exist — `package.json` scripts / `Makefile` targets / cargo builtins
//   3 no section-number pointer **to the root file** — anchors like `§5` silently break when the root file is reordered,
//     and no tool reports it. Checked in **every** doc this run covers, not only in the root file: the root file is the one
//     that gets reordered, so a corpus doc is exactly where such a pointer breaks.
//   4 **no `README.md` index in the corpus directory** — the index is the root file's routing table, and the two will inevitably drift
//      (real experience: one repo's corpus index pointed 8 links at non-existent files)
//
// **Coverage** = the root file + the corpus directories **recursively** + every directory-level `AGENTS.md` in the repo.
// All three were measured holes: a dead link in `docs/guides/<sub>/x.md`, a `§` pointer in `packages/*/AGENTS.md`, and a
// corpus living somewhere unexpected each used to print "All passed". Depth and file count are capped, and hitting a cap says so.
//
// The corpus directory itself is **auto-detected** (`CORPUS_CANDIDATES`) and the resolved list is printed, because a
// hard-coded path once made a repo print "1 file(s) / All passed" while its 8 scenario docs went unchecked.
//
// Design discipline: **keep criteria narrow; miss rather than false-positive**. A check that false-positives gets the whole thing turned off, which is worse than missing.
// So: skip glob-style writing, recognize only three command sources, and require a command-shaped mention to actually look
// like code — a bare mention counts only inside an inline code span, while a `run` form counts anywhere. Loose prose used to
// be compared against `package.json` as if it were a script name: `make sure`, `make it` and `pnpm can` all "reported" missing targets.
//
// Usage:
//   node check-docs.mjs [--root <dir>] [--help]        (`--root=<dir>` is equivalent)
// Exit codes: 0 = all pass; 1 = findings; 2 = usage error.
//
// When copying into a repo, only the CONFIG block below needs editing.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Candidate locations of the scenario corpus, used **only** when `corpusDirs` is `'auto'`.
 *  Keep this list short, and keep it in sync with `CORPUS_CANDIDATES` in `gen-agents-md.mjs` —
 *  this file must stay **self-contained** (it gets copied into a target repo), so the two copies
 *  cannot be merged into a shared module.
 *  Why this exists — verified in practice: with a hard-coded `['docs/guides']`, a repo whose corpus
 *  was `.agents/project/` printed "1 file(s)" and "All passed" while 8 scenario docs went unchecked.
 *  A green run that covers nothing is the worst failure mode this file can have, so 'auto' is the
 *  default: detect every candidate that exists, and **print which ones were used**. */
const CORPUS_CANDIDATES = ['docs/guides', '.agents/project', 'docs/notes'];

const CONFIG = {
  root: process.cwd(),
  /** Root constraint file. Its **name** is the sentinel for the section-number check, which runs in every doc this
   *  run covers — a pointer at *another* doc's section number stays legal and is not flagged. */
  rootDoc: 'AGENTS.md',
  /** Scenario corpus directories (relative to root); checked only if present.
   *  `'auto'` = every existing directory from `CORPUS_CANDIDATES` — the resolved list is printed,
   *  and both "none found" and "more than one found" are called out (the rule is one per repo).
   *  Pass an explicit array (e.g. `['.agents/project']`) to pin a corpus that lives elsewhere. */
  corpusDirs: 'auto',
  /** Extra allowed commands: full command string or bare word, e.g. ['pnpm db:seed'] */
  extraCommands: [],
  /** Skip link targets starting with these prefixes (e.g. 'http', '/tmp') */
  ignoreLinkPrefixes: [],
  /** Corpus directories must not contain a README.md index */
  forbidCorpusIndex: true,
  /** Command source: 'auto' picks automatically by the manifest files present in the repo (several may combine).
   *  Pinning one source **skips** the others entirely, and a skipped source produces no finding at all — it is a
   *  configuration choice, not a claim about the repo. Conflating that with "unreadable" once made a repo report
   *  "the repo has no readable `package.json`" while the file sat there, perfectly parseable.
   *  `'auto'` | `'npm'` | `'make'`. */
  commandSource: 'auto'
};

// ── Arguments ────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

/** `--flag value` and `--flag=value` are **equivalent**. The space-only form once made this file silently ignore the
 *  flag, fall back to the current directory, and print "All passed" for a repo it had never looked at — the worst
 *  failure mode this file has, and the one every neighbouring tool already avoided by accepting both forms. */
const argOf = (flag) => {
  const i = argv.indexOf(flag);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  const pre = `${flag}=`;
  const hit = argv.find((a) => a.startsWith(pre));
  return hit && hit.slice(pre.length) ? hit.slice(pre.length) : null;
};
const has = (f) => argv.includes(f);

if (has('--help') || has('-h')) {
  process.stdout.write(
    [
      'Docs self-check (zero dependency)',
      '',
      '  node check-docs.mjs [--root <dir> | --root=<dir>] [--help]',
      '',
      'Checks: 1 relative links reachable (resolved against the file\'s own directory) 2 commands mentioned in docs exist (npm scripts / make target / cargo builtin)',
      '       3 no section-number pointer to the root file (checked in **every** doc covered) 4 corpus directory has no README.md index',
      '',
      'Coverage: root file + corpus dirs (recursive) + every directory-level AGENTS.md. A bare (non-code-span) command mention is treated as prose and skipped.',
      `Current config: rootDoc=${CONFIG.rootDoc} · corpusDirs=${Array.isArray(CONFIG.corpusDirs) ? CONFIG.corpusDirs.join(',') : CONFIG.corpusDirs} · commandSource=${CONFIG.commandSource}`,
      `Corpus candidates (used when corpusDirs=auto): ${CORPUS_CANDIDATES.map((d) => `\`${d}\``).join(' / ')}`,
      'Edit the CONFIG block at the top of this file to change config.',
      ''
    ].join('\n')
  );
  process.exit(0);
}
const ROOT_VALUE = argOf('--root');
if (has('--root') && !ROOT_VALUE) {
  process.stdout.write('Usage error: `--root` was given without a value. Pass `--root <dir>` or `--root=<dir>`.\n');
  process.exit(2);
}
const ROOT = resolve(ROOT_VALUE || CONFIG.root);
// An invalid target is a usage error, **never** a fallback: silently checking some other directory is how a green
// run stops meaning anything.
const rootIsDir = (() => {
  try {
    return statSync(ROOT).isDirectory();
  } catch {
    return false;
  }
})();
if (!rootIsDir) {
  process.stdout.write(`Usage error: \`${ROOT}\` is not a directory — refusing to fall back to another target.\n`);
  process.exit(2);
}

/** Resolve `corpusDirs: 'auto'` **once**, so every consumer sees the same list and the report can
 *  state which directories were actually covered. */
const corpusNotes = [];
const CORPUS_DIRS =
  CONFIG.corpusDirs === 'auto'
    ? CORPUS_CANDIDATES.filter((d) => {
        const abs = join(ROOT, d);
        return existsSync(abs) && statSync(abs).isDirectory();
      })
    : CONFIG.corpusDirs;
if (CONFIG.corpusDirs === 'auto') {
  if (!CORPUS_DIRS.length) {
    corpusNotes.push(
      `no scenario corpus found among ${CORPUS_CANDIDATES.map((d) => `\`${d}\``).join(' / ')} — this run covers only \`${CONFIG.rootDoc}\`. ` +
        'If the corpus lives somewhere else, set `corpusDirs` explicitly: a run that covers nothing still prints "All passed".'
    );
  } else if (CORPUS_DIRS.length > 1) {
    corpusNotes.push(
      `more than one corpus directory found (${CORPUS_DIRS.map((d) => `\`${d}\``).join(' / ')}) — the rule is **one across the whole repo**; confirm which one is authoritative`
    );
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

const findings = [];
const notes = [];
const report = (file, msg) => findings.push(`${file}: ${msg}`);
const rel = (p) => p.slice(ROOT.length).replace(/^[\\/]/, '').replace(/\\/g, '/');

function readIf(p) {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt', '.output', '.cache',
  '.turbo', '.venv', 'venv', 'target', '.scratch', '.workbuddy'
]);
const MAX_DOC_DEPTH = 12;
const MAX_DOCS = 500;
const coverageNotes = [];

/** Depth-first walk, calling `visit(absPath)` for every file. Bounded, and **says so** when a bound is hit: a silently
 *  truncated walk turns "not found" into a fact, which is the thing this file exists to prevent. */
function walkFiles(dirAbs, depth, visit) {
  if (depth > MAX_DOC_DEPTH) {
    coverageNotes.push(`directory depth cap (${MAX_DOC_DEPTH}) reached — coverage may be incomplete`);
    return;
  }
  let entries;
  try {
    entries = readdirSync(dirAbs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dirAbs, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walkFiles(p, depth + 1, visit);
    } else if (e.isFile()) {
      visit(p);
    }
  }
}

/** Docs to check: the root file + everything under the corpus directories **recursively** + every directory-level `AGENTS.md`.
 *  Both extra scope classes were measured holes: the corpus used to be read one level deep, so a dead link in
 *  `docs/guides/<sub>/x.md` passed, and a nested `AGENTS.md` — a file this skill's own workflow produces — was never
 *  checked at all, so a `§` pointer inside one never went red. */
function docFiles() {
  const out = [];
  const seen = new Set();
  let count = 0;
  const add = (p, capNote) => {
    if (count >= MAX_DOCS) {
      if (capNote && !coverageNotes.some((n) => n.startsWith('file cap'))) {
        coverageNotes.push(`file cap (${MAX_DOCS}) reached — coverage may be incomplete`);
      }
      return;
    }
    count++;
    const k = p.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(p);
  };
  const rootDocPath = join(ROOT, CONFIG.rootDoc);
  if (existsSync(rootDocPath)) add(rootDocPath, false);
  else notes.push(`No ${CONFIG.rootDoc} found (skipping root-file-related checks)`);

  for (const dir of CORPUS_DIRS) {
    const abs = join(ROOT, dir);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) continue;
    walkFiles(abs, 0, (p) => {
      if (/\.md$/i.test(p)) add(p, true);
    });
  }
  // Directory-level AGENTS.md files: the agent reads "the nearest file in the directory tree", so a dead link in one is
  // a dead link in a file the agent really reads. The root file is already in `out`.
  walkFiles(ROOT, 0, (p) => {
    if (!/(^|[\\/])AGENTS\.md$/i.test(p)) return;
    if (resolve(p) === resolve(rootDocPath)) return;
    add(p, true);
  });
  return out.sort();
}

// ── 1 Relative links reachable ──────────────────────────────────────────────

const LINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** Whether a position in `text` sits inside an inline code span (an odd number of backticks earlier on that line). */
function inCodeSpanInText(text, index) {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  let ticks = 0;
  for (let i = lineStart; i < index; i++) if (text[i] === '`') ticks++;
  return ticks % 2 === 1;
}

function checkLinks(file) {
  const text = readIf(file);
  if (text === null) return;
  const fromDir = dirname(file);
  for (const m of text.matchAll(LINK_RE)) {
    let target = m[1].trim();
    if (!target) continue;
    // A link **quoted as an example** is not a link: `` `[100%](...)` `` is how a doc talks *about* markdown. Mirror of
    // the command rule — the reader acts on the plain form, not on the one the doc is exhibiting.
    if (inCodeSpanInText(text, m.index)) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // scheme: http: mailto: …
    if (target.startsWith('#')) continue; // pure anchor
    if (CONFIG.ignoreLinkPrefixes.some((p) => target.startsWith(p))) continue;
    target = target.split('#')[0].split('?')[0];
    if (!target) continue;
    // **Resolve against the file's own directory** — the easiest line to get wrong (resolving against the repo root mis-flags a batch of good links)
    // Decoding is best-effort: `decodeURI` throws on a malformed escape (a bare `%` in `[100%](./x.md)`), and an uncaught
    // throw takes the whole run down — four checks, zero findings, one stack trace. Fall back to the literal target instead.
    let decoded = target;
    try {
      decoded = decodeURI(target);
    } catch {
      /* malformed escape: compare the literal form rather than aborting the run */
    }
    const abs = target.startsWith('/') ? join(ROOT, target) : resolve(fromDir, decoded);
    if (!existsSync(abs)) report(rel(file), `Relative link unreachable: \`${m[1]}\` -> resolved to \`${rel(abs)}\``);
  }
}

// ── 2 Commands mentioned in docs really exist ────────────────────────────────

const NPM_MANAGERS = ['pnpm', 'npm', 'yarn', 'bun'];
/** Truly **built-in** package-manager subcommands. Deliberately **not** including `test` / `start` / `build`:
 * they forward to a same-named script — including them opens a back door to a non-existent script (learned the hard way). */
const NPM_BUILTINS = new Set([
  'install', 'i', 'ci', 'add', 'remove', 'rm', 'uninstall', 'update', 'up', 'upgrade', 'exec', 'dlx',
  'init', 'create', 'publish', 'pack', 'link', 'unlink', 'ls', 'list', 'outdated', 'audit', 'fund',
  'config', 'cache', 'prune', 'dedupe', 'doctor', 'why', 'view', 'info', 'bin', 'root', 'prefix',
  'version', 'help', 'env', 'store', 'patch', 'approve-builds', 'rebuild', 'licenses', 'sbom'
]);
/** A bare `<manager> <word>` counts as a command only if the word is in the list; everything else passes as prose (real experience: "workflow only runs npm commands" was mis-judged) */
const BARE_WORDS = new Set(['test', 'start', 'build', 'run', 'lint', 'dev', 'prepare']);
/** Counted when a mention *is* command-shaped but this repo has no manifest to check it against. One aggregated note at
 *  the end beats one finding per mention: a finding a reader cannot act on is noise, and noise is what gets a check
 *  switched off. Measured: a non-Node repo whose docs merely *discuss* commands produced 22 such findings. */
const inapplicable = { npm: 0, make: 0 };
const CARGO_BUILTINS = new Set([
  'build', 'check', 'run', 'test', 'bench', 'fmt', 'clippy', 'doc', 'clean', 'update', 'add', 'remove',
  'install', 'uninstall', 'publish', 'package', 'tree', 'metadata', 'fix', 'generate-lockfile', 'vendor'
]);

/** Read a command source. **Three states, and the difference is load-bearing**:
 *  `ok` = readable, here is the name set · `absent` = this repo has no such manifest, so the check simply does not apply
 *  here (a note, never a finding) · `unreadable` = it exists and cannot be read, which is something to fix (a finding).
 *  All three used to collapse into one `null`, so pinning `commandSource: 'make'` made every `pnpm …` mention claim
 *  "the repo has no readable `package.json`", and a non-Node repo whose docs discuss commands produced one finding per
 *  mention — all of them unactionable, which is how a check gets switched off. */
/** Read a manifest and produce its name set, in the same state vocabulary used everywhere else.
 *  Extracted because the npm and make readers were one shape written twice, and this package's own rule is that two
 *  implementations of one shape drift (the `--flag=value` support had to be added to four separate parsers for exactly
 *  that reason). `parse` may throw; `noteOnError` is for the caller that has something useful to say when it does. */
function sourceNames(path, parse, noteOnError) {
  const raw = readIf(join(ROOT, path));
  if (raw === null) return { state: 'absent' };
  try {
    return { state: 'ok', names: parse(raw) };
  } catch {
    if (noteOnError) notes.push(noteOnError);
    return { state: 'unreadable' };
  }
}

function npmScripts() {
  return sourceNames(
    'package.json',
    (raw) => new Set(Object.keys(JSON.parse(raw).scripts ?? {})),
    '`package.json` parse failed — npm command check skipped'
  );
}

function makeTargets() {
  return sourceNames('Makefile', (raw) => {
    const names = new Set();
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z0-9_][\w.-]*)\s*:(?!=)/);
      if (m) names.add(m[1]);
    }
    return names;
  });
}

/** A glob-style trailing `*` / `<` / `{` means a family of scripts, not a command name */
const isGlobish = (rest) => /^\s*[*<{]/.test(rest);

/** Whether the character at `index` sits inside an inline code span on this line (an odd number of backticks before it).
 *  This is what separates "a command this doc is telling you to run" from "English prose that happens to use a word a
 *  package manager also uses": `make sure` is not a make target, `pnpm can` is not a script. Measured: judging by the
 *  word alone reported 11 problems on this skill's own reference docs, and every one was prose. */
function inCodeSpan(line, index) {
  let ticks = 0;
  for (let i = 0; i < index; i++) if (line[i] === '`') ticks++;
  return ticks % 2 === 1;
}

/** Position of the tool name inside a match. The patterns below swallow the character **before** the name as a
 *  delimiter, so `m.index` points one character early — and that character is exactly the backtick being tested for.
 *  Getting this wrong made `` `make does-not-exist` `` read as prose (measured: the existing make case went green). */
const toolAt = (m, tool) => m.index + m[0].indexOf(tool);

function checkCommands(file, sources) {
  const text = readIf(file);
  if (text === null) return;
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    const at = (msg) => report(rel(file), `Line ${i + 1}: ${msg}`);
    for (const mgr of NPM_MANAGERS) {
      const re = new RegExp(`(?:^|[^\\w.-])${mgr}\\s+(?:run\\s+)?([a-z][\\w:.-]*)`, 'g');
      for (const m of line.matchAll(re)) {
        const name = m[1];
        const after = line.slice(m.index + m[0].length);
        const isRun = /\brun\s+$/.test(m[0].slice(0, m[0].length - name.length));
        if (isGlobish(after)) continue;
        if (CONFIG.extraCommands.includes(name) || CONFIG.extraCommands.includes(`${mgr} ${name}`)) continue;
        if (!isRun && NPM_BUILTINS.has(name)) continue;
        // The bare-form criterion splits by manager: `pnpm <script>` / `yarn <script>` is the norm;
        // whereas `npm <word>` only counts as a command when it forwards to a same-named script; everything else passes as prose
        // (real experience: the prose "workflow only runs npm commands" once treated that word as a command name to compare against package.json)
        const bareIsCommand = mgr !== 'npm' || BARE_WORDS.has(name);
        if (!isRun && !bareIsCommand) continue;
        // A bare mention must **look like code** (inline code span); an explicit `run` is unambiguous and always checked.
        if (!isRun && !inCodeSpan(line, toolAt(m, mgr))) continue;
        if (sources.npm.state === 'skipped') continue;
        if (sources.npm.state === 'absent') {
          // No manifest here: the check does not apply to this repo, so there is nothing for the reader to fix.
          inapplicable.npm++;
          continue;
        }
        if (sources.npm.state !== 'ok') {
          at(`Mentions \`${mgr} ${isRun ? 'run ' : ''}${name}\`, but the repo's \`package.json\` could not be read (cannot verify)`);
          continue;
        }
        if (!sources.npm.names.has(name)) at(`Mentions \`${mgr} ${isRun ? 'run ' : ''}${name}\`, but \`package.json\` has no such script`);
      }
    }
    // make <target>
    for (const m of line.matchAll(/(?:^|[^\\\w.-])make\s+([a-zA-Z0-9_][\w.-]*)/g)) {
      const target = m[1];
      if (isGlobish(line.slice(m.index + m[0].length))) continue;
      if (CONFIG.extraCommands.includes(`make ${target}`) || CONFIG.extraCommands.includes(target)) continue;
      // Same rule as the bare package-manager form: `make sure` / `make it` are English, not targets.
      if (!inCodeSpan(line, toolAt(m, 'make'))) continue;
      if (sources.make.state === 'skipped') continue;
      if (sources.make.state === 'absent') {
        inapplicable.make++;
        continue;
      }
      if (sources.make.state !== 'ok') {
        at(`Mentions \`make ${target}\`, but the repo's \`Makefile\` could not be read (cannot verify)`);
        continue;
      }
      if (!sources.make.names.has(target)) at(`Mentions \`make ${target}\`, but \`Makefile\` has no such target`);
    }
    // cargo <sub>
    for (const m of line.matchAll(/(?:^|[^\\\w.-])cargo\s+([a-z][\w-]*)/g)) {
      const sub = m[1];
      if (CARGO_BUILTINS.has(sub)) continue;
      if (CONFIG.extraCommands.includes(`cargo ${sub}`)) continue;
      if (!inCodeSpan(line, toolAt(m, 'cargo'))) continue;
      // cargo custom subcommands (cargo-nextest -> `cargo nextest`) cannot be verified from repo facts; only note, don't error
      notes.push(`Line ${i + 1} mentions \`cargo ${sub}\`: it is not a cargo built-in subcommand; confirm whether it is a custom extension`);
    }
  });
}

// ── 3 No section-number pointer to the root file ─────────────────────────────
// Runs over **every** doc this run covers (the caller loops), because the root file is the one that gets reordered —
// so a corpus doc or a nested AGENTS.md is exactly where such a pointer silently breaks. A pointer at another doc's
// section number is legal and stays unflagged: the sentinel is the root file's name, not the `§` alone.

function checkSectionPointers(file) {
  const text = readIf(file);
  if (text === null) return;
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    // **One-directional check**: counts only when a `§` appears within 20 chars after the root file name.
    // The reverse (the line contains both a number and the root file name) would wrongly hit legitimate references to **other** docs' sections.
    const idx = line.indexOf(CONFIG.rootDoc);
    if (idx < 0) return;
    const tail = line.slice(idx + CONFIG.rootDoc.length, idx + CONFIG.rootDoc.length + 20);
    if (tail.includes('§')) {
      report(rel(file), `Line ${i + 1}: section-number pointer to root file (a \`§\` appears after \`${CONFIG.rootDoc}\`) — reordering silently breaks it`);
    }
  });
}

// ── 4 Corpus directory must not have an index ────────────────────────────────

function checkCorpusIndex() {
  if (!CONFIG.forbidCorpusIndex) return;
  for (const dir of CORPUS_DIRS) {
    const idx = join(ROOT, dir, 'README.md');
    if (existsSync(idx)) {
      report(`${dir}/README.md`, 'A corpus directory should not hold an index — the index is the root file\'s routing table, and the two will inevitably drift');
    }
  }
}

// ── Run ──────────────────────────────────────────────────────────────────────

const docs = docFiles();
const wantNpm = CONFIG.commandSource === 'auto' || CONFIG.commandSource === 'npm';
const wantMake = CONFIG.commandSource === 'auto' || CONFIG.commandSource === 'make';
// A skipped source is `{ state: 'skipped' }`: no check, and **no finding**. `null` used to mean both "switched off by
// config" and "required but unreadable", which is how a false premise got into the report (see `npmScripts`).
const sources = {
  npm: wantNpm ? npmScripts() : { state: 'skipped' },
  make: wantMake ? makeTargets() : { state: 'skipped' }
};

for (const f of docs) {
  checkLinks(f);
  checkCommands(f, sources);
}
// Section-number pointers run over **every** covered doc, not only the root file.
for (const f of docs) checkSectionPointers(f);
checkCorpusIndex();

// Mentions that could not be checked **because this repo has no manifest at all**. Reported once, as a note: the reader
// has nothing to act on, and a wall of unactionable findings is what makes people disable a check.
if (inapplicable.npm || inapplicable.make) {
  const bits = [];
  if (inapplicable.npm) bits.push(`${inapplicable.npm} × \`npm|pnpm|yarn|bun …\` (this repo has no \`package.json\`)`);
  if (inapplicable.make) bits.push(`${inapplicable.make} × \`make …\` (this repo has no \`Makefile\`)`);
  notes.push(
    `not checked, because there is no manifest here to check them against: ${bits.join(' · ')}. ` +
      'Expected when the docs discuss commands this repo does not itself use — nothing to fix.'
  );
}

// The coverage is printed explicitly: "1 file(s)" once read as "the repo is clean" while the corpus was configured
// wrong or read one level deep, so the header must state what was actually covered.
const rootDocAbs = join(ROOT, CONFIG.rootDoc);
const nestedCount = docs.filter(
  (p) => /(^|[\\/])AGENTS\.md$/i.test(p) && resolve(p) !== resolve(rootDocAbs)
).length;
process.stdout.write(
  `Docs self-check: ${docs.length} file(s) — root \`${CONFIG.rootDoc}\`` +
    `${nestedCount ? ` + ${nestedCount} directory-level \`AGENTS.md\`` : ''}` +
    `${CORPUS_DIRS.length ? ` + corpus ${CORPUS_DIRS.map((d) => `\`${d}\``).join(' + ')} (recursive)` : ' (no corpus directory found)'}\n`
);
notes.push(...corpusNotes, ...coverageNotes);
if (notes.length) {
  process.stdout.write('\nNotes (not counted as problems):\n');
  for (const n of notes) process.stdout.write(`  - ${n}\n`);
}
if (!findings.length) {
  process.stdout.write('\nAll passed.\n');
  process.exit(0);
}
process.stdout.write(`\nFound ${findings.length} problem(s):\n`);
for (const f of findings) process.stdout.write(`  ${f}\n`);
process.exit(1);
