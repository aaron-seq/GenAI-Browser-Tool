import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = resolve(process.cwd(), '.github/scripts/check-pr-base.mjs');
let repo;

function git(...args) {
  return execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    stdio: 'pipe',
  }).trim();
}

function check(base, defaultBranch = 'main') {
  return spawnSync(process.execPath, [script], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      PR_BASE_BRANCH: base,
      DEFAULT_BRANCH: defaultBranch,
    },
  });
}

describe('PR base ancestry guard', () => {
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'genai-pr-base-'));
    git('init', '--initial-branch=main');
    git('config', 'user.name', 'Integration test');
    git('config', 'user.email', 'integration@example.test');
    git('-c', 'core.hooksPath=', 'commit', '--allow-empty', '-m', 'initial');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it('allows a PR targeting the default branch', () => {
    expect(check('main').status).toBe(0);
  });

  it('rejects a merged feature base and explains how to retarget', () => {
    git('update-ref', 'refs/remotes/origin/feature/old', 'HEAD');
    git(
      '-c',
      'core.hooksPath=',
      'commit',
      '--allow-empty',
      '-m',
      'later main work'
    );
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');

    const result = check('feature/old');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Retarget this PR at main');
  });

  it('rejects a base at the same commit as the default branch', () => {
    git('update-ref', 'refs/remotes/origin/feature/empty', 'HEAD');
    expect(check('feature/empty').status).toBe(1);
  });

  it('allows stacking on a branch with unmerged commits', () => {
    git(
      '-c',
      'core.hooksPath=',
      'commit',
      '--allow-empty',
      '-m',
      'feature work'
    );
    git('update-ref', 'refs/remotes/origin/feature/open', 'HEAD');

    expect(check('feature/open').status).toBe(0);
  });

  it('uses the repository default branch rather than assuming main', () => {
    git('update-ref', 'refs/remotes/origin/trunk', 'HEAD');
    git('update-ref', 'refs/remotes/origin/feature/old', 'HEAD');

    expect(check('trunk', 'trunk').status).toBe(0);
    expect(check('feature/old', 'trunk').stderr).toContain(
      'Retarget this PR at trunk'
    );
  });

  it('fails closed when a remote ref is missing', () => {
    const result = check('feature/missing');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Cannot verify PR base ancestry');
  });

  it('requires explicit branch information', () => {
    expect(check('').status).toBe(1);
    expect(check('main', '').status).toBe(1);
  });
});
