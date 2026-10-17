import { spawnSync } from 'node:child_process';

const base = process.env.PR_BASE_BRANCH;
const defaultBranch = process.env.DEFAULT_BRANCH;

if (!base || !defaultBranch) {
  process.stderr.write('PR_BASE_BRANCH and DEFAULT_BRANCH are required.\n');
  process.exit(1);
}

if (base === defaultBranch) {
  process.stdout.write(`PR targets the default branch ${defaultBranch}.\n`);
  process.exit(0);
}

// Full remote history comes from checkout's fetch-depth: 0. Arguments are
// passed directly to Git so a branch name never becomes shell code.
const result = spawnSync(
  'git',
  [
    'merge-base',
    '--is-ancestor',
    `refs/remotes/origin/${base}`,
    `refs/remotes/origin/${defaultBranch}`,
  ],
  { encoding: 'utf8' }
);

if (result.status === 0) {
  process.stderr.write(
    `Base branch ${base} is already contained in ${defaultBranch}. Retarget this PR at ${defaultBranch} so the changes reach the main codebase.\n`
  );
  process.exit(1);
}

if (result.status !== 1) {
  process.stderr.write(
    `Cannot verify PR base ancestry: ${result.error?.message || result.stderr}\n`
  );
  process.exit(1);
}

process.stdout.write(`Base branch ${base} still has unmerged work.\n`);
